#!/usr/bin/env python3
"""data/comments/ の article_ids / draft_id が、実在する条文・改憲案を
指しているかを検証する (docs/design.md 10)。

Astro の Zod スキーマ (src/content.config.ts) は各コメントの型は検証するが、
article_ids / draft_id が指す先が実在するかまでは見ていない。改番・削除が
絡む条文(docs/design.md 5.2)で番号が衝突するケースなどは、ビルドが通って
いても気づかれない参照ミスを生みやすいため、このスクリプトで別途検証する。

標準ライブラリのみを使用する (追加の依存なし)。article_ids は
`article_ids: [a, b]` のフロー形式で書かれている前提(既存データが
すべてこの形式のため)。
"""

import pathlib
import re
import sys

DATA_DIR = pathlib.Path(__file__).resolve().parent.parent / "data"
ARTICLES_DIR = DATA_DIR / "articles"
DRAFTS_DIR = DATA_DIR / "drafts"
COMMENTS_DIR = DATA_DIR / "comments"

ID_PATTERN = re.compile(r'^id:\s*"?([\w-]+)"?\s*$', re.MULTILINE)
DRAFT_ID_PATTERN = re.compile(r'^draft_id:\s*(.+)$', re.MULTILINE)
ARTICLE_IDS_PATTERN = re.compile(r"^article_ids:\s*\[(.*?)\]\s*$", re.MULTILINE)


def read_id(text: str) -> str | None:
    m = ID_PATTERN.search(text)
    return m.group(1) if m else None


def collect_current_article_ids() -> set[str]:
    return {path.stem for path in ARTICLES_DIR.glob("*.yaml")}


def collect_draft_ids() -> set[str]:
    return {path.parent.name for path in DRAFTS_DIR.glob("*/meta.yaml")}


def collect_draft_article_ids() -> set[tuple[str, str]]:
    """(draft_id, article_id) のペア。変更・新設条文 (art-*.yaml, preamble.yaml) と
    削除 (del-art-*.yaml、現行条文側のidを指す) の両方を含む。"""
    pairs: set[tuple[str, str]] = set()
    for path in DRAFTS_DIR.glob("*/*.yaml"):
        if path.name == "meta.yaml":
            continue
        draft_id = path.parent.name
        article_id = read_id(path.read_text(encoding="utf-8"))
        if article_id:
            pairs.add((draft_id, article_id))
    return pairs


def main() -> int:
    current_article_ids = collect_current_article_ids()
    draft_ids = collect_draft_ids()
    draft_article_pairs = collect_draft_article_ids()

    problems: list[str] = []
    checked = 0

    for path in sorted(COMMENTS_DIR.glob("*/*.yaml")):
        checked += 1
        text = path.read_text(encoding="utf-8")
        rel = path.relative_to(DATA_DIR.parent)

        draft_id_match = DRAFT_ID_PATTERN.search(text)
        draft_id_raw = draft_id_match.group(1).strip() if draft_id_match else "null"
        draft_id = None if draft_id_raw == "null" else draft_id_raw.strip('"')

        if draft_id is not None and draft_id not in draft_ids:
            problems.append(f"{rel}: draft_id '{draft_id}' は data/drafts/ に存在しません")
            continue

        article_ids_match = ARTICLE_IDS_PATTERN.search(text)
        if not article_ids_match:
            problems.append(f"{rel}: article_ids が見つかりません(フロー形式 '[a, b]' を想定)")
            continue
        article_ids = [a.strip() for a in article_ids_match.group(1).split(",") if a.strip()]
        if not article_ids:
            problems.append(f"{rel}: article_ids が空です")
            continue

        for article_id in article_ids:
            # 現行条文のidとして有効、または(draft_id指定時)その改憲案の変更・
            # 新設・削除条文のidとして有効であれば問題なし。
            is_current = article_id in current_article_ids
            is_in_draft = draft_id is not None and (draft_id, article_id) in draft_article_pairs
            if not is_current and not is_in_draft:
                problems.append(
                    f"{rel}: article_ids の '{article_id}' が、現行条文にも"
                    f"{f'改憲案 {draft_id} の変更・新設・削除条文にも' if draft_id else ''}見つかりません"
                )

    print(f"Checked {checked} comment file(s) under {COMMENTS_DIR}")

    if problems:
        print(f"\n{len(problems)} problem(s):")
        for p in problems:
            print(f"  - {p}")
        return 1

    print("All comment article_ids / draft_id references OK.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
