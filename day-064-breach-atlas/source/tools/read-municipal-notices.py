"""Download official municipal disclosure inputs into a caller-selected research folder.

Raw announcements stay outside the distributable app. No accounts or API keys.
Two concurrent reads at most; existing input files are retained and hashed.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date
import hashlib
import html
import json
from pathlib import Path
import re
import subprocess
import time
from urllib.parse import urljoin, urlsplit

YOKOHAMA = 'https://www.city.yokohama.lg.jp'
SAITAMA = 'https://www.city.saitama.lg.jp'
ALLOWED_HOSTS = {'www.city.yokohama.lg.jp', 'www.city.saitama.lg.jp'}


def text(value):
    return ' '.join(html.unescape(re.sub(r'<[^>]*>', ' ', value)).split())


def links(body, base):
    return [(urljoin(base, url), text(label)) for url, label in
            re.findall(r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', body, re.S | re.I)]


def read_inputs(output, as_of):
    def fetch(url):
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or parsed.hostname not in ALLOWED_HOSTS or parsed.query:
            raise ValueError('Only the specified public municipal sites without query strings are accepted.')
        suffix = '.pdf' if parsed.path.lower().endswith('.pdf') else '.html'
        name = 'municipal-' + hashlib.sha256(url.encode()).hexdigest()[:14] + suffix
        path = output / name
        if not path.exists():
            subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location',
                            '--max-time', '45', '--output', str(path), url], check=True)
            time.sleep(.35)
        raw = path.read_bytes()
        return {'url': url, 'inputFile': name, 'sha256': hashlib.sha256(raw).hexdigest(),
                'bytes': len(raw)}, raw

    indexes, reports, candidates = [], [], []
    archive = YOKOHAMA + '/city-info/koho-kocho/press/archive/'
    for year in range(2021, as_of.year + 1):
        meta, raw = fetch(archive + str(year) + '/index.html')
        indexes.append(meta)
        months = sorted({url for url, _ in links(raw.decode('utf-8'), meta['url'])
                         if re.search(r'/202\d/202\d\d\d/index.html$', url)
                         and url.split('/')[-2] <= as_of.strftime('%Y%m')})
        with ThreadPoolExecutor(max_workers=2) as pool:
            for page, raw_month in pool.map(fetch, months):
                indexes.append(page)
                for li in re.findall(r'<li\b[^>]*>(.*?)</li>', raw_month.decode('utf-8'), re.S):
                    if '<span class="date">' not in li:
                        continue
                    for url, label in links(li, page['url']):
                        if '事務処理ミス' in label:
                            candidates.append(('yokohama-bulletin', '横浜市', url))
        print(f'横浜市 {year}年度: {len(months)}月の公式索引を確認', flush=True)

    # This disclosure index preserves a direct link to every available monthly bulletin.
    saitama_index = SAITAMA + '/006/006/004/001/p052387.html'
    meta, raw = fetch(saitama_index)
    indexes.append(meta)
    for url, label in links(raw.decode('utf-8'), saitama_index):
        if re.search(r'令和\d+年\d+月分', label) and url.endswith('.html'):
            candidates.append(('saitama-bulletin', 'さいたま市', url))

    def read_bulletin(item):
        kind, publisher, url = item
        meta, raw = fetch(url)
        meta.update(kind=kind, publisher=publisher, documents=[])
        if kind == 'yokohama-bulletin':
            documents = sorted({u for u, _ in links(raw.decode('utf-8'), url)
                                if u.endswith('.pdf') and urlsplit(u).hostname == 'www.city.yokohama.lg.jp'
                                and '/city-info/koho-kocho/press/' in u})
            if not documents:
                raise RuntimeError(f'Official bulletin has no attached PDF: {url}')
            for document in documents:
                document_meta, _ = fetch(document)
                meta['documents'].append(document_meta)
        return meta

    with ThreadPoolExecutor(max_workers=2) as pool:
        for index, meta in enumerate(pool.map(read_bulletin, sorted(set(candidates)))):
            reports.append(meta)
            if index % 10 == 0:
                print(f'公式一括公表資料: {index + 1}/{len(set(candidates))}', flush=True)
    result = {'retrievedAt': as_of.isoformat(), 'indexes': indexes, 'inputs': reports}
    (output / 'municipal-inputs.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f'{len(reports)}件の公式一括公表を保存', flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--as-of', type=date.fromisoformat, default=date.today())
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    read_inputs(args.output, args.as_of)


if __name__ == '__main__':
    main()
