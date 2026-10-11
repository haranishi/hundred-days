"""Import factual records from all rows of IPA's dated external-intrusion tables."""
import argparse
import hashlib
import importlib.util
import json
import re
from pathlib import Path

spec = importlib.util.spec_from_file_location('ppc', Path(__file__).with_name('import-ppc-history.py'))
ppc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ppc)

ALIASES = {
    '東京メトロポリタンテレビジョン': ['TOKYO MX'], 'ほくやく・竹山ホールディングス': ['アドウイック', 'シマフクロウ'],
    'ラッシュ': ['キルフェボン'], 'ファーストリテイリング': ['ユニクロ', 'UNIQLO', 'GU', 'ジーユー'],
    'サンポークリエイト': ['アネモネ'], 'DigiBook': ['デジブック'], 'スープレックス': ['ラーメンデータベース'],
    'フィセル': ['10mois'], 'JIMOS': ['マキアレイベル', 'Coyori'], 'ビーグリー': ['ノベルバ'],
    'ナカバヤシ': ['フエルモール'], 'リジョブ': ['REJOB'], 'キタムラ': ['カメラのキタムラ'],
    'Peatix Japan': ['ピーティックス'], 'TIMERS': ['Famm', 'ファム'], 'マイナビ': ['マイナビ転職'],
    'アーバンリサーチ': ['URBAN RESEARCH', 'UR CLUB'],
}
OVERRIDES = {
    '国土交通省': (None, 'unknown', '最大4,335件の回答者情報・最大194,834件の登記情報（合算しない）'),
    'おもちゃ箱': (None, 'unknown', '流出証跡210件・流出可能性40,233件（合算しない）'),
    '京都一の傳': (None, 'unknown', 'カード18,855件・会員72,738件（重複を推定しない）'),
    'ナカバヤシ': (120000, 'records', '顧客情報12万件の流出可能性（カード情報94名分とは合算しない）'),
    'フィセル': (108131, 'records', '個人情報108,131件の流出可能性（カード情報11,913件とは合算しない）'),
    'TIMERS': (1430000, 'records', '最大143万件のユーザーテーブル（各情報項目の件数は加算しない）'),
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, required=True)
    args = parser.parse_args()
    research = Path(__file__).resolve().parents[3] / 'docs/day064/research'
    sources = json.loads((args.input / 'manifest.json').read_text())['sources']
    incidents, coverage = [], []
    for source in sources:
        year = source['year']
        report = {'year': year, 'title': f'IPA 情報セキュリティ白書{year}', 'url': source['url'], 'sha256': source['sha256'], 'casePages': [], 'rows': [], 'selection': '企業・組織名と公表日を持つ、外部からの不正アクセスによる情報漏えいの主な事例表を全行確認。外国組織のみの事例は除外。その他の本文事例・別表を全て収録したものではありません。'}
        pages = json.loads((args.input / f'{source["file"]}.json').read_text())
        for page in pages:
            for table in page['tables']:
                if len(table[0]) != 3 or not any('組織名' in str(cell) or '法人・団体名' in str(cell) for cell in table[0]):
                    continue
                report['casePages'].append(page['page'])
                date_index = next(i for i, cell in enumerate(table[0]) if '公表日' in str(cell) or '情報公開日' in str(cell))
                company_index = 1 if date_index == 0 else 0
                current_year = year - 1
                for row in table[1:]:
                    raw_date, company, description = map(ppc.clean, [row[date_index], row[company_index], row[2]])
                    explicit_year = re.search(r'(20\d{2})年', raw_date)
                    if explicit_year:
                        current_year = int(explicit_year[1])
                    md = re.search(r'(\d+)月(\d+)日', raw_date)
                    if not md:
                        raise ValueError(f'Undated row: {year}: {company}')
                    announced = f'{current_year}-{int(md[1]):02d}-{int(md[2]):02d}'
                    ledger = {'company': company, 'announcedAt': announced, 'page': page['page']}
                    report['rows'].append(ledger)
                    if company == 'FASTBOOKING':
                        ledger.update({'action': 'excluded', 'reason': '外国企業の事例。本アプリの企業・組織の収録範囲から除外'})
                        continue
                    evidence = {'title': f'IPA 白書{year}・情報漏えい事例表（PDF {page["page"]}ページ）', 'url': f'{source["url"]}#page={page["page"]}', 'publishedAt': None}
                    short = re.sub(r'株式会社|有限会社|国立研究開発法人', '', company)
                    short = short.replace('J.フロントリテイリング・(ディンプル)', 'ディンプル（J.フロントリテイリング）')
                    if '全日本空輸' in company and '日本航空' in company:
                        parts = [('全日本空輸株式会社', 'ANA', 1000000, 'people', '約100万人', ['全日空']), ('日本航空株式会社', 'JAL', 919685, 'people', '919,685人', ['日本航空'])]
                    else:
                        quantities = re.findall(r'([0-9,十百千万億.]+)(人|名|件)', description)
                        value, unit, label = OVERRIDES.get(short, (ppc.number(quantities[0][0]) if quantities else None, 'people' if quantities and quantities[0][1] in ['人', '名'] else 'records' if quantities else 'unknown', ''))
                        parts = [(company, short, value, unit, label, ALIASES.get(short, []))]
                    identifiers = []
                    for full, name, value, unit, label, aliases in parts:
                        identifier = f'ipa-{announced}-{hashlib.sha256(full.encode()).hexdigest()[:8]}'
                        identifiers.append(identifier)
                        qualifier = 'undisclosed' if value is None else 'approximate' if '約' in description else 'maximum' if '最大' in description else 'exact'
                        if name == 'JAL':
                            qualifier = 'exact'
                        bound = 'maximum' if value is not None and '最大' in description else None
                        count = {'value': value, 'unit': unit, 'qualifier': qualifier, 'label': label or (f'{"最大" if bound else "約" if qualifier == "approximate" else ""}{value:,}{"人" if unit == "people" else "件"}' if value is not None else '規模はこの表では未公表')}
                        if bound:
                            count['bound'] = bound
                        status = 'possible' if re.search(r'可能性|恐れ|おそれ|見られる', description) else 'confirmed'
                        if name in ['おもちゃ箱', '京都一の傳']:
                            status = 'possible'
                        incidents.append({'id': identifier, 'company': full, 'shortName': name, 'aliases': aliases, 'sector': 'other', 'cause': 'intrusion', 'year': current_year, 'announcedAt': announced, 'sourceUpdatedAt': announced, 'status': status, 'scale': count,
                            'summary': '外部からの不正アクセスによる情報漏えいの公表事案として、IPAの白書に掲載されています。',
                            'informationTypes': ppc.information(description), 'scopeNote': f'{year}年版のIPA白書に記載された{ name }の対象区分です。国内外や利用者・登録者の範囲が事例ごとに異なるため、他事例と合計しません。',
                            'countNote': 'IPAの事例表に記載された公表規模です。可能性を含む値は全数の流出確認ではありません。個人情報、カード情報、情報項目など複数の数がある場合は、対象の定義を保ち、重複する数を加算しません。企業の後の続報を網羅した値ではありません。' + ('複数の区分の総数を確定できないため、合計を数値化していません。' if value is None else ''),
                            'sourceKind': 'government-report', 'sources': [evidence]})
                    ledger.update({'action': 'split-row' if len(parts) > 1 else 'imported', 'incidentIds': identifiers})
        report.update({'status': 'case-table' if report['rows'] else 'narrative-only', 'sourceRows': len(report['rows']), 'imported': sum(len(r.get('incidentIds', [])) for r in report['rows']), 'excluded': sum(r['action'] == 'excluded' for r in report['rows'])})
        if not report['rows']:
            report['selection'] = '本文の個別事例はありますが、同形式の公表日・組織名付き事例表はありません。補完事例は企業の公式発表から別途収録しています。'
        coverage.append(report)
    (research / 'ipa-history.json').write_text(json.dumps({'incidents': incidents}, ensure_ascii=False, indent=2) + '\n')
    (research / 'ipa-coverage.json').write_text(json.dumps({'reports': coverage}, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'incidents': len(incidents), 'rowsReviewed': sum(r['sourceRows'] for r in coverage), 'excluded': sum(r['excluded'] for r in coverage)}))


if __name__ == '__main__':
    main()
