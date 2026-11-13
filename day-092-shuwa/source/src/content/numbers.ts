/**
 * 数字：0〜10・100・1000（sign-content が持ち主）。
 * 形はすべて右手・相手から見た向き（場の座標: +X＝相手から見て右, +Y＝上, +Z＝相手の方）。
 * 元は調査 r2（.agent-harness/research/r2_numbers_words.json）と、2つの数字の表（神奈川県 p.15・前橋市 p.12。相手から見た図）。
 * 照合の記録と確信度の理由は .agent-harness/runs/content-words/verify.md にある（項目ごと）。
 *
 * 指文字のデータ（kana.ts）から読み込むのは、親指の置き方の角度（THUMB_OVER_RING・THUMB_IN_PALM）だけ。
 * 同じ置き方の描画の警告を、指文字と同じ値で消すため（独立照合 第2周）。項目そのものは読み込まない。
 * 同じ形の指文字（1＝ひ・3＝わ・6＝む・7＝し・9＝く）は、kana.ts と同じ書き方の形にそろえてある。
 * ただし 6〜9 の親指は数字の表に合わせて真上に近づけた（指文字の表は む・し・く の親指を少し指先の側へ傾けて描くので、指文字はそのまま）。
 */
import type { Dir, FingerState, HandshapeSpec, JointAdjust, Keyframe, Orientation, SignSpec } from '../hand/types';
import { THUMB_IN_PALM, THUMB_OVER_RING } from './kana';
import type { SignItem } from './types';

const F = (index: FingerState, middle: FingerState, ring: FingerState, pinky: FingerState) => ({ index, middle, ring, pinky });

/** 手のひらを相手に向け、指先は上（1〜5） */
const FACE: Orientation = { palm: 'toViewer', fingers: 'up' };
/** 手の甲を相手に向ける（6〜9・100・1000）。指先を相手から見て右へ向けると、親指の側は上になる */
const back = (fingers: Dir): Orientation => ({ palm: 'toSigner', fingers });
/**
 * 0: 小指の側を相手に向け、丸めた指と親指で作った輪の穴を相手へ向ける（前橋市の表の図）。
 * 相手は体の正面に立つので、右手の輪を相手へ向けると手のひらは真横より少し表す人の側へ回る
 */
const SIDE_TO_VIEWER: Orientation = { palm: [0.98, 0, -0.17], fingers: 'up' };

/**
 * 止まる区間の書き方（words.ts と同じ）。位置の補間（Catmull-Rom 曲線）は、同じ位置が続く区間の前後で行き過ぎたり戻ったりするので、
 * 止まる区間の両端に EPS 秒の短い区間を置き、その中だけで済ませる（「千」の角が丸くふくらまないように）
 */
const EPS = 0.004;

function still(shape: HandshapeSpec, orient: Orientation = FACE): SignSpec {
  return { hands: { dominant: { keyframes: [{ t: 0, shape, orient, pos: { at: 'neutral' } }] } } };
}

const fist = F('curled', 'curled', 'curled', 'curled');

/**
 * 6〜9 の親指の角度（横に出す置き方 extendedOut の表の値を上書きする）。表の値のままだと、相手から見て親指が真上より約22°、
 * 指先の側（相手から見て右）へ傾いた。2つの数字の表（神奈川県 p.15・前橋市 p.12）はどれも真上に近い（独立照合 第2周）。
 * 付け根を開ききり（cmcFlex −35＝可動域の端）、親指の付け根の関節と先の関節を少し反らせる（mcp −10・ip −8）と、
 * 相手から見た親指（付け根の関節→先）は真上から約4°になる（推定）
 */
const THUMB_UP: JointAdjust = { cmcFlex: -35, mcp: -10, ip: -8 };

