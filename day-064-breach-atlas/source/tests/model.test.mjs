import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { CAUSES, UNITS, DEFAULT_FILTERS, normalize, filterIncidents, unitCounts, radiusFor, shortScale, layoutGraph, shareUrl, selectionFromUrl, relatedIncidents } from '../src/model.mjs';
const data = JSON.parse(readFileSync(new URL('../src/data.json', import.meta.url), 'utf8'));
const incidents = data.incidents, byId = id => incidents.find(record => record.id === id);
const japanManifest = JSON.parse(readFileSync(new URL('../../../docs/day064/research/japan-notice-manifest.json', import.meta.url), 'utf8'));
const municipalManifest = JSON.parse(readFileSync(new URL('../../../docs/day064/research/municipal-notice-manifest.json', import.meta.url), 'utf8'));
const japanReferences = new Set(data.coverage.reports.filter(report => report.publisher?.includes('アーカイブ') || report.publisher?.includes('事例索引')).flatMap(report => [report.url, ...report.ledger.flatMap(row => [row.url, row.archiveUrl].filter(Boolean))]));
const hosts = new Set(['blog.playstation.com','corp.rakuten.co.jp','estore.jp','global.toyota','group.kadokawa.co.jp','newsroom.kddi.com','ocrportal.hhs.gov','pdf.irpocket.com','support.nintendo.com','www.asahigroup-holdings.com','www.askul.co.jp','www.benesse.co.jp','www.capcom.co.jp','www.docomo.ne.jp','www.fastretailing.com','www.his.co.jp','www.intellilink.co.jp','www.ipa.go.jp','www.kadokawa.co.jp','www.kddi.com','www.lawson.co.jp','www.lashinbang.com','www.lycorp.co.jp','www.nttdata-act.com','www.oag.ca.gov','www.oaic.gov.au','www.ppc.go.jp','www.resorttrust.co.jp','www.softbank.jp','www.u-can.co.jp','www.universal-music.co.jp']);

test('compressed public download preserves the complete snapshot within the hosting limit', () => {
  const compressed = readFileSync(new URL('../public/data/incidents.json.gz', import.meta.url));
  assert.ok(compressed.length < 25 * 1024 * 1024);
  assert.deepEqual(gunzipSync(compressed), readFileSync(new URL('../src/data.json', import.meta.url)));
});

test('expanded real public records have qualified scales, dates and traceable sources', () => {
  assert.equal(incidents.length, 13349 + municipalManifest.totalJapaneseRecords); assert.equal(new Set(incidents.map(record => record.id)).size, incidents.length);
  assert.equal(incidents.filter(record => record.region === 'japan').length, municipalManifest.totalJapaneseRecords);
  assert.equal(incidents.filter(record => record.registry === 'california').length, 5336);
  assert.equal(incidents.filter(record => record.registry === 'hhs').length, 8013);
  for (const record of incidents) {
    assert.match(record.id, /^[a-z0-9-]+$/);
    for (const field of ['company','companyId','shortName','summary','scopeNote','countNote']) assert.ok(record[field]?.length, `${record.id}: ${field}`);
    assert.ok(CAUSES[record.cause]); assert.ok(UNITS[record.scale.unit]); assert.notEqual(record.scale.unit, 'all');
    assert.ok(['confirmed','possible','reported','notice'].includes(record.status));
    assert.ok(record.informationTypes.length && record.sources.length);
    assert.equal(record.year, Number(record.announcedAt.slice(0,4)));
    for (const date of [record.announcedAt,record.sourceUpdatedAt,...record.sources.map(source => source.publishedAt)].filter(Boolean)) {
      assert.match(date, /^\d{4}-\d{2}(-\d{2})?$/); assert.ok(date <= data.asOf);
      const precise = date.length === 7 ? `${date}-01` : date;
      assert.equal(new Date(precise).toISOString().slice(0,10), precise);
    }
    if (record.announcedAt.length === 7) assert.equal(record.datePrecision, 'month');
    if (record.scale.unit === 'unknown') assert.equal(record.scale.value, null);
    else assert.ok(Number.isSafeInteger(record.scale.value) && record.scale.value > 0);
    assert.ok(['exact','approximate','estimated','maximum','undisclosed'].includes(record.scale.qualifier));
    for (const source of record.sources) {
      const url = new URL(source.url), importedReference = japanReferences.has(source.url);
      assert.ok(importedReference ? ['https:', 'http:'].includes(url.protocol) : url.protocol === 'https:');
      assert.ok(importedReference || hosts.has(url.hostname) || (record.sourceKind === 'municipal-disclosure' && ['www.city.yokohama.lg.jp', 'www.city.saitama.lg.jp'].includes(url.hostname)), source.url);
      assert.equal(url.username, ''); assert.equal(url.password, '');
      if (!importedReference) assert.equal(url.search, '');
      assert.ok(![...url.searchParams.keys()].some(key => /token|secret|signature|password|credential|api.?key|authorization|authkey/i.test(key)));
      assert.ok(source.title.length);
    }
  }
});

