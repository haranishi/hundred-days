# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 haranishi
# This PDF extraction tool is free software under the GNU AGPL v3 or later.
# See LICENSE-AGPL-3.0.txt for terms, including the warranty disclaimer.
"""Import individual rows from official municipal disclosures, with a full decision ledger.

The PDF/HTML bodies are research inputs only. Export factual dates, departments,
qualifications and reference URLs; never copy announcement bodies or contact names.
"""
import argparse
from collections import Counter
from datetime import date
import hashlib
import html
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlsplit, urlunsplit

import fitz

RESEARCH = Path(__file__).resolve().parents[3] / 'docs/day064/research'
BASE_FILES = ['core-incidents.json', 'recent-incidents.json', 'historical-incidents.json',
              'government-history.json', 'ipa-history.json', 'ipa-narrative-history.json',
              'supplementary-history.json', 'japan-notices.json', 'japan-notice-reviews.json']
JURISDICTIONS = {'横浜市': '神奈川県', 'さいたま市': '埼玉県'}
TERMS = ['メール', '名簿', 'マイナンバー', '通知書', '申請書', '住民票', '証明書', '戸籍',
         '生活保護', '国民健康保険', '税', '学校', '児童', '生徒', 'USB', 'FAX', 'ホームページ']
CLASSIFICATIONS = {'mistake': '誤送付・誤交付など', 'loss': '紛失・盗難など',
                   'exposure': '公開・設定の不備など', 'insider': '内部の不適切な取扱い',
                   'intrusion': '不正アクセス関連', 'ransomware': 'ランサムウェア関連',
                   'unknown': '分類を確定していない記録'}


def normalized(value):
    return ' '.join(unicodedata.normalize('NFKC', str(value or '')).split())


def clean_html(value):
    return normalized(html.unescape(re.sub(r'<[^>]*>', ' ', value)))


def public_department(value):
    # Retain department/contractor names, without contact telephone numbers.
    return normalized(re.sub(r'\s*\d{2,4}-\d{3,4}(?:-\d{3,4})?\s*', ' ', normalized(value)))


def public_row(row):
    # The original subject and description are used for classification only.
    # Publish our common classification instead of reproducing table headings.
    return {**{key: value for key, value in row.items() if key not in ('subject',)},
            'department': public_department(row['department']),
            'classification': CLASSIFICATIONS[row['cause']]}


def full_date(value):
    # PDF glyph positioning can split a day into "1 7"; dates are compact fields.
    compact = re.sub(r'\s+', '', normalized(value))
    match = re.search(r'(令和|平成)(元|\d+)年(\d+)月(\d+)日', compact)
    if not match:
        return None
    era, year, month, day = match.groups()
    year = (2018 if era == '令和' else 1988) + (1 if year == '元' else int(year))
    try:
        return date(year, int(month), int(day)).isoformat()
    except ValueError:
        return None


def received_date(value, published):
    complete = full_date(value)
    if complete:
        return complete if complete <= published else None
    match = re.fullmatch(r'(\d+)月(\d+)日', re.sub(r'\s+', '', normalized(value)))
    if not match:
        return None
    month, day = map(int, match.groups())
    year = int(published[:4]) - int(month > int(published[5:7]))
    try:
        result = date(year, month, day).isoformat()
    except ValueError:
        return None
    return result if result <= published else None


def cause_from_words(value):
    value = normalized(value)
    if re.search(r'ランサム[^。]{0,12}(?:なし|なかった|ありません)', value):
        return 'unknown'
    if 'ランサム' in value:
        return 'ransomware'
    if re.search(r'紛失|所在不明|盗難|誤廃棄', value):
        return 'loss'
    if re.search(r'設定(?:ミス|不備|誤り)|誤掲載|誤公開|公開状態', value):
        return 'exposure'
    if re.search(r'内部不正|不正な持ち出し|目的外利用', value):
        return 'insider'
    if re.search(r'不正アクセス[^。]{0,12}(?:なし|なかった|ありません)', value):
        return 'unknown'
    if re.search(r'不正アクセス|不正ログイン|サーバ.{0,8}侵入', value):
        return 'intrusion'
    if re.search(r'誤送|誤交付|誤配|誤投函|誤記載|誤操作', value):
        return 'mistake'
    return 'unknown'


