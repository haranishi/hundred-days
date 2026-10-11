"""Normalize every named case row in downloaded government annual-report tables."""
import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path


def clean(value):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', str(value or '')))


def dates(value):
    result = []
    for era, y, m, d in re.findall(r'(平成|令和)(\d+)年(\d+)月(\d+)日', clean(value)):
        result.append(f'{int(y) + (1988 if era == "平成" else 2018):04d}-{int(m):02d}-{int(d):02d}')
    return sorted(set(result))


def number(value):
    value = value.replace(',', '')
    total = section = 0
    digits = ''
    for ch in value:
        if ch.isdigit() or ch == '.':
            digits += ch
        elif ch in '十百千':
            section += (float(digits) if digits else 1) * {'十': 10, '百': 100, '千': 1000}[ch]
            digits = ''
        elif ch in '万億':
            section += float(digits) if digits else 0
            total += (section or 1) * {'万': 10000, '億': 100000000}[ch]
            section = 0
            digits = ''
        else:
            raise ValueError(f'Unsupported numeric character: {ch}')
    return int(total + section + (float(digits) if digits else 0))


def scale(value):
    value = clean(value)
    parts = re.findall(r'([0-9,十百千万億.]+)(人|名|件)', value)
    if len(parts) != 1:
        return {'value': None, 'unit': 'unknown', 'qualifier': 'undisclosed', 'label': value or '規模未公表'}
    quantity, unit = parts[0]
    return {'value': number(quantity), 'unit': 'people' if unit in ['人', '名'] else 'records', 'qualifier': 'approximate' if '約' in value else 'exact', 'bound': 'maximum', 'label': f'{value}（年度表の掲載規模）'}


def classify(value):
    if re.search(r'ウイルス|ウィルス|サイバー|不正アクセス|不正ログイン|不正アタック|リスト型', value):
        return 'intrusion'
    if re.search(r'持ち出|持出|売却|販売|第三者提供|不正行為', value):
        return 'insider'
    if re.search(r'誤送|誤表示|誤交付|他の委託元', value):
        return 'mistake'
    if re.search(r'紛失|盗難|廃棄|消失', value):
        return 'loss'
    if re.search(r'設定|外部から閲覧|サーバに掲載|閲覧できる', value):
        return 'exposure'
    if 'システムバグ' in value:
        return 'mistake'
    return 'unknown'


CAUSE_DESCRIPTIONS = {
    'intrusion': 'システムへの侵入や不正ログインなどによって、情報が対象になった事案です。',
    'insider': '従業者や関係者による情報の持ち出し・第三者への提供などが報告された事案です。',
    'loss': '情報を含む書類・機器・記録媒体の紛失、盗難や廃棄などが報告された事案です。',
    'mistake': '情報の送付先やシステム処理などの誤りが報告された事案です。',
    'exposure': '情報を外部から閲覧できる状態などが報告された事案です。',
    'unknown': '公表資料では原因の特定ができない事案です。',
}


def information(value):
    if '公表せず' in value:
        return ['個人情報（企業による詳細項目は未公表）']
    keys = [
        ('氏名|名前|契約者名|申込者名', '氏名'), ('住所|郵便番号', '住所'),
        ('生年月日', '生年月日'), ('性別', '性別'), ('電話|FAX', '電話番号等'),
        ('メール', 'メールアドレス等'), ('パスワード|PASS', 'パスワード等'),
        ('クレジット|カード番号|カード会員', 'クレジットカード情報等'),
        ('口座|残高|資産', '口座・金融情報等'), ('取引|購入|請求|金額|使用量', '取引・利用情報等'),
        ('証券|保険|被保険', '保険関連情報等'), ('医療|検査|再審査', '医療関連情報等'),
        ('パスポート', 'パスポート情報等'), ('ID|学籍|会員番号|顧客番号', 'ID・会員番号等'),
        ('ニックネーム', 'ニックネーム'), ('家族|子供|保証人', '家族・保証人関連情報等'),
    ]
    return [label for pattern, label in keys if re.search(pattern, value)] or ['個人情報（資料記載の対象区分）']


