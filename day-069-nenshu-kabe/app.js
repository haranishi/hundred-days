import { META, AGE_BANDS, TAX_WALLS, PARENT_DEDUCTION, HEALTH, NOTES, REFERENCES, GLOSSARY, EXAMPLE, LIMITS, SOURCES } from './lib/rules-2026.js';
import { evaluate, parentDeduction } from './lib/calc.js';
import { validateInputs, parseYen } from './lib/validate.js';
import { yen, man, manExact, hours } from './lib/format.js';
import * as storage from './lib/storage.js';

const $ = (id) => document.getElementById(id);
const fields = {
  ageBand: $('age-band'), student: $('student'), paidSoFar: $('paid-so-far'), hourlyWage: $('hourly-wage'),
  remainingPaydays: $('remaining-paydays'), hoursPerPayday: $('hours-per-payday'),
};
// mode は example（架空の例。欄を変えても例のまま）か user（自分の数字）。自分の数字へ移るのは「自分の数字を入れる」だけ。
// saveEnabled は保存のチェック。保存した入力が残っている間（hasSaved）は、例の表示中もオンのまま示し、表示と保存の中身をそろえる。
const state = {
  mode: 'example', exampleEdited: false, inputsValid: true,
  saveEnabled: false, hasSaved: false, storageEvent: null, storageError: '',
};
const statusMarks = { clear: '○', 'will-cross': '△', crossed: '×' };
let firstInvalidField = null;

// 単位・境界・日付と、途中で切ると読みにくい言い回しをまとめる。入力を含む文も、文字列を textContent にだけ渡す。
const numberPattern = String.raw`\d[\d,]*(?:\.\d+)?`;
const amountPattern = `${numberPattern}(?:億|万|千)?(?:${numberPattern}(?:万|千)?)*`;
const noBreakPattern = new RegExp([
  `(?:確認日[：: ]*)?${numberPattern}年(?:度|分|の分|${numberPattern}(?:[〜～]${numberPattern})?月(?:${numberPattern}日)?)?`,
  `(?:令和|平成|昭和)${numberPattern}年(?:度|分|${numberPattern}月(?:${numberPattern}日)?)?`,
  `${numberPattern}(?:[〜～]${numberPattern})?月(?:${numberPattern}日)?`,
  `(?:年|月)?約?${amountPattern}(?:[〜～]${amountPattern})?円(?:以下|未満|以上|超過|超|を超えると)?`,
  `(?:週|月)?約?${numberPattern}(?:[〜～]${numberPattern})?(?:時間|歳|人|か所目?|回(?:目|分)?)(?:以下|未満|以上|超)?`,
  '確認日', '（市区町村で違う）', 'このブラウザ', 'この端末', 'その給料は', '引かれた分は', '原則として', '特例のある人', 'ある人には',
].join('|'), 'g');

function setText(element, text) {
  // option と SVG の title は、HTML の span を子に持てない。
  if (element.tagName === 'OPTION' || element.namespaceURI === 'http://www.w3.org/2000/svg') {
    element.textContent = text;
    return;
  }
  const fragment = document.createDocumentFragment();
  let start = 0;
  for (const match of String(text).matchAll(noBreakPattern)) {
    fragment.append(document.createTextNode(text.slice(start, match.index)));
    const span = document.createElement('span');
    span.className = 'nw';
    span.textContent = match[0];
    fragment.append(span);
    start = match.index + match[0].length;
  }
  fragment.append(document.createTextNode(text.slice(start)));
  element.replaceChildren(fragment);
}

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) setText(element, text);
  if (className) element.className = className;
  return element;
}

function paragraph(text, className) { return node('p', text, className); }

function sources(ids) {
  const group = node('div', undefined, 'source-list');
  group.append(paragraph(`次の資料をもとに作者が要約・計算しています（確認日：${META.checkedOnLabel}）`));
  const list = node('ul');
  for (const id of ids) {
    const source = SOURCES[id];
    const item = node('li');
    // 題名を確かめた資料だけ「」で囲む。確かめられないものは、作者の説明として「」なしで出す
    const link = node('a', source.exact ? `${source.publisher}「${source.title}」` : `${source.publisher} ${source.title}`);
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    item.append(link);
    list.append(item);
  }
  group.append(list);
  return group;
}

// localStorage 自体を読めない環境でも、操作ごとの文で失敗を返す。サイトデータから消す案内は削除の失敗だけに付ける
const storageFailures = {
  load: 'このブラウザの保存内容を読み込めませんでした。計算は続けられます。',
  save: 'この端末に保存できませんでした。計算は続けられます。',
  clear: 'この端末の保存内容を削除できませんでした。ブラウザのサイトデータから削除できます。計算は続けられます。',
};

