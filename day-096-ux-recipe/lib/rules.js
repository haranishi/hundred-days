import { BLOCK_SCHEMA, LEVEL_WEIGHT, MAX_BLOCKS, STAGES, STAGE_LABEL, STAGE_NOTE, countChars, nextBlockId, resolveField, stageOf } from './contract.js';
import { makeBlock } from './blocks.js';
import { RECIPES } from './recipes.js';
import { textFields } from './sample.js';
import { reduce } from './state.js';

export const CONFIDENCE_NOTE = {
  '確認済み': '出典のページに、同じ内容が書かれています。',
  '一部確認': '出典に近い内容があります。この説明には、そこから広げた部分があります。',
  '独自の整理': 'この基準は出典に書かれていません。このアプリの考え方です。',
};

const guide = 'このアプリの目安です（調査で決まった基準ではありません）。';

function source(label, url, confidence) {
  return { label, url, confidence };
}

const buttonSource = source('英国政府デザインシステム・ボタンの名前', 'https://design-system.service.gov.uk/components/button/', '確認済み');
const startButtonSource = source('英国政府デザインシステム・ボタン（開始のボタンを含む）', buttonSource.url, '一部確認');
const appGuideline = { label: CONFIDENCE_NOTE['独自の整理'], confidence: '独自の整理' };

