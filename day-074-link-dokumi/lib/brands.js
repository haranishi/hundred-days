import { CONFUSABLES, RISKY_TLDS, sensitiveWordsInText, USER_CONTENT_HOSTS, isUserContentHost } from './lists.js';
import { registrableDomain } from './psl.js';
import { toUnicodeHost } from './punycode.js';

// 語の強弱は検知用の選択。登録ドメインの事実はresearch/R1 §A2・A3。
const ROWS = [
  ['amazon', 'アマゾン', 'amazon', 'amzn', 'amazon.co.jp aboutamazon.jp amazon.jp', 'アマゾン Amazon', 'shopping'],
  ['apple', 'アップル', 'apple icloud', '', 'apple.com icloud.com', 'アップル Apple iCloud', 'account'],
  ['saison', 'セゾンカード', 'saison saisoncard netanswer', '', 'saisoncard.co.jp a-q-f.com', 'セゾンカード Netアンサー', 'finance'],
  ['amex', 'アメリカン・エキスプレス', 'americanexpress amex', '', 'americanexpress.com', 'アメリカン・エキスプレス American Express アメックス', 'finance'],
  ['nta', '国税庁／e-Tax', 'etax e-tax', 'nta', 'nta.go.jp', '国税庁 e-Tax イータックス', 'government'],
  ['rakuten', '楽天市場・楽天ID', 'rakuten', 'r10', 'rakuten.co.jp rakuten.net', '楽天市場 楽天ID Rakuten 楽天', 'shopping'],
  ['mufg', '三菱UFJ銀行', 'mufg', 'ufj', 'mufg.jp', '三菱UFJ銀行 MUFG', 'finance'],
  ['smbc', '三井住友銀行', 'smbc', '', 'smbc.co.jp', '三井住友銀行 SMBC', 'finance'],
  ['smbc_card', '三井住友カード／Vpass', 'smbc-card smbc vpass', '', 'smbc-card.com', '三井住友カード Vpass', 'finance'],
  ['mizuho', 'みずほ銀行', 'mizuho mizuhobank', '', 'mizuhobank.co.jp', 'みずほ銀行 Mizuho', 'finance'],
  ['yucho', 'ゆうちょ銀行', 'yucho yu-cho jp-bank japanpost', '', 'japanpost.jp', 'ゆうちょ銀行 ゆうちょダイレクト', 'finance'],
  ['paypay', 'PayPay・金融関連', 'paypay', '', 'paypay.ne.jp paypay-card.co.jp paypay-bank.co.jp paypay-sec.co.jp paypay-insurance.co.jp', 'PayPay ペイペイ', 'finance'],
  ['epos', 'エポスカード', 'eposcard epos', '', 'eposcard.co.jp', 'エポスカード エポスNet', 'finance'],
  ['jcb', 'ジェーシービー／MyJCB', 'myjcb', 'jcb', 'jcb.co.jp', 'ジェーシービー MyJCB JCBカード', 'finance'],
  ['aeon', 'イオンカード', 'aeon aeoncard', '', 'aeon.co.jp', 'イオンカード AEONカード', 'finance'],
  ['etc', 'ETC利用照会サービス', 'etc-meisai', 'etc', 'etc-meisai.jp', 'ETC利用照会サービス', 'transport'],
  ['yamato', 'ヤマト運輸', 'yamato kuroneko kuronekoyamato', '', 'kuronekoyamato.co.jp', 'ヤマト運輸 クロネコヤマト', 'delivery'],
  ['sagawa', '佐川急便', 'sagawa sagawa-exp', '', 'sagawa-exp.co.jp', '佐川急便 Sagawa', 'delivery'],
  ['japanpost', '日本郵便', 'japanpost yuubin', 'post', 'japanpost.jp', '日本郵便 日本郵政', 'delivery'],
  ['docomo', 'NTTドコモ／dアカウント／dカード', 'docomo d-account dcard ahamo', 'd', 'docomo.ne.jp', 'NTTドコモ ドコモ dアカウント dカード', 'telecom'],
  ['au', 'au／KDDI', 'kddi auone aupay', 'au', 'au.com auone.jp kddi.com ezweb.ne.jp', 'KDDI My au au PAY', 'telecom'],
  ['softbank', 'ソフトバンク', 'softbank softbankbb ymobile linemo', '', 'softbank.jp softbankbb.co.jp ymobile.jp linemo.jp', 'ソフトバンク SoftBank ワイモバイル LINEMO', 'telecom'],
  ['line', 'LINE', '', 'line lin', 'line.me line.biz lin.ee', 'LINE公式 LINEアカウント LINEログイン', 'account'],
  ['mercari', 'メルカリ／メルカリShops', 'mercari merpay', '', 'mercari.com mercari-shops.com', 'メルカリ Mercari メルペイ', 'shopping'],
  ['microsoft', 'マイクロソフト', 'microsoft outlook onedrive', 'office live', 'microsoft.com live.com microsoftonline.com', 'マイクロソフト Microsoft Outlook OneDrive Office 365', 'account'],
  ['google', 'グーグル', 'google gmail youtube', '', 'google.com google.co.jp', 'グーグル Google Gmail YouTube ユーチューブ', 'account'],
  ['yahoo', 'Yahoo! JAPAN', 'yahoo', 'yj', 'yahoo.co.jp yahoo-net.jp', 'Yahoo! JAPAN Yahoo!ジャパン ヤフー', 'account'],
  ['netflix', 'ネットフリックス', 'netflix', '', 'netflix.com', 'ネットフリックス Netflix', 'subscription'],
  ['myna', 'マイナポータル', 'mynaportal mynumber', 'myna', 'myna.go.jp digital.go.jp', 'マイナポータル', 'government'],
  ['nhk', 'NHK', '', 'nhk', 'nhk-cs.jp nhk.or.jp', 'NHK受信料 NHKプラス NHKの受信料', 'subscription'],
  ['rakuten_card', '楽天カード', 'rakuten rakuten-card enavi e-navi', '', 'rakuten-card.co.jp rakuten.co.jp rakuten-card.jp', '楽天カード 楽天e-NAVI', 'finance'],
  ['rakuten_bank', '楽天銀行', 'rakuten rakuten-bank', '', 'rakuten-bank.co.jp rakuten-bank.net', '楽天銀行', 'finance'],
  ['jre', 'JR東日本／えきねっと／JRE POINT', 'jreast eki-net jrepoint', 'jre suica', 'jreast.co.jp eki-net.com jrepoint.jp jrewallet.jp jreast-app.jp jre-travel.com jrview-travel.com jre-hotels.jp', 'JR東日本 えきねっと JRE POINT モバイルSuica', 'transport'],
  ['ana', '全日本空輸／ANA', '', 'ana mileage', 'ana.co.jp', '全日本空輸 ANAマイレージクラブ', 'transport'],
  ['jal', '日本航空／JAL', '', 'jal jmb', 'jal.co.jp jal.com job-jal.com', '日本航空 JALマイレージバンク', 'transport'],
  ['tepco', '東京電力エナジーパートナー', 'tepco', 'kurashi', 'tepco.co.jp', '東京電力 TEPCO くらしTEPCO', 'utility']
];
const EXTRA = {
  amazon: ['amazon.com'],
  apple: ['apple.co.jp', 'apple.com.cn'],
  microsoft: ['office.com', 'outlook.com', 'onedrive.com', 'office365.com', 'microsoft365.com', 'windows.com', 'bing.com', 'msn.com', 'xbox.com', 'skype.com', 'msftauth.net'],
  google: ['youtube.com', 'gmail.com'], yamato: ['yamato-hd.co.jp'], docomo: ['nttdocomo.co.jp', 'ahamo.com', 'docomo-cycle.jp'],
  mizuho: ['mizuho-fg.co.jp', 'mizuho-sc.com'], smbc_card: ['vpass.ne.jp'],
  rakuten: ['rakuten.today', 'rakuten-wallet.co.jp', 'rakuten-sec.co.jp', 'rakuten-insurance.co.jp', 'rakuten.com', 'rakuten.ne.jp']
};
const AMBIGUOUS = new Set(['yamato', 'sagawa', 'saison', 'apple', 'amex', 'aeon', 'epos', 'mizuho']);
const STATIC = { amazon: ['media-amazon.com', 'ssl-images-amazon.com', 'amazon-adsystem.com'], saison: ['saisoncard-assets.com'], rakuten_card: ['rakuten-static.com'], netflix: ['nflxso.net', 'nflxext.com'] };
const words = (s) => s ? s.split(' ') : [];
// 一次資料に名前・用途を確認できたものだけ、公式の免除に使う。
const VERIFIED_SOURCES = {
  'amazon.com': { source: 'https://www.aboutamazon.com/what-we-do/amazon-store', purpose: 'Amazonのオンラインストア' },
  'apple.co.jp': { source: 'https://images.apple.com/jp/education/docs/Apple-TrainingCertificationCatalogWeb.pdf', purpose: 'Apple Japanの教育研修連絡用ドメイン（過去の公式資料）' },
  'apple.com.cn': { source: 'https://www.apple.com/newsroom/2010/10/26Apple-Launches-Online-Store-in-China/', purpose: 'Apple中国向けストア' },
  'office.com': { source: 'https://learn.microsoft.com/en-us/microsoft-365/enterprise/urls-and-ip-address-ranges', purpose: 'Officeアプリ' },
  'outlook.com': { source: 'https://learn.microsoft.com/en-us/microsoft-365/enterprise/urls-and-ip-address-ranges', purpose: 'Outlookメール' },
  'onedrive.com': { source: 'https://learn.microsoft.com/en-us/microsoft-365/enterprise/urls-and-ip-address-ranges', purpose: 'OneDriveサービス' },
  'office365.com': { source: 'https://learn.microsoft.com/en-us/microsoft-365/enterprise/urls-and-ip-address-ranges', purpose: 'Microsoft 365サービス' },
  'microsoft365.com': { source: 'https://support.microsoft.com/en-us/outlook/how-to-sign-in-to-outlook-on-the-web', purpose: 'Microsoft 365へのサインイン' },
  'windows.com': { source: 'https://learn.microsoft.com/en-us/microsoft-365/enterprise/urls-and-ip-address-ranges', purpose: 'Windows通知・更新サービス' },
  'bing.com': { source: 'https://support.microsoft.com/en-us/bing/how-bing-delivers-search-results', purpose: 'Bing検索' },
  'msn.com': { source: 'https://www.microsoft.com/en-us/msn', purpose: 'MSNニュース' },
  'xbox.com': { source: 'https://download.microsoft.com/download/6/3/c/63c1d527-9d7e-4fd6-9867-fd0632066740/kinect_qsg%20premium_bndl_en-fr-es.pdf', purpose: 'Xboxサポート' },
  'skype.com': { source: 'https://learn.microsoft.com/en-us/microsoft-365/enterprise/urls-and-ip-address-ranges', purpose: 'Skypeサービス' },
  'msftauth.net': { source: 'https://learn.microsoft.com/en-us/microsoft-365/enterprise/urls-and-ip-address-ranges', purpose: 'Microsoft認証用配信' },
  'youtube.com': { source: 'https://support.google.com/youtube/answer/3802431', purpose: 'YouTube動画サービス' },
  'gmail.com': { source: 'https://www.gmail.com/', purpose: 'GoogleのGmailログインへの転送' },
  'yamato-hd.co.jp': { source: 'https://www.yamato-hd.co.jp/company/information.html', purpose: 'ヤマトホールディングス会社案内' },
  'nttdocomo.co.jp': { source: 'https://www.docomo.ne.jp/corporate/ir/binary/pdf/library/annual/fy2011/docomo_ar2012.pdf', purpose: 'NTTドコモの企業ドメイン（過去の公式資料）' },
  'ahamo.com': { source: 'https://www.docomo.ne.jp/info/anti-phishing/confirmation/', purpose: 'ドコモのahamoサービス' },
  'docomo-cycle.jp': { source: 'https://docomo-cycle.jp/tokyo/commercial', purpose: 'ドコモ・バイクシェアサービス' },
  'mizuho-fg.co.jp': { source: 'https://www.mizuho-fg.co.jp/notice/index.html', purpose: 'みずほフィナンシャルグループ企業案内' },
  'mizuho-sc.com': { source: 'https://www.mizuho-fg.co.jp/investors/financial/annual/data1303/pdf/data1303_all.pdf', purpose: 'みずほ証券の公式サイト案内' },
  'vpass.ne.jp': { source: 'https://qa.smbc-card.com/mem/nyukai/detail?category=191&id=1797&site=4H4A00IO', purpose: '三井住友カードの連絡用ドメイン' },
  'rakuten-sec.co.jp': { source: 'https://network.mobile.rakuten.co.jp/assets/pdf/ecare/privacy.pdf', purpose: '楽天証券の会社サイト' },
  'rakuten-insurance.co.jp': { source: 'https://hoken.rakuten.co.jp/pdf/190531_pr_release.pdf', purpose: '楽天保険の総合窓口' },
  'rakuten.com': { source: 'https://www.rakuten.com/', purpose: '楽天の地域別サービス案内' },
  'rakuten.today': { source: 'https://rakuten.today/about?lang=ja', purpose: '楽天グループ公式ブログ' },
  'rakuten-wallet.co.jp': { source: 'https://network.mobile.rakuten.co.jp/assets/pdf/ecare/privacy.pdf', purpose: '楽天ウォレットの会社サイト' },
  'media-amazon.com': { source: 'https://affiliate.amazon.co.jp/creatorsapi/docs/en-us/api-reference/resources/images', purpose: '商品画像の配信。利用者の任意ページ公開機能は確認されない' },
  'ssl-images-amazon.com': { source: 'https://docs.aws.amazon.com/solutions/latest/qnabot-on-aws/qnabot-on-aws.pdf', purpose: 'Amazon商品画像の配信。利用者の任意ページ公開機能は確認されない' },
  'amazon-adsystem.com': { source: 'https://affiliate-program.amazon.com/help/node/topic/GZ2P5RSW6AMWWKTM', purpose: 'Amazon広告タグの配信。任意ページ公開用ではない' },
  'saisoncard-assets.com': { source: 'https://www.saisoncard.co.jp/service/line/', purpose: 'セゾンカード画像配信' },
  'rakuten-static.com': { source: 'https://www.rakuten-card.co.jp/security/', purpose: '楽天カード画像配信' },
  'nflxso.net': { source: 'https://www.netflix.com/jp/', purpose: 'Netflix公式ページ画像配信' },
  'nflxext.com': { source: 'https://www.netflix.com/jp/', purpose: 'Netflix公式ページ静的資産配信' }
};
export const BRAND_DOMAIN_SOURCES = ROWS.flatMap(([brandId, , , , domains]) => [
  ...words(domains).map(domain => ({ domain, brandId, source: 'research/R1 §A2', checkedAt: '2026-10-22', confidence: 'high', userPublishing: false, purpose: '公式サイト・関連サービス（R1の各行参照）' })),
  ...[...(EXTRA[brandId] || []), ...(STATIC[brandId] || [])].map(domain => ({
    domain, brandId, source: VERIFIED_SOURCES[domain]?.source || 'https://www.rakuten.ne.jp/', checkedAt: '2026-10-22',
    confidence: VERIFIED_SOURCES[domain] ? 'high' : 'medium', userPublishing: false,
    purpose: VERIFIED_SOURCES[domain]?.purpose || '楽天本体への転送は確認。配下の利用者公開範囲は未確認のため免除しない'
  }))
]);
export const UNVERIFIED_DOMAINS = BRAND_DOMAIN_SOURCES.filter(row => row.confidence !== 'high');
export const BRANDS = ROWS.map(([id, name, strong, weak, , names, category]) => {
  const sources = BRAND_DOMAIN_SOURCES.filter(row => row.brandId === id && row.confidence === 'high' && !row.userPublishing);
  return {
    id, name, keywords: words(strong), ambiguousKeywords: words(strong).filter(word => AMBIGUOUS.has(word)), weakKeywords: words(weak),
    domains: sources.filter(row => !(STATIC[id] || []).includes(row.domain)).map(row => row.domain),
    staticDomains: sources.filter(row => (STATIC[id] || []).includes(row.domain)).map(row => row.domain),
    contentNames: words(names), category, confidence: 'high', source: 'research/R1 §A2',
    domainSources: Object.fromEntries(sources.map(row => [row.domain, row]))
  };
});
// 空白を含む固有名は分割せず保持する。
const CONTENT_NAMES = {
  amex: ['アメリカン・エキスプレス', 'American Express', 'アメックス'], yahoo: ['Yahoo! JAPAN', 'Yahoo!ジャパン', 'ヤフー'],
  au: ['KDDI', 'My au', 'au PAY'], microsoft: ['マイクロソフト', 'Microsoft', 'Outlook', 'OneDrive', 'Office 365'],
  mufg: ['三菱UFJ銀行', '三菱UFJ', 'MUFG'], smbc: ['三井住友銀行', '三井住友', 'SMBC'],
  jre: ['JR東日本', 'えきねっと', 'JRE POINT', 'モバイルSuica']
};
for (const brand of BRANDS) if (CONTENT_NAMES[brand.id]) brand.contentNames = CONTENT_NAMES[brand.id];
const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase();
const domainOwner = new Map();
const strongWords = new Set();
for (const brand of BRANDS) {
  for (const domain of [...brand.domains, ...brand.staticDomains]) if (!domainOwner.has(domain)) domainOwner.set(domain, brand);
  for (const keyword of [...brand.keywords, ...brand.weakKeywords]) strongWords.add(keyword);
}
export function findOfficialBrand(host, registrable) {
  const normalized = normalize(host).replace(/\.+$/, '');
  const domain = registrableDomain(normalized);
  if (isUserContentHost(normalized) || domain.section === 'private') return null;
  const actual = domain.registrable;
  // 渡された登録ドメインだけを信用して別ホストを公式にしない。
  if (registrable && normalize(registrable).replace(/\.+$/, '') !== actual) return null;
  return domainOwner.get(actual) || null;
}
function skeleton(label) {
  return Array.from(normalize(label), char => CONFUSABLES[char] || char).join('').replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/0/g, 'o').replace(/1/g, 'l').replace(/5/g, 's');
}
// 距離1だけを線形時間で判定する。長いラベルの距離行列は作らない。
function distanceOne(left, right) {
  if (left === right) return false;
  const a = Array.from(left), b = Array.from(right);
  if (Math.abs(a.length - b.length) > 1) return false;
  const sameTail = (x, y) => {
    while (x < a.length && y < b.length) if (a[x++] !== b[y++]) return false;
    return x === a.length && y === b.length;
  };
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return sameTail(i + 1, i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && sameTail(i + 2, i + 2));
  return a.length > b.length ? sameTail(i + 1, i) : sameTail(i, i + 1);
}
function boundedKeyword(value, keyword) {
  let from = 0;
  for (let index; (index = value.indexOf(keyword, from)) >= 0; from = index + 1) {
    const end = index + keyword.length;
    if ((index === 0 || '/._-'.includes(value[index - 1])) && (end === value.length || '/._-'.includes(value[end]))) return true;
  }
  return false;
}
export function matchBrands(parts = {}) {
  const host = normalize(parts.host || parts.hostname || '').replace(/\.+$/, '');
  const domain = registrableDomain(host);
  const official = findOfficialBrand(host, domain.registrable);
  const result = { official: official ? { id: official.id, name: official.name } : null, subdomain: [], typo: [], keyword: [] };
  if (official) return result;
  const label = domain.isPublicSuffix || USER_CONTENT_HOSTS.includes(domain.registrable) ? '' : toUnicodeHost(domain.labels[domain.subdomainLabels.length] || '');
  const qualifiedJp = ['ac.jp', 'ed.jp', 'go.jp', 'lg.jp'].includes(domain.suffix);
  const subdomains = domain.subdomainLabels.map(toUnicodeHost);
  const nameLabels = [...domain.subdomainLabels, ...(label ? [domain.labels[domain.subdomainLabels.length]] : [])];
  const fullHost = `.${nameLabels.join('.')}.`;
  let path = String(parts.path || '');
  try { path = decodeURIComponent(path); } catch { /* 見えた文字だけで照合する */ }
  path = normalize(path);
  const pathTokens = new Set(path.split(/[\/_.-]/));
  const searchable = toUnicodeHost(host) + path;
  const corroborated = sensitiveWordsInText(searchable).length > 0 ||
    (host.match(/-/g) || []).length >= 2 || RISKY_TLDS.includes(domain.labels.at(-1)) || isUserContentHost(host) || domain.section === 'private';
  const addKeyword = (identity, keyword, where) => {
    // 楽天グループ等の共有語と、その語を含む複合名を重ねて数えない。
    if (result.keyword.some(hit => hit.where === where && (hit.keyword === keyword || keyword.split('-').includes(hit.keyword)))) return;
    result.keyword.push({ ...identity, keyword, where });
  };
  const exactKnown = strongWords.has(label) || domainOwner.has(domain.registrable);
  const corrected = skeleton(label);
  const tokens = new Set(label.split('-'));
  for (const brand of BRANDS) {
    // 公開サービスの登録ドメイン名は提供者の語。利用者の偽装語と混同しない。
    if (isUserContentHost(host) && domainOwner.get(domain.registrable) === brand) continue;
    const identity = { id: brand.id, name: brand.name };
    for (const officialDomain of [...brand.domains, ...brand.staticDomains]) {
      if (domain.registrable !== officialDomain && fullHost.includes(`.${officialDomain}.`)) result.subdomain.push({ ...identity, domain: officialDomain });
    }
    for (const keyword of brand.keywords) {
      if (!qualifiedJp && !exactKnown && label !== keyword) {
        if (corrected === keyword) result.typo.push({ ...identity, label, brandLabel: keyword, kind: 'confusable' });
        else if (keyword.length >= 6 && distanceOne(label, keyword)) result.typo.push({ ...identity, label, brandLabel: keyword, kind: 'distance1' });
      }
      if (brand.ambiguousKeywords.includes(keyword) && !corroborated) continue;
      if (!qualifiedJp && keyword.length >= 4 && (keyword.includes('-') ? boundedKeyword(label, keyword) : tokens.has(keyword) || (keyword.length >= 6 && label.includes(keyword)))) addKeyword(identity, keyword, 'registrable');
      if (keyword.length >= 4 && subdomains.some(part => keyword.includes('-') ? boundedKeyword(part, keyword) : part.split('-').includes(keyword) || (keyword.length >= 6 && part.includes(keyword)))) addKeyword(identity, keyword, 'subdomain');
      if (keyword.length >= 4 && (keyword.includes('-') ? boundedKeyword(path, keyword) : pathTokens.has(keyword))) addKeyword(identity, keyword, 'path');
    }
  }
  return result;
}
export function brandKeywordsInText(text) {
  const normalized = normalize(text);
  return BRANDS.flatMap(brand => {
    const keyword = brand.contentNames.find(name => normalized.includes(normalize(name)));
    return keyword ? [{ id: brand.id, name: brand.name, keyword }] : [];
  });
}