function storageAction(action, inputs) {
  try { return storage[action](window.localStorage, inputs); }
  catch { return { ok: false, reason: storageFailures[action] }; }
}

function readInputs() {
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.type === 'checkbox' ? field.checked : field.value]));
}

function setInputs(inputs) {
  for (const [key, field] of Object.entries(fields)) {
    if (field.type === 'checkbox') field.checked = inputs[key] ?? false;
    else field.value = inputs[key] ?? '';
  }
}

function storageMessage() {
  if (state.mode === 'example') {
    if (state.hasSaved) return 'この端末に保存した入力が残っています。次に開くと戻ります。消すには「保存した入力を削除」を押します。';
    return state.storageEvent === 'deleted' ? '保存した入力を削除しました。例の数字は保存しません。' : '例の数字は保存しません。自分の数字に切り替えると、保存を選べます。';
  }
  if (!state.saveEnabled) return state.storageEvent === 'deleted' ? '保存した入力を削除しました。入力は、このページを閉じると消えます。' : '入力は、このページを閉じると消えます。';
  if (!state.inputsValid) return state.hasSaved ? '入力を直すと保存します。保存済みの入力は、最後に保存できた値です。' : '入力を直すと保存します。';
  return state.storageEvent === 'restored' ? 'このブラウザに保存した入力を復元しました。' : '入力値をこのブラウザに保存しました。';
}

function renderStorage() {
  const example = state.mode === 'example';
  $('save-inputs').checked = state.saveEnabled;
  $('save-inputs').disabled = example;
  const canDelete = state.hasSaved || (!example && state.saveEnabled);
  $('delete-inputs').hidden = !canDelete;
  $('delete-inputs').disabled = !canDelete;
  const status = $('save-status');
  status.classList.toggle('is-error', Boolean(state.storageError));
  if (state.storageError) setText(status, `！ ${state.storageError}`);
  else status.replaceChildren(node('strong', state.saveEnabled ? '● 保存オン' : '○ 保存オフ', 'save-state'), node('span', storageMessage()));
}

function showMode() {
  const example = state.mode === 'example';
  const edited = example && state.exampleEdited;
  $('app').dataset.mode = state.mode;
  setText($('banner-title'), edited ? '例の数字を変えて試しています' : example ? 'まずは、架空の例で。' : 'あなたの数字で計算しています');
  setText($('banner-note'), edited ? '例の数字は保存しません。' : example ? '表示中の数字は、架空の給料です。' : '入力を変えると、結果はすぐ変わります。');
  $('use-own').hidden = !example;
  $('use-example').hidden = example;
  setText($('result-mode'), edited ? '例（一部変更）' : example ? '架空の例' : 'あなたの入力');
  setText($('result-title'), example ? 'いちばん近い壁（例）' : 'いちばん近い壁');
  renderStorage();
}

// 状態の札。記号は色以外の手がかりで、読み上げでは文だけを読む
function statusLine(tag, status, text) {
  const element = node(tag, undefined, `wall-status wall-status--${status}`);
  const mark = node('span', statusMarks[status], 'status-mark');
  mark.setAttribute('aria-hidden', 'true');
  element.append(mark, document.createTextNode(' '), node('span', text));
  return element;
}

function statusText(result) {
  if (result.status === 'crossed') return `すでに越えています（${yen(result.overBy)}超過）`;
  if (result.status === 'will-cross') return `予定だと越える：${result.crossAtPayday}回目の給料日で越える見込み（予定どおりなら${yen(result.overBy)}超過）`;
  return 'まだ越えない';
}

function tierText(result, threshold) {
  const tier = `基準${man(threshold)}の市区町村：`;
  if (result.status === 'crossed') return `${tier}越えた（${yen(result.overBy)}超過）`;
  if (result.status === 'will-cross') return `${tier}${result.crossAtPayday}回目の給料日で越える見込み（予定どおりなら${yen(result.overBy)}超過）`;
  return `${tier}まだ越えない`;
}

function primaryResult(nearest) {
  const useLow = Boolean(nearest.low && nearest.low.remaining !== null);
  return { primary: useLow ? nearest.low : nearest, threshold: useLow ? nearest.wall.rangeLow.threshold : nearest.wall.threshold, useLow };
}

const compactYen = (amount) => amount % 10_000 === 0 && amount !== 0 ? man(amount) : yen(amount);
const thresholdAmount = (wall) => (wall.rangeLow ? `${man(wall.rangeLow.threshold).replace('円', '')}〜${man(wall.threshold)}` : man(wall.threshold));

