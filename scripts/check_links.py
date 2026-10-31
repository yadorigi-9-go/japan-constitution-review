#!/usr/bin/env python3
"""data/ 以下の YAML ファイルから source_url / archive_url を集めて、
リンク切れがないか確認する (docs/design.md 10)。

標準ライブラリのみを使用する (追加の依存なし)。
サーバーへの負荷を避けるため、リクエスト間に待機時間を置く。
"""

import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

DATA_DIR = pathlib.Path(__file__).resolve().parent.parent / "data"
URL_PATTERN = re.compile(r'^\s*(?:source_url|archive_url):\s*"([^"]+)"', re.MULTILINE)
REQUEST_INTERVAL_SECONDS = 3
TIMEOUT_SECONDS = 15
USER_AGENT = "japan-constitution-review-link-checker/1.0"


def collect_urls() -> dict[str, list[pathlib.Path]]:
    urls: dict[str, list[pathlib.Path]] = {}
    for path in sorted(DATA_DIR.rglob("*.yaml")):
        if path.is_relative_to(DATA_DIR / "raw"):
            continue
        text = path.read_text(encoding="utf-8")
        for match in URL_PATTERN.finditer(text):
            urls.setdefault(match.group(1), []).append(path)
    return urls


def check_url(url: str) -> tuple[bool, str]:
    request = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return True, f"{response.status}"
    except urllib.error.HTTPError as e:
        # HEAD を許可しないサーバーもあるため、405/403 等は GET で再確認する。
        if e.code in (403, 405):
            get_request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            try:
                with urllib.request.urlopen(get_request, timeout=TIMEOUT_SECONDS) as response:
                    return True, f"{response.status} (GET)"
            except urllib.error.HTTPError as e2:
                return False, f"HTTP {e2.code}"
            except urllib.error.URLError as e2:
                return False, str(e2.reason)
        return False, f"HTTP {e.code}"
    except urllib.error.URLError as e:
        return False, str(e.reason)


def main() -> int:
    urls = collect_urls()
    print(f"Checking {len(urls)} unique URLs from {DATA_DIR}")

    broken: list[tuple[str, str, list[pathlib.Path]]] = []
    for i, (url, paths) in enumerate(urls.items()):
        ok, detail = check_url(url)
        status = "OK" if ok else "BROKEN"
        print(f"[{status}] {url} ({detail})")
        if not ok:
            broken.append((url, detail, paths))
        if i < len(urls) - 1:
            time.sleep(REQUEST_INTERVAL_SECONDS)

    if broken:
        print(f"\n{len(broken)} broken link(s):")
        for url, detail, paths in broken:
            referenced_by = ", ".join(str(p.relative_to(DATA_DIR.parent)) for p in paths)
            print(f"  - {url} ({detail}) referenced by: {referenced_by}")
        return 1

    print("\nAll links OK.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