def count_scale(value):
    value = normalized(value)
    match = re.fullmatch(r'(\d[\d,]*)\s*(?:名分|名|人)', value)
    if match and int(match[1].replace(',', '')) > 0:
        number = int(match[1].replace(',', ''))
        return {'value': number, 'unit': 'people', 'qualifier': 'exact',
                'label': f'資料に記載された対象人数 {number:,}人（漏えいのおそれを含む公表値）'}
    return {'value': None, 'unit': 'unknown', 'qualifier': 'undisclosed',
            'label': f'資料の対象欄：{value or "人数・単位の記載を確認できない"}（合計は推定していません）'}


def exclusion_reason(row):
    count = re.sub(r'\s+', '', normalized(row['count']))
    if not count or count in ('なし', '無し', '該当なし', '無') or re.fullmatch(r'[-―—−ー–]+|0(?:人|名分|名|件)?', count):
        return '個人情報漏えい欄に対象なし、または対象の記載を確認できない'
    if not row['department'] or not row['receivedAt'] or row['receivedAt'] > row['publishedAt']:
        return '所管課または報告・覚知日を確認できない'
    return None


def public_key(value):
    parts = urlsplit(value)
    if parts.scheme not in ('https', 'http') or parts.username or parts.password or parts.query:
        raise ValueError('Municipal inputs must use a public URL without credentials or query strings.')
    return urlunsplit((parts.scheme, parts.netloc, parts.path, '', ''))


def verify_input(root, meta):
    path = root / meta['inputFile']
    if path.name != meta['inputFile']:
        raise ValueError('Input names must be simple filenames.')
    if hashlib.sha256(path.read_bytes()).hexdigest() != meta['sha256']:
        raise ValueError(f'Input hash mismatch: {meta["inputFile"]}')
    return path


def yokohama_rows(root, bulletin, as_of):
    reports = []
    for document in bulletin['documents']:
        path = verify_input(root, document)
        with fitz.open(path) as pdf:
            cover = pdf[0].get_text()
            published = full_date(cover)
            if not published or published > as_of:
                raise ValueError(f'No valid official publication date: {document["url"]}')
            expected = re.search(r'1事務処理ミス[^\d]{0,80}(\d+)件', re.sub(r'\s+', '', normalized(cover)))
            if not expected:
                raise ValueError(f'No cover total for table reconciliation: {document["url"]}')
            rows = []
            for page_number, page in enumerate(pdf, 1):
                for table in page.find_tables().tables:
                    cells = table.extract()
                    if not cells or not any('個人情報' in normalized(cell) and '漏' in normalized(cell)
                                            for cell in cells[0]):
                        continue
                    for cells_row in cells[1:]:
                        if not re.fullmatch(r'\d+', normalized(cells_row[0])):
                            continue
                        if len(cells_row) < 5:
                            raise ValueError(f'Incomplete official table: {document["url"]}')
                        number, received, subject, count = map(normalized, cells_row[:4])
                        department = ' '.join(normalized(cell) for cell in cells_row[4:] if cell)
                        rows.append({'row': int(number), 'page': page_number, 'publishedAt': published,
                                     'receivedAt': received_date(received, published), 'department': department,
                                     'subject': subject, 'count': count, 'cause': cause_from_words(subject),
                                     'referenceUrl': document['url'], 'announcementUrl': bulletin['url']})
            if len(rows) != int(expected[1]) or len({r['row'] for r in rows}) != len(rows):
                raise ValueError(f'Table/cover mismatch: {len(rows)}/{expected[1]} rows in {document["url"]}')
            reports.append({**document, 'publisher': '横浜市', 'title': f'事務処理ミス等の一括公表（{published}）',
                            'announcementUrl': bulletin['url'], 'publishedAt': published,
                            'tableRows': len(rows), 'rows': rows})
    return reports