test('Japanese expansion exceeds tenfold with publication evidence rather than invented leakage counts', () => {
  const japanese = incidents.filter(record => record.region === 'japan');
  assert.ok(japanese.length >= 2010);
  assert.ok(japanese.filter(record => ['intrusion','ransomware'].includes(record.cause)).length >= 1280);
  const added = japanese.filter(record => record.id.startsWith('jp-notice-'));
  assert.equal(added.length, japanManifest.addedJapaneseRecords);
  assert.equal(japanese.filter(record => !record.id.startsWith('jp-notice-') && !record.id.startsWith('jp-municipal-')).length, 201);
  assert.equal(added.filter(record => record.sourceKind === 'official-notice-archive').length, 1504);
  assert.equal(added.filter(record => record.sourceKind === 'news-index').length, 816);
  assert.equal(added.filter(record => record.sourceKind === 'official-reviewed').length, 1);
  for (const record of added) {
    assert.equal(record.status, record.sourceKind === 'official-reviewed' ? 'confirmed' : 'notice');
    assert.equal(record.scale.value, null);
    assert.equal(record.scale.unit, 'unknown');
    assert.ok(record.noticeDetails.publications >= 1);
    if (record.sourceKind === 'news-index') assert.equal(record.dateKind, 'mixed');
    else if (record.sourceKind === 'official-notice-archive') {
      assert.equal(record.dateKind, 'published');
      assert.ok(record.sources.some(source => source.url.startsWith(`https://github.com/piyokango/SecurityIncidentArchive/blob/${japanManifest.archiveCommit}/`)));
    }
  }
  const lawson = byId('jp-notice-20261008-cd7e5353d2c6');
  assert.equal(lawson.sources[0].url,'https://www.lawson.co.jp/contents/cont07/1533174_3310.html');
  assert.match(lawson.scale.label,/215万5,345件/);
  assert.equal(byId('jp-notice-20260911-e70ca260a2f7').noticeDetails.outcome,'not-leaked');
});

