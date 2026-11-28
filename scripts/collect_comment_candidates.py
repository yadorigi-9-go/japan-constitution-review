#!/usr/bin/env python3
"""国会会議録検索APIから、改憲案の条文に関する実発言コメントの「候補」を収集し、
data/comments/ に verified: false の YAML として書き出す (Issue #159)。

自動収集は候補の発見・整理までとし、出典との照合・公開可否の判断は人が行う
(npm run review:comments)。そのため、このスクリプトは次の方針を守る。

- 発言内容・出典情報を推測・創作しない。APIレスポンスにある値だけを使う。
  - excerpt は発言本文(API の speech)からの一言一句そのままの部分文字列。
  - summary は空欄にする(要約は人が書くか、AIで書いた場合は summary_source: ai にする)。
  - stance / claim_type はスキーマ上必須のため仮値(neutral / quote)を入れ、
    直前の行に「要確認」のYAMLコメントを付ける。
- verified は常に false(確認前の候補が公開されないようにする。docs/design.md 10)。
- 既存の data/comments/ と source_url で照合し、重複候補は書き出さない。
- 国会会議録検索APIの利用規約に従い、リクエストの間に数秒空ける(docs/design.md 8)。

検索対象(キーワード・紐付ける条文)は scripts/comment_collection_targets.json で定義する。
標準ライブラリのみを使用する(追加の依存なし)。
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
COMMENTS_DIR = DATA_DIR / "comments"
TARGETS_PATH = pathlib.Path(__file__).resolve().parent / "comment_collection_targets.json"
IGNORE_PATH = pathlib.Path(__file__).resolve().parent / "comment_collection_ignore.txt"

API_URL = "https://kokkai.ndl.go.jp/api/speech"
USER_AGENT = "japan-constitution-review comment-candidate collector"
SOURCE_URL_PATTERN = re.compile(r'^source_url:\s*"?([^"\n]*)"?\s*$', re.MULTILINE)
NAME_PATTERN = re.compile(r'^\s+name:\s*"?([^"\n]*)"?\s*$', re.MULTILINE)
ID_PATTERN = re.compile(r'^id:\s*"?(c-\d{8}-([a-z]+))(?:-\d+)?"?\s*$', re.MULTILINE)

# excerpt の目安の長さ(docs/design.md 5.5: 約120字以内で切れる自然な区切り)。
EXCERPT_SOFT_LIMIT = 120
EXCERPT_HARD_LIMIT = 200


# ---------------------------------------------------------------------------
# ひらがな → ローマ字(ヘボン式、長音は表記しない。既存 id の慣例: おおしま → oshima、
# いとう → ito、こんどう → kondo に合わせる)
# ---------------------------------------------------------------------------

_KANA = {
    "あ": "a", "い": "i", "う": "u", "え": "e", "お": "o",
    "か": "ka", "き": "ki", "く": "ku", "け": "ke", "こ": "ko",
    "さ": "sa", "し": "shi", "す": "su", "せ": "se", "そ": "so",
    "た": "ta", "ち": "chi", "つ": "tsu", "て": "te", "と": "to",
    "な": "na", "に": "ni", "ぬ": "nu", "ね": "ne", "の": "no",
    "は": "ha", "ひ": "hi", "ふ": "fu", "へ": "he", "ほ": "ho",
    "ま": "ma", "み": "mi", "む": "mu", "め": "me", "も": "mo",
    "や": "ya", "ゆ": "yu", "よ": "yo",
    "ら": "ra", "り": "ri", "る": "ru", "れ": "re", "ろ": "ro",
    "わ": "wa", "ゐ": "i", "ゑ": "e", "を": "o", "ん": "n",
    "が": "ga", "ぎ": "gi", "ぐ": "gu", "げ": "ge", "ご": "go",
    "ざ": "za", "じ": "ji", "ず": "zu", "ぜ": "ze", "ぞ": "zo",
    "だ": "da", "ぢ": "ji", "づ": "zu", "で": "de", "ど": "do",
    "ば": "ba", "び": "bi", "ぶ": "bu", "べ": "be", "ぼ": "bo",
    "ぱ": "pa", "ぴ": "pi", "ぷ": "pu", "ぺ": "pe", "ぽ": "po",
    "ゔ": "vu", "ぁ": "a", "ぃ": "i", "ぅ": "u", "ぇ": "e", "ぉ": "o",
}
_YOON = {"ゃ": "a", "ゅ": "u", "ょ": "o"}


def kana_to_romaji(yomi: str) -> str:
    out: list[str] = []
    chars = list(yomi)
    i = 0
    geminate = False
    while i < len(chars):
        c = chars[i]
        if c == "っ":
            geminate = True
            i += 1
            continue
        if c == "ー":
            i += 1
            continue
        syl = _KANA.get(c)
        if syl is None:
            # ひらがな以外(空白など)は無視する。
            i += 1
            continue
        if i + 1 < len(chars) and chars[i + 1] in _YOON and syl.endswith("i"):
            base = syl[:-1]
            vowel = _YOON[chars[i + 1]]
            syl = base + vowel if base in ("sh", "ch", "j") else base + "y" + vowel
            i += 1
        if geminate:
            syl = ("t" + syl) if syl.startswith("ch") else (syl[0] + syl)
            geminate = False
        # 「ん」は後続の音にかかわらず常に n とする(b/m/p の前でも m にしない)。
        out.append(syl)
        i += 1
    s = "".join(out)
    # 長音を表記しない: ou / oo → o、uu → u。
    s = re.sub(r"o[ou]", "o", s)
    s = s.replace("uu", "u")
    return s


# ---------------------------------------------------------------------------
# 既存データ
# ---------------------------------------------------------------------------


def normalize_url(url: str) -> str:
    return url.strip().rstrip("/")


def load_existing() -> tuple[set[str], dict[str, str], set[str]]:
    """(既存の source_url 集合, 発言者名 → id 用の姓ローマ字, 既存 id 集合)。"""
    urls: set[str] = set()
    surnames: dict[str, str] = {}
    ids: set[str] = set()
    for path in COMMENTS_DIR.glob("*/*.yaml"):
        text = path.read_text(encoding="utf-8")
        ids.add(path.stem)
        m = SOURCE_URL_PATTERN.search(text)
        if m and m.group(1):
            urls.add(normalize_url(m.group(1)))
        name = NAME_PATTERN.search(text)
        idm = ID_PATTERN.search(text)
        if name and idm:
            surnames.setdefault(name.group(1), idm.group(2))
    return urls, surnames, ids


# ---------------------------------------------------------------------------
# 既存コメントの賛否(stance)の内訳(収集作業用。Issue #167)
#
# 公開ページには件数・比率を表示しない(「賛成/反対が多い」という印象を与え、中立性の
# 表明と逆の効果になりうるため)。ここでは、反対側の立場の発言を探すきっかけにする
# 目的で、候補PRの本文と --stance-report の出力にだけ使う(docs/design.md 5.5 の2)。
# ---------------------------------------------------------------------------

STANCES = ("support", "oppose", "neutral")
STANCE_PATTERN = re.compile(r'^stance:\s*"?(\w+)"?\s*$', re.MULTILINE)
DRAFT_ID_PATTERN = re.compile(r'^draft_id:\s*"?([\w-]+)"?\s*$', re.MULTILINE)
ARTICLE_IDS_PATTERN = re.compile(r"^article_ids:\s*\[(.*?)\]\s*$", re.MULTILINE)
VERIFIED_PATTERN = re.compile(r"^verified:\s*true\s*$", re.MULTILINE)


def load_stance_records() -> list[tuple[str | None, set[str], str]]:
    """公開済み(verified: true)のコメントの (draft_id, article_ids, stance)。"""
    records = []
    for path in COMMENTS_DIR.glob("*/*.yaml"):
        text = path.read_text(encoding="utf-8")
        if not VERIFIED_PATTERN.search(text):
            continue
        stance = STANCE_PATTERN.search(text)
        ids = ARTICLE_IDS_PATTERN.search(text)
        draft = DRAFT_ID_PATTERN.search(text)
        if not stance or not ids:
            continue
        draft_id = draft.group(1) if draft and draft.group(1) != "null" else None
        article_ids = {a.strip().strip("\"'") for a in ids.group(1).split(",") if a.strip()}
        records.append((draft_id, article_ids, stance.group(1)))
    return records


def stance_counts(records: list[tuple[str | None, set[str], str]], draft_id: str | None,
                  article_ids: list[str]) -> dict[str, int]:
    """draft_id が一致し、article_ids をすべて含むコメントの stance ごとの件数。

    改番された条文の検索対象は改番前・改番後の両方のidを持つため、それらをすべて含む
    コメントだけを数えることで、番号が偶然一致する別の条文へのコメントをおおむね除く。
    収集作業の目安であり、サイトの表示判定(src/lib/draftComments.ts)ほど厳密ではない。"""
    counts = {s: 0 for s in STANCES}
    if not article_ids:
        return counts
    want = set(article_ids)
    for rec_draft, rec_ids, stance in records:
        if rec_draft == draft_id and want <= rec_ids and stance in counts:
            counts[stance] += 1
    return counts


def stance_note(counts: dict[str, int]) -> str:
    """件数から、収集の手がかりになる事実だけを書く(評価語は使わない)。"""
    total = sum(counts.values())
    if total == 0:
        return "未収集"
    missing = [s for s in ("support", "oppose") if counts[s] == 0]
    return " / ".join(f"{s} の発言が未収集" for s in missing)


def format_counts(counts: dict[str, int]) -> str:
    return " / ".join(f"{s} {counts[s]}" for s in STANCES)


def render_stance_table(targets: list[dict], records: list[tuple[str | None, set[str], str]]) -> list[str]:
    lines = [
        "| 検索対象 | 改憲案側(support / oppose / neutral) | メモ | 現行条文側(support / oppose / neutral) | メモ |",
        "| --- | --- | --- | --- | --- |",
    ]
    for target in targets:
        draft_counts = stance_counts(records, target["draft_id"], target["article_ids"])
        fallback = target.get("fallback_article_ids") or []
        if fallback:
            current_counts = stance_counts(records, None, fallback[:1])
            current_cell, current_note = f"`{fallback[0]}`: {format_counts(current_counts)}", stance_note(current_counts)
        else:
            current_cell, current_note = "(対応する現行条文なし)", ""
        lines.append(
            f"| {target['label']} | {format_counts(draft_counts)} | {stance_note(draft_counts)} | "
            f"{current_cell} | {current_note} |"
        )
    return lines


def load_ignore(paths: list[pathlib.Path]) -> set[str]:
    urls: set[str] = set()
    for path in paths:
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.split("#", 1)[0].strip()
            if line:
                urls.add(normalize_url(line))
    return urls


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------


def fetch_speeches(params: dict[str, str], retries: int, sleep: float) -> list[dict]:
    query = urllib.parse.urlencode({**params, "recordPacking": "json"})
    url = f"{API_URL}?{query}"
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        if attempt > 0:
            time.sleep(sleep * (attempt + 1))
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=60) as res:
                data = json.load(res)
            if "message" in data and "speechRecord" not in data and data.get("numberOfRecords", 0) != 0:
                raise RuntimeError(f"API error: {data.get('message')}")
            return data.get("speechRecord", []) or []
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError) as e:
            last_error = e
            print(f"  ! request failed ({attempt + 1}/{retries + 1}): {e}", file=sys.stderr)
    raise RuntimeError(f"国会会議録検索APIへのリクエストに失敗しました: {url}: {last_error}")


# ---------------------------------------------------------------------------
# 候補の組み立て
# ---------------------------------------------------------------------------

SPEAKER_HEADER = re.compile(r"^○[^　]*　")


def speech_body(speech: str) -> str:
    """先頭の話者表記(「○奥野委員　」等)だけを除いた本文。本文自体は変更しない。"""
    return SPEAKER_HEADER.sub("", speech, count=1)


def pick_excerpt(body: str, keywords: list[str]) -> str:
    """キーワードを含む最初の文を、本文の一言一句そのままの部分文字列として返す。
    長い場合は、読点(、)の直後など自然な区切りで後ろを切る(前後に文字は足さない)。"""
    positions = [body.find(k) for k in keywords if k in body]
    if not positions:
        return ""
    pos = min(positions)
    start = max(body.rfind("。", 0, pos), body.rfind("\n", 0, pos)) + 1
    ends = [i for i in (body.find("。", pos), body.find("\n", pos)) if i != -1]
    end = (min(ends) + 1) if ends else len(body)
    sentence = body[start:end].strip()
    if len(sentence) <= EXCERPT_HARD_LIMIT:
        return sentence
    cut = sentence.rfind("、", 0, EXCERPT_SOFT_LIMIT)
    if cut == -1 or cut < 40:
        cut = EXCERPT_SOFT_LIMIT
    return sentence[: cut + 1].strip()


def yaml_str(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def mentions_any(text: str, words: list[str]) -> bool:
    return any(w in text for w in words)


def build_candidate(record: dict, target: dict, keywords: list[str], today: dt.date) -> dict | None:
    if record.get("speechOrder") in (0, "0"):
        return None  # 会議録冒頭の出席者一覧等
    if record.get("speakerRole"):
        return None  # 参考人・公述人・証人等(政治家本人の発言に限る)
    if not record.get("speakerGroup"):
        return None  # 会派の記録がない発言者(政府参考人等)
    speech = record.get("speech") or ""
    body = speech_body(speech)
    excerpt = pick_excerpt(body, keywords)
    if not excerpt:
        return None

    # 改憲案への明示的な言及がある場合のみ draft_id を設定する(docs/design.md 5.5 の7)。
    # 言及の有無は文字列の一致で機械的に判定するだけなので、人による確認が前提。
    if mentions_any(body, target.get("draft_mention_keywords", [])):
        draft_id = target["draft_id"]
        article_ids = target["article_ids"]
    else:
        draft_id = None
        article_ids = target.get("fallback_article_ids") or []
        if not article_ids:
            # 新設条文などで、同じ番号の現行条文と内容が対応しない場合は fallback を
            # 空にしておき、改憲案への言及がない発言は候補にしない(無関係な現行条文に
            # 紐付けないため。docs/design.md 5.2 の is_new)。
            return None

    position = record.get("speakerPosition") or ""
    house = record.get("nameOfHouse") or ""
    role = position if ("大臣" in position or "総理" in position) else f"{house}議員"

    return {
        "record": record,
        "draft_id": draft_id,
        "article_ids": article_ids,
        "role": role,
        "venue": f"{house}{record.get('nameOfMeeting') or ''}",
        "excerpt": excerpt,
        "source_url": record.get("speechURL")
        or f"https://kokkai.ndl.go.jp/txt/{record['issueID']}/{record['speechOrder']}",
        "accessed_at": today.isoformat(),
        "target_label": target["label"],
    }


def assign_id(candidate: dict, surnames: dict[str, str], used_ids: set[str]) -> tuple[str, bool]:
    """id を決める。戻り値の bool は「姓の切り出しが要確認か」。

    speakerYomi は姓と名の区切りを持たないため、姓だけを機械的に切り出せない。既存
    データに同じ発言者がいれば、その id の姓部分を使う。いなければ読み全体を
    ローマ字化した仮の id にし、PR本文で姓のみへの修正を促す(推測で切らない)。"""
    record = candidate["record"]
    date = record["date"].replace("-", "")
    surname = surnames.get(record["speaker"])
    needs_fix = surname is None
    if surname is None:
        surname = kana_to_romaji(record.get("speakerYomi") or "") or "unknown"
    base = f"c-{date}-{surname}"
    cid = base
    n = 2
    while cid in used_ids:
        cid = f"{base}-{n}"
        n += 1
    used_ids.add(cid)
    return cid, needs_fix


def render_yaml(cid: str, c: dict) -> str:
    r = c["record"]
    draft = c["draft_id"] if c["draft_id"] else "null"
    lines = [
        "# 自動収集した候補(scripts/collect_comment_candidates.py)。出典と照合し、",
        "# stance / claim_type / summary / tags / id を確認・修正してから verified: true にする。",
        f"id: {cid}",
        f"article_ids: [{', '.join(c['article_ids'])}]",
        f"draft_id: {draft}",
        "kind: speech",
        "# 要確認: claim_type は自動収集の仮値",
        "claim_type: quote",
        "# 要確認: stance は自動収集の仮値(発言者本人の立場表明に基づいて設定する)",
        "stance: neutral",
        "source_type: primary",
        "speaker:",
        f"  name: {yaml_str(r['speaker'])}",
        f"  role: {yaml_str(c['role'])}",
        f"  party: {yaml_str(r['speakerGroup'])}",
        f"date: {r['date']}",
        f"venue: {yaml_str(c['venue'])}",
        f"excerpt: {yaml_str(c['excerpt'])}",
        'summary: ""',
        "summary_source: human",
        f"source_url: {yaml_str(c['source_url'])}",
        'archive_url: ""',
        f"accessed_at: {c['accessed_at']}",
        "tags: []",
        "verified: false",
    ]
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--since", help="この日付(YYYY-MM-DD)以降の発言を対象にする。省略時は --days 日前から")
    parser.add_argument("--days", type=int, default=14, help="--since 省略時に遡る日数(既定: 14)")
    parser.add_argument("--max-records", type=int, default=20, help="1検索あたりの最大取得件数(既定: 20、上限100)")
    parser.add_argument("--sleep", type=float, default=4.0, help="リクエスト間の待ち秒数(既定: 4)")
    parser.add_argument("--retries", type=int, default=2, help="失敗時の再試行回数(既定: 2)")
    parser.add_argument("--exclude-urls", type=pathlib.Path, action="append", default=[],
                        help="候補から除外する source_url の一覧ファイル(1行1URL)。複数指定可")
    parser.add_argument("--summary", type=pathlib.Path, help="収集結果の Markdown を書き出すパス(PR本文用)")
    parser.add_argument("--dry-run", action="store_true", help="ファイルを書き出さずに候補だけ表示する")
    parser.add_argument("--stance-report", action="store_true",
                        help="APIにアクセスせず、全検索対象の既存コメントの賛否(stance)の内訳だけを表示する(収集作業用)")
    args = parser.parse_args()

    today = dt.date.today()
    since = dt.date.fromisoformat(args.since) if args.since else today - dt.timedelta(days=args.days)
    config = json.loads(TARGETS_PATH.read_text(encoding="utf-8"))
    default_meeting = config.get("default_meeting")
    stance_records = load_stance_records()

    if args.stance_report:
        # 収集作業用(Issue #167)。公開ページには表示しない。
        print("\n".join(render_stance_table(config["targets"], stance_records)))
        return 0

    existing_urls, surnames, used_ids = load_existing()
    skip_urls = existing_urls | load_ignore([IGNORE_PATH, *args.exclude_urls])

    # source_url → 候補。同じ発言が複数の検索対象に一致した場合は、改憲案に紐付いた
    # 候補(draft_id あり)を、現行条文側の候補(draft_id: null)より優先する。複数の
    # 改憲案が同じ検索語を使う場合(例: 第26条は jimin-2012 / jimin-2018 の両方)に、
    # 先に検索した対象の fallback に取られて改憲案への言及が失われないようにするため。
    # どちらも draft_id ありなら、targets の並び順で先のものを採用する。
    candidates: dict[str, dict] = {}
    # 同じ検索条件のリクエストは1回の実行内で再利用し、APIへの重複アクセスを避ける
    # (docs/design.md 8 のレート制限)。
    cache: dict[tuple, list[dict]] = {}
    first_request = True
    for target in config["targets"]:
        for keywords in target["queries"]:
            params = {
                "any": " ".join(keywords),
                "from": since.isoformat(),
                "maximumRecords": str(min(args.max_records, 100)),
            }
            meeting = target.get("meeting", default_meeting)
            if meeting:
                params["nameOfMeeting"] = meeting
            print(f"[{target['label']}] {' '.join(keywords)} (from {since}, meeting={meeting or '*'})")
            key = tuple(sorted(params.items()))
            if key not in cache:
                if not first_request:
                    time.sleep(args.sleep)
                first_request = False
                cache[key] = fetch_speeches(params, args.retries, args.sleep)
            for record in cache[key]:
                candidate = build_candidate(record, target, keywords, today)
                if candidate is None:
                    continue
                url = normalize_url(candidate["source_url"])
                if url in skip_urls:
                    continue
                current = candidates.get(url)
                if current is not None and (current["draft_id"] or not candidate["draft_id"]):
                    continue
                candidates[url] = candidate

    written: list[tuple[pathlib.Path, str, dict, bool]] = []
    for candidate in candidates.values():
        record = candidate["record"]
        cid, needs_fix = assign_id(candidate, surnames, used_ids)
        path = COMMENTS_DIR / candidate["article_ids"][0] / f"{cid}.yaml"
        written.append((path, cid, candidate, needs_fix))
        print(f"  + {path.relative_to(ROOT)}  {record['speaker']} {record['date']}  ({candidate['target_label']}, draft_id={candidate['draft_id']})")

    if not args.dry_run:
        for path, cid, candidate, _ in written:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(render_yaml(cid, candidate), encoding="utf-8")

    # 候補が見つかった検索対象について、既存コメントの賛否の内訳を出す(収集作業用。#167)。
    labels = {c["target_label"] for _, _, c, _ in written}
    hit_targets = [t for t in config["targets"] if t["label"] in labels]
    if hit_targets:
        print("\n既存コメントの賛否(stance)の内訳(収集作業用):")
        print("\n".join(render_stance_table(hit_targets, stance_records)))

    if args.summary:
        args.summary.write_text(render_summary(written, since, hit_targets, stance_records), encoding="utf-8")

    print(f"{len(written)} candidate(s){' (dry run)' if args.dry_run else ''}")
    return 0


def render_summary(written: list[tuple[pathlib.Path, str, dict, bool]], since: dt.date,
                   hit_targets: list[dict], stance_records: list[tuple[str | None, set[str], str]]) -> str:
    lines = [
        f"国会会議録検索APIから、{since.isoformat()} 以降の発言を対象に自動収集した実発言コメントの**候補**です(Issue #159)。",
        "",
        "すべて `verified: false` のため、このままマージしてもサイトには表示されません。",
        "`npm run review:comments` で出典(source_url)と照合し、次を確認・修正してください。",
        "",
        "- `stance` / `claim_type` は仮値です(`neutral` / `quote`)。発言者本人の立場表明に基づいて設定してください",
        "- `summary` は空欄です。書いた場合は `summary_source` を実態に合わせてください",
        "- `draft_id` は、発言本文に改憲案への言及語が含まれる場合のみ機械的に設定しています(docs/design.md 5.5 の7)",
        "- 不要な候補はファイルを削除し、再提案を防ぐ場合は `scripts/comment_collection_ignore.txt` に source_url を追記してください",
        "",
        "| ファイル | 発言者 | 日付 | 会議 | 検索対象 | draft_id | 備考 |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for path, _cid, c, needs_fix in written:
        r = c["record"]
        note = "id の姓を要確認(既存データに同じ発言者がいないため、読み全体をローマ字化)" if needs_fix else ""
        draft = f"`{c['draft_id']}`" if c["draft_id"] else "null(現行条文側)"
        lines.append(
            f"| `{path.relative_to(ROOT)}` | {r['speaker']}({r['speakerGroup']}) | {r['date']} | "
            f"[{c['venue']}]({c['source_url']}) | {c['target_label']} | {draft} | {note} |"
        )
    if hit_targets:
        lines += [
            "",
            "### 既存コメントの賛否(stance)の内訳(収集作業用)",
            "",
            "候補が見つかった検索対象について、公開済み(`verified: true`)の既存コメントの件数です。"
            "一方の立場だけに偏らないよう、未収集の立場の発言を探す手がかりにしてください"
            "(docs/design.md 5.5 の2)。**この内訳はサイトには表示しません**(Issue #167)。",
            "",
            *render_stance_table(hit_targets, stance_records),
        ]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    sys.exit(main())