// 壁の名前に出る専門用語を短く言い換える。越えると変わることの文に括弧の言い換えがあればそれを、無ければ用語の説明の最初の文を使う
function shortGloss(wall) {
  const entry = GLOSSARY.find(({ term }) => wall.title.includes(term));
  if (!entry) return '';
  const inline = wall.effect.match(new RegExp(`${entry.term}（([^）\\d]+)）`));
  const meaning = inline ? inline[1] : entry.desc.split('。')[0].replace(/(?:です)?(?:（[^）]*）)?$/, '');
  return `${entry.term}＝${meaning}`;
}

function renderClock(evaluation, inputs) {
  const nearest = evaluation.nearest;
  const main = $('nearest-main');
  const statusRows = $('nearest-status');
  main.replaceChildren();
  main.className = 'nearest-main';
  if (nearest) {
    // 文字盤と状態は、範囲のうち今回比べている端をそろえる。
    const { primary, threshold, useLow } = primaryResult(nearest);
    const remaining = primary.remaining;
    const remainingHours = primary.remainingHours;
    const noWage = remainingHours === null;
    const number = new Intl.NumberFormat('ja-JP').format(noWage ? remaining : remainingHours);
    main.classList.toggle('nearest--yen', noWage);
    // 4桁の時間（「1,120」）は一段小さく、それより長い数は もう一段小さくして、文字盤の目盛りに重ねない
    main.classList.toggle('nearest--wide', number.length === 5);
    main.classList.toggle('nearest--long', number.length > 6);
    // 「あと 約」は数字の上の行に置く（横幅を数字と単位だけにする）
    const lead = node('span', undefined, 'nearest-lead');
    lead.append(node('span', 'あと', 'nearest-prefix'));
    if (!noWage) lead.append(node('span', '約', 'nearest-approx'));
    const value = node('span', undefined, 'nw');
    value.append(node('strong', number, 'nearest-number'), node('span', noWage ? '円' : '時間', 'nearest-unit'));
    main.append(lead, value);
    setText($('nearest-money'), noWage ? '時給を入れると、時間も表示します' : `残り ${yen(remaining)}`);
    setText($('nearest-name'), nearest.wall.title);
    const gloss = shortGloss(nearest.wall);
    $('nearest-gloss').hidden = !gloss;
    setText($('nearest-gloss'), gloss);
    $('nearest-threshold').hidden = false;
    $('nearest-threshold').replaceChildren(node('span', `${thresholdAmount(nearest.wall)}を超えると`), ...(nearest.wall.rangeLow ? [node('span', '（市区町村で違う）', 'threshold-note')] : []));
    // 範囲の壁は2段の状態欄。時計が数えている段を先に、もう一方（越えた段など）をすぐ下に置く
    const tiers = nearest.low
      ? [{ tier: 'low', result: nearest.low, amount: nearest.wall.rangeLow.threshold }, { tier: 'high', result: nearest, amount: nearest.wall.threshold }]
      : [];
    if (!useLow) tiers.reverse();
    statusRows.replaceChildren(...(nearest.low ? tiers.map(({ tier, result, amount }) => {
      const row = statusLine('p', result.status, tierText(result, amount));
      row.dataset.tier = tier;
      return row;
    }) : [statusLine('p', primary.status, statusText(primary))]));
    statusRows.hidden = false;
    setText($('clock-ratio'), `支払い済み ${compactYen(inputs.paidSoFar)} ／ 基準 ${man(threshold)}`);
    const percentage = Math.max(0, Math.min(100, inputs.paidSoFar / threshold * 100));
    $('clock-arc').setAttribute('stroke-dasharray', `${percentage} ${100 - percentage}`);
    $('clock-label').textContent = `支払い済み ${yen(inputs.paidSoFar)}。${nearest.wall.title}の基準 ${yen(threshold)}に対し約${Math.floor(percentage)}パーセント`;
    $('nearest-live').textContent = `いちばん近い壁まであと${yen(remaining)}`;
    setText($('result-jump-summary'), `（いちばん近い壁まで あと${noWage ? yen(remaining) : `約${hours(remainingHours)}`}・概算）`);
  } else {
    main.classList.add('is-finished');
    setText(main, '表示している壁はすべて越えています');
    setText($('nearest-money'), '');
    setText($('nearest-name'), 'それぞれの変化と窓口は、下の一覧で確認できます。');
    $('nearest-gloss').hidden = true;
    $('nearest-threshold').hidden = true;
    statusRows.hidden = true;
    setText($('clock-ratio'), '');
    $('clock-arc').setAttribute('stroke-dasharray', '100 0');
    $('clock-label').textContent = '表示している壁はすべて越えています';
    $('nearest-live').textContent = '表示している壁はすべて越えています';
    setText($('result-jump-summary'), '（表示している壁はすべて越えています・概算）');
  }
  setText($('projected-summary'), evaluation.perPaydayPlanned === null
    ? `支払い済み ${yen(inputs.paidSoFar)}。時給と1回分の予定時間を入れると、年内の見込みも表示します。`
    : `支払い済み ${yen(inputs.paidSoFar)} → 予定どおりなら ${yen(evaluation.projected)}（1回 ${yen(evaluation.perPaydayPlanned)} × 残り${inputs.remainingPaydays}回）`);
}