def saitama_rows(root, bulletin, as_of):
    body = verify_input(root, bulletin).read_text()
    h1 = re.search(r'<h1\b[^>]*>(.*?)</h1>', body, re.S)
    published = full_date(clean_html(h1[1]) if h1 else '')
    if not published or published > as_of:
        raise ValueError(f'No valid official publication date: {bulletin["url"]}')
    rows = []
    for table in re.findall(r'<table\b[^>]*>(.*?)</table>', body, re.S | re.I):
        if '個人情報' not in clean_html(table) or '漏えい' not in clean_html(table):
            continue
        for tr in re.findall(r'<tr\b[^>]*>(.*?)</tr>', table, re.S | re.I):
            cells = re.findall(r'<t[dh]\b[^>]*>(.*?)</t[dh]>', tr, re.S | re.I)
            if not cells or not re.fullmatch(r'\d+', clean_html(cells[0])):
                continue
            if len(cells) != 5:
                raise ValueError(f'Unexpected official table columns: {bulletin["url"]}')
            number, received, description, count, classification = map(clean_html, cells)
            match = re.search(r'【([^】]*)】', description)
            department = re.split(r'\d{2,4}-\d{2,4}-\d{3,4}', match[1])[0].strip() if match else ''
            rows.append({'row': int(number), 'page': None, 'publishedAt': published,
                         'receivedAt': full_date(received), 'department': department, 'subject': classification,
                         'searchTerms': [term for term in TERMS if term in description], 'count': count,
                         'cause': cause_from_words(classification + ' ' + description),
                         'referenceUrl': bulletin['url'], 'announcementUrl': bulletin['url']})
    if not rows:
        raise ValueError(f'No individual municipal table rows: {bulletin["url"]}')
    return [{**bulletin, 'title': f'事務処理ミス及び事件・事故の一括公表（{published}）',
             'publishedAt': published, 'tableRows': len(rows), 'rows': rows}]


