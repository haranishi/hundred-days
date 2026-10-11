"""Download public government exports; never submit a breach or store session state."""
import argparse, csv, hashlib, http.cookiejar, json, pathlib, re, ssl
import urllib.parse, urllib.request, xml.etree.ElementTree as ET
from html.parser import HTMLParser
import certifi

class Form(HTMLParser):
    def __init__(self):
        super().__init__(); self.fields={}; self.active=False; self.link={}; self.csv_action=None
    def handle_starttag(self, tag, attributes):
        a=dict(attributes)
        if tag=='form': self.active=a.get('id')=='ocrForm'
        if self.active and tag=='input' and a.get('type')=='hidden': self.fields[a['name']]=a.get('value','')
        if tag=='a': self.link=a
        if tag=='img' and a.get('alt')=='CSV':
            match=re.search(r"\{'([^']+)':",self.link.get('onclick',''))
            if match: self.csv_action=match.group(1)
    def handle_endtag(self, tag):
        if tag=='form': self.active=False
        if tag=='a': self.link={}

def read_hhs(client, output, manifest):
    home='https://ocrportal.hhs.gov/ocr/breach/breach_frontpage.jsf'
    raw=client.open(home,timeout=60).read(); form=Form(); form.feed(raw.decode())
    response=client.open(urllib.request.Request(home,data=urllib.parse.urlencode({**form.fields,'ocrForm:j_idt39':'ocrForm:j_idt39'}).encode()),timeout=60)
    page=response.read().decode(); endpoint=response.url.split(';')[0]; form=Form(); form.feed(page)
    for kind in ['investigation','archive']:
        if kind=='archive':
            fields={**form.fields,'javax.faces.partial.ajax':'true','javax.faces.source':'ocrForm:j_idt32','javax.faces.partial.execute':'ocrForm:j_idt32','javax.faces.partial.render':'ocrForm:breachReports ocrForm:results','javax.faces.behavior.event':'tabChange','javax.faces.partial.event':'tabChange','ocrForm:j_idt32_newTab':'ocrForm:j_idt32:archiveTab','ocrForm:j_idt32_tabindex':'1','ocrForm:j_idt32_activeIndex':'1'}
            response=client.open(urllib.request.Request(endpoint,data=urllib.parse.urlencode(fields).encode(),headers={'Faces-Request':'partial/ajax'}),timeout=60)
            xml=ET.fromstring(response.read()); updates=xml.findall('.//update'); markup=''.join(u.text or '' for u in updates if not u.attrib['id'].endswith('ViewState'))
            next_form=Form(); next_form.feed('<form id="ocrForm">'+markup+'</form>')
            for update in updates:
                if update.attrib['id'].endswith('ViewState'): form.fields['javax.faces.ViewState']=update.text
            form.fields.update(next_form.fields); form.fields['ocrForm:j_idt32_activeIndex']='1'
            form.csv_action=next_form.csv_action
            page=markup
        if not form.csv_action: raise RuntimeError('Public CSV control not found')
        response=client.open(urllib.request.Request(endpoint,data=urllib.parse.urlencode({**form.fields,form.csv_action:form.csv_action}).encode()),timeout=90)
        raw=response.read()
        if 'csv' not in response.headers.get('Content-Type',''): raise RuntimeError('Expected CSV export')
        name='hhs-'+kind+'.csv'; (output/name).write_bytes(raw)
        rows=list(csv.DictReader(raw.decode('utf-8-sig').splitlines()))
        match=re.search(r'rowCount:(\d+)',page)
        expected=int(match.group(1)) if match else None
        if expected is not None and len(rows)!=expected: raise RuntimeError(f'Export/table count mismatch: {len(rows)} vs {expected}')
        manifest.append({'file':name,'publisher':'HHS OCR','sourceUrl':endpoint,'rows':len(rows),'tableCount':expected,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)})
        print(json.dumps(manifest[-1]))

parser=argparse.ArgumentParser(); parser.add_argument('--output',default='/private/tmp/day064-public-registers'); args=parser.parse_args()
output=pathlib.Path(args.output); output.mkdir(exist_ok=True,parents=True)
client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=certifi.where())))
manifest=[]
url='https://www.oag.ca.gov/privacy/databreach/list-export'; raw=client.open(url,timeout=60).read(); (output/'california.csv').write_bytes(raw)
manifest.append({'file':'california.csv','publisher':'California DOJ','sourceUrl':url,'rows':len(list(csv.DictReader(raw.decode('utf-8-sig').splitlines()))),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)})
print(json.dumps(manifest[-1])); read_hhs(client,output,manifest)
(output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
