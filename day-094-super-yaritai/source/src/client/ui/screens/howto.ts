// あそびかた：やっちゃダメ10個（店の注意書き → その逆）・ひみつ・点の入り方・コンボ・店員・ラストスパート・操作。
// いちばん伝えたいのは「店の注意書きの逆をやればいい」（docs/04）。だから各カードは注意書きから始める。

import { MISDEEDS, type MisdeedDef } from '../../../shared/rules/misdeeds';
import { CLERK, MATCH, SCORE } from '../../../shared/rules/tuning';
import { button, h, phraseBreaks, prefersReducedMotion } from './dom';
import { menuPage } from './parts';

/** 説明に出す数。正本は rules/tuning.ts（体験ループで数を変えると、ここも自動で変わる） */
export const HOWTO_NUMBERS = {
  matchMinutes: MATCH.duration / 60,
  comboWindow: SCORE.comboWindow,
  comboSteps: SCORE.comboMultipliers,
  firstBonus: SCORE.achieveBonus,
  completeBonus: SCORE.completeBonus,
  secretBonus: SCORE.secretBonus,
  dropPoints: SCORE.knockItem,
  graceSeconds: MATCH.friendlyOpening,
  managerAt: MATCH.managerAt,
  lastSpurt: MATCH.lastSpurtAt,
  lastSpurtRate: MATCH.lastSpurtMultiplier,
  caughtSeconds: CLERK.caughtStun,
  escapeAfter: CLERK.giveUpAfter,
  escapeBonus: SCORE.escape,
} as const;

const PRESS_LABEL: Record<MisdeedDef['press'], string> = { press: '押す', hold: '長押し', mash: '連打' };

function misdeedCard(m: MisdeedDef, index: number): HTMLElement {
  return h(
    'li',
    { class: 'sy-deed', 'data-misdeed': m.id },
    h(
      'div',
      { class: 'sy-notice', 'aria-label': `店の注意書き：${m.sign}` },
      h('span', { class: 'sy-notice-head', 'aria-hidden': 'true' }, 'お客様へ'),
      h('span', { class: 'sy-notice-text', 'aria-hidden': 'true' }, m.sign),
    ),
    h('p', { class: 'sy-deed-flip', 'aria-hidden': 'true' }, '↓ 逆をやる'),
    h('h3', { class: 'sy-deed-name' }, h('span', { class: 'sy-deed-no' }, String(index + 1)), h('span', { class: 'sy-deed-title' }, ...phraseBreaks(m.name))),
    h(
      'dl',
      { class: 'sy-deed-facts' },
      h('dt', null, '場所'),
      h('dd', null, m.where),
      h('dt', null, 'やり方'),
      h('dd', null, m.how, ' ', h('span', { class: `sy-press sy-press--${m.press}` }, PRESS_LABEL[m.press])),
    ),
  );
}

function section(title: string, ...children: (Node | string)[]): HTMLElement {
  return h('section', { class: 'sy-card sy-howto-sec' }, h('h2', { class: 'sy-h2' }, title), ...children);
}

function list(items: (string | Node)[][]): HTMLElement {
  return h('ul', { class: 'sy-list' }, ...items.map((parts) => h('li', null, ...parts)));
}

function keys(...names: string[]): HTMLElement {
  return h('span', { class: 'sy-keys' }, ...names.map((k) => h('kbd', { class: 'sy-kbd' }, k)));
}

