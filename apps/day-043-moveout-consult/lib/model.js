export const STORAGE_KEY = 'day043-consult-draft-v1';
export const VERIFIED_ON = '2026-09-19';
export const SOURCES = [
  { title: '国民生活センター：原状回復トラブルの案内', url: 'https://www.kokusen.go.jp/news/data/n-20260217_1.html' },
  { title: '消費者庁：消費者ホットライン', url: 'https://www.caa.go.jp/policies/policy/local_cooperation/local_consumer_administration/hotline/' },
  { title: '国民生活センター：全国の相談窓口', url: 'https://www.kokusen.go.jp/map/' },
];
export const OPTIONS = {
  stage: [['', 'まだ整理できていない'], ['before', '退去前'], ['after', '退去済み']],
  tenure: [['', 'わからない'], ['under1', '1年未満'], ['1to3', '1年以上〜3年未満'], ['3to6', '3年以上〜6年未満'], ['over6', '6年以上']],
  payment: [['', 'まだ確認できていない'], ['unpaid', 'まだ支払っていない'], ['partial', '一部支払った'], ['paid', '支払い済み']],
};
export const CHARGES = [
  ['cleaning', 'クリーニング'], ['wall', '壁紙・クロス'], ['floor', '床・フローリング'],
  ['tatami', '畳・ふすま'], ['key', '鍵の交換'], ['equipment', '設備・その他の修繕'], ['other', 'その他の費用'],
];
export const CONCERNS = [
  ['breakdown', '金額の内訳がわからない', '請求の項目・数量・単価と、金額の算出方法を確認したい。'],
  ['damage', '傷・汚れの説明を確かめたい', '指摘された傷や汚れについて、入居時と退去時の記録を見比べて相談したい。'],
  ['contract', '契約・特約の意味がわからない', '契約書や特約のどの部分が今回の請求に関係するか、確認したい。'],
  ['deposit', '敷金の扱いがわからない', '敷金がどう精算されるか、請求書の金額との関係を確認したい。'],
  ['duplicate', '入居時にも同じ費用を払った', '入居時の支払いと今回の請求が、それぞれ何の費用なのか確認したい。'],
  ['reply', 'どう返答すればよいか迷う', '請求元へ確認する内容と、返答の進め方を相談したい。'],
];
export const DOCUMENTS = [
  ['contract', '契約書・特約', '重要事項説明書もあれば一緒に'],
  ['invoice', '請求書・費用の明細', '見積書や精算書も含みます'],
  ['entry', '入居時の写真・記録', '当初の傷や汚れがわかるもの'],
  ['exit', '退去時の写真・記録', '部屋を引き渡したときの様子'],
  ['inspection', '退去立会いの記録', '確認書や、その場で取ったメモ'],
  ['messages', 'これまでのやり取り', 'メール・メッセージ・支払いの記録'],
];
export const DOC_LABELS = { unknown: '未確認', have: 'ある', missing: 'ない' };

export function emptyData() {
  return {
    stage: '', tenure: '', payment: '', invoice: '', deposit: '',
    charges: Object.fromEntries(CHARGES.map(([id]) => [id, { selected: false, amount: '' }])),
    concerns: [], documents: Object.fromEntries(DOCUMENTS.map(([id]) => [id, 'unknown'])),
  };
}

export function parseMoney(raw) {
  if (typeof raw !== 'string' || raw.length > 20) return { kind: 'invalid', value: null };
  const clean = raw.normalize('NFKC').trim();
  if (!clean) return { kind: 'unknown', value: null };
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(clean)) return { kind: 'invalid', value: null };
  const value = Number(clean.replaceAll(',', ''));
  return Number.isSafeInteger(value) && value <= 999999999
    ? { kind: 'known', value } : { kind: 'invalid', value: null };
}

export function moneyText(raw) {
  const money = parseMoney(raw);
  if (money.kind === 'unknown') return '不明・未入力';
  if (money.kind === 'invalid') return '入力を確認';
  return `${money.value.toLocaleString('ja-JP')}円`;
}

export function selectedCharges(data) {
  return CHARGES.filter(([id]) => data.charges[id].selected).map(([id, label]) => ({
    id, label, raw: data.charges[id].amount, ...parseMoney(data.charges[id].amount),
  }));
}

export function chargeSummary(data) {
  const items = selectedCharges(data);
  const known = items.filter((item) => item.kind === 'known');
  return { count: items.length, known: known.length, unknown: items.filter((item) => item.kind === 'unknown').length,
    invalid: items.some((item) => item.kind === 'invalid'),
    total: known.length ? known.reduce((sum, item) => sum + item.value, 0) : null };
}

export function issues(data) {
  const found = [];
  for (const [id, label] of [['invoice', '請求書に書かれた金額'], ['deposit', '預けた敷金']]) {
    if (parseMoney(data[id]).kind === 'invalid') found.push({ id, step: 0, label });
  }
  for (const item of selectedCharges(data)) {
    if (item.kind === 'invalid') found.push({ id: `amount-${item.id}`, step: 1, label: `${item.label}の金額` });
  }
  return found;
}

