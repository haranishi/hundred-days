export const CAUSES = {
  intrusion: { label: '外部からの侵入', short: '外部侵入', color: '#386da7' },
  ransomware: { label: 'ランサムウェア', short: 'ランサムウェア', color: '#7654a8' },
  insider: { label: '内部の持ち出し', short: '内部持ち出し', color: '#ac4d31' },
  exposure: { label: '公開設定・権限の不備', short: '公開・権限の不備', color: '#856312' },
  loss: { label: '紛失・盗難・誤廃棄', short: '紛失・盗難等', color: '#247253' },
  mistake: { label: '誤送信・処理の誤り', short: '誤送信・処理ミス', color: '#a44372' },
  unknown: { label: '原因を特定できない', short: '原因不明', color: '#59677b' },
};
export const UNITS = {
  all: { label: '全記録', suffix: '', description: '単位を問わず全ての事例' },
  records: { label: '件数', suffix: '件', description: '情報のレコード数' },
  people: { label: '人数', suffix: '人', description: '公式資料が人数として示す数' },
  accounts: { label: 'アカウント', suffix: 'ID', description: 'アカウント・ID数' },
  unknown: { label: '合計不明', suffix: '', description: '規模未公表、または合計不能' },
};
export const REGISTRIES = { all: '全ての資料', japan: '日本の公表・報道', california: '米国・カリフォルニア州', hhs: '米国・HHS医療情報台帳' };
export const REGIONS = { all: '国内・海外すべて', japan: '日本の公表・報道', us: '米国の公的台帳' };
export const STATUSES = { confirmed: '流出・公開確認', possible: '可能性・紛失等', reported: '当局への届出', notice: '公表・報道記録' };
export const SECTORS = { government: '自治体・公的機関', healthcare: '医療・ヘルスケア', telecom: '通信・インターネット', education: '教育', manufacturing: '製造', retail: '小売・EC', entertainment: 'エンタメ', travel: '旅行・宿泊', finance: '金融・保険', other: 'その他' };
export const DEFAULT_FILTERS = Object.freeze({ query: '', unit: 'all', cause: 'all', period: 'all', status: 'all', region: 'all', registry: 'all', location: 'all' });

export function normalize(value = '') {
  return String(value).normalize('NFKC').toLowerCase().replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/株式会社|有限会社/g, '').replace(/[\s・.\-（）()]/g, '');
}

export function matchesIncident(incident, filters, checkUnit = true) {
  const terms = String(filters.query).trim().split(/\s+/).map(normalize).filter(Boolean);
  const haystack = normalize([incident.company, incident.shortName, ...(incident.aliases || [])].join(' '));
  return (!checkUnit || filters.unit === 'all' || incident.scale.unit === filters.unit)
    && (filters.cause === 'all' || incident.cause === filters.cause)
    && (filters.status === 'all' || incident.status === filters.status)
    && (filters.period === 'all' || (filters.period === 'recent' ? incident.year >= 2025 : filters.period === 'historical' ? incident.year < 2025 : incident.year === Number(filters.period)))
    && (!filters.region || filters.region === 'all' || incident.region === filters.region)
    && (!filters.registry || filters.registry === 'all' || incident.registry === filters.registry)
    && (!filters.location || filters.location === 'all' || incident.geoCode === filters.location)
    && terms.every(term => haystack.includes(term));
}

export function filterIncidents(incidents, filters, order = 'date') {
  const result = incidents.filter(incident => matchesIncident(incident, filters));
  if (order === 'scale') {
    if (filters.unit === 'all' || filters.unit === 'unknown') throw new RangeError('Choose one unit before comparing scales.');
    return result.sort((a, b) => (b.scale.value ?? -1) - (a.scale.value ?? -1) || b.announcedAt.localeCompare(a.announcedAt) || a.id.localeCompare(b.id));
  }
  return result.sort((a, b) => (order === 'oldest' ? a.announcedAt.localeCompare(b.announcedAt) : b.announcedAt.localeCompare(a.announcedAt)) || a.id.localeCompare(b.id));
}

export function representatives(incidents) {
  const grouped = new Map();
  const ordered = [...incidents].sort((a, b) => (b.scale.value ?? -1) - (a.scale.value ?? -1) || b.year - a.year || a.id.localeCompare(b.id));
  for (const incident of ordered) {
    const key = incident.companyId || incident.company;
    if (!grouped.has(key)) grouped.set(key, { ...incident, otherIncidents: [] });
    else grouped.get(key).otherIncidents.push(incident);
  }
  return [...grouped.values()];
}