/** 形（HandshapeSpec）。名前は数字 */
export const NUMBER_SHAPES = {
  // 全部の指を丸めて親指の先と合わせる（前橋市の表の0。指文字の お と同じ描き方）。
  // 中指・薬指・小指は丸めた角度に固定し、人差し指は親指の先に届くよう逆運動学に任せる。親指は手のひらの前へ起こして輪の下側を作る
  zero: {
    fingers: F('half', 'half', 'half', 'half'),
    thumb: { touch: 'index.tip' },
    spread: 'together',
    adjust: {
      middle: { mcp: 47, pip: 69, dip: 44 },
      ring: { mcp: 49, pip: 71, dip: 46 },
      pinky: { mcp: 51, pip: 71, dip: 46 },
      thumb: { cmcAbd: 50, cmcRot: 35 },
    },
  },
  // 2つの表とも、親指は握った中指・薬指の上に重ねる
  one: { fingers: F('extended', 'curled', 'curled', 'curled'), thumb: 'acrossFront' },
  // 2つの表とも V 字に開く
  two: { fingers: F('extended', 'extended', 'curled', 'curled'), thumb: 'acrossFront', spread: { index: 9, middle: 7 }, adjust: { thumb: THUMB_OVER_RING } },
  // 2つの表とも、親指で折った小指を押さえる（指文字の わ と同じ形）
  three: { fingers: F('extended', 'extended', 'extended', 'curled'), thumb: { touch: 'pinky.dip' }, spread: { index: 8, middle: 1, ring: 8 } },
  // 親指は手のひらの側へ折る（神奈川県「親指以外の4本を上に」・前橋市の図）
  four: { fingers: F('extended', 'extended', 'extended', 'extended'), thumb: 'foldedPalm', spread: { index: 6, middle: 1, ring: 3, pinky: 7 }, adjust: { thumb: THUMB_IN_PALM } },
  // こぶしから親指だけを横へ出す
  five: { fingers: fist, thumb: 'extendedOut' },
  // 6〜9: 親指（5）を上に立て、伸ばす指を足す（前橋市「親指の5に1を加える」）。親指は THUMB_UP（真上に近づける）
  six: { fingers: F('extended', 'curled', 'curled', 'curled'), thumb: 'extendedOut', adjust: { thumb: THUMB_UP } },
  seven: { fingers: F('extended', 'extended', 'curled', 'curled'), thumb: 'extendedOut', spread: { index: 4, middle: 4 }, adjust: { thumb: THUMB_UP } },
  eight: { fingers: F('extended', 'extended', 'extended', 'curled'), thumb: 'extendedOut', spread: { index: 4, middle: 1, ring: 4 }, adjust: { thumb: THUMB_UP } },
  nine: { fingers: F('extended', 'extended', 'extended', 'extended'), thumb: 'extendedOut', spread: 'together', adjust: { thumb: THUMB_UP } },
  // 10: 1 の人差し指を第2関節から折り曲げる（神奈川県の図）
  ten: { fingers: F('hooked', 'curled', 'curled', 'curled'), thumb: 'acrossFront' },
} satisfies Record<string, HandshapeSpec>;

/** 10: 1 を作ってから人差し指を折り曲げる */
const TEN: SignSpec = {
  hands: {
    dominant: {
      keyframes: [
        { t: 0, shape: NUMBER_SHAPES.one, orient: FACE, pos: { at: 'neutral' } },
        { t: 0.3 },
        { t: 0.8, shape: NUMBER_SHAPES.ten, ease: 'inOut' },
        { t: 1.0 },
      ],
    },
  },
};

/**
 * 100: 漢数字の「一」の形（手の甲を相手に向け、人差し指を相手から見て右へ）から、手首を使って指先を上へはね上げる。
 * 終わりの角度（横から約55°上）と、手が少し上がる量は表の図からの推定
 */
const HUNDRED: SignSpec = {
  hands: {
    dominant: {
      keyframes: [
        { t: 0, shape: NUMBER_SHAPES.one, orient: back('viewerRight'), pos: { at: 'neutral', offset: [-0.2, -0.25, 0] } },
        { t: 0.3 - EPS },
        { t: 0.3 },
        { t: 0.7, orient: back([0.57, 0.82, 0]), pos: { at: 'neutral', offset: [-0.4, 0.25, 0] }, ease: 'out' },
        { t: 0.7 + EPS },
        { t: 0.9 },
      ],
    },
  },
};

/**
 * 1000: 「一」の形のまま、空中に「千」を書く（ノ・一・｜の順）。
 * 点は指先が通る形を、相手から見た向きで書いたもの（表す人から見た字を左右反転済み）。
 * 角で止まるように同じ点を続けて置き、止まる区間の両端に EPS の短い区間を置く（位置の補間は曲線なので、止めないと角が丸くふくらむ）。
 * 筆を離して次の画へ移る区間も手は動く（空中に書くので線の跡は出さない）
 */
