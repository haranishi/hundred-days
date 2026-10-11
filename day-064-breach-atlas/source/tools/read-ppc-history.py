# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 haranishi
# This PDF extraction tool is free software under the GNU AGPL v3 or later.
# See LICENSE-AGPL-3.0.txt for terms, including the warranty disclaimer.
"""Read public PPC annual reports into temporary evidence files; no publication."""
import argparse
import concurrent.futures
import hashlib
import json
import re
import ssl
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import urlopen

import fitz
import certifi

INDEX = 'https://www.ppc.go.jp/personalinfo/sekoujyoukyou/'


def read_url(url):
    if urlparse(url).hostname != 'www.ppc.go.jp':
        raise ValueError('Only public PPC sources are accepted.')
    with urlopen(url, timeout=45, context=ssl.create_default_context(cafile=certifi.where())) as response:
        return response.read()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    html = read_url(INDEX).decode('utf-8')
    links = sorted(set(urljoin(INDEX, link) for link in re.findall(r'href=[\"\']([^\"\']+\.pdf)[\"\']', html) if re.search(r'personal_sekou(?:gaiyou)?_\d+', link)))
    if not links:
        raise RuntimeError('No annual report links found in the official index.')

    def read_report(url):
        content = read_url(url)
        name = Path(urlparse(url).path).name
        (args.output / name).write_bytes(content)
        return (url, name, content)

    # PyMuPDF table extraction is sequential; its document APIs are not thread safe.
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        downloaded = list(pool.map(read_report, links))
    manifest = []
    for url, name, content in downloaded:
        document = fitz.open(stream=content, filetype='pdf')
        pages = []
        for number, page in enumerate(document):
            text = page.get_text()
            compact = re.sub(r'\s+', '', text)
            if '事業者名' in compact and ('漏えい' in compact or '漏洩' in compact):
                pages.append({'page': number + 1, 'text': text, 'tables': [table.extract() for table in page.find_tables().tables]})
        (args.output / (name + '.json')).write_text(json.dumps(pages, ensure_ascii=False, indent=2), encoding='utf-8')
        manifest.append({'url': url, 'file': name, 'sha256': hashlib.sha256(content).hexdigest(), 'totalPages': len(document), 'casePages': [p['page'] for p in pages], 'tableRows': sum(len(table) for page in pages for table in page['tables'])})
    (args.output / 'manifest.json').write_text(json.dumps({'index': INDEX, 'sources': manifest}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