function appendAmounts(host, result) {
  host.append(statusLine('p', result.status, statusText(result)));
  // 越えた額は状態の札に入れる（「越えた」と「すでに越えています」を重ねて書かない）
  if (result.status === 'crossed') return;
  // 時間は時給換算の目安なので「約」を付ける（注記は一覧の見出しの下と結果カードのそば）
  host.append(paragraph(`あと${yen(result.remaining)}${result.remainingHours === null ? '' : ` ／ 約${hours(result.remainingHours)}`}`, 'wall-remaining'));
  if (result.perPaydayCap !== null) {
    host.append(paragraph(`1回あたりの上限 ${yen(result.perPaydayCap)}${result.perPaydayHours === null ? '' : ` ／ 約${hours(result.perPaydayHours)}`}`, 'wall-cap'));
  } else host.append(paragraph('残りの給料日が0回のため、1回あたりの上限は表示しません。', 'hint'));
}

function markerItem({ amount, marker }) {
  const item = node('li', marker === 'paid' ? `いまここ（支払い済み ${yen(amount)}）` : `予定どおりなら（${yen(amount)}）`, `timeline-marker${marker === 'projected' ? ' timeline-marker--projected' : ''}`);
  item.dataset.marker = marker;
  item.dataset.amount = amount;
  return item;
}

// 112万〜119万円の壁は、2つの段を小さい順に同じ重さの行で並べる。範囲の中にある額の印は、2つの行のあいだに置く
function rangeRows(result, isNearest, markers) {
  const { wall } = result;
  const primaryTier = result.low.remaining !== null ? 'low' : 'high';
  const list = node('ul', undefined, 'range-rows');
  const row = (tier, tierResult, amount) => {
    const item = node('li', undefined, 'range-row');
    item.dataset.range = tier;
    item.dataset.amount = amount;
    item.dataset.status = tierResult.status;
    const label = node('p', `基準${man(amount)}の市区町村`, 'range-tier');
    if (isNearest && primaryTier === tier) label.append(node('span', 'いちばん近い', 'nearest-tag'));
    const amounts = node('div', undefined, 'range-amounts');
    appendAmounts(amounts, tierResult);
    item.append(label, amounts);
    return item;
  };
  list.append(row('low', result.low, wall.rangeLow.threshold), ...markers.map(markerItem), row('high', result, wall.threshold));
  return list;
}

function renderWall(result, { explainedTerms, isNearest, markers }) {
  const { wall } = result;
  const item = node('li', undefined, 'wall-item');
  item.dataset.wall = wall.id;
  item.dataset.amount = wall.threshold;
  item.dataset.status = result.status;
  const card = node('article', undefined, `wall-card${result.low ? ' wall-card--range' : ''}`);
  card.setAttribute('aria-labelledby', `wall-${wall.id}`);
  const title = node('h3', wall.title);
  title.id = `wall-${wall.id}`;
  // 基準はすべて「以下」なので、向きは「◯円を超えると」で書く
  const threshold = node('p', undefined, 'wall-threshold');
  threshold.append(node('span', thresholdAmount(wall), 'threshold-amount'), node('span', 'を超えると', 'threshold-direction nw'));
  if (wall.rangeLow) threshold.append(node('span', '（市区町村で違う）', 'wall-range-label'));
  if (wall.prev2025 !== null) threshold.append(node('span', `2025年は${man(wall.prev2025)}`, 'wall-previous'));
  const top = node('div', undefined, 'wall-top');
  const heading = node('div', undefined, 'wall-heading');
  heading.append(title, threshold);
  top.append(heading);
  card.append(top);
  if (result.low) card.append(rangeRows(result, isNearest, markers));
  else {
    const amounts = node('div', undefined, 'wall-amounts');
    appendAmounts(amounts, result);
    top.append(amounts);
  }
  card.append(paragraph(wall.effect, 'wall-effect'));
  if (wall.note) card.append(paragraph(wall.note, 'hint'));
  // 用語の説明は、初めて出てくる壁にだけ、折りたたんで置く
  const text = [wall.title, wall.effect, wall.formula, wall.note ?? ''].join(' ');
  const terms = [];
  for (const { term, desc } of GLOSSARY) {
    if (text.includes(term) && !explainedTerms.has(term)) {
      terms.push(paragraph(`${term}：${desc}`));
      explainedTerms.add(term);
    }
  }
  if (terms.length) {
    const glossary = node('details', undefined, 'wall-gloss');
    glossary.append(node('summary', 'この壁に出てくる用語'), ...terms);
    card.append(glossary);
  }
  const info = node('dl');
  info.append(node('dt', '判定の単位'), node('dd', wall.unit), node('dt', '確かめる窓口'), node('dd', wall.window), node('dt', '基準額の出し方'), node('dd', wall.formula));
  const detail = node('details', undefined, 'wall-source');
  detail.append(node('summary', '判定の単位・窓口・出典'), info);
  if (wall.rangeNote) detail.append(paragraph(wall.rangeNote, 'hint'));
  detail.append(sources(wall.sources));
  card.append(detail);
  item.append(card);
  return item;
}