const SEN_POINTS: Array<[number, number]> = [
  [-0.45, 0.75], // ノ の書き始め（表す人から見て右上＝相手から見て左上）
  [0.3, 0.42], // ノ の終わり
  [0.75, 0.0], // 一 の書き始め（表す人から見て左＝相手から見て右）
  [-0.75, 0.0], // 一 の終わり
  [0, 0.55], // ｜ の書き始め
  [0, -0.95], // ｜ の終わり
];
function senKeyframes(): Keyframe[] {
  // 手のひらの中心の位置（指先は、手の甲を相手に向けて指先を右へ向けているので、手のひらの中心の右 約1.3）
  const base: [number, number, number] = [-0.6, 0.05, 0];
  const at = (i: number) => ({ at: 'neutral' as const, offset: [base[0] + SEN_POINTS[i]![0], base[1] + SEN_POINTS[i]![1], base[2]] as [number, number, number] });
  // 書き始めで少し止まる（0〜0.2）
  const keys: Keyframe[] = [{ t: 0, shape: NUMBER_SHAPES.one, orient: back('viewerRight'), pos: at(0) }, { t: 0.2 - EPS, pos: at(0) }, { t: 0.2, pos: at(0) }];
  // 画と移動: [着く時刻, 止まる長さ]（i=1 ノ・2 一の書き始めへ・3 一・4 ｜の書き始めへ・5 ｜）
  const plan: Array<[number, number]> = [
    [0.55, 0.08],
    [0.8, 0.06],
    [1.3, 0.08],
    [1.55, 0.06],
    [2.05, 0.15],
  ];
  plan.forEach(([arrive, hold], k) => {
    const p = at(k + 1);
    keys.push({ t: arrive, pos: p, ease: 'inOut' }, { t: arrive + EPS, pos: p });
    if (k < plan.length - 1) keys.push({ t: arrive + hold - EPS, pos: p });
    keys.push({ t: arrive + hold, pos: p });
  });
  return keys;
}
const THOUSAND: SignSpec = { hands: { dominant: { keyframes: senKeyframes() } } };

const TABLES = ['kanagawa-2025', 'maebashi-panf'];
/** 1〜9 の形を説明する文章の資料（大学の教材・論文の図3） */
const BASIC = ['baika-suuji', 'sagara-2020', ...TABLES];

