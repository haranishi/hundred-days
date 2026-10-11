import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { locateRecord } from '../src/geo-model.mjs';

const source = new URL('../', import.meta.url);
const research = new URL('../../../docs/day064/research/', import.meta.url);
const files = ['core-incidents.json', 'recent-incidents.json', 'historical-incidents.json', 'government-history.json', 'ipa-history.json', 'ipa-narrative-history.json', 'supplementary-history.json', 'japan-notices.json', 'japan-notice-reviews.json', 'municipal-notices.json'];
const records = await Promise.all(files.map(async name => JSON.parse(await readFile(new URL(name, research), 'utf8'))));
const incidents = records.flatMap(record => record.incidents).sort((a, b) => b.announcedAt.localeCompare(a.announcedAt) || a.id.localeCompare(b.id));
if (new Set(incidents.map(i => i.id)).size !== incidents.length) throw new Error('Duplicate incident IDs');
for (const record of records) {
  for (const supplement of record.supplements || []) {
    const incident = incidents.find(i => i.id === supplement.incidentId);
    if (!incident) throw new Error(`Missing supplement target: ${supplement.incidentId}`);
    if (!incident.sources.some(source => source.url === supplement.source.url)) incident.sources.push(supplement.source);
  }
  for (const patch of record.patches || []) {
    const incident = incidents.find(i => i.id === patch.incidentId);
    if (!incident) throw new Error(`Missing correction target: ${patch.incidentId}`);
    Object.assign(incident, patch.changes);
    if (!incident.sources.some(source => source.url === patch.source.url)) incident.sources.push(patch.source);
  }
}
const companyKey = name => name.normalize('NFKC').toLowerCase().replace(/株式会社|有限会社|学校法人|公益社団法人/g, '').replace(/[\s・.\-（）()]/g, '');
const companyGroups = new Map([
  ['kddi-isp-mail-2026', 'kddi'], ['kddi-dion-2006', 'kddi'], ['kddi-employee-pc-2006', 'kddi'],
  ['yahoo-japan-2013', companyKey('ヤフー')], ['docomo-plala-2023', companyKey('NTTドコモ')],
  ['his-thailand-fileserver-2026', companyKey('エイチ・アイ・エス')], ['uniqlo-partners-2019', 'fast-retailing'],
]);
for (const incident of incidents) {
  incident.companyId = companyGroups.get(incident.id) || incident.companyId || companyKey(incident.company);
  incident.region = 'japan';
  incident.registry = 'japan';
}
const publicRegisters = JSON.parse(await readFile(new URL('public-registers.json', research), 'utf8'));
for (const row of publicRegisters.records) {
  const hhs = row.registry === 'hhs';
  const names = hhs ? row.breachType.split(',').map(value => value.trim()) : [];
  const cause = names.some(value => value === 'Hacking/IT Incident') ? 'intrusion' : names.length && names.every(value => ['Loss', 'Theft', 'Improper Disposal'].includes(value)) ? 'loss' : 'unknown';
  const count = hhs ? row.individuals : null;
  const publicUrl = hhs ? 'https://ocrportal.hhs.gov/ocr/breach/breach_report_hip.jsf' : 'https://www.oag.ca.gov/privacy/databreach/list-export';
  const sourceTitle = hhs ? '米国HHS OCR・医療情報漏えい届出台帳' : 'カリフォルニア州司法長官・漏えい通知台帳（全件CSV）';
  incidents.push({
    id: row.id, companyId: `us:${companyKey(row.company)}`, company: row.company, shortName: row.company,
    aliases: [], sector: hhs ? 'healthcare' : 'other', cause, year: Number(row.announcedAt.slice(0, 4)),
    announcedAt: row.announcedAt, sourceUpdatedAt: null, dateKind: 'reported', region: 'us', registry: row.registry,
    status: 'reported', sourceKind: 'government-register',
    scale: { value: count, unit: count === null ? 'unknown' : 'people', qualifier: count === null ? 'undisclosed' : 'exact', label: count === null ? '台帳には対象人数・件数の記載なし' : `届出に記載された対象人数 ${new Intl.NumberFormat('ja-JP').format(count)}人` },
    summary: hhs ? '医療情報の侵害についてHHS OCRに届出された公表記録です。届出人数や分類は組織の報告に基づき、当局の独立した認定人数ではありません。' : 'カリフォルニア州司法長官が公表する漏えい通知の記録です。通知を出した組織が、事故が起きた組織と同一とは限りません。',
    informationTypes: hhs ? ['保護対象の医療・健康情報（詳細は原資料を参照）'] : ['個人情報（台帳CSVに項目の記載なし）'],
    scopeNote: hhs ? `米国の医療情報届出。州・地域コード：${row.state || '記載なし'}。組織区分：${row.entityType || '記載なし'}。` : '500人を超えるカリフォルニア州住民へ送付された通知のサンプルを掲載する台帳。事故の全世界・全米の人数ではありません。',
    countNote: hhs ? '同じ事故の委託元・委託先や複数当局への届出が含まれ得ます。別の記録の人数と合算しません。アーカイブへの移動は流出人数の確定や法令違反の認定を意味しません。' : '台帳CSVは通知元・発生日・報告日だけを示します。対象人数・原因・流出確定を推定しません。他州や連邦当局への同じ事故の届出があり得ます。',
    sources: [{ title: sourceTitle, url: publicUrl, publishedAt: null }],
    registerDetails: hhs ? { state: row.state, entityType: row.entityType, breachType: row.breachType, location: row.location, businessAssociate: row.businessAssociate, reviewState: row.reviewState } : { breachDates: row.breachDates },
  });
}
incidents.sort((a, b) => b.announcedAt.localeCompare(a.announcedAt) || a.id.localeCompare(b.id));
for (const incident of incidents) {
  const location = locateRecord(incident);
  incident.geoCode = location.code;
  incident.geoBasis = location.basis;
}
if (new Set(incidents.map(i => i.id)).size !== incidents.length) throw new Error('Duplicate record IDs');

