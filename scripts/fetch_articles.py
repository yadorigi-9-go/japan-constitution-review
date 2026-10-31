#!/usr/bin/env python3
"""e-Gov 法令API から日本国憲法の本文を取得し、data/articles/ に
docs/design.md 5.1 のスキーマ (kind: article | preamble) で YAML を生成する。

標準ライブラリのみを使用する (追加の依存なし)。
"""

import datetime
import pathlib
import urllib.request
import xml.etree.ElementTree as ET

API_URL = "https://laws.e-gov.go.jp/api/1/lawdata/321CONSTITUTION"
SOURCE_URL = "https://laws.e-gov.go.jp/law/321CONSTITUTION"
OUT_DIR = pathlib.Path(__file__).resolve().parent.parent / "data" / "articles"


def fetch_root() -> ET.Element:
    with urllib.request.urlopen(API_URL, timeout=30) as res:
        data = res.read()
    return ET.fromstring(data)


def sentence_text(paragraph_sentence: ET.Element) -> str:
    return "".join(s.text or "" for s in paragraph_sentence.findall("Sentence"))


def paragraphs_from(paragraph_elems: list[ET.Element]) -> list[dict]:
    paragraphs = []
    for paragraph in paragraph_elems:
        no = int(paragraph.get("Num"))
        sentence_el = paragraph.find("ParagraphSentence")
        text = sentence_text(sentence_el)
        paragraphs.append({"no": no, "text": text})
    return paragraphs


def yaml_quote(text: str) -> str:
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'


def write_yaml(path: pathlib.Path, data: dict) -> None:
    lines = [f"kind: {data['kind']}", f"id: {data['id']}"]
    if "chapter" in data:
        lines.append(f"chapter: {data['chapter']}")
    if "number" in data:
        lines.append(f"number: {data['number']}")
    for note_line in data.get("notes", []):
        lines.append(f"# {note_line}")
    lines.append("paragraphs:")
    for p in data["paragraphs"]:
        lines.append(f"  - no: {p['no']}")
        lines.append(f"    text: {yaml_quote(p['text'])}")
    lines.append(f"source_url: {yaml_quote(data['source_url'])}")
    lines.append(f"retrieved_at: {data['retrieved_at']}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    root = fetch_root()
    law_body = root.find(".//LawBody")
    retrieved_at = datetime.date.today().isoformat()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    preamble = law_body.find("Preamble")
    write_yaml(
        OUT_DIR / "preamble.yaml",
        {
            "kind": "preamble",
            "id": "preamble",
            "notes": [
                "no は e-Gov の構造化データ上の段落区切り(表示用の便宜的な区切り)。",
                "前文自体に公式な段落番号は存在しない。",
            ],
            "paragraphs": paragraphs_from(preamble.findall("Paragraph")),
            "source_url": SOURCE_URL,
            "retrieved_at": retrieved_at,
        },
    )

    count = 0
    for chapter in law_body.iter("Chapter"):
        # ChapterTitle は "第一章　天皇" の形式。サブタイトルを除いた章番号部分のみ使う。
        chapter_title = chapter.find("ChapterTitle").text.split("　")[0]
        for article in chapter.findall("Article"):
            number = int(article.get("Num"))
            article_id = f"art-{number:03d}"
            write_yaml(
                OUT_DIR / f"{article_id}.yaml",
                {
                    "kind": "article",
                    "id": article_id,
                    "chapter": chapter_title,
                    "number": number,
                    "paragraphs": paragraphs_from(article.findall("Paragraph")),
                    "source_url": SOURCE_URL,
                    "retrieved_at": retrieved_at,
                },
            )
            count += 1

    print(f"Wrote preamble.yaml and {count} article files to {OUT_DIR}")


if __name__ == "__main__":
    main()