export const NUMBERS: SignItem[] = [
  {
    id: 'num-0',
    kind: 'number',
    label: '0',
    reading: 'zero',
    sign: still(NUMBER_SHAPES.zero, SIDE_TO_VIEWER),
    describe: {
      viewer: '指をそろえて丸め、親指の先と合わせて「O」の形の輪を作る。小指の側を相手に向けるので、相手には輪の穴が見える。',
      self: '4本の指を丸め、人差し指の先に親指の先を付けて輪にする。前橋市の表では、指文字の「お」と同じ形に描かれている。',
    },
    confusables: [{ id: 'num-10', tip: '10は人差し指だけを折り曲げ、ほかの指は握る。0は全部の指で丸い輪を作る' }],
    variants:
      '神奈川県の表は、親指と人差し指だけで輪を作り、ほかの3本は立てる形で描いている。講座の報告（Tokyo Art Research Lab）には、少し震わせるという説明もある。',
    sources: ['baika-suuji', 'tarl-2023', ...TABLES],
    confidence: 'medium',
    detailNote:
      '輪をどの指で作るかが資料で分かれる（全部の指で丸める＝前橋市の表・大学の教材・講座の報告／親指と人差し指だけ＝神奈川県の表）。指の曲げ方と輪の向きは前橋市の表の図に合わせた推定。震わせる動きは1つの資料だけなので入れていない。',
    dynamic: false,
  },
  {
    id: 'num-1',
    kind: 'number',
    label: '1',
    reading: 'ichi',
    sign: still(NUMBER_SHAPES.one),
    describe: {
      viewer: '手のひらを相手に向け、人差し指だけを上へ伸ばす。ほかの指は握り、親指は握った中指の上に重ねる。',
      self: '自分からは手の甲が見える。人差し指をまっすぐ立てる。指文字の「ひ」と同じ形で、「ひ」は数字の1から来ている（ひぃ・ふぅ・みぃの「ひ」）。',
    },
    confusables: [
      { id: 'num-6', tip: '6は手の甲を相手に向け、親指を上に立てて、人差し指を横へ伸ばす' },
      { id: 'num-10', tip: '10は立てた人差し指を折り曲げる。1はまっすぐ立てたまま' },
    ],
    variants: '2つの表と資料で同じ形。地域差の記述は見つからなかった（地域差がないとは言い切れない）。',
    sources: [...BASIC, 'baika-yubimoji'],
    confidence: 'high',
    detailNote: '親指の重ね方は2つの表の図に合わせた。指の角度・体からの距離は資料に数値がない（推定）。',
    dynamic: false,
  },
  {
    id: 'num-2',
    kind: 'number',
    label: '2',
    reading: 'ni',
    sign: still(NUMBER_SHAPES.two),
    describe: {
      viewer: '手のひらを相手に向け、人差し指と中指を上へ伸ばしてV字に開く。ほかの指は握り、親指を薬指の上に重ねる。',
      self: '自分からは手の甲が見える。伸ばした2本を軽く開く。指文字の「に」は、数字の2から来ている（神奈川県の表）。',
    },
    confusables: [{ id: 'num-7', tip: '7は手の甲を相手に向け、親指を上に立てて、人差し指と中指を横へ伸ばす' }],
    variants: '2つの表と資料で同じ形。地域差の記述は見つからなかった（地域差がないとは言い切れない）。',
    sources: BASIC,
    confidence: 'high',
    detailNote: '2本の開き幅は2つの表の図に合わせた推定。',
    dynamic: false,
  },
  {
    id: 'num-3',
    kind: 'number',
    label: '3',
    reading: 'san',
    sign: still(NUMBER_SHAPES.three),
    describe: {
      viewer: '手のひらを相手に向け、人差し指・中指・薬指を上へ伸ばす。小指は折り、親指で押さえる。',
      self: '自分からは手の甲が見える。小指を親指で押さえると3本がそろいやすい。指文字の「わ」と同じ形。「み」は数字の3から来ている（神奈川県の表・梅花女子大学の教材）。',
    },
    confusables: [{ id: 'num-8', tip: '8は手の甲を相手に向け、親指を上に立てて、3本を横へ伸ばす' }],
    variants: '2つの表と資料で同じ形。地域差の記述は見つからなかった（地域差がないとは言い切れない）。',
    sources: [...BASIC, 'baika-yubimoji'],
    confidence: 'high',
    detailNote: '親指で小指を押さえる形は2つの表の図に合わせた。3本の開き幅は推定。',
    dynamic: false,
  },
  {
    id: 'num-4',
    kind: 'number',
    label: '4',
    reading: 'yon',
    sign: still(NUMBER_SHAPES.four),
    describe: {
      viewer: '手のひらを相手に向け、親指以外の4本を上へ伸ばす。親指は手のひらの側へ折る。',
      self: '自分からは手の甲が見え、親指は隠れる。指文字の「よ」は、数字の4から来ている（神奈川県の表）。',
    },
    confusables: [
      { id: 'num-9', tip: '9は手の甲を相手に向け、親指を上に立てて、4本を横へ伸ばす' },
      { id: 'num-5', tip: '5は4本を握って親指だけを出す。4は親指だけを折る' },
    ],
    variants: '2つの表と資料で同じ形。地域差の記述は見つからなかった（地域差がないとは言い切れない）。',
    sources: BASIC,
    confidence: 'high',
    detailNote: '親指の折り方と4本の開き幅は2つの表の図に合わせた推定。',
    dynamic: false,
  },
  {
    id: 'num-5',
    kind: 'number',
    label: '5',
    reading: 'go',
    sign: still(NUMBER_SHAPES.five),
    describe: {
      viewer: '手のひらを相手に向けて4本の指を握り、親指だけを横へ伸ばす。相手から見ると、親指は右へ出る。',
      self: '自分からは手の甲が見え、親指は左へ出る。前橋市の表では、指文字の「あ」と同じ形に描かれている。',
    },
    memory: {
      kind: 'origin',
      text: '前橋市の表は「数の表し方はそろばんが基本」と説明し、横へ出した親指を5（そろばんの五玉）に当てている。6〜9は、この5に伸ばす指を足して作る。',
    },
    confusables: [{ id: 'num-6', tip: '6は手の甲を相手に向け、親指を上に立てて、人差し指も横へ伸ばす' }],
    variants: '2つの表と資料で同じ形。地域差の記述は見つからなかった（地域差がないとは言い切れない）。',
    sources: [...BASIC, 'hashimoto-shuwa'],
    confidence: 'high',
    detailNote:
      '論文の図3は5の向きを上向きの記号で書いているが、大学の教材・橋本市・2つの表は親指を横へ出すので、横を主にした。親指の角度は推定。',
    dynamic: false,
  },
  {
    id: 'num-6',
    kind: 'number',
    label: '6',
    reading: 'roku',
    sign: still(NUMBER_SHAPES.six, back('viewerRight')),
    describe: {
      viewer: '手の甲を相手に向け、親指を上に立てて、人差し指を横へ伸ばす。人差し指の先は相手から見て右を向く。',
      self: '自分からは手のひらが見え、人差し指は自分の左を指す。指文字の「む」と同じ形で、「む」は数字の6から来ている。',
    },
    memory: { kind: 'origin', text: '6〜9は、親指（5）に、横へ伸ばす指の本数を足した形（前橋市の表「親指の5に1を加える」）。' },
    confusables: [
      { id: 'num-1', tip: '1は手のひらを相手に向け、人差し指を上に立てる。親指は握った指の上に重ねる' },
      { id: 'num-100', tip: '100は親指を出さず、人差し指を横から上へはね上げる' },
    ],
    variants: '2つの表と資料で同じ形。地域差の記述は見つからなかった（地域差がないとは言い切れない）。',
    sources: [...BASIC, 'baika-yubimoji'],
    confidence: 'high',
    detailNote: '親指と人差し指の開きの角度は資料に数値がない（2つの表の図に合わせた推定）。親指は2つの表に合わせて真上に近く立てた（指文字の「む」は、指文字の表に合わせて少し指先の側へ傾けて描いている）。',
    dynamic: false,
  },
  {
    id: 'num-7',
    kind: 'number',
    label: '7',
    reading: 'nana',
    sign: still(NUMBER_SHAPES.seven, back('viewerRight')),
    describe: {
      viewer: '手の甲を相手に向け、親指を上に立てて、人差し指と中指をそろえて横へ伸ばす。指先は相手から見て右を向く。',
      self: '自分からは手のひらが見え、2本の指は自分の左を指す。指文字の「し」と同じ形で、「し」は数字の7から来ている。',
    },
    memory: { kind: 'origin', text: '6〜9は、親指（5）に、横へ伸ばす指の本数を足した形（前橋市の表「親指の5に2を加える」）。' },
    confusables: [{ id: 'num-2', tip: '2は手のひらを相手に向け、人差し指と中指を上へ伸ばす。親指は握った指の上' }],
    variants: '2つの表と資料で同じ形。地域差の記述は見つからなかった（地域差がないとは言い切れない）。',
    sources: [...BASIC, 'baika-yubimoji'],
    confidence: 'high',
    detailNote: '親指の角度と2本の開き幅は2つの表の図に合わせた推定。親指は真上に近く立てた（指文字の「し」は、指文字の表に合わせて少し指先の側へ傾けて描いている）。',
    dynamic: false,
  },
  {
    id: 'num-8',
    kind: 'number',
    label: '8',
    reading: 'hachi',
    sign: still(NUMBER_SHAPES.eight, back('viewerRight')),
    describe: {
      viewer: '手の甲を相手に向け、親指を上に立てて、人差し指・中指・薬指を横へ伸ばす。小指は握る。指先は相手から見て右を向く。',
      self: '自分からは手のひらが見え、3本の指は自分の左を指す。小指だけを折る。',
    },
    memory: { kind: 'origin', text: '6〜9は、親指（5）に、横へ伸ばす指の本数を足した形（前橋市の表「親指の5に3を加える」）。' },
    confusables: [
      { id: 'num-3', tip: '3は手のひらを相手に向け、3本を上へ伸ばす。親指は小指を押さえる' },
      { id: 'num-9', tip: '9は小指も伸ばして4本にする' },
    ],
    variants: '2つの表と資料で同じ形。地域差の記述は見つからなかった（地域差がないとは言い切れない）。',
    sources: BASIC,
    confidence: 'high',
    detailNote: '3本の開き幅と親指の角度は2つの表の図に合わせた推定。親指は真上に近く立てた。',
    dynamic: false,
  },
  {
    id: 'num-9',
    kind: 'number',
    label: '9',
    reading: 'kyuu',
    sign: still(NUMBER_SHAPES.nine, back('viewerRight')),
    describe: {
      viewer: '手の甲を相手に向け、親指を上に立てて、ほかの4本をそろえて横へ伸ばす。指先は相手から見て右を向く。',
      self: '自分からは手のひらが見え、4本の指は自分の左を指す。指文字の「く」と同じ形で、「く」は数字の9から来ている。',
    },
    memory: { kind: 'origin', text: '6〜9は、親指（5）に、横へ伸ばす指の本数を足した形（前橋市の表「親指の5に4を加える」）。' },
    confusables: [
      { id: 'num-4', tip: '4は手のひらを相手に向け、4本を上へ伸ばす。親指は折る' },
      { id: 'num-8', tip: '8は小指を握って3本にする' },
    ],
    variants: '2つの表と資料で同じ形。地域差の記述は見つからなかった（地域差がないとは言い切れない）。',
    sources: [...BASIC, 'baika-yubimoji'],
    confidence: 'high',
    detailNote: '親指の角度は2つの表の図に合わせた推定。親指は真上に近く立てた（指文字の「く」は、指文字の表に合わせて少し指先の側へ傾けて描いている）。',
    dynamic: false,
  },
  {
    id: 'num-10',
    kind: 'number',
    label: '10',
    reading: 'juu',
    sign: TEN,
    describe: {
      viewer: '手のひらを相手に向けて人差し指を立て（1の形）、その指を折り曲げる。',
      self: '1を作ってから、人差し指を真ん中の関節で曲げて、指先を相手の方へ折る。',
    },
    confusables: [
      { id: 'num-1', tip: '1は人差し指を立てたまま動かさない' },
      { id: 'num-0', tip: '0は全部の指を丸めて輪を作る' },
    ],
    variants:
      '国立国語研究所によると、大阪・京都・群馬には別の10の表し方がある。大阪：親指と人差し指の先を合わせ、中指・薬指・小指を立てる。京都：全部の指を丸めて指先を親指に付ける。群馬：親指の先を人差し指の指先に近い関節に添える。',
    sources: ['baika-suuji', 'sagara-2020', 'ninjal-dialect', ...TABLES],
    confidence: 'high',
    detailNote:
      '神奈川県の表は、曲げながら少し右（相手から見て左）へずらすと説明している。前橋市の表と大学の教材は曲げることだけを書いているので、この表示では曲げる動きだけにした。曲げた角度は推定。',
    dynamic: true,
  },
  {
    id: 'num-100',
    kind: 'number',
    label: '100',
    reading: 'hyaku',
    sign: HUNDRED,
    describe: {
      viewer: '人差し指だけを伸ばし、手の甲を相手に向けて指先を横（相手から見て右）へ向ける。手首を使って、指先を上へはね上げる。',
      self: '漢数字の「一」のように人差し指を横へ向けてから、手首を返して指先を上へはね上げる。',
    },
    confusables: [
      { id: 'num-1', tip: '1は手のひらを相手に向けて人差し指を立てるだけ。100は横に向けた指をはね上げる' },
      { id: 'num-1000', tip: '1000は人差し指を横に向けたまま「千」の字を書く' },
    ],
    variants:
      '親指の先と人差し指・中指の先を合わせ、0が2つあることで表す形もある（橋本市・相良 2020）。神奈川県の表は、200を「2を作り、のびた指をはね上げる」と説明している。',
    sources: ['baika-suuji', 'hashimoto-shuwa', 'sagara-2020', ...TABLES],
    confidence: 'high',
    detailNote: 'はね上げる角度・速さ・手の上がる量は資料に数値がなく、前橋市の表の図からの推定。手のひらの向き（手の甲を相手へ）は前橋市の「一」の図に合わせた。',
    dynamic: true,
  },
  {
    id: 'num-1000',
    kind: 'number',
    label: '1000',
    reading: 'sen',
    sign: THOUSAND,
    describe: {
      viewer: '人差し指を横（相手から見て右）へ向けたまま、空中に漢字の「千」を書く。相手からは字が左右反対に見え、横の線は右から左へ動く。',
      self: '漢数字の「一」の形のまま、自分から見て正しい向きで「千」を書く（ノ・一・｜の順）。',
    },
    confusables: [{ id: 'num-100', tip: '100は字を書かず、横に向けた指を上へはね上げる' }],
    variants: '親指の先と人差し指・中指・薬指の先を合わせ、0が3つあることで表す形もある（橋本市・相良 2020）。',
    sources: ['baika-suuji', 'hashimoto-shuwa', 'sagara-2020', ...TABLES],
    confidence: 'high',
    detailNote: '字の大きさ・書く位置・速さは資料に数値がない（推定）。書き順は神奈川県の表の番号（ノ・一・｜）に合わせた。',
    dynamic: true,
  },
];