const copy = {
  'has-action': {
    level: 'must', title: '手続きに進む入口がある',
    why: 'ボタンや入力欄があると、来た人が手続きに進みやすくなります。',
    sources: [startButtonSource],
  },
  'hero-first': {
    level: 'must', title: 'ページの先頭に用件を伝える見出しがある',
    why: '冒頭に用件が書いてあると、自分に合うページか判断しやすくなります。',
    sources: [source('NN/g・ホームページの冒頭で伝えること', 'https://www.nngroup.com/articles/top-ten-guidelines-for-homepage-usability/', '一部確認')],
  },
  'flow-complete': {
    level: 'must', title: 'お客さんの各段階に応じた案内がある',
    why: '手続きの前後にどんな案内があるか、段階ごとに見渡しやすくなります。',
    sources: [appGuideline],
  },
  'trust-before-action': {
    level: 'must', title: '最初の手続きの前に信頼を判断する材料がある',
    why: '先に仕事ぶりを見られると、任せたい相手かどうかを考えやすくなります。',
    sources: [source('NN/g・個人情報を求める前に示す判断材料', 'https://www.nngroup.com/articles/commitment-levels/', '一部確認')],
  },
  'honest-limited': {
    level: 'must', title: '期限や人数の表示すべてに確認の印がある',
    why: '実際の期限や空き状況がわかると、予定を立てやすくなります。',
    note: '表示した期限や人数を受付の記録と照らしてから、その部品の編集欄で「本当の数字です」に印を付けてください。',
    sources: [source('消費者庁・残り時間が延びる表示の事例', 'https://www.caa.go.jp/policies/future/ppi/assets/caa_futurer101_251003_01.pdf#page=7', '一部確認')],
  },
  'price-before-action': {
    level: 'should', title: '最初の手続きの前に費用の案内がある',
    why: '申し込む前に費用がわかると、予算に合うか判断しやすくなります。',
    sources: [
      source('Baymard・注文前にわかる送料', 'https://baymard.com/research-articles/show-shipping-costs-on-product-pages', '一部確認'),
      source('英国政府デザインシステム・サービスを使い始める前の案内', 'https://design-system.service.gov.uk/patterns/start-using-a-service/', '一部確認'),
    ],
  },
  'button-label-result': {
    level: 'should', title: 'どのボタンにも押した結果がわかる名前がある',
    why: '押すと何が起きるか、来た人がボタンの名前から判断できます。',
    sources: [buttonSource],
  },
  'button-label-consistent': {
    level: 'should', title: 'ボタンの呼び方にまとまりがある',
    why: '同じ操作の名前がそろうと、来た人が見つけやすくなります。',
    note: '案内を見るボタンと申し込みを送るボタンには、それぞれの働きに合う名前を使えます。',
    sources: [source('W3C・同じ機能に一貫した名前を付ける', 'https://www.w3.org/WAI/WCAG22/Understanding/consistent-identification', '確認済み')],
  },
  'form-short': {
    level: 'should', title: '手短に記入できる申し込み欄がある',
    why: '尋ねることを絞ると、来た人の記入の手間が減ります。',
    note: '入力欄が4項目以内なら、この項目に印が付きます。' + guide,
    sources: [source('W3C・利用しやすい入力フォーム', 'https://www.w3.org/WAI/tutorials/forms/', '確認済み')],
  },
  'hero-title-short': {
    level: 'tip', title: '入口に拾い読みしやすい短い見出しがある',
    why: '中身が伝わる短い見出しは、読みたい箇所を探す手がかりです。',
    note: '冒頭の見出しが28字以内なら、この項目に印が付きます。' + guide,
    sources: [source('NN/g・見出しを手がかりに読む行動', 'https://www.nngroup.com/articles/layer-cake-pattern-scanning/', '一部確認')],
  },
  'faq-before-last-action': {
    level: 'tip', title: '最後の手続きの前に疑問に答える場所がある',
    why: '申し込みで迷ったとき、手続きの前に気になる条件を確かめやすくなります。',
    note: '質問をひとまとめにするほか、料金や使い方の説明に答えを添える方法もあります。',
    sources: [source('Baymard・商品を選ぶときの質問と回答', 'https://baymard.com/research-articles/product-page-faq-and-qa', '一部確認')],
  },
  'action-reachable-again': {
    level: 'tip', title: '読み進めた先にも手続きの入口がある',
    why: '読み終えた人が、ページの上に戻らず手続きに進めます。',
    sources: [source('Unbounce・長い紹介ページのボタン配置例', 'https://unbounce.com/landing-pages/10-ways-to-increase-conversions-on-mobile-app-landing-pages/', '一部確認')],
  },
  'no-adjacent-same': {
    level: 'tip', title: '隣り合う部品の種類に変化がある',
    why: '部品の種類が変わると、話の切れ目に気づきやすくなります。',
    note: 'いくつかの商品を比べてほしいときなど、同じ形式を続けるのが向く場面もあります。',
    sources: [appGuideline],
  },
  'not-too-long': {
    level: 'tip', title: '部品数を絞った構成がある',
    why: '部品を絞ると、来た人が大切な案内を見つけやすくなります。',
    note: 'ページが12部品以内なら、この項目に印が付きます。' + guide,
    sources: [appGuideline],
  },
  'replace-samples': {
    level: 'tip', title: '見本を自分の案内に書き換えた文章がある',
    why: '実際の品物やサービスに合わせて書くと、使う場面を思い描きやすくなります。',
    note: 'この目的の見本と同じ文章が残っている部品を示します。ボタンの名前や注意書きも含みます。',
    sources: [
      source('Studio・テンプレートの文章を編集する手順', 'https://help.studio.design/ja/articles/9974045-テンプレートを編集する', '一部確認'),
      source('Shopify・商品説明の書き方', 'https://www.shopify.com/jp/blog/seo-product-descriptions', '一部確認'),
    ],
  },
};

const priceGoals = new Set(['reserve', 'buy', 'event', 'visit']);
const faqGoals = new Set(['reserve', 'buy', 'apply', 'signup', 'support']);
const genericButtons = new Set(['送信', 'こちら', '詳細', '詳しくはこちら', 'クリック', 'ok', 'submit']);
const isAction = block => block.type === 'cta' || block.type === 'form';
const isTrust = block => stageOf(block.type) === 'trust';
const isPrice = block => block.type === 'menu' || block.type === 'plans';
const isFaq = block => block.type === 'faq';
const formFieldCount = block => block.variant === 1 ? 1 : block.props.items.length;
const stageBlock = { notice: 'hero', understand: 'benefits', trust: 'voices', act: 'cta', relief: 'faq' };