const government = JSON.parse(await readFile(new URL('coverage.json', research), 'utf8'));
const ipa = JSON.parse(await readFile(new URL('ipa-coverage.json', research), 'utf8'));
const registers = JSON.parse(await readFile(new URL('public-register-coverage.json', research), 'utf8'));
const japanNotices = JSON.parse(await readFile(new URL('japan-notice-coverage.json', research), 'utf8'));
const municipal = JSON.parse(await readFile(new URL('municipal-notice-coverage.json', research), 'utf8'));
const coverage = {
  reports: [...government.reports.map(report => ({ ...report, publisher: '個人情報保護委員会' })), ...ipa.reports.map(report => ({ ...report, publisher: 'IPA' })), ...registers.reports, ...japanNotices.reports, ...municipal.reports],
  explanation: '海外台帳は取得時の全行を確認し、全列一致の重複と通知元空欄を除外しました。国内では政府・IPAの事例に、企業・団体の公表文を保存した公開アーカイブと国内の事例索引を追加しています。本文を配布せず、組織名・日付・参照URL等を収録。同一URL・同じ組織の明示された事案ID・続報参照をまとめています。事例索引の日付は公表日・発生日・報道日が混在し、確認状態を公表・報道の記録として表示します。未確認の人数は推定しません。別の台帳や団体による同じ事故の公表は残るため、全体は独立した事故数ではなく記録数です。',
  gaps: ['2005–2008年度の政府資料には企業名・日付付きの事例表がありません。', '2022–2025年版IPA白書の本文事例は一部を補完しています。全文の全事例の収録ではありません。', '追加した国内の公表・報道記録は、流出確認済みの事故だけの一覧ではありません。情報流出の有無と人数は原資料を参照してください。', '自治体の追加資料は横浜市2021年4月–2026年9月と、さいたま市の公開一覧にある2024年5月–2026年9月の一括公表95資料です。全自治体・全期間の資料ではありません。', '別の日付・名称で掲載された同じ事故の公表や、委託元・委託先の別発表が残る場合があります。', '各社の全ての続報、非公表事案、全地方自治体・全企業の小規模事案を網羅していません。'],
};
coverage.explanation += ' 自治体の一括公表は個人情報の漏えい・紛失等に対象の記載がある掲載行を取り込み、対象なし・記載のない一般の事務処理ミスを除外しました。所管課・掲載No.・公表日と資料の報告・覚知日を区別して保持します。公表人数には漏えいのおそれがある対象も含まれ、実際の流出確認人数とは限りません。';
const snapshot = { asOf: municipal.asOf, scope: '日本の公表・報道記録と米国政府の漏えい通知・医療情報届出記録。侵入の公表と情報流出の確認は別。独立した事故数や被害人数を合計する統計ではなく、世界中の全ての過去の事故を保証しない。', coverage, incidents };
await mkdir(new URL('src/', source), { recursive: true });
await mkdir(new URL('public/data/', source), { recursive: true });
const content = JSON.stringify(snapshot) + '\n';
await writeFile(new URL('src/data.json', source), content);
// Pages limits each asset to 25 MiB. Preserve the full export in a gzip file;
// the application continues to load the index and individual detail chunks.
await writeFile(new URL('public/data/incidents.json.gz', source), gzipSync(content, { level: 9 }));
await unlink(new URL('public/data/incidents.json', source)).catch(error => { if (error.code !== 'ENOENT') throw error; });
const chunkSize = 100;
const chunkRoot = new URL('public/data/details/', source);
await mkdir(chunkRoot, { recursive: true });
for (const name of await readdir(chunkRoot)) if (/^\d+\.json$/.test(name)) await unlink(new URL(name, chunkRoot));
for (let offset = 0; offset < incidents.length; offset += chunkSize) {
  await writeFile(new URL(`${Math.floor(offset / chunkSize)}.json`, chunkRoot), JSON.stringify(incidents.slice(offset, offset + chunkSize)) + '\n');
}
const columns = ['id', 'company', 'companyId', 'shortName', 'aliases', 'cause', 'year', 'announcedAt', 'status', 'unit', 'value', 'qualifier', 'bound', 'region', 'registry', 'sourceKind', 'geoCode', 'geoBasis'];
const rows = incidents.map(i => [i.id, i.company, i.companyId, i.shortName === i.company ? null : i.shortName, i.aliases.length ? i.aliases : null, i.cause, i.year, i.announcedAt, i.status, i.scale.unit, i.scale.value, i.scale.qualifier, i.scale.bound || null, i.region, i.registry, i.sourceKind || null, i.geoCode, i.geoBasis]);
const sourceCount = new Set([...incidents.flatMap(i => i.sources.map(source => source.url)), ...coverage.reports.map(report => report.sourceUrl || report.url)].map(value => { const url = new URL(value); url.hash = ''; return url.href; })).size;
const publicCoverage = { ...coverage, reports: coverage.reports.map(({ ledger, ...report }) => report) };
await writeFile(new URL('public/data/index.json', source), JSON.stringify({ asOf: snapshot.asOf, scope: snapshot.scope, sourceCount, coverage: publicCoverage, chunkSize, columns, rows }) + '\n');
await writeFile(new URL('public/data/coverage.json', source), JSON.stringify(coverage) + '\n');
console.log(`Prepared ${incidents.length} public records (${incidents.filter(i => i.region === 'japan').length} Japanese cases), ${Math.ceil(incidents.length / chunkSize)} detail chunks as of ${snapshot.asOf}.`);
