#!/usr/bin/env python3
"""data/comments/ の各コメントを人が目で見てレビューし、verified フィールドを
承認(true)/却下(false)するための対話式CLI。

新規追加コメントの初回承認(verified: false のものを認可する)と、既存コメント
(verified: true)の事後的な再チェックの両方に、同じ仕組みを使う想定(デフォルトは
未承認のみ、--all で既存分も含める)。source_url を開いて出典と excerpt/summary を
照合したうえで判断する想定で、出典内容の正誤はこのスクリプト自身では判定しない
(あくまで人が確認するための支援ツール)。

標準ライブラリのみを使用する (追加の依存なし)。verified 行だけをピンポイントで
書き換え、他のフィールドの書式(クオートの付け方など)を変えないようにする。
"""

import argparse
import pathlib
import re
import sys
import webbrowser

DATA_DIR = pathlib.Path(__file__).resolve().parent.parent / "data"
COMMENTS_DIR = DATA_DIR / "comments"

VERIFIED_LINE_PATTERN = re.compile(r"^verified:[ \t]*(true|false)[ \t]*$", re.MULTILINE)


def extract_scalar(text: str, key: str) -> str:
    m = re.search(rf"^{key}:\s*(.+)$", text, re.MULTILINE)
    if not m:
        return ""
    return m.group(1).strip().strip('"')


def extract_list(text: str, key: str) -> list[str]:
    m = re.search(rf"^{key}:\s*\[(.*?)\]\s*$", text, re.MULTILINE)
    if not m:
        return []
    return [v.strip().strip('"') for v in m.group(1).split(",") if v.strip()]


def extract_speaker(text: str) -> dict[str, str]:
    m = re.search(r"^speaker:\n((?:  .+\n?)+)", text, re.MULTILINE)
    if not m:
        return {}
    out: dict[str, str] = {}
    for line in m.group(1).splitlines():
        km = re.match(r"\s*(\w+):\s*(.+)$", line)
        if km:
            out[km.group(1)] = km.group(2).strip().strip('"')
    return out


def format_comment(path: pathlib.Path, text: str) -> str:
    speaker = extract_speaker(text)
    summary_source = extract_scalar(text, "summary_source")
    lines = [
        f"--- {path.relative_to(DATA_DIR.parent)} ---",
        f"id: {extract_scalar(text, 'id')}  verified: {extract_scalar(text, 'verified')}",
        f"article_ids: {extract_list(text, 'article_ids')}  draft_id: {extract_scalar(text, 'draft_id')}",
        f"kind: {extract_scalar(text, 'kind')}  claim_type: {extract_scalar(text, 'claim_type')}  "
        f"stance: {extract_scalar(text, 'stance')}  source_type: {extract_scalar(text, 'source_type')}",
        f"speaker: {speaker.get('name', '')} ({speaker.get('role', '')} / {speaker.get('party', '')})",
        f"date: {extract_scalar(text, 'date')}  venue: {extract_scalar(text, 'venue')}",
        f"excerpt: {extract_scalar(text, 'excerpt')}",
        f"summary ({'AIによる要約' if summary_source == 'ai' else '人による要約'}): "
        f"{extract_scalar(text, 'summary')}",
        f"source_url: {extract_scalar(text, 'source_url')}",
    ]
    archive_url = extract_scalar(text, "archive_url")
    if archive_url:
        lines.append(f"archive_url: {archive_url}")
    lines.append(f"tags: {extract_list(text, 'tags')}")
    return "\n".join(lines)


def set_verified(text: str, value: bool) -> str:
    replacement = f"verified: {'true' if value else 'false'}"
    new_text, count = VERIFIED_LINE_PATTERN.subn(replacement, text)
    if count != 1:
        raise ValueError("verified: true/false の行が一意に見つかりませんでした")
    return new_text


def collect_targets(
    article: str | None, draft: str | None, comment_id: str | None, include_all: bool
) -> list[tuple[pathlib.Path, str]]:
    paths = sorted(COMMENTS_DIR.glob("*/*.yaml"))
    if article:
        paths = [p for p in paths if p.parent.name == article]

    targets = []
    for path in paths:
        text = path.read_text(encoding="utf-8")
        if comment_id and extract_scalar(text, "id") != comment_id:
            continue
        if draft and extract_scalar(text, "draft_id") != draft:
            continue
        if extract_scalar(text, "verified") == "true" and not include_all:
            continue
        targets.append((path, text))
    return targets


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--article", help="data/comments/<article_id>/ に絞り込む")
    parser.add_argument("--draft", help="draft_id で絞り込む")
    parser.add_argument("--id", dest="comment_id", help="指定した comment id のみレビューする")
    parser.add_argument(
        "--all",
        action="store_true",
        help="verified: true のコメントも対象にする(既存コメントの再チェック用。"
        "指定しない場合は verified: false のもののみ表示する)",
    )
    parser.add_argument(
        "--no-open",
        action="store_true",
        help="source_url を自動でブラウザで開かない",
    )
    args = parser.parse_args()

    targets = collect_targets(args.article, args.draft, args.comment_id, args.all)
    if not targets:
        print("対象のコメントが見つかりませんでした。")
        return 0

    print(f"{len(targets)} 件のコメントをレビューします。\n")

    reviewed = approved = rejected = 0
    try:
        for i, (path, text) in enumerate(targets, start=1):
            print(f"[{i}/{len(targets)}]")
            print(format_comment(path, text))
            source_url = extract_scalar(text, "source_url")
            if source_url and not args.no_open:
                webbrowser.open(source_url)

            choice = ""
            while choice not in ("y", "n", "s", "q"):
                choice = input("[y]承認 / [n]却下 / [s]スキップ(Enterでも可) / [q]終了 > ").strip().lower()
                if choice == "":
                    choice = "s"
            print()

            if choice == "q":
                break
            if choice == "s":
                continue

            new_text = set_verified(text, choice == "y")
            path.write_text(new_text, encoding="utf-8")
            reviewed += 1
            if choice == "y":
                approved += 1
            else:
                rejected += 1
    except KeyboardInterrupt:
        print("\n中断しました。")

    print(f"レビュー完了: {reviewed} 件更新(承認 {approved} / 却下 {rejected})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