function renderTimeline(evaluation, inputs) {
  const markers = [{ amount: inputs.paidSoFar, marker: 'paid' }];
  if (evaluation.perPaydayPlanned !== null) markers.push({ amount: evaluation.projected, marker: 'projected' });
  const range = evaluation.walls.find((result) => result.low);
  const inRange = ({ amount }) => Boolean(range) && amount > range.wall.rangeLow.threshold && amount <= range.wall.threshold;
  // 同じ額なら印を壁の手前に置く（基準は「以下」なので、ちょうどの額はまだ越えていない）。範囲の中の印はカードの中へ
  const items = [
    ...evaluation.walls.map((result) => ({ amount: result.wall.threshold, order: 1, result })),
    ...markers.filter((marker) => !inRange(marker)).map((marker) => ({ ...marker, order: 0 })),
  ].sort((a, b) => a.amount - b.amount || a.order - b.order);
  const fragment = document.createDocumentFragment();
  const explainedTerms = new Set();
  for (const item of items) {
    if (item.result) {
      fragment.append(renderWall(item.result, {
        explainedTerms, isNearest: item.result === evaluation.nearest, markers: item.result === range ? markers.filter(inRange) : [],
      }));
    } else fragment.append(markerItem(item));
  }
  $('wall-timeline').replaceChildren(fragment);
}

function renderParent(evaluation, inputs) {
  $('parent-section').hidden = inputs.ageBand !== 'a19_22';
  if (inputs.ageBand !== 'a19_22') return;
  const deduction = parentDeduction(evaluation.projected, inputs.ageBand);
  const deductionAmount = (amount) => amount === 0 ? yen(amount) : man(amount);
  setText($('parent-note'), `控除は、親の所得から差し引く額です。親の税額の増減は計算しません。${evaluation.perPaydayPlanned === null ? '支払い済みの額' : '現在の見込み額'}で、所得税の控除 ${deductionAmount(deduction.incomeTax)}・住民税の控除 ${deductionAmount(deduction.residentTax)}です。`);
  const steps = PARENT_DEDUCTION.a19_22;
  const thresholds = [...new Set([...steps.incomeTax, ...steps.residentTax].map(({ upTo }) => upTo))].sort((a, b) => a - b);
  const table = node('table');
  table.append(node('caption', `19〜22歳の親の控除。●は${evaluation.perPaydayPlanned === null ? '支払い済み' : '現在の見込み'} ${yen(evaluation.projected)}の段です。`));
  const head = node('thead');
  const header = node('tr');
  for (const text of ['子の給与収入', '所得税の控除', '住民税の控除']) {
    const th = node('th', text);
    th.scope = 'col';
    header.append(th);
  }
  head.append(header);
  const body = node('tbody');
  for (let index = 0; index <= thresholds.length; index += 1) {
    const lower = thresholds[index - 1] ?? 0;
    const upper = thresholds[index] ?? Infinity;
    const current = evaluation.projected <= upper && (index === 0 || evaluation.projected > lower);
    const values = parentDeduction(upper === Infinity ? lower + 1 : upper, inputs.ageBand);
    const row = node('tr');
    row.dataset.current = String(current);
    if (current) {
      row.setAttribute('aria-current', 'true');
      row.className = 'deduction-current';
    }
    const label = node('th');
    if (index > 0) label.append(node('span', `${man(lower)}超${upper === Infinity ? '' : '〜'}`, 'deduction-bound nw'));
    if (upper !== Infinity) label.append(node('span', `${man(upper)}以下`, 'deduction-bound nw'));
    if (current) label.append(node('span', '● 現在の段', 'deduction-mark nw'));
    label.scope = 'row';
    row.append(label);
    for (const key of ['incomeTax', 'residentTax']) {
      const cell = node('td', deductionAmount(values[key]));
      row.append(cell);
    }
    body.append(row);
  }
  table.append(head, body);
  $('parent-table').replaceChildren(table, sources(steps.sources));
}