test('municipal additions resolve to exact disclosure rows and keep dates and possible exposure counts distinct', () => {
  const added = incidents.filter(record => record.sourceKind === 'municipal-disclosure');
  const reports = data.coverage.reports.filter(report => ['横浜市', 'さいたま市'].includes(report.publisher));
  assert.equal(reports.length, 95);
  assert.equal(reports.reduce((total, report) => total + report.tableRows, 0), 3149);
  assert.equal(added.length, 2130);
  assert.equal(added.length, municipalManifest.addedJapaneseRecords);
  assert.equal(municipalManifest.baseJapaneseRecords, japanManifest.totalJapaneseRecords);
  const rows = new Map(reports.flatMap(report => report.ledger.filter(row => row.disposition === 'included').map(row => [row.incidentIds[0], row])));
  assert.equal(rows.size, added.length);
  for (const record of added) {
    const row = rows.get(record.id);
    assert.ok(row, record.id);
    assert.equal(record.status, 'notice');
    assert.equal(record.dateKind, 'published');
    assert.equal(record.announcedAt, row.publishedAt);
    assert.equal(record.municipalDetails.receivedAt, row.receivedAt);
    assert.ok(row.receivedAt <= row.publishedAt);
    assert.equal(record.municipalDetails.row, row.row);
    assert.equal(record.municipalDetails.department, row.department);
    assert.equal(record.municipalDetails.classification, row.classification);
    assert.equal('subject' in row, false);
    assert.equal('subject' in record.municipalDetails, false);
    assert.doesNotMatch(row.department, /\d{2,4}-\d{3,4}/);
    assert.equal(record.sources[0].url.split('#')[0], row.referenceUrl);
    assert.ok(record.shortName.includes(row.department));
    assert.match(record.countNote, /おそれ|実際の閲覧/);
    if (record.scale.value !== null) assert.equal(record.scale.value, Number(row.count.replace(/[,名分人\s]/g, '')));
  }
  assert.equal(added.filter(record => record.scale.unit === 'people').length, 2124);
  assert.ok(added.filter(record => record.scale.unit === 'unknown').every(record => record.scale.value === null));
  for (const report of reports) {
    assert.equal(report.tableRows, report.included + report.excluded + report.duplicate + report['merged-existing']);
    for (const row of report.ledger.filter(row => row.disposition === 'excluded')) {
      assert.equal(row.reason, '個人情報漏えい欄に対象なし、または対象の記載を確認できない');
      assert.ok(!row.incidentIds);
    }
  }
});

test('every source table row has an auditable included, duplicate or excluded disposition', () => {
  const ids = new Set(incidents.map(record => record.id));
  for (const report of data.coverage.reports) {
    const rows = report.ledger || report.rows;
    assert.equal(rows.length, report.tableRows ?? report.sourceRows);
    for (const row of rows) {
      for (const id of row.incidentIds || (row.incidentId ? [row.incidentId] : [])) assert.ok(ids.has(id), `Missing linked record ${id}`);
      if (row.disposition === 'excluded' || row.action === 'excluded') assert.ok(row.reason?.length);
    }
    if (report.ledger) {
      assert.equal(report.included, rows.filter(row => row.disposition === 'included').length);
      assert.equal(report.excluded, rows.filter(row => row.disposition === 'excluded').length);
    }
    assert.match(report.sha256, /^[a-f0-9]{64}$/);
  }
  const registers = data.coverage.reports.filter(report => report.registry);
  assert.equal(registers.reduce((sum, report) => sum + report.tableRows, 0), 13365);
  assert.equal(registers.reduce((sum, report) => sum + report.included, 0), 13349);
  assert.equal(registers.reduce((sum, report) => sum + report.excluded, 0), 16);
});

test('government notifications retain reported status, unknown numbers and original categories', () => {
  const california = incidents.filter(record => record.registry === 'california');
  assert.ok(california.every(record => record.status === 'reported' && record.scale.value === null && record.cause === 'unknown' && record.dateKind === 'reported'));
  const hhs = incidents.filter(record => record.registry === 'hhs');
  assert.ok(hhs.every(record => record.status === 'reported' && record.dateKind === 'reported' && typeof record.registerDetails.breachType === 'string'));
  assert.ok(hhs.every(record => !['ransomware','insider','exposure'].includes(record.cause)));
  assert.ok(hhs.filter(record => !record.registerDetails.breachType).every(record => record.cause === 'unknown'));
  assert.equal(hhs.filter(record => record.registerDetails.reviewState === 'investigation').length, 752);
  assert.equal(hhs.filter(record => record.registerDetails.reviewState === 'archive').length, 7261);
});

test('corrections, accounts, people and possible losses are preserved', () => {
  assert.equal(byId('docomo-plala-2023').scale.value, 5960000);
  assert.equal(byId('capcom-ransomware-2020').scale.value, 15649);
  assert.equal(byId('benesse-customer-2014').scale.value, 28950000);
  assert.equal(byId('lycorp-network-2023').status, 'possible');
  assert.equal(byId('resorttrust-web-2026').scale.value, null);
  assert.equal(byId('kddi-dion-2006').scale.value, 3996789);
  assert.equal(byId('nintendo-nnid-2020').scale.unit, 'accounts');
  assert.equal(incidents.find(record => record.company.includes('ユーキャン')).scale.unit, 'people');
  const amagasaki = byId('ipa-narrative-2022-06-c42ebaae');
  assert.equal(amagasaki.cause, 'loss'); assert.equal(amagasaki.status, 'possible');
});