// 繰り返し欄を並べ替えた後も、文章そのものが残っていれば見本と分かる。
const sampleText = new Map();
for (const recipe of Object.values(RECIPES)) {
  const texts = new Set();
  for (const block of recipe.blocks) {
    for (const { value } of textFields(block)) {
      if (value.trim()) texts.add(value);
    }
  }
  sampleText.set(recipe.goal, texts);
}

export function stageCoverage(state) {
  const counts = new Map(STAGES.map(key => [key, 0]));
  for (const block of state.blocks) {
    const stage = stageOf(block.type);
    counts.set(stage, counts.get(stage) + 1);
  }
  return STAGES.map(key => ({ key, label: STAGE_LABEL[key], count: counts.get(key), ok: counts.get(key) > 0 }));
}

function assess(state) {
  const { blocks, goal } = state;
  const stages = stageCoverage(state);
  if (!blocks.length) {
    return { score: 0, passed: 0, total: 0, items: [], stages, empty: true, samples: { count: 0, blockIds: [] } };
  }
  const missingStages = stages.filter(stage => !stage.ok);
  const first = blocks.findIndex(isAction);
  const last = blocks.findLastIndex(isAction);
  const heroes = blocks.filter(b => b.type === 'hero');
  const limits = blocks.filter(b => b.type === 'limited');
  const forms = blocks.filter(b => b.type === 'form');
  const buttons = [];
  const sampleBlocks = [];
  const texts = sampleText.get(goal);
  for (const block of blocks) {
    let hasSample = false;
    for (const { field, value } of textFields(block)) {
      if (field.role === 'button') buttons.push({ block, label: value.trim() });
      if (texts.has(value)) hasSample = true;
    }
    if (hasSample) sampleBlocks.push(block);
  }

  const items = [];
  function record(id, ok, block, note) {
    const item = { id, ...copy[id], ok };
    if (!ok && block) item.blockId = block.id;
    if (note) item.note = note;
    items.push(item);
  }

  record('has-action', first >= 0);
  const firstIsHero = blocks[0].type === 'hero';
  const missingTitle = firstIsHero && !blocks[0].props.title.trim();
  record('hero-first', firstIsHero && !missingTitle, heroes[0] ?? blocks[0], missingTitle
    ? `${BLOCK_SCHEMA.hero.label}の「${resolveField('hero', ['title']).label}」が空です。` : undefined);
  const stageHelp = missingStages.map(stage => `${stage.label}（${STAGE_NOTE[stage.key]}）`).join('・');
  record('flow-complete', missingStages.length === 0, undefined,
    'この流れはこのアプリ独自の整理です。' + (stageHelp ? `補いたいのは${stageHelp}です。` : ''));
  if (first >= 0) record('trust-before-action', blocks.slice(0, first).some(isTrust), blocks[first]);
  if (limits.length) {
    const unconfirmed = limits.find(b => b.props.real !== true);
    record('honest-limited', !unconfirmed, unconfirmed);
  }
  if (first >= 0 && priceGoals.has(goal)) record('price-before-action', blocks.slice(0, first).some(isPrice), blocks[first]);
  if (buttons.length) {
    const vague = buttons.find(({ label }) => !label || genericButtons.has(label.normalize('NFKC').toLowerCase()));
    record('button-label-result', !vague, vague?.block);
  }
  const namedButtons = buttons.filter(({ label }) => label);
  if (namedButtons.length >= 2) {
    const labels = new Set();
    const third = namedButtons.find(({ label }) => {
      labels.add(label);
      return labels.size > 2;
    });
    record('button-label-consistent', !third, third?.block);
  }
  if (forms.length) {
    const long = forms.find(b => formFieldCount(b) > 4);
    record('form-short', !long, long);
  }
  if (heroes.length) {
    const long = heroes.find(b => countChars(b.props.title) > 28);
    record('hero-title-short', !long, long);
  }
  if (last >= 0 && faqGoals.has(goal)) record('faq-before-last-action', blocks.slice(0, last).some(isFaq), blocks[last]);
  if (blocks.length >= 6 && heroes.some(b => b.props.cta.trim())) {
    record('action-reachable-again', last >= Math.floor(2 * blocks.length / 3), blocks[last] ?? heroes[0]);
  }
  const repeated = blocks.find((b, i) => b.type === blocks[i - 1]?.type);
  record('no-adjacent-same', !repeated, repeated);
  record('not-too-long', blocks.length <= 12);
  record('replace-samples', sampleBlocks.length === 0, sampleBlocks[0]);

  const totalWeight = items.reduce((sum, item) => sum + LEVEL_WEIGHT[item.level], 0);
  const passed = items.filter(item => item.ok);
  const passedWeight = passed.reduce((sum, item) => sum + LEVEL_WEIGHT[item.level], 0);
  return {
    score: Math.round(100 * passedWeight / totalWeight), passed: passed.length, total: items.length, items, stages,
    empty: false, samples: { count: sampleBlocks.length, blockIds: sampleBlocks.map(block => block.id) },
  };
}

