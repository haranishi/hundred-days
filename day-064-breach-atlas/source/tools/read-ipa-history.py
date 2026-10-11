# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 haranishi
# This PDF extraction tool is free software under the GNU AGPL v3 or later.
# See LICENSE-AGPL-3.0.txt for terms, including the warranty disclaimer.
"""Download official public white papers; extract candidate pages for human review."""
import argparse
import concurrent.futures
import hashlib
import html
import json
import re
import ssl
import urllib.parse
import urllib.request
from pathlib import Path

import certifi
import fitz


def fetch(url):
    if urllib.parse.urlparse(url).hostname != 'www.ipa.go.jp':
        raise ValueError('Only official IPA sources are allowed')
    return urllib.request.urlopen(url, context=ssl.create_default_context(cafile=certifi.where()), timeout=60).read()


def download(year, folder):
    index = f'https://www.ipa.go.jp/{"archive/" if year < 2023 else ""}publish/wp-security/{"sec-" if year < 2023 else ""}{year}.html'
    page = fetch(index).decode('utf-8')
    links = [(urllib.parse.urljoin(index, html.unescape(href)), re.sub('<[^>]+>', '', label)) for href, label in re.findall(r'<a[^>]+href=["\']([^"\']+\.pdf)["\'][^>]*>(.*?)</a>', page, re.S)]
    preferred = next((url for url, label in links if '1章' in label), None) or next((url for url, label in links if '全章' in label or 'ダウンロード' in label), None)
    if not preferred:
        return {'year': year, 'index': index, 'status': 'no-public-pdf'}
    content = fetch(preferred)
    filename = f'ipa-{year}.pdf'
    (folder / filename).write_bytes(content)
    return {'year': year, 'index': index, 'url': preferred, 'file': filename, 'sha256': hashlib.sha256(content).hexdigest(), 'status': 'downloaded'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        sources = list(pool.map(lambda year: download(year, args.output), range(2018, 2026)))
    # PyMuPDF table extraction must remain sequential.
    for source in sources:
        if source['status'] != 'downloaded':
            continue
        document = fitz.open(args.output / source['file'])
        pages = []
        for index, page in enumerate(document):
            text = page.get_text()
            if re.search(r'情報漏[え洩い]+.*(?:主な事例|事例)|主な.*情報漏[え洩い]+', text):
                pages.append({'page': index + 1, 'text': text, 'tables': [table.extract() for table in page.find_tables().tables]})
        source['candidatePages'] = [page['page'] for page in pages]
        (args.output / f'{source["file"]}.json').write_text(json.dumps(pages, ensure_ascii=False, indent=2))
        (args.output / f'ipa-{source["year"]}-text.json').write_text(json.dumps([{'page': i + 1, 'text': p.get_text()} for i, p in enumerate(document)], ensure_ascii=False, indent=2))
        document.close()
    (args.output / 'manifest.json').write_text(json.dumps({'sources': sources}, ensure_ascii=False, indent=2))
    print(json.dumps(sources, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