function renderHealth(evaluation) {
  const { rule, diff } = evaluation.health;
  const result = $('health-result');
  result.replaceChildren(paragraph(`${rule.annualLabel} ／ ${rule.monthlyLabel}`, 'health-limit'), paragraph(rule.note));
  if (diff === null) result.append(paragraph('時給と1回分の予定時間を入れると、月額の目安との差を表示します。', 'hint'));
  else {
    const comparison = diff < 0 ? `月の目安を ${yen(-diff)} 上回る見込み`
      : diff === 0 ? '月の目安の上端と同じ額' : `月の目安まで ${yen(diff)}`;
    // 「→」の前で2行に分ける
    const line = node('p', undefined, 'health-diff');
    line.append(node('span', `給料日1回分 ${yen(evaluation.perPaydayPlanned)}`, 'health-diff-from'), document.createTextNode(' '), node('span', `→ ${comparison}`, 'health-diff-to'));
    result.append(line);
  }
  result.append(paragraph(HEALTH.compareNote, 'hint'), paragraph('この比較だけでは、扶養の認定は確かめられません。加入先で確認してください。', 'hint'));
}

function renderErrors(errors = {}) {
  for (const [field, element] of Object.entries(fields)) {
    element.setAttribute('aria-invalid', String(Boolean(errors[field])));
    const message = $(`${field}-error`);
    message.hidden = !errors[field];
    setText(message, errors[field] ? `！ ${errors[field]}` : '');
  }
}

const sameAsExample = (inputs) => Object.entries(EXAMPLE).every(([key, value]) => inputs[key] === value);
const fieldLabel = (key) => fields[key].labels[0].querySelector('.field-name').textContent;

function persistInputs(inputs) {
  const saved = storageAction('save', inputs);
  if (saved.ok) {
    state.hasSaved = true;
    state.storageEvent = 'saved';
    state.storageError = '';
  } else {
    // 保存できなかったら、残っている入力があるときだけ保存オンのまま示す
    state.saveEnabled = state.hasSaved;
    state.storageError = saved.reason;
  }
}

function recalculate({ persist = false } = {}) {
  const checked = validateInputs(readInputs());
  state.inputsValid = checked.ok;
  // 例の数字を変えても例のまま（保存しない）。例と同じ値に戻せば「一部変更」は外れる
  state.exampleEdited = state.mode === 'example' && !(checked.ok && sameAsExample(checked.inputs));
  renderErrors(checked.ok ? {} : checked.errors);
  // 支払い済みの欄だけ正しければ、ほかの欄の誤りにかかわらず読みを添える。四捨五入せず1円まで出す
  const paid = parseYen(fields.paidSoFar.value);
  const paidValid = paid.ok && paid.value <= LIMITS.paidSoFar.max;
  $('paid-reading').hidden = !paidValid;
  setText($('paid-reading'), paidValid ? `＝${manExact(paid.value)}` : '');
  for (const id of ['invalid-result', 'walls-invalid', 'health-invalid']) $(id).hidden = checked.ok;
  for (const id of ['clock-result', 'wall-timeline', 'health-result', 'clock-time-note']) $(id).hidden = !checked.ok;
  document.querySelector('.health-panel').dataset.invalid = String(!checked.ok);
  firstInvalidField = checked.ok ? null : Object.keys(fields).find((key) => checked.errors[key]);
  $('result-jump').setAttribute('aria-controls', checked.ok ? 'result-card' : fields[firstInvalidField].id);
  $('result-jump-summary').hidden = !checked.ok;
  if (checked.ok) {
    setText($('result-jump-label'), '結果を見る ↑');
    const evaluation = evaluate(checked.inputs);
    renderClock(evaluation, checked.inputs);
    renderTimeline(evaluation, checked.inputs);
    renderParent(evaluation, checked.inputs);
    renderHealth(evaluation);
    if (persist && state.mode === 'user' && state.saveEnabled) persistInputs(checked.inputs);
  } else {
    const label = fieldLabel(firstInvalidField);
    // スマホの固定バーも、直す欄の名前を出す（押すとその欄へ移る）
    setText($('result-jump-label'), `「${label}」を直すと結果が出ます`);
    setText($('result-jump-summary'), '');
    for (const id of ['invalid-result', 'walls-invalid', 'health-invalid']) setText($(id), `「${label}」を直すと表示します`);
    $('parent-section').hidden = true;
    $('nearest-live').textContent = '';
  }
  showMode();
  updateSticky();
}