const insertionEnd = blocks => blocks.at(-1)?.type === 'footer' ? blocks.length - 1 : blocks.length;
const move = (id, to) => ({ type: 'moveBlock', id, to });

function add(state, blockType, index) {
  if (nextBlockId(state.blocks).length <= 12) return { type: 'addBlock', blockType, index };
  // 共有データに最大桁のIDがあると連番が契約の長さを超えるため、空いている番号を使う。
  const used = new Set(state.blocks.map(b => b.id));
  let n = 1;
  while (used.has(`b${n}`)) n++;
  const blocks = state.blocks.slice();
  blocks.splice(index, 0, makeBlock(state.goal, blockType, `b${n}`));
  return { type: 'replace', state: { ...state, blocks } };
}

function together(state, actions) {
  // 既存の置き換え操作なら、複数の変更でも履歴から一手で元のページに戻せる。
  return actions.length === 1 ? actions[0] : { type: 'replace', state: actions.reduce(reduce, state) };
}

function* before(state, index, type, matches, addLabel, moveLabel) {
  if (state.blocks.length < MAX_BLOCKS) yield { label: addLabel, action: add(state, type, index) };
  // 上限や採点の境界では、後ろにある同じ役割の部品を生かせることがある。
  for (const block of state.blocks.slice(index + 1)) {
    if (matches(block)) yield { label: moveLabel, action: move(block.id, index) };
  }
}

function stageIndex(blocks, stage) {
  if (stage === 'notice') return 0;
  let index = -1;
  if (stage === 'understand') index = blocks.findIndex(b => isTrust(b) || isAction(b));
  if (stage === 'trust') index = blocks.findIndex(isAction);
  if (stage === 'relief') index = blocks.findLastIndex(isAction);
  return index >= 0 ? index : insertionEnd(blocks);
}