export function howToScreen(onBack: () => void): { el: HTMLElement } {
  const n = HOWTO_NUMBERS;
  const steps = n.comboSteps.map((x) => `×${x.toFixed(1)}`);

  const lead = h(
    'section',
    { class: 'sy-howto-lead' },
    h('p', { class: 'sy-howto-lead-big' }, '店の注意書きの', h('span', { class: 'sy-nowrap' }, '逆をやればいい。')),
    h(
      'p',
      { class: 'sy-howto-lead-sub' },
      `店じゅうに「〜しないでください」の札が立っています。書いてあることの逆をやると、荒らし度（点）が入ります。${n.matchMinutes}分間でいちばん荒らした人の勝ち。`,
    ),
  );

  const deeds = h(
    'section',
    { class: 'sy-howto-deeds', 'aria-labelledby': 'sy-howto-deeds-h' },
    h('h2', { class: 'sy-h2', id: 'sy-howto-deeds-h' }, `やっちゃダメリスト（${MISDEEDS.length}個）`),
    h('ol', { class: 'sy-deeds' }, ...MISDEEDS.map(misdeedCard)),
  );

  const secrets = section(
    'ひみつが2つ',
    h(
      'p',
      null,
      'リストには「？？？」と出ます。見つけると名前が出て、',
      h('b', null, `+${n.secretBonus}点`),
      '。何をすればいいかは、店の中で探してください。',
    ),
  );

  const scoring = section(
    '点の入り方',
    list([
      ['悪事をするたびに荒らし度が入る。いちばん高い人の勝ち（同点なら、達成したやっちゃダメが多い人）'],
      ['やっちゃダメを初めて達成すると ', h('b', null, `+${n.firstBonus}`), '。10個ぜんぶで「完全制覇」', h('b', null, `+${n.completeBonus}`)],
      [`棚の商品を床に落とすと、1個${n.dropPoints}点`],
    ]),
  );

  const combo = section(
    'コンボ',
    h('p', null, `点が入ってから${n.comboWindow}秒以内に、`, h('b', null, '別の種類'), 'の悪事をすると倍率が上がります。'),
    h('p', { class: 'sy-steps', 'aria-label': `倍率は ${steps.join('、')} と上がる` }, ...steps.flatMap((x, i) => (i === 0 ? [h('span', { class: 'sy-step' }, x)] : [h('span', { class: 'sy-step-arrow', 'aria-hidden': 'true' }, '→'), h('span', { class: 'sy-step' }, x)]))),
    h('p', { class: 'sy-note' }, '同じ悪事を続けると、猶予だけがのびます。捕まると0にもどります。'),
  );

  const clerks = section(
    '店員さんと目立ち度',
    list([
      ['派手にやるほど目立ち、店員さんに追いかけられる。頭の上の「！」と、画面の端の矢印が合図'],
      [`捕まるとサービスカウンターへ連れもどされ、${n.caughtSeconds}秒動けない。コンボと目立ち度も0にもどる`],
      [`${n.escapeAfter}秒見失わせたら逃げ切り。`, h('b', null, `+${n.escapeBonus}`)],
      [`開店から${n.graceSeconds}秒は追いかけてこない。残り${n.managerAt}秒で店長も出てくる`],
    ]),
  );

  const spurt = section(
    'ラストスパート',
    h('p', null, `残り${n.lastSpurt}秒は、入る点が`, h('b', null, `${n.lastSpurtRate}倍`), '。BGMが速くなったら合図です。'),
  );

  const controls = h(
    'section',
    { class: 'sy-card sy-howto-sec sy-controls', 'aria-labelledby': 'sy-howto-ctl-h' },
    h('h2', { class: 'sy-h2', id: 'sy-howto-ctl-h' }, 'そうさ'),
    h(
      'div',
      { class: 'sy-controls-grid' },
      h(
        'div',
        { class: 'sy-control' },
        h('h3', { class: 'sy-h3' }, 'パソコン'),
        h(
          'dl',
          { class: 'sy-keymap' },
          h('dt', null, keys('W', 'A', 'S', 'D'), h('span', { class: 'sy-or' }, 'か'), keys('↑', '←', '↓', '→')),
          h('dd', null, '移動'),
          h('dt', null, keys('Shift')),
          h('dd', null, 'ダッシュ'),
          h('dt', null, keys('Space')),
          h('dd', null, 'ジャンプ'),
          h('dt', null, keys('J'), h('span', { class: 'sy-or' }, 'か'), keys('E')),
          h('dd', null, 'アクション'),
          h('dt', null, keys('Esc')),
          h('dd', null, '一時停止'),
        ),
        h('p', { class: 'sy-note' }, 'アクションは、押す・長押し・連打を悪事ごとに使い分けます（リストの「押す」「長押し」「連打」）。'),
      ),
      h(
        'div',
        { class: 'sy-control' },
        h('h3', { class: 'sy-h3' }, 'スマホ'),
        list([
          ['左の親指：触れた所がスティックの中心になる。倒した方へ移動'],
          ['右下の大きなボタン：アクション。近くの物によって「なぎ払う」「乗る」「食べる」に変わる'],
          ['その上の2つ：ダッシュとジャンプ'],
          ['縦持ちでも横持ちでも遊べる'],
        ]),
      ),
      // ボタンの割り当ては input/index.ts（ゲームの芯）と同じ。変えるときは両方を直す
      h(
        'div',
        { class: 'sy-control' },
        h('h3', { class: 'sy-h3' }, 'ゲームパッド'),
        h(
          'dl',
          { class: 'sy-keymap' },
          h('dt', null, keys('左スティック')),
          h('dd', null, '移動'),
          h('dt', null, keys('A'), h('span', { class: 'sy-or' }, '（×）')),
          h('dd', null, 'アクション'),
          h('dt', null, keys('B'), h('span', { class: 'sy-or' }, '（○）か'), keys('LB')),
          h('dd', null, 'ジャンプ'),
          h('dt', null, keys('X'), h('span', { class: 'sy-or' }, '（□）か'), keys('RB'), keys('RT')),
          h('dd', null, 'ダッシュ'),
          h('dt', null, keys('スタート')),
          h('dd', null, '一時停止'),
        ),
      ),
    ),
  );

  // 目次：スマホでは「そうさ」が4画面ぶん下にあるので、上から飛べるようにする（URL の # は変えない）
  const jumps = h(
    'nav',
    { class: 'sy-jumps', 'aria-label': 'あそびかたの目次' },
    ...(
      [
        ['やっちゃダメ10個', deeds],
        ['点とコンボ', scoring],
        ['店員さん', clerks],
        ['そうさ', controls],
      ] as const
    ).map(([label, target]) =>
      button(label, {
        cls: 'sy-btn--plain sy-jump',
        onClick: () => target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }),
      }),
    ),
  );

  const el = menuPage({
    name: 'howto',
    title: 'あそびかた',
    back: { label: 'もどる', a: 'back', onClick: onBack },
    wide: true,
    body: [lead, jumps, deeds, h('div', { class: 'sy-howto-grid' }, secrets, scoring, combo, clerks, spurt), controls],
  });
  return { el };
}