// 入力欄の追従は、入力欄（上下の余白20pxずつを含む）が表示の高さに収まるときだけ
function updateSticky() {
  const panel = document.querySelector('.input-panel');
  panel.classList.toggle('is-sticky', panel.offsetHeight + 40 <= window.innerHeight);
}
window.addEventListener('resize', updateSticky);

function removeSaved() {
  const cleared = storageAction('clear');
  if (cleared.ok) {
    state.storageEvent = state.hasSaved ? 'deleted' : null;
    state.hasSaved = false;
    state.saveEnabled = false;
    state.storageError = '';
  } else {
    // 消せなかったら、残っている入力に合わせて保存オンのまま示す
    state.saveEnabled = state.hasSaved;
    state.storageError = cleared.reason;
  }
  return cleared.ok;
}

// 例へ戻っても保存した入力は消さない（消すのは削除ボタンと保存のオフだけ）。残っている間は保存オンのまま示す
function showExample() {
  state.mode = 'example';
  state.saveEnabled = state.hasSaved;
  setInputs(EXAMPLE);
  recalculate();
}

function focusField(key) {
  const field = fields[key];
  if (!field) return;
  field.scrollIntoView({ behavior: 'auto', block: 'start' });
  field.focus({ preventScroll: true });
}

function initializeResultJump() {
  const mobile = window.matchMedia('(max-width: 1023px)');
  const panel = document.querySelector('.input-panel');
  const result = $('result-card');
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  };
  let inputVisible = visible(panel);
  let resultVisible = visible(result);
  const refresh = () => { $('result-jump').hidden = !mobile.matches || !inputVisible || resultVisible; };
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const inView = entry.isIntersecting && entry.intersectionRect.height > 0;
      if (entry.target === panel) inputVisible = inView;
      else resultVisible = inView;
    }
    refresh();
  });
  observer.observe(panel);
  observer.observe(result);
  mobile.addEventListener('change', refresh);
  $('result-jump').addEventListener('click', () => {
    // 入力に誤りがあるあいだは、最初の誤りの欄へ移る
    if (firstInvalidField) {
      focusField(firstInvalidField);
      return;
    }
    result.scrollIntoView({ behavior: 'auto', block: 'start' });
    result.focus({ preventScroll: true });
  });
  refresh();
}