const repairs = {
  *'has-action'(state) {
    if (state.blocks.length >= MAX_BLOCKS) return;
    const index = insertionEnd(state.blocks);
    const button = add(state, 'cta', index);
    yield { label: '手続きのボタンを足す', action: button };
    if (state.blocks.length + 2 > MAX_BLOCKS) return;
    // 初めてのボタンで初めて必要になる判断材料も、足す場合はボタン名で知らせる。
    const withButton = reduce(state, button);
    if (!state.blocks.some(isTrust)) {
      yield { label: '利用した人の声と手続きのボタンを足す', action: together(state, [button, add(withButton, 'voices', index)]) };
    }
    if (priceGoals.has(state.goal) && !state.blocks.some(isPrice)) {
      yield { label: '料金と手続きのボタンを足す', action: together(state, [button, add(withButton, 'menu', index)]) };
    }
  },
  *'hero-first'(state) {
    const hero = state.blocks.find(b => b.type === 'hero');
    if (!hero && state.blocks.length >= MAX_BLOCKS) return;
    const action = hero ? move(hero.id, 0) : add(state, 'hero', 0);
    yield { label: hero ? '入口の見出しを先頭に移す' : '先頭に見出しを足す', action };
    const withHero = reduce(state, action);
    if (!hero && assess(withHero).items.some(i => i.id === 'action-reachable-again' && !i.ok)) {
      for (const tail of repairs['action-reachable-again'](withHero)) {
        yield { label: `先頭に見出しを足し、${tail.label}`, action: together(state, [action, tail.action]) };
      }
    }
  },
  *'flow-complete'(state, stages) {
    const missing = stages.filter(stage => !stage.ok);
    if (state.blocks.length + missing.length > MAX_BLOCKS) return;
    let next = state;
    let action;
    for (const { key } of missing) {
      action = add(next, stageBlock[key], stageIndex(next.blocks, key));
      next = reduce(next, action);
    }
    yield { label: '足りない段階の部品を足す', action: missing.length === 1 ? action : { type: 'replace', state: next } };
  },
  'trust-before-action'(state) {
    return before(state, state.blocks.findIndex(isAction), 'voices', isTrust, '手続きの前に利用した人の声を足す', '判断の材料を手続きの前に移す');
  },
  'price-before-action'(state) {
    return before(state, state.blocks.findIndex(isAction), 'menu', isPrice, '手続きの前に料金を足す', '料金を手続きの前に移す');
  },
  *'form-short'(state) {
    const actions = [];
    for (const block of state.blocks.filter(b => b.type === 'form')) {
      for (let index = formFieldCount(block) - 1; index >= 4; index--) {
        actions.push({ type: 'removeItem', id: block.id, path: ['items'], index });
      }
    }
    yield { label: '末尾の入力欄を外して各4項目までにする', action: together(state, actions) };
  },
  'faq-before-last-action'(state) {
    return before(state, state.blocks.findLastIndex(isAction), 'faq', isFaq, '最後の手続きの前に質問と答えを足す', '質問と答えを手続きの前に移す');
  },
  *'action-reachable-again'(state) {
    const end = insertionEnd(state.blocks);
    if (state.blocks.length < MAX_BLOCKS) yield { label: 'ページの終わりにボタンを足す', action: add(state, 'cta', end) };
    const action = state.blocks.findLast(isAction);
    if (action) yield { label: '手続きの入口をページの終わりに移す', action: move(action.id, end - 1) };
  },
};

export function diagnose(state) {
  const report = assess(state);
  for (const item of report.items) {
    if (item.ok || !repairs[item.id]) continue;
    // 見出しがすでに先頭なら、空欄に書く言葉は本人が決める。
    if (item.id === 'hero-first' && state.blocks[0].type === 'hero') continue;
    let tradeoff;
    for (const fix of repairs[item.id](state, report.stages)) {
      const after = assess(reduce(state, fix.action));
      // 追加で適用項目や分母も変わるため、お客さんが実際に目にする点で確かめる。
      if (after.score > report.score && after.items.some(next => next.id === item.id && next.ok)) {
        item.fix = fix;
        break;
      }
      tradeoff ??= after.items.find(next => !next.ok && report.items.find(old => old.id === next.id)?.ok !== false);
    }
    if (!item.fix) {
      const needed = item.id === 'flow-complete' ? report.stages.filter(stage => !stage.ok).length : 1;
      let help = 'この変更だけでは合計点が上がりません。部品や文章を見ながら調整できます。';
      if (tradeoff) help = `この変更では「${tradeoff.title}」も満たせず、合計点が上がりません。`;
      else if (state.blocks.length + needed > MAX_BLOCKS) help = '部品を足す空きが足りません。入れ替えたい部品を選んでください。';
      item.note = (item.note ?? '') + help;
    }
  }
  return report;
}
