#!/usr/bin/env python3
"""check_links.py が書き出した data/link_check_report.json を、
定点観測用のトラッキングIssueにコメントとして報告する (docs/design.md 10, Issue #133)。

GitHub Actions 上でのみ実行する想定 (gh CLI と GH_TOKEN / GITHUB_REPOSITORY に依存)。
新しいIssueを都度作らず、既存のIssue 1件にコメントを積んでいく運用にする
(data/comments/ の実発言収集Issueと同様の「定点観測」の形)。
"""

import json
import os
import pathlib
import subprocess
import sys

DATA_DIR = pathlib.Path(__file__).resolve().parent.parent / "data"
REPORT_PATH = DATA_DIR / "link_check_report.json"

# リンク切れチェックの結果を報告する先のトラッキングIssue。
TRACKING_ISSUE_NUMBER = 133


def build_comment_body(report: dict) -> str:
    checked_at = report["checked_at"][:10]
    total_checked = report["total_checked"]
    broken = report["broken"]

    lines = [f"リンク切れチェック結果 (チェック日時: {checked_at}, 確認URL数: {total_checked})"]

    if not broken:
        lines.append("")
        lines.append("リンク切れは見つかりませんでした。")
        return "\n".join(lines)

    lines.append("")
    lines.append(f"{len(broken)}件のリンク切れが見つかりました。")
    lines.append("")
    for item in broken:
        referenced_by = ", ".join(item["referenced_by"])
        lines.append(f"- `{item['detail']}` {item['url']} (参照元: {referenced_by})")
    return "\n".join(lines)


def main() -> int:
    if not REPORT_PATH.exists():
        print(f"{REPORT_PATH} が見つからないため、報告をスキップします", file=sys.stderr)
        return 0

    report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    body = build_comment_body(report)
    repo = os.environ["GITHUB_REPOSITORY"]

    subprocess.run(
        [
            "gh",
            "issue",
            "comment",
            str(TRACKING_ISSUE_NUMBER),
            "--repo",
            repo,
            "--body",
            body,
        ],
        check=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
