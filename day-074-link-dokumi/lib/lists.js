// research/R1 §C・D・E。サービスの利用者コンテンツや短縮先の正当性は保証しない。
export const SHORTENERS = {
  thirdParty: ['bit.ly', 'ow.ly', 'buff.ly', 't.ly', 'cutt.ly', 'rebrand.ly', 'rb.gy', 's.id', 'tinyurl.com', 'is.gd', 'shorturl.at', 'tiny.cc', 'x.gd', 'j.mp', 'bitly.com', 'goo.gl'],
  official: { 'amzn.to': 'Amazon', 'lin.ee': 'LINE', 'youtu.be': 'YouTube', 't.co': 'X', 'fb.me': 'Meta', 'g.co': 'Google', 'r10.to': '楽天グループ', 'aka.ms': 'Microsoft' }
};
export const SHARED_HOSTS = {
  'pages.dev': 'Cloudflare Pages', 'workers.dev': 'Cloudflare Workers', 'r2.dev': 'Cloudflare R2',
  'github.io': 'GitHub Pages', 'vercel.app': 'Vercel', 'netlify.app': 'Netlify', 'web.app': 'Google Firebase Hosting',
  'firebaseapp.com': 'Google Firebase Hosting', 'blogspot.com': 'Google Blogger', 'weebly.com': 'Weebly', 'weeblysite.com': 'Weebly',
  'wixsite.com': 'Wix', 'onrender.com': 'Render', 'herokuapp.com': 'Heroku', 'notion.site': 'Notion Sites',
  'canva.site': 'Canva', 'framer.app': 'Framer', 'ngrok-free.app': 'ngrok'
};
// 既存の契約名は保つ。Herokuを含み、料金の分類ではない。
export const FREE_HOSTS = SHARED_HOSTS;
export const USER_CONTENT_HOSTS = [
  ...Object.keys(SHARED_HOSTS), 'sites.google.com', 'docs.google.com', 'drive.google.com', 'forms.gle',
  'amazonaws.com', 'storage.googleapis.com', 'googleusercontent.com', 'sharepoint.com', 'azurewebsites.net', 'blob.core.windows.net'
];
export function isUserContentHost(value) {
  const host = String(value ?? '').normalize('NFKC').toLowerCase().replace(/\.+$/, '');
  return USER_CONTENT_HOSTS.some(domain => host === domain || host.endsWith('.' + domain));
}
export const RISKY_TLDS = ['xin', 'icu', 'cfd'];
export const SENSITIVE_WORDS = [
  'login', 'signin', 'sign-in', 'verify', 'verification', 'secure', 'security', 'account', 'update', 'confirm', 'billing', 'payment', 'wallet', 'password', 'support', 'unlock', 'suspend', 'limited', 'recover', 'helpdesk',
  'locked', 'suspended', 'restricted', 'reactivate', 'recovery', 'expired', 'authentication', 'auth', 'kakunin', 'ninsho', 'teishi', 'seigen',
  'delivery', 'redelivery', 'parcel', 'tracking', 'shipment', 'package', 'invoice', 'refund', 'prize',
  '配達', '配送', '荷物', 'お届け', '返金', '請求', '当選', '未納', '利用停止', '緊急', 'ご確認',
  'ログイン', '認証', '確認', '再配達', '本人確認', '停止', '解除', '更新', '不在', 'お荷物', '未払い', '支払い', '暗証', 'カード'
];
// 短いASCII語は別の単語の一部を拾わない。日本語は既存の部分一致を保つ。
export function sensitiveWordsInText(text) {
  const value = String(text).normalize('NFKC').toLowerCase();
  const tokens = new Set(value.split(/[\/_.-]/));
  const found = SENSITIVE_WORDS.filter(word => /^[a-z]{1,4}$/.test(word) ? tokens.has(word) : value.includes(word));
  // 別の語に含まれる語（redelivery と delivery）は、同じ箇所を2回数えない
  return found.filter(word => !found.some(other => other !== word && other.includes(word)));
}
export const CONFUSABLES = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd',
  'һ': 'h', 'ԛ': 'q', 'ӏ': 'l', 'ο': 'o', 'α': 'a', 'ν': 'v', 'ι': 'i', 'κ': 'k', 'ρ': 'p', 'τ': 't', 'ϲ': 'c', 'υ': 'u'
};
export const REDIRECT_PARAM_NAMES = ['url', 'redirect', 'next', 'goto', 'link', 'target', 'u', 'r', 'return', 'returnurl', 'continue', 'dest', 'destination', 'redir', 'out'];
export const RESTRICTED_JP = ['co.jp', 'or.jp', 'go.jp', 'ac.jp', 'ed.jp', 'lg.jp', 'ne.jp', 'ad.jp', 'gr.jp'];