function initializeContent() {
  const yearDetail = META.label.slice(META.label.indexOf('（')).replace('。', '・');
  $('year-label').append(node('span', `${META.year}年の制度で計算${yearDetail}`, 'year-line'), node('span', `確認日：${META.checkedOnLabel}`, 'year-line'));
  setText($('year-banner'), NOTES.yearBanner2027);
  $('year-banner').hidden = new Date().getFullYear() <= META.year;
  for (const { id, label } of AGE_BANDS) {
    const option = node('option', label);
    option.value = id;
    fields.ageBand.append(option);
  }
  for (const [key, { min, max }] of Object.entries(LIMITS)) {
    fields[key].dataset.min = min;
    fields[key].dataset.max = max;
  }
  for (const [id, text] of Object.entries({
    'age-band-hint': `${META.year}年12月31日時点（学年ではない）`, 'age-note': NOTES.ageRule,
    'input-privacy': NOTES.privacy, 'payday-note': NOTES.paydayRule,
    'input-scope': NOTES.scope, 'scope-window': NOTES.windowsForOther, 'save-note': NOTES.saveNote,
    // 時間の注記の全文は結果カードのそばに置き、一覧の冒頭は短くする
    'result-disclaimer': NOTES.disclaimer, 'clock-time-note': NOTES.timeNote, 'walls-time-note': '時間は、差額を時給で割った目安です（1時間未満は切り捨て）。',
  })) setText($(id), text);
  for (let index = 0; index < 12; index += 1) {
    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const angle = index * Math.PI / 6;
    const inner = index % 3 === 0 ? 117 : 123;
    tick.setAttribute('x1', String(160 + Math.sin(angle) * inner));
    tick.setAttribute('y1', String(160 - Math.cos(angle) * inner));
    tick.setAttribute('x2', String(160 + Math.sin(angle) * 130));
    tick.setAttribute('y2', String(160 - Math.cos(angle) * 130));
    tick.setAttribute('class', `clock-tick${index % 3 === 0 ? ' clock-tick-major' : ''}`);
    $('clock-ticks').append(tick);
  }
  $('health-intro').append(paragraph(`被扶養者：${GLOSSARY.find(({ term }) => term === '被扶養者').desc}`), paragraph(HEALTH.judgment));
  $('health-explanation').append(paragraph(HEALTH.contract), ...HEALTH.checkWith.map((text) => paragraph(text)), paragraph(HEALTH.effect), paragraph(`確かめる窓口：${HEALTH.window}`), sources(HEALTH.sources));
  for (const reference of REFERENCES) {
    const article = node('article', undefined, 'reference-item');
    article.append(node('h3', reference.title), paragraph(reference.body));
    if (reference.sources.length) article.append(sources(reference.sources));
    $('references').append(article);
  }
  // 項目名は比べるための名前（changeLabel）。健康保険の19〜22歳の注記は健康保険の欄にあるので、ここには重ねない
  const changes = node('ul', undefined, 'changes-comparison');
  for (const wall of TAX_WALLS.filter(({ prev2025 }) => prev2025 !== null)) {
    const row = node('li');
    row.append(node('strong', wall.changeLabel, 'change-name'), node('span', `2025年 ${man(wall.prev2025)}以下 → ${META.year}年 ${man(wall.threshold)}以下`));
    changes.append(row);
  }
  const health = HEALTH.bands.a19_22;
  const healthRow = node('li');
  healthRow.append(node('strong', health.changeLabel, 'change-name'), node('span', `2025年 ${man(health.prev2025)}未満 → ${META.year}年 ${man(health.annualLimit)}未満`));
  changes.append(healthRow);
  $('changes-list').append(paragraph(`税金は、${META.label}と前年の基準の比較です。健康保険は${META.year - 1}年の途中で変わりました。`, 'hint'), changes);
  $('about').append(paragraph(NOTES.disclaimer), paragraph(NOTES.unofficial), paragraph(`作者：100日チャレンジの個人の大学生 ／ 確認日：${META.checkedOnLabel}`), paragraph(NOTES.scope), paragraph(NOTES.windowsForOther), paragraph('配偶者の扶養、年齢区分の対象外の人、特例のある人、社会保険料控除などを反映した税額計算には対応していません。'), paragraph('予定額は、時給と予定時間から給料日1回分を計算し、1円未満を切り捨てています。手当・賞与・通勤手当や実際の支給時の端数処理は反映していません。'), paragraph(NOTES.attribution), paragraph(NOTES.contact));
  const contact = node('a', '不具合・表示の誤りを報告する（GitHub Issue）');
  contact.href = NOTES.contactUrl;
  contact.target = '_blank';
  contact.rel = 'noopener noreferrer';
  $('about').append(contact);
  for (const { term, desc } of GLOSSARY) $('glossary').append(node('dt', term), node('dd', desc));
  $('all-sources').append(sources(Object.keys(SOURCES)));
}

initializeContent();

$('inputs').addEventListener('submit', (event) => event.preventDefault());
$('inputs').addEventListener('input', () => recalculate({ persist: true }));
$('use-own').addEventListener('click', () => {
  // 保存のオン・オフは引き継ぐ。正しい入力になったら、保存した入力を上書きする
  state.mode = 'user';
  state.storageEvent = null;
  setInputs({ ageBand: '', student: false, paidSoFar: '', hourlyWage: '', remainingPaydays: 12 - new Date().getMonth(), hoursPerPayday: '' });
  recalculate();
  focusField('ageBand');
});
for (const id of ['invalid-result', 'walls-invalid', 'health-invalid']) {
  $(id).addEventListener('click', () => focusField(firstInvalidField));
}
$('use-example').addEventListener('click', () => {
  state.storageEvent = null;
  showExample();
  $('use-own').focus();
});
// 例の表示中はチェックを押せないので、ここに来るのは自分の数字のときだけ
$('save-inputs').addEventListener('change', () => {
  state.storageEvent = null;
  if ($('save-inputs').checked) {
    state.saveEnabled = true;
    state.storageError = '';
    recalculate({ persist: true });
  } else {
    removeSaved();
    renderStorage();
  }
});
$('delete-inputs').addEventListener('click', () => {
  if (!removeSaved()) {
    renderStorage();
    return;
  }
  showExample();
  $('use-own').focus();
});

const restored = storageAction('load');
if (restored.ok && restored.inputs) {
  state.mode = 'user';
  state.saveEnabled = true;
  state.hasSaved = true;
  state.storageEvent = 'restored';
  setInputs(restored.inputs);
  recalculate();
} else {
  if (!restored.ok) state.storageError = restored.reason;
  showExample();
}
initializeResultJump();
document.documentElement.dataset.ready = 'true';