export function unitCounts(incidents, filters) {
  return Object.fromEntries(Object.keys(UNITS).map(unit => [unit, filterIncidents(incidents, { ...filters, unit }).length]));
}

export function radiusFor(value) {
  if (value === null) return 11;
  if (!Number.isFinite(value) || value <= 0) throw new RangeError('Scale must be a positive, finite count or null.');
  return Math.min(42, 7 + Math.max(0, Math.log10(value) - 2) * 5.6);
}

export function shortScale(scale) {
  if (scale.value === null) return '合計不明';
  const rounded = scale.value >= 10000 && scale.value % 1000 !== 0;
  const bound = scale.bound === 'maximum' || scale.qualifier === 'maximum' ? '最大' : '';
  const approximate = ['approximate', 'estimated'].includes(scale.qualifier) || rounded;
  const prefix = `${bound}${approximate ? '約' : ''}`;
  const value = scale.value >= 10000 ? `${new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 }).format(scale.value / 10000)}万` : new Intl.NumberFormat('ja-JP').format(scale.value);
  return `${prefix}${value}${UNITS[scale.unit].suffix}${scale.bound === 'minimum' ? '超' : ''}`;
}

export function companyCount(incidents) {
  return new Set(incidents.map(i => i.companyId || i.company)).size;
}

export function yearDistribution(incidents, filters, years) {
  const context = filterIncidents(incidents, { ...filters, period: 'all' });
  return years.map(year => ({ year, count: context.filter(i => i.year === year).length }));
}

export function causeDistribution(incidents, filters) {
  const context = filterIncidents(incidents, { ...filters, cause: 'all' });
  return Object.keys(CAUSES).map(cause => ({ cause, count: context.filter(i => i.cause === cause).length }));
}

export function relatedIncidents(incidents, incident) {
  return incidents.filter(i => i.id !== incident.id && (i.companyId || i.company) === (incident.companyId || incident.company)).sort((a, b) => b.announcedAt.localeCompare(a.announcedAt));
}

function hash(value) {
  let result = 2166136261;
  for (const ch of value) result = Math.imul(result ^ ch.charCodeAt(0), 16777619);
  return (result >>> 0) / 4294967296;
}

export function layoutGraph(incidents, flat = false, compact = false, uniformScale = false) {
  const nodes = [];
  const hubs = [];
  const groups = Object.entries(CAUSES).map(([cause, config]) => ({ cause, config, items: incidents.filter(i => i.cause === cause).sort((a, b) => a.id.localeCompare(b.id)) })).filter(group => group.items.length);
  const clusterRadius = group => 75 + Math.sqrt(group.items.length) * 48;
  const largest = Math.max(0, ...groups.map(clusterRadius));
  const orbit = groups.length > 1 ? (largest + 100) / Math.sin(Math.PI / groups.length) : 0;
  groups.forEach(({ cause, config, items }, groupIndex) => {
    const angle = Math.PI / 2 - groupIndex / groups.length * Math.PI * 2;
    const anchor = [Math.cos(angle) * orbit, Math.sin(angle) * orbit * (compact ? 1.25 : 0.88), (hash(cause) - 0.5) * 110];
    hubs.push({ id: cause, ...config, position: [anchor[0], anchor[1], flat ? 0 : anchor[2]], count: items.length });
    items.forEach((incident, index) => {
      const spiralAngle = index * Math.PI * (3 - Math.sqrt(5));
      const distance = 65 + Math.sqrt(index) * 52;
      nodes.push({ ...incident, radius: uniformScale ? 14 : radiusFor(incident.scale.value), position: [anchor[0] + Math.cos(spiralAngle) * distance, anchor[1] + Math.sin(spiralAngle) * distance, flat ? 0 : anchor[2] + (hash(incident.id) - 0.5) * 120] });
    });
  });
  return { nodes, hubs };
}

export function selectionFromUrl(url, incidents) {
  const id = new URL(url).searchParams.get('incident');
  return incidents.find(i => i.id === id) || null;
}

export function shareUrl(url, id, incidents) {
  const result = new URL(url);
  result.search = '';
  result.hash = '';
  if (incidents.some(i => i.id === id)) result.searchParams.set('incident', id);
  return result.href;
}
