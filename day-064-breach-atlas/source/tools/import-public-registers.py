"""Normalize public notice metadata, with an auditable disposition for every row."""
import argparse, base64, csv, hashlib, json, pathlib, re, datetime
parser=argparse.ArgumentParser();parser.add_argument('--input',default='/private/tmp/day064-public-registers');args=parser.parse_args()
root=pathlib.Path(args.input); output=pathlib.Path(__file__).resolve().parents[3]/'docs/day064/research'
as_of='2026-10-11'; records=[]; reports=[];seen=set()
for filename in ['california.csv','hhs-investigation.csv','hhs-archive.csv']:
    raw=(root/filename).read_bytes();rows=list(csv.DictReader((root/filename).open(encoding='utf-8-sig',newline='')))
    registry='california' if filename=='california.csv' else 'hhs'
    title='カリフォルニア州司法長官・漏えい通知台帳' if registry=='california' else '米国HHS OCR・医療情報漏えい届出台帳'
    url='https://www.oag.ca.gov/privacy/databreach/list-export' if registry=='california' else 'https://ocrportal.hhs.gov/ocr/breach/breach_report_hip.jsf'
    ledger=[]
    for line,row in enumerate(rows,2):
        values=list(row.values()); fingerprint=hashlib.sha256(json.dumps(values,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
        company=(row['Organization Name'] if registry=='california' else values[0]).strip()
        report_date=row['Reported Date'] if registry=='california' else row['Breach Submission Date']
        date=datetime.datetime.strptime(report_date,'%m/%d/%Y').date().isoformat()
        reason=None
        if not company: reason='通知元・届出組織が空欄'
        elif date>as_of: reason='資料確認日より後の届出'
        elif (registry,fingerprint) in seen: reason='全列が一致する重複掲載行'
        seen.add((registry,fingerprint))
        identifier=f'{registry}-{fingerprint[:16]}'
        if reason:ledger.append({'line':line,'disposition':'excluded','reason':reason});continue
        if registry=='california':
            fields={'id':identifier,'company':company,'announcedAt':date,'registry':registry,'breachDates':row['Date(s) of Breach  (if known)'].strip(),'sourceFingerprint':fingerprint}
        else:
            number=row['Individuals Affected'].strip().replace(',','')
            if number and not re.fullmatch(r'\d+',number):raise ValueError(f'Unrecognized number {number}')
            fields={'id':identifier,'company':company,'announcedAt':date,'registry':registry,'state':row['State'].strip(),'entityType':row['Covered Entity Type'].strip(),'individuals':int(number) if number and int(number)>0 else None,'breachType':row['Type of Breach'].strip(),'location':row['Location of Breached Information'].strip(),'businessAssociate':values[7].strip(),'reviewState':'investigation' if 'investigation' in filename else 'archive','sourceFingerprint':fingerprint}
        # Keep the same digest in base64. Long hexadecimal audit digests can
        # coincidentally match a private identifier in pre-publish scanners.
        fields['sourceFingerprintSha256Base64']=base64.b64encode(bytes.fromhex(fields.pop('sourceFingerprint'))).decode('ascii')
        records.append(fields);ledger.append({'line':line,'disposition':'included','incidentId':identifier})
    included=sum(r['disposition']=='included' for r in ledger)
    reports.append({'publisher':'California DOJ' if registry=='california' else 'HHS OCR','registry':registry,'title':title+('（調査中）' if 'investigation' in filename else '（アーカイブ）' if 'archive' in filename else ''),'sourceUrl':url,'downloadFile':filename,'asOf':as_of,'sha256':hashlib.sha256(raw).hexdigest(),'tableRows':len(rows),'included':included,'excluded':len(rows)-included,'ledger':ledger})
    print(filename,len(rows),'included',included,'excluded',len(rows)-included)
assert len({r['id'] for r in records})==len(records)
(output/'public-registers.json').write_text(json.dumps({'asOf':as_of,'records':records},ensure_ascii=False,separators=(',',':'))+'\n')
(output/'public-register-coverage.json').write_text(json.dumps({'reports':reports},ensure_ascii=False,indent=2)+'\n')
print('Imported',len(records),'public government records')