def build_record(row, publisher):
    row = public_row(row)
    qualified = f'{publisher}（{JURISDICTIONS[publisher]}）'
    digest = hashlib.sha256(f'{row["referenceUrl"]}:row:{row["row"]}'.encode()).hexdigest()[:14]
    page_reference = row['referenceUrl'] + (f'#page={row["page"]}' if row['page'] else '')
    sources = [{'title': f'{publisher}・公式一括公表資料（掲載No.{row["row"]}）',
                'url': page_reference, 'publishedAt': row['publishedAt']}]
    if row['announcementUrl'] != row['referenceUrl']:
        sources.append({'title': f'{publisher}・資料掲載ページ', 'url': row['announcementUrl'],
                        'publishedAt': row['publishedAt']})
    aliases = [publisher, row['department'], *row.get('searchTerms', []), row['classification']]
    return {'id': f'jp-municipal-{digest}', 'company': qualified, 'companyId': publisher,
            'shortName': f'{publisher} · {row["department"]}', 'aliases': sorted({v for v in aliases if v}), 'sector': 'government',
            'cause': row['cause'], 'year': int(row['publishedAt'][:4]), 'announcedAt': row['publishedAt'],
            'sourceUpdatedAt': None, 'status': 'notice', 'sourceKind': 'municipal-disclosure', 'dateKind': 'published',
            'scale': count_scale(row['count']),
            'summary': f'{publisher}の公式一括公表資料に掲載された、{row["department"]}の記録（No.{row["row"]}）です。'
                       f'本アプリでは「{row["classification"]}」に整理しています。件名・内容は原資料の掲載行を参照してください。記載人数には漏えいのおそれがある対象も含まれます。',
            'informationTypes': ['対象の情報項目は原資料の掲載行を参照'],
            'scopeNote': f'{publisher}の所管課・委託先等について公表された掲載事案。地図の都道府県は自治体の所管地域で、攻撃元や侵入した端末の位置を示しません。',
            'countNote': '資料の「個人情報漏えい」欄の公表値です。実際の閲覧や流出が確認された人数だけの数値ではありません。'
                         '日付欄は報告を受けた日または発生を覚知した日で、発生日・公表日とは区別しています。'
                         '個別公表や他の資料に同じ事案が掲載される場合があります。記録間の人数は合算しません。',
            'sources': sources, 'noticeDetails': {'publications': 1, 'countReviewed': True},
            'municipalDetails': {'publisher': publisher, 'department': row['department'], 'row': row['row'],
                                 'page': row['page'], 'receivedAt': row['receivedAt'], 'classification': row['classification'],
                                 'reportedCount': row['count']}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input-dir', type=Path, required=True)
    args = parser.parse_args()
    inputs = json.loads((args.input_dir / 'municipal-inputs.json').read_text())
    as_of = inputs['retrievedAt']
    existing = [record for name in BASE_FILES for record in json.loads((RESEARCH / name).read_text())['incidents']]
    existing_urls = {}
    for record in existing:
        for source in record['sources']:
            # Existing imported URLs can legitimately contain public article identifiers.
            parts = urlsplit(source['url'])
            if not parts.query:
                existing_urls.setdefault(urlunsplit((parts.scheme, parts.netloc, parts.path, '', '')), record['id'])
    reports = []
    for index, bulletin in enumerate(inputs['inputs']):
        verify_input(args.input_dir, bulletin)
        reader = yokohama_rows if bulletin['kind'] == 'yokohama-bulletin' else saitama_rows
        reports.extend(reader(args.input_dir, bulletin, as_of))
        if index % 10 == 0:
            print(f'表の行数を照合: {index + 1}/{len(inputs["inputs"])}', flush=True)
    incidents, supplements, fingerprints = [], [], {}
    for report in reports:
        ledger = []
        for row in report.pop('rows'):
            audit = {key: value for key, value in public_row(row).items() if key not in ('searchTerms',)}
            audit['cause'] = row['cause']
            excluded = exclusion_reason(row)
            if excluded:
                audit.update(disposition='excluded', reason=excluded)
            elif public_key(row['referenceUrl']) in existing_urls or public_key(row['announcementUrl']) in existing_urls:
                incident_id = existing_urls.get(public_key(row['referenceUrl'])) or existing_urls[public_key(row['announcementUrl'])]
                audit.update(disposition='merged-existing', incidentIds=[incident_id],
                             reason='同じ一括公表資料が既存記録で参照されているため個別行を重ねて加算しない')
            else:
                # Two rows with the same date, department and short classification can be
                # distinct incidents. Only identical source rows are automatic duplicates.
                fingerprint = (public_key(row['referenceUrl']), row['row'])
                if fingerprint in fingerprints:
                    audit.update(disposition='duplicate', incidentIds=[fingerprints[fingerprint]],
                                 reason='同じ原資料URL・掲載No.の行を重複して取得')
                else:
                    record = build_record(row, report['publisher'])
                    incidents.append(record)
                    fingerprints[fingerprint] = record['id']
                    audit.update(disposition='included', incidentIds=[record['id']])
            ledger.append(audit)
        report['ledger'] = ledger
        counts = Counter(row['disposition'] for row in ledger)
        report.update({key: counts[key] for key in ('included', 'excluded', 'duplicate', 'merged-existing')})
        report['selection'] = '個人情報漏えい欄に対象がある個別の掲載行。日付・所管課・公表値・参照URLを収録。本文や連絡先は配布しません。'
    summary = {'asOf': as_of, 'baseJapaneseRecords': len(existing), 'addedJapaneseRecords': len(incidents),
               'totalJapaneseRecords': len(existing) + len(incidents),
               'newCauses': dict(Counter(record['cause'] for record in incidents)),
               'newPublishers': dict(Counter(record['municipalDetails']['publisher'] for record in incidents)),
               'dispositions': dict(Counter(row['disposition'] for report in reports for row in report['ledger'])),
               'inputDocuments': len(reports),
               'reports': [{key: value for key, value in report.items() if key != 'ledger'} for report in reports]}
    output = {'asOf': as_of, 'incidents': sorted(incidents, key=lambda record: (record['announcedAt'], record['id']), reverse=True),
              'supplements': supplements, 'patches': []}
    (RESEARCH / 'municipal-notices.json').write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n')
    (RESEARCH / 'municipal-notice-coverage.json').write_text(json.dumps({'asOf': as_of, 'reports': reports}, ensure_ascii=False, separators=(',', ':')) + '\n')
    (RESEARCH / 'municipal-notice-manifest.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: value for key, value in summary.items() if key != 'reports'}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
