import { PSL_RULES, PSL_VERSION, PSL_MAX_RULE_LABELS } from './psl-data.js';

export { PSL_VERSION };

// 公開サフィックスリスト(PSL)の本物で「登録ドメイン」の境界を決める。
// 手書きの2ラベル表では sakura.ne.jp・city.kawasaki.jp・s3.amazonaws.com の境界が表せず、
// 別々の利用者のサブドメインを同じ登録ドメインと見誤った（独立レビューJ3）。
// アルゴリズムはPSL公式の規則どおり：一致する規則のうち例外があれば例外、なければラベル数が最長のもの、
// どれにも当たらなければ既定の「*」(最後の1ラベルだけが公開サフィックス)。

const tables = new Map();

// TLDごとに初めて引かれたときだけ規則を展開する。起動のたびに約9千規則を展開しない（無料枠のCPU対策）。
function tableFor(tld) {
  let table = tables.get(tld);
  if (table) return table;
  table = { exact: new Map(), wild: new Map(), except: new Map() };
  if (Object.hasOwn(PSL_RULES, tld)) {
    PSL_RULES[tld].forEach((raw, index) => {
      const section = index === 0 ? 'icann' : 'private';
      for (const rule of raw ? raw.split(' ') : []) {
        if (rule.startsWith('!')) table.except.set(rule.slice(1), section);
        else if (rule === '*') table.wild.set('', section);
        else if (rule.startsWith('*.')) table.wild.set(rule.slice(2), section);
        else table.exact.set(rule, section);
      }
    });
  }
  tables.set(tld, table);
  return table;
}

function lookup(labels) {
  const n = labels.length;
  const table = tableFor(labels[n - 1]);
  // 左側の部分（TLDを除くラベル列）をキーにして、k個のラベルでできた規則に当たるかを見る。
  const left = (from) => labels.slice(from, n - 1).join('.');
  // 規則は最大 PSL_MAX_RULE_LABELS ラベル。長大なホスト名（ラベルが数千）でも、末尾の数ラベルしか見ない（計算量を一定にする）。
  const top = Math.min(n, PSL_MAX_RULE_LABELS);
  for (let k = top; k >= 2; k--) {
    const section = table.except.get(left(n - k));
    if (section) return { length: k - 1, section }; // 例外規則：先頭の1ラベルを外したものが公開サフィックス
  }
  for (let k = top; k >= 2; k--) {
    const exact = table.exact.get(left(n - k));
    if (exact) return { length: k, section: exact };
    const wild = table.wild.get(left(n - k + 1));
    if (wild) return { length: k, section: wild };
  }
  return { length: 1, section: 'icann' };
}

function normalizeHost(host) {
  let value = typeof host === 'string' ? host.toLowerCase().replace(/\.+$/, '') : '';
  // 日本語などの名前は、URLの標準と同じ規則でpunycodeにそろえる（規則はpunycodeで持つ）。
  if (/[^\x00-\x7f]/.test(value)) {
    try { value = new URL(`http://${value}`).hostname; } catch { /* 名前として扱う */ }
  }
  return value;
}

export function registrableDomain(host) {
  const normalized = normalizeHost(host);
  // ホスト名は253字・127ラベルまで（DNSの上限）。それを超える入力は境界を引かず、自身を返す（長大な入力で計算を使わせない）。
  const tooLong = normalized.length > 253;
  const labels = normalized && !tooLong ? normalized.split('.') : [];
  // URLのホスト解釈で、16進・8進・省略IPv4も通常のIPv4になる。
  let numeric = normalized.includes(':');
  if (!numeric && normalized) {
    try { numeric = /^\d+\.\d+\.\d+\.\d+$/.test(new URL(`http://${normalized}`).hostname); } catch { /* 名前として扱う */ }
  }
  if (tooLong || numeric || labels.length <= 1 || labels.length > 127 || labels.includes('')) {
    return { registrable: normalized, suffix: normalized, labels, subdomainLabels: [], isPublicSuffix: !numeric && labels.length === 1, section: 'icann' };
  }
  const { length, section } = lookup(labels);
  const suffix = labels.slice(-length).join('.');
  if (labels.length === length) {
    // ホスト自身が公開サフィックス（co.jp・github.io など）。呼び出し側が文字列を扱えるよう登録ドメインには自身を返す。
    return { registrable: normalized, suffix, labels, subdomainLabels: [], isPublicSuffix: true, section };
  }
  const count = length + 1;
  return { registrable: labels.slice(-count).join('.'), suffix, labels, subdomainLabels: labels.slice(0, -count), isPublicSuffix: false, section };
}