export function subtotalText(data) {
  const sum = chargeSummary(data);
  if (!sum.count) return '内訳は未入力です';
  if (sum.invalid) return '金額の入力を確認してください';
  if (sum.total === null) return `選んだ${sum.count}項目の金額は不明です`;
  const total = `${sum.total.toLocaleString('ja-JP')}円`;
  return sum.unknown ? `わかる分の小計 ${total}（金額不明 ${sum.unknown}項目）` : `入力した内訳の合計 ${total}`;
}

export function comparisonNote(data) {
  const sum = chargeSummary(data);
  const invoice = parseMoney(data.invoice);
  if (sum.invalid || sum.unknown || sum.total === null || invoice.kind !== 'known' || sum.total === invoice.value) return '';
  return '請求書の金額と入力した内訳の合計が異なります。項目の抜け・税込／税別・敷金精算前後など、金額の意味を相談時に確認してください。';
}

export function questions(data) {
  const lines = CONCERNS.filter(([id]) => data.concerns.includes(id)).map(([, , question]) => question);
  if (comparisonNote(data)) lines.push('請求書の金額と内訳の合計が異なる理由を確認したい。');
  return lines.length ? lines : ['請求内容を確認するために、何を調べ、どの資料を用意すればよいか相談したい。'];
}

export function labelFor(key, value) {
  return OPTIONS[key].find(([id]) => id === value)?.[1] ?? OPTIONS[key][0][1];
}

export function documentGroups(data) {
  return Object.keys(DOC_LABELS).map((status) => ({ status, label: DOC_LABELS[status],
    items: DOCUMENTS.filter(([id]) => data.documents[id] === status).map(([, label]) => label) }));
}

export function hasInput(data) {
  return JSON.stringify(data) !== JSON.stringify(emptyData());
}

export function memoText(data) {
  if (issues(data).length) throw new Error('金額の入力を確認してください');
  const lines = [
    '退去費用の相談メモ', '本人の入力整理です。請求の妥当性・支払義務を判定するものではありません。', '',
    '【1. いまの状況】',
    `退去の状況：${labelFor('stage', data.stage)}`,
    `入居期間：${labelFor('tenure', data.tenure)}`,
    `支払いの状況：${labelFor('payment', data.payment)}`,
    `請求書に書かれた金額：${moneyText(data.invoice)}`,
    `預けた敷金：${moneyText(data.deposit)}（請求書の金額から差し引いていません）`, '',
    '【2. 請求の内訳】',
    ...selectedCharges(data).map((item) => `・${item.label}：${moneyText(item.raw)}`),
    subtotalText(data),
  ];
  const comparison = comparisonNote(data);
  if (comparison) lines.push(comparison);
  lines.push('', '【3. 相談で確認したいこと】', ...questions(data).map((line) => `・${line}`), '', '【4. 手元の資料】');
  for (const group of documentGroups(data)) {
    if (group.items.length) lines.push(`${group.label}：${group.items.join('／')}`);
  }
  lines.push('資料がすべて揃っていなくても、まず窓口へ相談してください。', '', '【相談先】',
    '消費者ホットライン 188（相談は無料・通話料がかかります）',
    '受付時間・休業日は窓口ごとに異なります。公式案内で確認してください。', SOURCES[2].url,
    '', `参考情報の確認日：${VERIFIED_ON}`, ...SOURCES.slice(0, 2).map((source) => `${source.title}\n${source.url}`));
  return lines.join('\n');
}

// 保存データは信頼しない。余分なプロパティを復元・出力しない。
export function decodeDraft(raw) {
  if (typeof raw !== 'string' || raw.length > 8000) throw new Error('保存形式を確認できません');
  const envelope = JSON.parse(raw);
  if (envelope?.version !== 1 || !envelope.data || typeof envelope.data !== 'object') throw new Error('保存形式が異なります');
  const source = envelope.data;
  const result = emptyData();
  for (const key of Object.keys(OPTIONS)) {
    if (!OPTIONS[key].some(([id]) => id === source[key])) throw new Error('選択肢が壊れています');
    result[key] = source[key];
  }
  function amount(value) {
    if (typeof value !== 'string' || value.length > 20 || !/^[\d０-９,，.．+＋\-－\s]*$/.test(value)) throw new Error('金額の保存形式が異なります');
    return value;
  }
  result.invoice = amount(source.invoice);
  result.deposit = amount(source.deposit);
  for (const [id] of CHARGES) {
    const item = source.charges?.[id];
    if (typeof item?.selected !== 'boolean') throw new Error('内訳の保存形式が異なります');
    result.charges[id] = { selected: item.selected, amount: amount(item.amount) };
  }
  if (!Array.isArray(source.concerns) || source.concerns.length > CONCERNS.length || source.concerns.some((id) => !CONCERNS.some(([key]) => key === id))) throw new Error('質問の保存形式が異なります');
  result.concerns = [...new Set(source.concerns)];
  for (const [id] of DOCUMENTS) {
    if (!Object.hasOwn(DOC_LABELS, source.documents?.[id])) throw new Error('資料の保存形式が異なります');
    result.documents[id] = source.documents[id];
  }
  return result;
}

export const encodeDraft = (data) => JSON.stringify({ version: 1, data });