test('every incident at the same organization is searchable without adding scales', () => {
  const found = filterIncidents(incidents, { ...DEFAULT_FILTERS, query: 'ＫＤＤＩ', region: 'japan' });
  assert.equal(found.length, 3); assert.deepEqual(found.map(record => record.year), [2026,2006,2006]);
  assert.equal(relatedIncidents(incidents, byId('kddi-isp-mail-2026')).length, 2);
  const counts = unitCounts(incidents, { ...DEFAULT_FILTERS, query: 'KDDI', region: 'japan' });
  assert.equal(counts.all, 3); assert.equal(counts.people, 3); assert.equal(counts.records, 0);
});

test('comparison is restricted to one known unit; all history defaults to chronological order', () => {
  const all = filterIncidents(incidents, DEFAULT_FILTERS); assert.equal(all.length, incidents.length);
  assert.ok(all[0].announcedAt >= all.at(-1).announcedAt);
  assert.throws(() => filterIncidents(incidents, DEFAULT_FILTERS, 'scale'), RangeError);
  assert.throws(() => filterIncidents(incidents, { ...DEFAULT_FILTERS, unit: 'unknown' }, 'scale'), RangeError);
  const numeric = filterIncidents(incidents, { ...DEFAULT_FILTERS, unit: 'records', region: 'japan' }, 'scale');
  assert.equal(numeric[0].id, 'benesse-customer-2014'); assert.ok(numeric.every(record => record.scale.unit === 'records'));
});

test('aliases, kana and multiple query terms match the relevant organization', () => {
  assert.equal(normalize('ＫＤＤＩ'), 'kddi'); assert.equal(normalize('ベネッセ'), normalize('べねっせ'));
  for (const query of ['ぷらら','Ｐｌａｌａ','ひかりＴＶ']) assert.equal(filterIncidents(incidents, { ...DEFAULT_FILTERS, query })[0]?.id, 'docomo-plala-2023');
  assert.ok(filterIncidents(incidents, { ...DEFAULT_FILTERS, query: 'LINE ヤフー' }).some(record => record.id === 'lycorp-network-2023'));
  assert.equal(filterIncidents(incidents, { ...DEFAULT_FILTERS, query: '架空の未収録会社' }).length, 0);
});

test('uniform maps never imply a comparison of different count units', () => {
  const selected = incidents.slice(0,120), layout = layoutGraph(selected, false, false, true);
  assert.equal(layout.nodes.length, 120); assert.ok(layout.nodes.every(node => node.radius === 14));
  assert.deepEqual(layout, layoutGraph(selected, false, false, true));
  assert.ok(layoutGraph(selected, true).nodes.every(node => node.position[2] === 0));
  for (const invalid of [0,-1,NaN,Infinity]) assert.throws(() => radiusFor(invalid), RangeError);
  assert.equal(shortScale({ value: null, unit: 'unknown' }), '合計不明');
  assert.equal(shortScale({ value: 627, unit: 'people', qualifier: 'maximum' }), '最大627人');
  assert.match(shortScale({ value: 59736, unit: 'people', qualifier: 'maximum' }), /^最大約/);
});

test('sharing includes a validated record ID and removes query terms and hashes', () => {
  const original = 'https://example.com/day-064-breach-atlas/?q=personal-search&status=all#private-note';
  const shared = shareUrl(original,'benesse-customer-2014',incidents);
  assert.equal(new URL(shared).search,'?incident=benesse-customer-2014'); assert.equal(new URL(shared).hash,'');
  assert.equal(selectionFromUrl(shared,incidents)?.scale.unit,'records');
  assert.equal(new URL(shareUrl(original,'invalid',incidents)).search,'');
});