ALIASES = {
    'ジェイティービー': ['JTB', 'i.JTB'], 'ジンズ': ['JINS'],
    'エヌ・ティ・ティ・コミュニケーションズ': ['NTTコミュニケーションズ', 'OCN'],
    'エヌ・ティ・ティレゾナント': ['NTTレゾナント', 'goo'],
    'サミーネットワークス': ['Sammy', '777town.net'],
    'サイバーエージェント': ['CyberAgent', 'Ameba', 'アメーバ'],
    'ドワンゴ': ['DWANGO', 'niconico', 'ニコニコ'],
    'ヤフー': ['Yahoo! JAPAN', 'Yahooメール'], 'サンリオデジタル': ['SanrioTown'],
    'ユニットコム': ['パソコン工房', 'Unitcom'], 'スクウェア・エニックス': ['Square Enix', 'スクエニ'],
    'イプサ': ['IPSA'], 'ワイジェイFX': ['YJFX'], 'NETSEA': ['ネッシー'],
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, required=True)
    args = parser.parse_args()
    research = Path(__file__).resolve().parents[3] / 'docs/day064/research'
    manifest = json.loads((args.input / 'manifest.json').read_text())
    incidents = {}
    supplements = []
    coverage = []
    for source in manifest['sources']:
        pages = json.loads((args.input / (source['file'] + '.json')).read_text())
        fiscal_year = 1988 + int(re.search(r'_(\d+)', source['file'])[1])
        url = source['url'].replace('/pdf//', '/pdf/')
        item = {'year': fiscal_year, 'title': f'{fiscal_year}年度 個人情報保護法施行状況の概要', 'url': url, 'sha256': source['sha256'], 'casePages': [p['page'] for p in pages], 'rows': []}
        for page in pages:
            for table in page['tables']:
                for row in table[1:]:
                    if not row or not row[0] or clean(row[0]) == '事業者名':
                        continue
                    if len(row) not in (8, 10):
                        raise ValueError(f'Unexpected table schema in {source["file"]}: {len(row)} columns')
                    company, _, announced, raw_count, raw_fields, raw_cause = map(clean, row[:6])
                    announced_dates = dates(announced)
                    ledger = {'company': company, 'announcedAt': announced_dates[0] if announced_dates else None, 'page': page['page']}
                    item['rows'].append(ledger)
                    if company.startswith('不明') or not announced_dates:
                        ledger.update({'action': 'excluded', 'reason': '企業名・公表日が資料で特定できない匿名事案'})
                        continue
                    company = re.split(r'\(委託先', company)[0]
                    short = re.sub(r'株式会社|有限会社|学校法人|公益社団法人', '', company)
                    short = re.sub(r'\(現[^)]+\)', '', short)
                    short = short.replace('関西大学関西大学', '関西大学')
                    short = {'ジャパン・プロフェッショナル・バスケットボールリーグ': 'B.LEAGUE'}.get(short, short)
                    evidence = {'title': f'{fiscal_year}年度 施行状況概要・主な事案表（PDF {page["page"]}ページ）', 'url': f'{url}#page={page["page"]}', 'publishedAt': None}
                    existing_id = None
                    if 'ベネッセ' in company and announced_dates[0] == '2014-07-09':
                        existing_id = 'benesse-customer-2014'
                    elif 'ソニー・コンピュータ' in company and announced_dates[0] == '2011-04-27':
                        existing_id = 'sony-psn-2011'
                    if existing_id:
                        supplements.append({'incidentId': existing_id, 'source': evidence})
                        ledger.update({'action': 'merged-existing', 'incidentId': existing_id, 'reason': '既存事例と同じ事故。既存の続報・対象範囲と単位を優先'})
                        continue
                    company_id = re.sub(r'[・.\-\(\)]', '', short).lower()
                    key = (company_id, announced_dates[0])
                    if key in incidents:
                        if evidence['url'] not in [s['url'] for s in incidents[key]['sources']]:
                            incidents[key]['sources'].append(evidence)
                        ledger.update({'action': 'duplicate', 'incidentId': incidents[key]['id'], 'reason': '複数省庁が掲載した同一事案'})
                        continue
                    cause = classify(raw_cause)
                    count = scale(raw_count)
                    count_note = '政府の年度資料にある「漏えい人数（最大）」欄の掲載規模です。「件」と「人・名」の原表記を区別しています。流出確認数・閲覧可能数・紛失対象などの定義は事案により異なり、被害者の総数には換算しません。資料後の企業の続報を網羅した値ではありません。'
                    if count['value'] is None:
                        count_note += '資料が複数の数値を併記しているため、合計を推定せず、原表記を残しています。'
                    if 'ソニー・コンピュータ' in company and announced_dates[0] == '2013-11-22':
                        count = {'value': None, 'unit': 'unknown', 'qualifier': 'undisclosed', 'label': f'{raw_count}（数値の対象定義を保留）'}
                        count_note += '年度表は約1,200万件と記載していますが、この資料だけでは流出確認数と通知・ログイン対象数を区別できないため、規模比較の数値には使いません。'
                    if short == 'ヤフー' and announced_dates[0] == '2015-09-06':
                        cause = 'loss'
                        count_note += '対象は電子メールで、システム処理による消失等の区分です。外部への情報流出が確認された人数として扱いません。'
                    if '回収済' in raw_cause:
                        count_note += '資料は記録媒体の回収済みを記載しています。第三者への流出確認とは区別します。'
                    status = 'confirmed' if re.search(r'売却|販売|第三者提供|アップロード|インターネット上で閲覧', raw_cause) else 'possible'
                    identifier = f'ppc-{announced_dates[0]}-{hashlib.sha256(company_id.encode()).hexdigest()[:8]}'
                    incident = {
                        'id': identifier, 'companyId': company_id, 'company': company, 'shortName': short,
                        'aliases': ALIASES.get(short, []), 'sector': 'finance' if re.search(r'銀行|信用|生命|保険|証券|カード|FX', company) else 'other',
                        'cause': cause, 'year': int(announced_dates[0][:4]), 'announcedAt': announced_dates[0], 'sourceUpdatedAt': announced_dates[-1],
                        'status': status, 'scale': count, 'summary': CAUSE_DESCRIPTIONS[cause],
                        'informationTypes': information(raw_fields),
                        'scopeNote': f'{fiscal_year}年度の政府公表資料に掲載された{short}の事案。年度資料では漏えい・紛失・滅失等をまとめて扱っています。対象者や情報区分が他事例と重なる可能性があるため、全体で加算しません。',
                        'countNote': count_note, 'causeNote': raw_cause, 'sourceKind': 'government-report', 'sources': [evidence],
                    }
                    incidents[key] = incident
                    ledger.update({'action': 'imported', 'incidentId': identifier})
        item.update({
            'status': 'case-table' if item['rows'] else 'aggregate-only',
            'sourceRows': len(item['rows']),
            **{action: sum(r['action'] == action for r in item['rows']) for action in ['imported', 'duplicate', 'merged-existing', 'excluded']},
            'selection': '主な公表事案の年度表。原資料の規模・所管省庁による掲載条件があり、全国の全事案を列挙した資料ではありません。' if item['rows'] else '統計は掲載されていますが、企業名・公表日付きの個別事例表は掲載されていません。',
        })
        coverage.append(item)
    research.mkdir(parents=True, exist_ok=True)
    (research / 'government-history.json').write_text(json.dumps({'incidents': list(incidents.values()), 'supplements': supplements}, ensure_ascii=False, indent=2) + '\n')
    (research / 'coverage.json').write_text(json.dumps({'index': manifest['index'], 'asOf': '2026-10-11', 'reports': coverage}, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'incidents': len(incidents), 'rowsReviewed': sum(c['sourceRows'] for c in coverage), 'mergedExisting': len(supplements), 'duplicate': sum(c['duplicate'] for c in coverage), 'excluded': sum(c['excluded'] for c in coverage)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
