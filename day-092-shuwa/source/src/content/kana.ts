/**
 * 指文字：清音46文字と変化5種（sign-content が持ち主）。
 * 形はすべて右手・相手から見た向き（場の座標: +X＝相手から見て右, +Y＝上, +Z＝相手の方）。
 * 元は調査 r1（.agent-harness/research/r1_yubimoji.json）・r4（r4_followup.md）と、4つの指文字表（下の TABLE_SOURCE_IDS）。
 * 確信度の判断の理由と、表との照合の記録は .agent-harness/runs/content-kana/verify.md にある（文字ごと）。
 *
 * 向きの書き方の目安:
 *  - FACE ＝手のひらを相手に向け、指先は上（あ・い・う…）
 *  - back(…) ＝手の甲を相手に向ける（く・し・す・と・な…）。このとき親指の側は、指先が上なら相手から見て左、右なら上、下なら右
 *  - SIDE ＝小指の側を相手に向ける（こ・ぬ）。右手なので手のひらは相手から見て右を向く。
 *    お・を は筒の穴を相手へ向けるため SIDE_TO_VIEWER、ろ は2本のかぎが相手から横に並んで見えるよう RO_ORIENT（SIDE から60°）にする
 */
import type { Dir, FingerState, HandshapeSpec, JointAdjust, Keyframe, Orientation, SignSpec, Vec3 } from '../hand/types';
import { PULL_BACK, appendMove, composeModifier } from './compose';
import type { SignItem } from './types';

/**
 * 形を目で照合した4つの指文字表の出典ID（sources.ts に登録済み）。
 * sources.ts から読み込まない: 画面の試験が sources.ts を差し替えるため、ここで持つ（読み込むと差し替え時に項目が作れない）
 */
export const TABLE_SOURCE_IDS = ['kanagawa-2025', 'uji-table', 'asago-table', 'maebashi-panf'] as const;

const FACE: Orientation = { palm: 'toViewer', fingers: 'up' };
const back = (fingers: Dir): Orientation => ({ palm: 'toSigner', fingers });
const SIDE: Orientation = { palm: 'viewerRight', fingers: 'up' };
/**
 * お・を: 小指の側を相手に向け、指と親指で作った筒の穴を相手の目へ向ける。
 * 相手は表す人の体の正面に立つので、右手の筒を相手へ向けると、手のひらは真横より少し（約10°）表す人の側へ回る
 * （hand-model の「相手から」の視点も同じ 10° の位置から見ている）
 */
const SIDE_TO_VIEWER: Orientation = { palm: [0.98, 0, -0.17], fingers: 'up' };
/**
 * ろ: 小指の側を相手に向けた形から、手のひらを相手の方へ60°回す（cos60°・sin60°）。
 * SIDE のままだと相手から中指が人差し指の真後ろに重なって1本に見え、「ぬ」とほぼ同じ絵になる（独立照合 第1周）。
 * 30°では2本のかぎが1本分の太さに重なって見えた（独立照合 第2周）。60°で2本のかぎ（中節）が太さの和より離れて横に並び、曲げた形も見える。
 * 65°より回すと、かぎが相手の方へ向いて縮んで見える。神奈川県の表は手のひらを相手に向け、前橋市の表は横から描く。回す角度は推定
 */
const RO_ORIENT: Orientation = { palm: [0.5, 0, 0.87], fingers: 'up' };

/**
 * 親指を、握った薬指・小指の前に添える置き方（acrossFront）の角度。う・と・な・に・は・ら・り・ろ と、同じ形の数字の2・単語の「昼」が使う。
 * 逆運動学の解（cmcFlex 58・cmcAbd 27.6・mcp 15・ip 48）は、親指の先が薬指に 0.031〜0.032 めり込み、描画の警告（0.03）を超えた。
 * 解の角度に固定し、付け根の起こし（cmcAbd）だけ約1°足した: めり込み 0.022、親指の関節が動くのは 0.016（約1.6mm）で、見た目は変わらない
 */
export const THUMB_OVER_RING: JointAdjust = { cmcFlex: 58, cmcAbd: 28.5, cmcRot: -30, mcp: 15, ip: 48 };
/**
 * 親指を手のひらに折る置き方（foldedPalm）の角度。け・よ と、同じ形の数字の4が使う。
 * 逆運動学の解（ip 55.5）は親指の先が置き場所から 0.071 離れ、描画の警告（0.06）を超えた。
 * 解の角度に固定し、親指の先の関節（ip）だけ 6° 深く曲げた: 離れ 0.054、親指の関節が動くのは 0.027（約2.7mm）
 */
export const THUMB_IN_PALM: JointAdjust = { cmcFlex: 34, cmcAbd: 7.5, cmcRot: -16.5, mcp: 65, ip: 61.5 };

const F = (index: FingerState, middle: FingerState, ring: FingerState, pinky: FingerState) => ({ index, middle, ring, pinky });

function still(shape: HandshapeSpec, orient: Orientation = FACE): SignSpec {
  return { hands: { dominant: { keyframes: [{ t: 0, shape, orient, pos: { at: 'neutral' } }] } } };
}

/** 空中に字を書く文字（の・り・ん・のばす音）。points は動き出す時点の指先からのずれ（場の座標・相手から見た向き） */
function traced(
  shape: HandshapeSpec,
  orient: Orientation,
  start: Vec3,
  points: Vec3[],
  t: { start: number; end: number; total: number },
  extra: Keyframe[] = [],
): SignSpec {
  return {
    hands: { dominant: { keyframes: [{ t: 0, shape, orient, pos: { at: 'neutral', offset: start } }, ...extra] } },
    trace: { tip: 'index.tip', relativeTo: 'tipStart', points, tStart: t.start, tEnd: t.end },
    duration: t.total,
  };
}

/* ───────── 形（HandshapeSpec）。名前は文字のローマ字 ───────── */

const fist = F('curled', 'curled', 'curled', 'curled');

export const SHAPES = {
  // 親指は握りこぶしの横へ出す（4つの表とも、前を横切らず相手から見て右へ出ている）
  a: { fingers: fist, thumb: 'extendedOut' },
  i: { fingers: F('curled', 'curled', 'curled', 'extended'), thumb: 'acrossFront' },
  u: { fingers: F('extended', 'extended', 'curled', 'curled'), thumb: 'acrossFront', spread: 'together', adjust: { thumb: THUMB_OVER_RING } },
  // 第2関節から曲げ、付け根も曲げて指先を親指の上へ下ろす（表の図。付け根の角度は資料に無いので推定）
  e: {
    fingers: F('hooked', 'hooked', 'hooked', 'hooked'),
    thumb: 'tuckedUnder',
    spread: 'together',
    adjust: { index: { mcp: 40 }, middle: { mcp: 40 }, ring: { mcp: 40 }, pinky: { mcp: 40 } },
  },
  // 中指・薬指・小指は丸めた角度に固定し、人差し指は親指の先に届くよう逆運動学に任せる。
  // 親指は手のひらの前へ起こして（cmcAbd）輪の下側を作る。起こさないと親指が斜めに輪を横切り、相手から穴が見えない（4つの表とも穴が見える）
  o: {
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
  // 中指は相手の方へ倒す。倒す角度は資料に無いので、親指の腹が第2関節に届く 62° にした（推定）
  ka: {
    fingers: F('extended', 'bentMcp', 'curled', 'curled'),
    thumb: { touch: 'middle.pip' },
    spread: { index: 8, middle: 4 },
    adjust: { middle: { mcp: 62 } },
  },
  ki: {
    fingers: F('extended', 'half', 'half', 'extended'),
    thumb: { touch: 'middle.tip' },
    contacts: [['thumb.tip', 'ring.tip']],
    spread: { index: 6, pinky: 10 },
  },
  ku: { fingers: F('extended', 'extended', 'extended', 'extended'), thumb: 'extendedOut', spread: 'together' },
  ke: { fingers: F('extended', 'extended', 'extended', 'extended'), thumb: 'foldedPalm', spread: 'together', adjust: { thumb: THUMB_IN_PALM } },
  // 親指は指の向き（上）にそろえて立てる。曲げた指の上に親指の先がのぞく（神奈川県・朝来市・前橋市の表）。
  // 付け根の寄せ（cmcFlex）を 25° にすると親指が人差し指に 0.038 めり込む（描画の警告）。20° なら、めり込まずに先がのぞく
  ko: {
    fingers: F('bentMcp', 'bentMcp', 'bentMcp', 'bentMcp'),
    thumb: 'extendedUp',
    spread: 'together',
    adjust: { thumb: { cmcFlex: 20, cmcAbd: -5 } },
  },
  sa: { fingers: fist, thumb: 'acrossFront' },
  shi: { fingers: F('extended', 'extended', 'curled', 'curled'), thumb: 'extendedOut', spread: { index: 4, middle: 4 } },
  // し と同じ指の形（手首を返して指先を下へ）
  su: { fingers: F('extended', 'extended', 'curled', 'curled'), thumb: 'extendedOut', spread: { index: 4, middle: 4 } },
  se: { fingers: F('curled', 'extended', 'curled', 'curled'), thumb: 'acrossFront' },
  so: { fingers: F('extended', 'curled', 'curled', 'curled'), thumb: 'acrossFront' },
  ta: { fingers: fist, thumb: 'extendedOut' },
  chi: {
    fingers: F('half', 'half', 'half', 'extended'),
    thumb: { touch: 'middle.tip' },
    contacts: [
      ['thumb.tip', 'index.tip'],
      ['thumb.tip', 'ring.tip'],
    ],
    spread: { pinky: 8 },
  },
  tsu: {
    fingers: F('half', 'half', 'extended', 'extended'),
    thumb: { touch: 'index.tip' },
    contacts: [['thumb.tip', 'middle.tip']],
    spread: { ring: 6, pinky: 12 },
  },
  // 親指は横に開くが真横までは開かない（表の図はどれも斜め上。開きの角度は推定）
  te: {
    fingers: F('extended', 'extended', 'extended', 'extended'),
    thumb: 'extendedOut',
    spread: 'together',
    adjust: { thumb: { cmcFlex: -8 } },
  },
  to: { fingers: F('extended', 'extended', 'curled', 'curled'), thumb: 'acrossFront', spread: 'together', adjust: { thumb: THUMB_OVER_RING } },
  na: { fingers: F('extended', 'extended', 'curled', 'curled'), thumb: 'acrossFront', spread: { index: 6, middle: 6 }, adjust: { thumb: THUMB_OVER_RING } },
  ni: { fingers: F('extended', 'extended', 'curled', 'curled'), thumb: 'acrossFront', spread: { index: 3, middle: 3 }, adjust: { thumb: THUMB_OVER_RING } },
  // 親指は曲げて握りの中に収める（調査 r1「曲げて収める」）。先を中指の付け根に当てる。
  // 以前の acrossFront は親指が握った中指の前へ立ち上がり、自分から見ると人差し指のかぎと C 字を作った（独立照合 第2周）
  nu: { fingers: F('hooked', 'curled', 'curled', 'curled'), thumb: { touch: 'middle.mcp' } },
  ne: { fingers: F('extended', 'extended', 'extended', 'extended'), thumb: 'extendedOut', spread: 'apart' },
  no: { fingers: F('extended', 'curled', 'curled', 'curled'), thumb: 'acrossFront' },
  ha: { fingers: F('extended', 'extended', 'curled', 'curled'), thumb: 'acrossFront', spread: 'together', adjust: { thumb: THUMB_OVER_RING } },
  hi: { fingers: F('extended', 'curled', 'curled', 'curled'), thumb: 'acrossFront' },
  fu: { fingers: F('extended', 'curled', 'curled', 'curled'), thumb: 'extendedOut' },
  // 親指と小指を斜め下へ開いて「ヘ」の山形にする（表の図。開きの角度は推定）。
  // 親指は相手から見て水平から約35°下へ（4つの表はどれも20〜45°下。第1周の 5° では約52°下で、開きが狭く親指が短く見えた）
  he: {
    fingers: F('curled', 'curled', 'curled', 'extended'),
    thumb: 'extendedOut',
    spread: { pinky: 28 },
    adjust: { thumb: { cmcFlex: -12 } },
  },
  // 帆のように浅く丸める（丸める深さは推定）
  ho: {
    fingers: F('extended', 'extended', 'extended', 'extended'),
    thumb: 'alongside',
    spread: 'together',
    adjust: {
      index: { mcp: 12, pip: 18, dip: 10 },
      middle: { mcp: 12, pip: 18, dip: 10 },
      ring: { mcp: 12, pip: 18, dip: 10 },
      pinky: { mcp: 12, pip: 18, dip: 10 },
    },
  },
  ma: { fingers: F('extended', 'extended', 'extended', 'curled'), thumb: { touch: 'pinky.dip' }, spread: { index: 5, middle: 1, ring: 5 } },
  mi: { fingers: F('extended', 'extended', 'extended', 'curled'), thumb: { touch: 'pinky.dip' }, spread: { index: 5, middle: 1, ring: 5 } },
  mu: { fingers: F('extended', 'curled', 'curled', 'curled'), thumb: 'extendedOut' },
  // 輪は親指を横へ大きく開いて作る（相手に輪の穴が見えるように。付け根の角度は推定）。
  // 中指・薬指・小指は少し開く（神奈川県の表も3本を少し開いて描く）。開きが狭いと、自分から見て3本が前後に重なった（独立照合 第2周）
  me: {
    fingers: F('half', 'extended', 'extended', 'extended'),
    thumb: { touch: 'index.tip' },
    spread: { index: 25, middle: 4, ring: 10, pinky: 22 },
    adjust: { thumb: { cmcFlex: -24 } },
  },
  moOpen: {
    fingers: F('extended', 'curled', 'curled', 'curled'),
    thumb: 'extendedOut',
    adjust: { index: { pip: 14, dip: 10 } },
  },
  moClosed: { fingers: F('half', 'curled', 'curled', 'curled'), thumb: { touch: 'index.tip' } },
  ya: { fingers: F('curled', 'curled', 'curled', 'extended'), thumb: 'extendedOut' },
  yu: { fingers: F('extended', 'extended', 'extended', 'curled'), thumb: { touch: 'pinky.dip' }, spread: { index: 5, middle: 1, ring: 5 } },
  yo: { fingers: F('extended', 'extended', 'extended', 'extended'), thumb: 'foldedPalm', spread: 'together', adjust: { thumb: THUMB_IN_PALM } },
  // 相手からは人差し指が手前（中指の腹を人差し指の背＝爪の側に重ねる。types.ts の cross は手のひら側から見た前後）。
  // cross だけでは指先の近く（人差し指の末節）で交わり、相手から X 字に見えない（独立照合 第1周）。4つの表はどれも指の中ほどで交わり、
  // 指先が左右に分かれる。そこで2本を 14° ずつ傾けて付け根から約 0.42（人差し指の第2関節のあたり）で交わらせ、
  // 交わる所で2本の太さぶん前後にずれるよう付け根を 13° ずつ前後へ曲げる（傾き＝atan(0.105/0.42)、前後＝atan(0.0975/0.42)。推定）
  ra: {
    fingers: F('extended', 'extended', 'curled', 'curled'),
    thumb: 'acrossFront',
    cross: { front: 'index', back: 'middle' },
    adjust: { index: { mcp: 13, spread: -14 }, middle: { mcp: -13, spread: 14 }, thumb: THUMB_OVER_RING },
  },
  ri: { fingers: F('extended', 'extended', 'curled', 'curled'), thumb: 'acrossFront', spread: { index: 5, middle: 5 }, adjust: { thumb: THUMB_OVER_RING } },
  ru: { fingers: F('extended', 'extended', 'curled', 'curled'), thumb: 'extendedOut', spread: { index: 8, middle: 8 } },
  re: { fingers: F('extended', 'curled', 'curled', 'curled'), thumb: 'extendedOut' },
  ro: { fingers: F('hooked', 'hooked', 'curled', 'curled'), thumb: 'acrossFront', spread: 'together', adjust: { thumb: THUMB_OVER_RING } },
  wa: { fingers: F('extended', 'extended', 'extended', 'curled'), thumb: { touch: 'pinky.dip' }, spread: { index: 8, middle: 1, ring: 8 } },
  n: { fingers: F('extended', 'curled', 'curled', 'curled'), thumb: 'acrossFront' },
  chouon: { fingers: F('extended', 'curled', 'curled', 'curled'), thumb: 'acrossFront' },
} satisfies Record<string, HandshapeSpec>;

/* ───────── 形と向き・動き（SignSpec） ───────── */

const SIGNS = {
  a: still(SHAPES.a),
  i: still(SHAPES.i),
  u: still(SHAPES.u),
  e: still(SHAPES.e),
  o: still(SHAPES.o, SIDE_TO_VIEWER),
  ka: still(SHAPES.ka),
  ki: still(SHAPES.ki),
  ku: still(SHAPES.ku, back('viewerRight')),
  ke: still(SHAPES.ke),
  ko: still(SHAPES.ko, SIDE),
  sa: still(SHAPES.sa),
  shi: still(SHAPES.shi, back('viewerRight')),
  su: still(SHAPES.su, back('down')),
  se: still(SHAPES.se),
  // 相手の方の斜め下を指す。手のひらは下向き（文章の資料に無く、表の図から推定）
  so: still(SHAPES.so, { palm: [0.35, -0.75, -0.55], fingers: [-0.15, -0.6, 0.8] }),
  // 握った指の背を相手に見せ、親指を真上に立てる（4つの表の図。親指が真上になるよう指の付け根を少し上へ傾ける）
  ta: still(SHAPES.ta, { palm: 'toViewer', fingers: [-0.94, 0.34, 0] }),
  chi: still(SHAPES.chi),
  tsu: still(SHAPES.tsu),
  te: still(SHAPES.te),
  to: still(SHAPES.to, back('up')),
  na: still(SHAPES.na, back('down')),
  ni: still(SHAPES.ni, back('viewerRight')),
  nu: still(SHAPES.nu, SIDE),
  ne: still(SHAPES.ne, back('down')),
  // 相手から見て左上から右下へ（表す人から見た「ノ」を左右反転した点）
  no: traced(
    SHAPES.no,
    FACE,
    [-0.3, 0.4, 0],
    [
      [0, 0, 0],
      [0.12, -0.55, 0],
      [0.42, -1.05, 0],
      [0.95, -1.38, 0],
    ],
    { start: 0.25, end: 1.15, total: 1.3 },
  ),
  // 指先を相手の方へ、少し下・相手から見て左へ。小指の側を下にし、指の腹が少し相手に見える向き
  ha: still(SHAPES.ha, { palm: [0.89, 0, 0.35], fingers: [-0.35, -0.3, 0.89] }),
  hi: still(SHAPES.hi),
  fu: still(SHAPES.fu, back('down')),
  he: still(SHAPES.he, back('down')),
  ho: still(SHAPES.ho, back('up')),
  ma: still(SHAPES.ma, back('down')),
  mi: still(SHAPES.mi, back('viewerRight')),
  mu: still(SHAPES.mu, back('viewerRight')),
  // 手のひらを相手から見て右へ約50°回し、輪の穴が相手に見えるようにする（4つの表とも、輪は相手から見て右にあり穴が見える。
  // 正面のままだと輪を横から見ることになり穴が消える。90°まで回すと残りの3本が重なって見分けにくい）
  me: still(SHAPES.me, { palm: [0.8, 0, 0.6], fingers: 'up' }),
  // 開いた親指と人差し指を、少し下ろしながら閉じる。手の甲を相手に向ける（広島・SureTalk・Makki と神奈川県・前橋市の表）
  mo: {
    hands: {
      dominant: {
        keyframes: [
          { t: 0, shape: SHAPES.moOpen, orient: back('up'), pos: { at: 'neutral', offset: [0, 0.25, 0] } },
          { t: 0.3, pos: { at: 'neutral', offset: [0, 0.25, 0] } },
          { t: 0.85, shape: SHAPES.moClosed, pos: { at: 'neutral', offset: [0, -0.25, 0] }, ease: 'inOut' },
        ],
      },
    },
    duration: 1.0,
  },
  ya: still(SHAPES.ya),
  yu: still(SHAPES.yu, back('up')),
  yo: still(SHAPES.yo, back('viewerRight')),
  ra: still(SHAPES.ra),
  // 2本の指で「リ」。相手から見て右下へ払い、払い終わりで指先が相手から見て右を向く（神奈川県・前橋市の表の終わりの形）。
  // 指先を右下まで回すと前腕が上へ回り込んで不自然になるので、ほぼ水平で止める
  ri: traced(
    SHAPES.ri,
    FACE,
    [-0.3, 0.4, 0],
    [
      [0, 0, 0],
      [0.08, -0.5, 0],
      [0.35, -0.95, 0],
      [0.8, -1.25, 0],
    ],
    { start: 0.25, end: 1.15, total: 1.3 },
    [
      { t: 0.25, orient: FACE },
      { t: 1.15, orient: { palm: 'toViewer', fingers: [0.95, 0.1, 0.3] } },
    ],
  ),
  ru: still(SHAPES.ru),
  re: still(SHAPES.re),
  ro: still(SHAPES.ro, RO_ORIENT),
  wa: still(SHAPES.wa),
  // 「お」の形のまま、表す人の体の方へ引く（相手から遠ざかる）
  wo: appendMove(still(SHAPES.o, SIDE_TO_VIEWER), PULL_BACK),
  // 相手から見て右上から短く下ろし、そこから左上へ大きく払う（表す人から見た「ン」を左右反転した点）。
  // カタカナの「ン」は2画目が長いので、払い（道のり約1.4）を下ろす画（約0.8）より長くし、払い終わりを書き始めより高くする
  // （前橋市・朝来市の表は短い動きから大きな弧、神奈川県の表は下ろしてから左上へ大きく払う。大きさは推定）
  n: traced(
    SHAPES.n,
    FACE,
    [0.4, 0.35, 0],
    [
      [0, 0, 0],
      [-0.04, -0.3, 0],
      [-0.1, -0.55, 0],
      [-0.25, -0.7, 0],
      [-0.55, -0.58, 0],
      [-0.92, -0.25, 0],
      [-1.3, 0.15, 0],
    ],
    { start: 0.25, end: 1.45, total: 1.6 },
  ),
  // 人差し指を前（相手の方）へ向け、上から下へ縦の線を書く
  chouon: traced(SHAPES.chouon, { palm: 'viewerRight', fingers: [-0.15, 0.25, 1] }, [0, 0.6, 0], [
    [0, 0, 0],
    [0, -1.2, 0],
  ], { start: 0.2, end: 0.9, total: 1.05 }),
} satisfies Record<string, SignSpec>;

/* ───────── 項目 ───────── */

type ItemFields = Omit<SignItem, 'id' | 'kind' | 'label' | 'reading' | 'dynamic' | 'sign' | 'sources'> & {
  sign: SignSpec;
  /** 文章の資料（調査 r1・r4）の出典ID。照合に使った表は tables に書く（省略時は4つとも） */
  text: string[];
  tables?: readonly string[];
  dynamic?: boolean;
};

const ALL_TABLES = TABLE_SOURCE_IDS;

function kana(romaji: string, label: string, f: ItemFields): SignItem {
  const { text, tables = ALL_TABLES, dynamic = false, ...rest } = f;
  return { id: `kana-${romaji}`, kind: 'kana', label, reading: romaji, ...rest, sources: [...text, ...tables], dynamic };
}

function mod(id: string, label: string, reading: string, f: ItemFields): SignItem {
  const { text, tables = ALL_TABLES, dynamic = true, ...rest } = f;
  return { id, kind: 'modifier', label, reading, ...rest, sources: [...text, ...tables], dynamic };
}

const tip = (id: string, text: string) => ({ id, tip: text });

export const KANA_ITEMS: SignItem[] = [
  // あ行
  kana('a', 'あ', {
    sign: SIGNS.a,
    describe: {
      viewer: '握りこぶしから、親指だけを横に出す。手のひらは相手に向ける。',
      self: '4本の指を握り、親指を外へ出す。自分からは手の甲が見え、親指は左へ向く。',
    },
    memory: { kind: 'origin', text: 'アルファベットの指文字の「A」から。' },
    confusables: [tip('kana-sa', 'さは親指を曲げて、握った指の前に置く。'), tip('kana-ta', 'たは親指をまっすぐ上に立てる。')],
    text: ['kyoto-rou-a', 'hiroshima-a', 'benricho-1'],
    confidence: 'high',
    detailNote: '親指を出す角度（真横か、やや上か）は表によって少し違う。表の多数に合わせて、やや上向きの横にした（推定）。',
  }),
  kana('i', 'い', {
    sign: SIGNS.i,
    describe: {
      viewer: '小指だけを立て、ほかの指は握る。手のひらは相手に向ける。',
      self: '小指を立てて残りを握り、親指は握った指の前に添える。自分からは手の甲が見え、小指は右端に立つ。',
    },
    memory: { kind: 'origin', text: 'アルファベットの指文字の「I」から。' },
    confusables: [tip('kana-chi', 'ちは人差し指・中指・薬指の先を親指の先に集める。'), tip('kana-ya', 'やは親指も横に伸ばす。')],
    variants: '親指は握った指の前に添えても、内側に入れてもよいとする教材がある（ラブすぽ）。',
    text: ['kyoto-rou-i', 'hiroshima-a', 'lovespo'],
    confidence: 'high',
    detailNote: '親指の収め方には教材で許す幅がある。表の多数に合わせて、握った指の前に添えた。',
  }),
  kana('u', 'う', {
    sign: SIGNS.u,
    describe: {
      viewer: '人差し指と中指をそろえて立てる。手のひらは相手に向ける。',
      self: '2本の指をくっつけたまま上へ伸ばす。開いてVにしない。親指は薬指と小指を押さえる。',
    },
    memory: { kind: 'origin', text: 'アルファベットの指文字の「U」から。' },
    confusables: [
      tip('kana-to', 'とは同じ指の形で、手の甲を相手に向ける。'),
      tip('kana-na', 'なは指先を下に向ける。'),
      tip('kana-ni', 'には指先を横（相手から見て右）に向ける。'),
    ],
    text: ['hiroshima-a', 'makki', 'benricho-1'],
    confidence: 'high',
    detailNote: '親指で薬指・小指のどこを押さえるかは資料に無い（推定）。',
  }),
  kana('e', 'え', {
    sign: SIGNS.e,
    describe: {
      viewer: '4本の指をそろえて真ん中の関節から曲げ、指先を手のひらの方へ向ける。親指は曲げた指先の下に収める。手のひらは相手に向ける。',
      self: 'ボールを軽くつかむように指を曲げる。握りこぶしにはせず、指先と手のひらのあいだにすき間を残す。',
    },
    memory: { kind: 'origin', text: 'アルファベットの指文字の「E」から。' },
    confusables: [
      tip('kana-sa', 'さは指を握り込み、親指を握った指の前に置く。'),
      tip('kana-o', 'おは小指の側を相手に向け、指先と親指で輪を作る。'),
    ],
    text: ['hiroshima-a', 'suretalk', 'makki'],
    confidence: 'high',
    detailNote: '付け根の曲げ具合と、親指が指先に触れるかどうかは資料で分かれる（推定）。',
  }),
  kana('o', 'お', {
    sign: SIGNS.o,
    describe: {
      viewer: '指を丸めて、親指の先と人差し指の先をつけて輪を作る。小指の側を相手に向けるので、相手には輪の穴が見える。',
      self: '小指の側を相手に向け、筒を握るように指を丸める。自分からは親指と人差し指の側が見える。',
    },
    memory: { kind: 'origin', text: 'アルファベットの指文字の「O」から。' },
    confusables: [
      tip('kana-me', 'めは中指・薬指・小指を伸ばす。'),
      tip('kana-ko', 'こは指を付け根から直角に曲げ、親指とは輪を作らない。'),
    ],
    variants: '中指・薬指・小指の先まで親指に触れさせる説明もある（Makki）。',
    text: ['benricho-1', 'hiroshima-a', 'kyoto-rou-o'],
    confidence: 'high',
    detailNote: '中指・薬指・小指の先が親指に触れるかどうかは資料で分かれる。人差し指の先と親指の先で輪を閉じた（推定）。',
  }),
  // か行
  kana('ka', 'か', {
    sign: SIGNS.ka,
    describe: {
      viewer: '人差し指を上に立て、中指を相手の方へ斜めに出す。親指の腹を中指の真ん中の関節のあたりに当てる。薬指と小指は握る。手のひらは相手に向ける。',
      self: 'チョキの形から中指を前へ倒し、2本の間から親指を出して中指に当てる。薬指と小指は握る。',
    },
    memory: { kind: 'origin', text: 'アルファベットの指文字の「K」から。' },
    confusables: [
      tip('kana-u', 'うは2本をそろえて立て、親指は握った指の前に置く。'),
      tip('kana-ki', 'きは人差し指と小指を立て、中指と薬指の先を親指の先につける（きつねの形）。'),
      tip('kana-ru', 'るは親指を中指につけず、横に伸ばす。'),
    ],
    variants: '親指の側を相手の方へ向けて構える説明もある（Makki）。',
    text: ['hiroshima-ka', 'benricho-1', 'suretalk'],
    confidence: 'medium',
    detailNote: '中指を倒す角度は資料に無い（推定）。',
  }),
  kana('ki', 'き', {
    sign: SIGNS.ki,
    describe: {
      viewer: '人差し指と小指を立て、中指と薬指の先を親指の先につける。手のひらは相手に向ける。',
      self: '影絵のきつねを作る。中指・薬指・親指の先を1か所に集め、人差し指と小指は耳のように立てる。',
    },
    memory: { kind: 'origin', text: '影絵のきつねの形から。' },
    confusables: [
      tip('kana-ya', 'やは人差し指から薬指までを握り、親指と小指を開く。'),
      tip('kana-ka', 'かは薬指を握り、親指を中指の関節に当てる。'),
    ],
    variants: '宇治市の表は「き」を表す人から見た向きで描いている。',
    text: ['hiroshima-ka', 'benricho-1'],
    confidence: 'high',
  }),
  kana('ku', 'く', {
    sign: SIGNS.ku,
    describe: {
      viewer: '親指を上に立て、残りの4本をそろえて横（相手から見て右）に伸ばす。手の甲を相手に向ける。',
      self: '自分からは手のひらが見える。4本の指を左へ伸ばし、親指だけを上に立てる。',
    },
    memory: { kind: 'origin', text: '手話の数字の「9」と同じ形から。' },
    confusables: [tip('kana-yo', 'よは親指を手のひらに折る。'), tip('kana-shi', 'しは薬指と小指を握る。')],
    variants: '4本の指の先を軽く曲げる説明もある（ラブすぽ）。',
    text: ['hiroshima-ka', 'suretalk', 'lovespo'],
    confidence: 'high',
    detailNote: '4本の指の先をまっすぐにするか軽く曲げるかは資料で分かれる。ここではまっすぐにした。',
  }),
  kana('ke', 'け', {
    sign: SIGNS.ke,
    describe: {
      viewer: '4本の指をそろえて上に伸ばし、親指は手のひらの中へ折る。手のひらは相手に向ける。',
      self: '指をそろえたパーから、親指だけを手のひらに折りたたむ。',
    },
    memory: { kind: 'mnemonic', text: '敬礼（けいれい）をするときの手の形。' },
    confusables: [tip('kana-te', 'ては親指も伸ばす。'), tip('kana-yo', 'よは手の甲を相手に向け、指先を横にする。')],
    variants: 'アルファベットの指文字の「B」と結びつける説明もある（NPO法人ホープ）。',
    text: ['hiroshima-ka', 'benricho-1', 'hope'],
    confidence: 'high',
    detailNote: '親指を手のひらのどこまで折るかは資料に無い（推定）。',
  }),
  kana('ko', 'こ', {
    sign: SIGNS.ko,
    describe: {
      viewer: '4本の指をそろえて付け根から直角に曲げ、指先を相手から見て右に向ける。親指は上に立てる。小指の側を相手に向ける。',
      self: '手を横に向け、指をそろえたまま付け根だけを曲げて「コ」の字を作る。親指は上へ伸ばす。',
    },
    memory: { kind: 'origin', text: 'カタカナの「コ」の形から。' },
    confusables: [
      tip('kana-o', 'おは指を丸めて親指と輪を作る。'),
      tip('kana-ro', 'ろは人差し指と中指だけをかぎの形に曲げる。'),
    ],
    text: ['hiroshima-ka', 'benricho-1'],
    confidence: 'high',
  }),
  // さ行
  kana('sa', 'さ', {
    sign: SIGNS.sa,
    describe: {
      viewer: '4本の指を握り、親指も曲げて握った指の前に置く。手のひらは相手に向ける。',
      self: '握りこぶしを作り、親指で人差し指と中指を外から押さえる。',
    },
    memory: { kind: 'origin', text: 'アルファベットの指文字の「S」から。' },
    confusables: [tip('kana-a', 'あは親指を横に出す。'), tip('kana-e', 'えは指先を手のひらの方へ折り、すき間を残す。')],
    text: ['hiroshima-sa', 'benricho-1'],
    confidence: 'high',
    detailNote: '親指が人差し指・中指のどの関節の上を通るかは資料に無い。表の図に合わせて中ほどに置いた（推定）。',
  }),
  kana('shi', 'し', {
    sign: SIGNS.shi,
    describe: {
      viewer: '親指を上に立て、人差し指と中指を横（相手から見て右）に伸ばす。薬指と小指は握る。手の甲を相手に向ける。',
      self: '自分からは手のひらが見える。人差し指と中指を左へ向け、親指を上に立てる。',
    },
    memory: { kind: 'origin', text: '手話の数字の「7（しち）」から。' },
    confusables: [
      tip('kana-su', 'すは指先を下に向ける。'),
      tip('kana-ni', 'には親指を曲げる。'),
      tip('kana-ku', 'くは4本の指を伸ばす。'),
    ],
    text: ['hiroshima-sa', 'suretalk'],
    confidence: 'high',
    detailNote: '人差し指と中指の開き幅は資料で分かれる（推定）。',
  }),
  kana('su', 'す', {
    sign: SIGNS.su,
    describe: {
      viewer: '人差し指と中指を下に向けて伸ばし、親指を横（相手から見て右）に出す。手の甲を相手に向ける。',
      self: '「し」の形のまま手首を返して指先を下に向ける。自分からはカタカナの「ス」に見える。',
    },
    memory: { kind: 'origin', text: '自分から見たカタカナの「ス」の形から。' },
    confusables: [
      tip('kana-shi', 'しは指先を横に向ける。'),
      tip('kana-na', 'なは親指を曲げる。'),
      tip('kana-fu', 'ふは中指を握る。'),
    ],
    text: ['hiroshima-sa', 'benricho-1'],
    confidence: 'high',
    detailNote: '2本の指の開き幅は資料に無い（推定）。',
  }),
  kana('se', 'せ', {
    sign: SIGNS.se,
    describe: {
      viewer: '中指だけを上に立て、ほかの指は握る。手のひらは相手に向ける。',
      self: '握りこぶしから中指だけを伸ばす。親指は握った指の前に添える。',
    },
    memory: { kind: 'mnemonic', text: 'いちばん背（せ）の高い指を立てる。' },
    confusables: [tip('kana-hi', 'ひは人差し指を立てる。')],
    variants: '由来は「背が高い」とする説明と、手話の「兄弟」に結びつける説明がある（岩手県教育委員会の表）。',
    text: ['hiroshima-sa', 'benricho-1', 'iwate'],
    confidence: 'high',
    detailNote: '親指の置き場所は資料に無い（推定）。',
  }),
  kana('so', 'そ', {
    sign: SIGNS.so,
    describe: {
      viewer: '人差し指で、相手の方の斜め下を指す。ほかの指は握る。',
      self: '「それ」と目の前のものを指すように、人差し指を前の斜め下へ向ける。',
    },
    memory: { kind: 'origin', text: '「それ」と指さすしぐさから。' },
    confusables: [tip('kana-hi', 'ひは人差し指を上に立てる。')],
    variants: '「それ」と指す動きをつける説明もあるが、動かし方を決めた資料は見つからなかった。',
    text: ['hiroshima-sa', 'suretalk'],
    confidence: 'medium',
  }),
  // た行
  kana('ta', 'た', {
    sign: SIGNS.ta,
    describe: {
      viewer: '4本の指を握り、親指をまっすぐ上に立てる。手のひらの側を相手に向けるので、相手には親指の腹と、握った指先の並びが見える。',
      self: '親指を立てた「いいね」の形を作り、握った指先と親指の腹が相手に見えるよう、こぶしを横に倒す。自分からは手の甲が見える。',
    },
    memory: { kind: 'origin', text: 'アルファベットの指文字の「T」を変えた形とされる。' },
    confusables: [tip('kana-a', 'あは親指を横に出す。'), tip('kana-sa', 'さは親指を曲げる。')],
    variants: '手話の「男」と同じ形でもある（岩手県教育委員会の表）。',
    text: ['hiroshima-ta', 'benricho-1', 'iwate'],
    confidence: 'high',
    detailNote: 'こぶしの倒し方（手のひらの面の向き）は文章の資料に無く、表の図から推し量った（推定）。',
  }),
  kana('chi', 'ち', {
    sign: SIGNS.chi,
    describe: {
      viewer: '小指を立て、人差し指・中指・薬指の先を親指の先に集める。手のひらは相手に向ける。',
      self: '親指と3本の指の先をつまむように1か所に集め、小指だけを伸ばす。',
    },
    memory: { kind: 'origin', text: 'カタカナの「チ」に似た形から。' },
    confusables: [tip('kana-i', 'いは人差し指・中指・薬指を握り込む。'), tip('kana-tsu', 'つは薬指も伸ばす。')],
    variants: '宇治市の表は「ち」を表す人から見た向きで描いている。',
    text: ['hiroshima-ta', 'benricho-1'],
    confidence: 'high',
  }),
  kana('tsu', 'つ', {
    sign: SIGNS.tsu,
    describe: {
      viewer: '薬指と小指を立て、人差し指と中指の先を親指の先につける。手のひらは相手に向ける。',
      self: '親指・人差し指・中指でつまむ形を作り、薬指と小指を上へ伸ばす。',
    },
    memory: { kind: 'origin', text: 'カタカナの「ツ」の形から。' },
    confusables: [tip('kana-chi', 'ちは薬指も親指の先につける。')],
    variants: '宇治市の表は「つ」を表す人から見た向きで描いている。',
    text: ['hiroshima-ta', 'benricho-1'],
    confidence: 'high',
    detailNote: '薬指と小指の開き幅は資料に無い（推定）。',
  }),
  kana('te', 'て', {
    sign: SIGNS.te,
    describe: {
      viewer: '5本の指を伸ばし、手のひらを相手に向ける。',
      self: '手のひらを相手に見せる。4本の指はそろえ、親指は横に開く。',
    },
    memory: { kind: 'origin', text: '手そのものを示す形から。' },
    confusables: [
      tip('kana-ke', 'けは親指を手のひらに折る。'),
      tip('kana-ho', 'ほは手の甲を相手に向け、指を軽く曲げる。'),
      tip('kana-ne', 'ねは手の甲を相手に向け、指先を下に向ける。'),
    ],
    variants: '指をそろえる説明と、パーのように開く説明がある。',
    text: ['hiroshima-ta', 'benricho-1', 'lovespo'],
    confidence: 'high',
    detailNote: '4本の指のあいだを開くかどうかは資料で分かれる。表の多数に合わせてそろえた。',
  }),
  kana('to', 'と', {
    sign: SIGNS.to,
    describe: {
      viewer: '人差し指と中指をそろえて立て、手の甲を相手に向ける。',
      self: '自分からは手のひらが見える。2本の指をそろえて上へ伸ばし、残りは握る。',
    },
    memory: { kind: 'mnemonic', text: '2本の指を「〜と〜」の2つに見立てる。' },
    confusables: [
      tip('kana-u', 'うは手のひらを相手に向ける。'),
      tip('kana-na', 'なは指先を下に向ける。'),
      tip('kana-ni', 'には指先を横に向ける。'),
    ],
    text: ['hiroshima-ta', 'benricho-1'],
    confidence: 'high',
    detailNote: '親指の添え方は資料に無い（推定）。',
  }),
  // な行
  kana('na', 'な', {
    sign: SIGNS.na,
    describe: {
      viewer: '人差し指と中指を少し開いて下に向ける。手の甲を相手に向ける。',
      self: '自分からは手のひらが見える。2本の指を下へ伸ばし、親指と残りの指は握る。',
    },
    memory: { kind: 'origin', text: 'アルファベットの「N」の形から。' },
    confusables: [
      tip('kana-su', 'すは親指も伸ばす。'),
      tip('kana-ma', 'まは薬指も伸ばす。'),
      tip('kana-ni', 'には指先を横に向ける。'),
    ],
    text: ['hiroshima-na', 'suretalk'],
    confidence: 'high',
    detailNote: '親指の収め方と2本の開き幅は資料に無い（推定）。',
  }),
  kana('ni', 'に', {
    sign: SIGNS.ni,
    describe: {
      viewer: '人差し指と中指を横（相手から見て右）に伸ばす。手の甲を相手に向ける。',
      self: '自分からは手のひらが見える。2本の指を左へ向けて伸ばし、親指は握る。',
    },
    memory: { kind: 'origin', text: '手話の数字の「2」から。' },
    confusables: [
      tip('kana-shi', 'しは親指を上に立てる。'),
      tip('kana-mi', 'みは薬指も伸ばす。'),
      tip('kana-na', 'なは指先を下に向ける。'),
    ],
    text: ['hiroshima-na', 'benricho-1'],
    confidence: 'high',
    detailNote: '2本の指の開き幅は資料に無い（推定）。',
  }),
  kana('nu', 'ぬ', {
    sign: SIGNS.nu,
    describe: {
      viewer: '小指の側を相手に向け、立てた人差し指を真ん中の関節で曲げてかぎの形にする。ほかの指は握り、親指も曲げて握りの中に収める。',
      self: '人差し指の先を手のひらの方へ折り曲げて、フックを作る。親指は外へ出さず、中指の付け根のあたりにたたむ。手は横に向ける。',
    },
    memory: { kind: 'origin', text: '手話の「盗む」の手の形から。' },
    confusables: [tip('kana-hi', 'ひは人差し指をまっすぐ立てる。'), tip('kana-ro', 'ろは中指もかぎの形にする。')],
    text: ['hiroshima-na', 'benricho-1', 'suretalk'],
    confidence: 'high',
    detailNote: '親指は曲げて収める（調査 r1）ことまでは分かるが、どこに当てるかは資料に無い。先を中指の付け根に当てた（推定）。',
  }),
  kana('ne', 'ね', {
    sign: SIGNS.ne,
    describe: {
      viewer: '5本の指を開いて下に向ける。手の甲を相手に向ける。',
      self: '自分からは手のひらが見える。木の根のように指を広げて下へ伸ばす。',
    },
    memory: { kind: 'origin', text: '木の根の形から。' },
    confusables: [tip('kana-te', 'ては手のひらを相手に向け、指先を上に向ける。'), tip('kana-ma', 'まは伸ばす指が3本。')],
    text: ['hiroshima-na', 'benricho-1'],
    confidence: 'high',
  }),
  kana('no', 'の', {
    sign: SIGNS.no,
    describe: {
      viewer: '人差し指を立て、指先で「ノ」を空中に書く。相手からは左上から右下へ動いて見える。',
      self: '自分から見てカタカナの「ノ」を書く。右上から左下へ、1画で払う。',
    },
    memory: { kind: 'origin', text: 'カタカナの「ノ」を空中に書く。' },
    confusables: [
      tip('kana-so', 'そは動かさず、斜め下を指す。'),
      tip('kana-ri', 'りは人差し指と中指の2本で書く。'),
      tip('kana-n', 'んは「ン」を書く。'),
    ],
    text: ['hiroshima-na', 'makki'],
    confidence: 'medium',
    dynamic: true,
  }),
  // は行
  kana('ha', 'は', {
    sign: SIGNS.ha,
    describe: {
      viewer: '人差し指と中指をそろえて伸ばし、指先を相手の方へ向ける。小指の側を下にする。',
      self: 'そろえた2本の指を、前へ水平に（少し下向きに）出す。親指は握った指に添える。',
    },
    memory: { kind: 'origin', text: 'アルファベットの指文字の「H」から。' },
    confusables: [
      tip('kana-ni', 'には手の甲を相手に向け、指先を横に向ける。'),
      tip('kana-to', 'とは指先を上に向ける。'),
    ],
    variants: '指先を水平に出す説明と、斜め下に出す説明がある。はさみや箸に見立てる覚え方もある。',
    text: ['hiroshima-ha', 'benricho-2', 'makki'],
    confidence: 'medium',
  }),
  kana('hi', 'ひ', {
    sign: SIGNS.hi,
    describe: {
      viewer: '人差し指だけを上に立て、ほかの指は握る。手のひらは相手に向ける。',
      self: '数字の1を出すように人差し指を立てる。親指は握った指の前に添える。',
    },
    memory: { kind: 'origin', text: '数字の1（ひとつ）から。' },
    confusables: [
      tip('kana-se', 'せは中指を立てる。'),
      tip('kana-nu', 'ぬは人差し指をかぎの形に曲げる。'),
      tip('kana-so', 'そは相手の方の斜め下を指す。'),
    ],
    text: ['hiroshima-ha', 'benricho-2'],
    confidence: 'high',
    detailNote: '親指の置き場所は資料に無い（推定）。',
  }),
  kana('fu', 'ふ', {
    sign: SIGNS.fu,
    describe: {
      viewer: '人差し指を下に向けて伸ばし、親指を横（相手から見て右）に出す。手の甲を相手に向ける。',
      self: '自分から見てカタカナの「フ」になるよう、親指を左へ、人差し指を下へ伸ばす。',
    },
    memory: { kind: 'origin', text: '自分から見たカタカナの「フ」の形から。' },
    confusables: [
      tip('kana-su', 'すは中指も伸ばす。'),
      tip('kana-he', 'へは人差し指ではなく小指を伸ばす。'),
      tip('kana-re', 'れは手のひらを相手に向け、人差し指を上に立てる。'),
    ],
    text: ['hiroshima-ha', 'benricho-2'],
    confidence: 'high',
    detailNote: '親指を水平に出すか斜め下に出すかは資料に無い（推定）。',
  }),
  kana('he', 'へ', {
    sign: SIGNS.he,
    describe: {
      viewer: '親指と小指を開いて下向きに伸ばし、ほかの指は握る。手の甲を相手に向ける。',
      self: '自分からは手のひらが見える。親指と小指を開き、山の形（「ヘ」の字）になるよう下へ向ける。',
    },
    memory: { kind: 'origin', text: 'カタカナの「ヘ」の形から。' },
    confusables: [
      tip('kana-ya', 'やは手のひらを相手に向け、小指を上に立てる。'),
      tip('kana-fu', 'ふは小指ではなく人差し指を伸ばす。'),
    ],
    text: ['hiroshima-ha', 'benricho-2', 'lovespo'],
    confidence: 'high',
    detailNote: '親指と小指を開く角度は資料に無い。4つの表の図に合わせ、相手から見て親指は水平から約35°下、小指は約60°下へ開いた（推定）。',
  }),
  kana('ho', 'ほ', {
    sign: SIGNS.ho,
    describe: {
      viewer: '指をそろえて上に伸ばし、手のひらを軽く丸める。手の甲を相手に向ける。',
      self: '自分からは手のひらが見える。船の帆のように、手のひらを少しくぼませる。',
    },
    memory: { kind: 'origin', text: '船の帆（ほ）の形から。' },
    confusables: [
      tip('kana-te', 'ては手のひらを相手に向け、指をまっすぐ伸ばす。'),
      tip('kana-e', 'えは手のひらを相手に向け、指を深く曲げる。'),
    ],
    text: ['hiroshima-ha', 'benricho-2'],
    confidence: 'high',
    detailNote: '丸める深さは資料に無い（推定）。',
  }),
  // ま行
  kana('ma', 'ま', {
    sign: SIGNS.ma,
    describe: {
      viewer: '人差し指・中指・薬指を下に向けて伸ばす。親指と小指は曲げる。手の甲を相手に向ける。',
      self: '自分からは手のひらが見える。3本の指を下へ伸ばし、親指で小指を押さえる。',
    },
    memory: { kind: 'origin', text: 'アルファベットの「M」の形から。' },
    confusables: [
      tip('kana-na', 'なは伸ばす指が2本。'),
      tip('kana-mi', 'みは指先を横に向ける。'),
      tip('kana-wa', 'わは手のひらを相手に向け、指先を上に向ける。'),
    ],
    variants: '手のひらを相手に向けると書く資料もある（便利帳）。照合した4つの表は、どれも手の甲を相手に向けている。',
    text: ['hiroshima-ma', 'suretalk', 'benricho-2'],
    // 表4つと文章2つは手の甲で一致するが、便利帳が手のひらを相手に向けると書いており、基本の形（手のひらの向き）が食い違うので medium
    confidence: 'medium',
    detailNote: '親指で小指のどこを押さえるかは資料に無い（推定）。',
  }),
  kana('mi', 'み', {
    sign: SIGNS.mi,
    describe: {
      viewer: '人差し指・中指・薬指を横（相手から見て右）に伸ばす。手の甲を相手に向ける。',
      self: '自分からは手のひらが見える。3本の指を少し開いて左へ向ける。',
    },
    memory: { kind: 'origin', text: '数字の3（みっつ）から。' },
    confusables: [
      tip('kana-ni', 'には伸ばす指が2本。'),
      tip('kana-yo', 'よは伸ばす指が4本。'),
      tip('kana-ma', 'まは指先を下に向ける。'),
    ],
    text: ['hiroshima-ma', 'benricho-2'],
    confidence: 'high',
    detailNote: '親指で押さえる場所は資料に無い（推定）。',
  }),
  kana('mu', 'む', {
    sign: SIGNS.mu,
    describe: {
      viewer: '親指を上に立て、人差し指を横（相手から見て右）に伸ばす。手の甲を相手に向ける。',
      self: '自分からは手のひらが見える。人差し指を左へ、親指を上へ向ける。',
    },
    memory: { kind: 'origin', text: '手話の数字の「6（むっつ）」から。' },
    confusables: [
      tip('kana-re', 'れは手のひらを相手に向け、人差し指を上に立てる。'),
      tip('kana-shi', 'しは中指も伸ばす。'),
      tip('kana-fu', 'ふは人差し指を下に向ける。'),
    ],
    text: ['hiroshima-ma', 'benricho-2', 'hope'],
    confidence: 'high',
  }),
  kana('me', 'め', {
    sign: SIGNS.me,
    describe: {
      viewer: '親指と人差し指で輪を作り、中指・薬指・小指は上に伸ばす。手のひらは相手に向ける。相手には輪の穴が見える。',
      self: '親指と人差し指の先をつけて輪を作る。残りの3本は伸ばす。',
    },
    memory: { kind: 'origin', text: '目の形から（輪が目、3本の指がまつげ）。' },
    confusables: [tip('kana-o', 'おは5本の指を丸めて輪を作る。')],
    variants: '輪を真円にせず、つぶれた丸にする説明もある（Makki・神奈川県の表）。',
    text: ['hiroshima-ma', 'benricho-2'],
    confidence: 'medium',
    detailNote:
      '手のひらを真正面に向けると、輪を横から見ることになり穴が見えない。表の図はどれも穴が見えるので、手のひらを相手から見て右へ約50°回して描いた（回す角度は推定）。中指・薬指・小指の開き幅も推定（神奈川県の表に合わせて少し開いた）。',
  }),
  kana('mo', 'も', {
    sign: SIGNS.mo,
    describe: {
      viewer: '開いた親指と人差し指の先を、閉じ合わせる。閉じながら手を少し下げる。ほかの指は握る。手の甲を相手に向ける。',
      self: '開いた親指と人差し指の腹を、つまむように合わせる。合わせながら少し下へ下ろす。',
    },
    memory: { kind: 'origin', text: '手話の「同じ」「〜も」から。' },
    confusables: [
      tip('kana-me', 'めは動かさず、中指・薬指・小指を伸ばす。'),
      tip('kana-o', 'おは動かさず、5本の指で輪を作る。'),
    ],
    variants:
      '手のひらを上に向けて閉じる説明もある（便利帳・西海市）。閉じながら手を下げる動きは諫早市の資料と神奈川県の表にあり、下げると書いていない資料もある。閉じる回数を決めた資料は見つからなかった。',
    detailNote: '下げる距離は資料に無い。手のひら半分（約5cm）にした（推定）。',
    text: ['hiroshima-ma', 'suretalk', 'makki', 'benricho-2', 'isahaya', 'saikai-175', 'chikuzen-79'],
    confidence: 'medium',
    dynamic: true,
  }),
  // や行
  kana('ya', 'や', {
    sign: SIGNS.ya,
    describe: {
      viewer: '親指と小指を伸ばし、ほかの指は握る。手のひらは相手に向ける。',
      self: '親指を横に、小指を上に伸ばす。自分からは手の甲が見える。',
    },
    memory: { kind: 'origin', text: 'アルファベットの指文字の「Y」から。' },
    confusables: [tip('kana-i', 'いは親指を曲げる。'), tip('kana-he', 'へは手の甲を相手に向け、指先を下に向ける。')],
    variants: '中の3本を握り込む説明と、付け根から前へ倒す説明がある。',
    text: ['hiroshima-ya', 'benricho-2', 'makki'],
    confidence: 'high',
    detailNote: '中の3本の曲げ方は資料で分かれる。表の図に合わせて握り込んだ（推定）。',
  }),
  kana('yu', 'ゆ', {
    sign: SIGNS.yu,
    describe: {
      viewer: '人差し指・中指・薬指を少し開いて上に伸ばす。手の甲を相手に向ける。',
      self: '自分からは手のひらが見える。3本の指を立て、親指で小指を押さえる。',
    },
    memory: { kind: 'mnemonic', text: '温泉マーク（♨）の3本の湯気。' },
    confusables: [tip('kana-wa', 'わは手のひらを相手に向ける。'), tip('kana-mi', 'みは指先を横に向ける。')],
    text: ['hiroshima-ya', 'benricho-2'],
    confidence: 'high',
    detailNote: '3本の開き幅と親指の置き場所は資料に無い（推定）。',
  }),
  kana('yo', 'よ', {
    sign: SIGNS.yo,
    describe: {
      viewer: '親指以外の4本をそろえて横（相手から見て右）に伸ばす。親指は手のひらに折る。手の甲を相手に向ける。',
      self: '自分からは手のひらが見える。4本の指を左へ向け、親指を手のひらに折る。',
    },
    memory: { kind: 'origin', text: '手話の数字の「4（よん）」から。' },
    confusables: [
      tip('kana-ku', 'くは親指を上に立てる。'),
      tip('kana-mi', 'みは小指を曲げる。'),
      tip('kana-ke', 'けは手のひらを相手に向け、指先を上に向ける。'),
    ],
    variants: '4本の指を少し開く説明もある（ラブすぽ）。',
    text: ['hiroshima-ya', 'benricho-2', 'lovespo'],
    confidence: 'high',
    detailNote: '4本の指をそろえるか少し開くかは資料で分かれる（推定）。',
  }),
  // ら行
  kana('ra', 'ら', {
    sign: SIGNS.ra,
    describe: {
      viewer: '人差し指と中指を立てて交差させ、中指の腹を人差し指の背に重ねる。手のひらは相手に向ける。',
      self: '中指を人差し指の背に乗せて交差させる。自分からは中指が手前に見える。',
    },
    memory: { kind: 'origin', text: 'アルファベットの指文字の「R」から。' },
    confusables: [tip('kana-u', 'うは2本をそろえるだけで、交差させない。')],
    text: ['hiroshima-ra', 'benricho-2'],
    confidence: 'high',
    detailNote:
      '交差させる高さは文章の資料で決まらない（広島の教材は「人差し指の爪の上に中指の腹を乗せる」イメージで説明する）。4つの表の図に合わせ、指の中ほどで交わり指先が左右に分かれる形にした（推定）。親指の置き場所は資料に無い（推定）。',
  }),
  kana('ri', 'り', {
    sign: SIGNS.ri,
    describe: {
      viewer: '人差し指と中指を少し開いて立て、そのまま下へ払う。相手からは右下へ動いて見える。',
      self: '自分から見てカタカナの「リ」を2本の指で書く。左下へ払う。',
    },
    memory: { kind: 'origin', text: 'カタカナの「リ」を書く動きから。' },
    confusables: [
      tip('kana-no', 'のは人差し指1本で書く。'),
      tip('kana-u', 'うは動かさない。'),
      tip('kana-ra', 'らは2本の指を交差させる。'),
    ],
    text: ['hiroshima-ra', 'benricho-2', 'makki'],
    confidence: 'high',
    detailNote: '払うときの手首の返し方と動かす量は資料に無い（推定）。',
    dynamic: true,
  }),
  kana('ru', 'る', {
    sign: SIGNS.ru,
    describe: {
      viewer: '親指・人差し指・中指を開いて伸ばす。薬指と小指は握る。手のひらは相手に向ける。',
      self: '自分からは手の甲が見える。人差し指と中指を立て、親指を横に開く。',
    },
    memory: { kind: 'origin', text: '相手から見たカタカナの「ル」の形から。' },
    confusables: [
      tip('kana-ka', 'かは親指の腹を中指につける。'),
      tip('kana-shi', 'しは手の甲を相手に向け、指先を横に向ける。'),
      tip('kana-re', 'れは中指を握る。'),
    ],
    text: ['hiroshima-ra', 'benricho-2'],
    confidence: 'high',
    detailNote: '3本の指の開き方は資料に無い（推定）。',
  }),
  kana('re', 'れ', {
    sign: SIGNS.re,
    describe: {
      viewer: '親指を横に、人差し指を上に伸ばして「L」の形にする。手のひらは相手に向ける。',
      self: '自分からは手の甲が見える。人差し指を立て、親指を横に開く。',
    },
    memory: { kind: 'origin', text: '相手から見たカタカナの「レ」の形から。' },
    confusables: [
      tip('kana-mu', 'むは手の甲を相手に向け、人差し指を横にする。'),
      tip('kana-hi', 'ひは親指を曲げる。'),
      tip('kana-ru', 'るは中指も伸ばす。'),
    ],
    text: ['hiroshima-ra', 'benricho-2'],
    confidence: 'high',
  }),
  kana('ro', 'ろ', {
    sign: SIGNS.ro,
    describe: {
      viewer:
        '人差し指と中指をそろえてかぎの形に曲げる。ほかの指と親指は握る。小指の側から手のひらを斜めに相手の方へ回すので、相手には曲げた2本の指が横に並んで見える。',
      self: '2本の指の先を手のひらの方へ折って、「ロ」の字の一部を作る。親指は立てない。手のひらを斜めに相手の方へ向け、曲げた2本が並んで相手に見えるようにする。',
    },
    memory: { kind: 'origin', text: 'カタカナの「ロ」の一部から。' },
    confusables: [
      tip('kana-nu', 'ぬはかぎの形にするのが人差し指1本。'),
      tip('kana-ko', 'こは4本の指を付け根から直角に曲げる。'),
    ],
    variants: '親指を立てる説明もある（しゅわぶくろ）。照合した4つの表は、どれも親指を握りの近くに収めている。',
    text: ['hiroshima-ra', 'benricho-2', 'makki', 'saikai-177', 'chikuzen-79', 'syuwafriends'],
    confidence: 'medium',
    detailNote:
      '手のひらを相手の方へ回す角度は資料に無い。真横（小指の側を真正面）のままだと、相手からは中指が人差し指に重なって1本に見える。表の図に合わせて、2本のかぎが横に並んで見える60°にした（推定）。親指の接触先と関節の角度も資料に無い（推定）。',
  }),
  // わ行・ん
  kana('wa', 'わ', {
    sign: SIGNS.wa,
    describe: {
      viewer: '人差し指・中指・薬指を開いて立て、親指で小指を押さえる。手のひらは相手に向ける。',
      self: '自分からは手の甲が見える。3本の指を開いて立て、小指を親指で押さえる。',
    },
    memory: { kind: 'origin', text: 'アルファベットの指文字の「W」から。' },
    confusables: [tip('kana-yu', 'ゆは手の甲を相手に向ける。'), tip('kana-ma', 'まは指先を下に向ける。')],
    text: ['hiroshima-wa', 'benricho-2'],
    confidence: 'high',
    detailNote: '親指で小指のどこを押さえるかは資料に無い（推定）。',
  }),
  kana('wo', 'を', {
    sign: SIGNS.wo,
    describe: {
      viewer: '「お」の形のまま、手を自分の方へ引く。相手からは手が遠ざかって見える。',
      self: '「お」の輪を作り、そのまま胸の方へ引き寄せる。',
    },
    memory: { kind: 'origin', text: '指文字の「お」に、自分の方へ引く動きを足した形。' },
    confusables: [tip('kana-o', 'おは動かさない。')],
    text: ['hiroshima-wa', 'benricho-2'],
    confidence: 'high',
    detailNote: '引く距離と速さは資料に無い。ほかの変化と同じ手のひら1つぶん（約10cm）にした（推定）。',
    dynamic: true,
  }),
  kana('n', 'ん', {
    sign: SIGNS.n,
    describe: {
      viewer: '人差し指を立て、指先で「ン」を空中に書く。相手からは、右上から短く下ろし、そこから左上へ大きく払って見える。',
      self: '自分から見てカタカナの「ン」を書く。左上から短く下ろし、そこから右上へ長く払い上げる。',
    },
    memory: { kind: 'origin', text: 'カタカナの「ン」を空中に書く。' },
    confusables: [tip('kana-no', 'のは「ノ」を1画で書く。'), tip('kana-ri', 'りは2本の指で書く。')],
    text: ['hiroshima-wa', 'makki', 'waseda'],
    confidence: 'medium',
    detailNote: '下ろす画と払う画の長さ・向きは文章の資料に無い。カタカナの「ン」と表の矢印に合わせて、払う画を長くし、払い終わりを書き始めより高くした（推定）。',
    dynamic: true,
  }),
];

const kanaSign = (romaji: string): SignSpec => {
  const item = KANA_ITEMS.find((i) => i.id === `kana-${romaji}`);
  if (!item) throw new Error(`kana-${romaji} がありません`);
  return item.sign;
};

/** 変化5種。各項目の sign は、その変化の例（が・ぱ・っ・ゃ）か、のばす音そのもの */
export const MODIFIER_ITEMS: SignItem[] = [
  mod('mod-dakuon', '濁音（゛）', 'dakuon', {
    sign: composeModifier(kanaSign('ka'), 'mod-dakuon'),
    describe: {
      viewer: '元の文字の形のまま、手を相手から見て左（表す人の右）へ動かす。例は「が」。',
      self: '元の文字を作ってから、手を自分の右へ10cmほど動かす。左手で表すときは左へ動かす。',
    },
    confusables: [tip('mod-handakuon', '半濁音は上へ動かす。')],
    text: ['kanagawa-video', 'benricho-1', 'makki'],
    confidence: 'high',
    detailNote: '動かす距離は神奈川県の表の「10cmくらい」に合わせた。',
  }),
  mod('mod-handakuon', '半濁音（゜）', 'handakuon', {
    sign: composeModifier(kanaSign('ha'), 'mod-handakuon'),
    describe: {
      viewer: 'は行の文字の形のまま、手を上へ動かす。例は「ぱ」。',
      self: 'は・ひ・ふ・へ・ほの形を作ってから、手を10cmほど上げる。',
    },
    confusables: [tip('mod-dakuon', '濁音は横へ動かす。')],
    text: ['kanagawa-video', 'benricho-2'],
    confidence: 'high',
    detailNote: '動かす距離は神奈川県の表の「10cmくらい」に合わせた。',
  }),
  mod('mod-sokuon', '小さい「っ」', 'sokuon', {
    sign: composeModifier(kanaSign('tsu'), 'mod-sokuon'),
    describe: {
      viewer: '「つ」の形のまま、手を自分の方へ引く。相手からは手が遠ざかって見える。',
      self: '「つ」を作ってから、胸の方へ引き寄せる。',
    },
    confusables: [
      tip('kana-tsu', 'つは動かさない。'),
      tip('mod-youon', '小さい「ゃ・ゅ・ょ」や「ぁ・ぃ・ぅ・ぇ・ぉ」は、それぞれ元の文字の形で引く。'),
    ],
    text: ['kanagawa-video', 'benricho-1'],
    confidence: 'high',
    detailNote: '引く距離は資料に無い。手のひら1つぶん（約10cm）にした（推定）。',
  }),
  // 拗音（ゃ・ゅ・ょ）と小さい母音（ぁ・ぃ・ぅ・ぇ・ぉ）をまとめた項目。小さい母音は拗音ではないので、画面では「拗音」と呼ばない。
  // ID（mod-youon）は課程・綴りの対応（spell.ts・engine）が参照するので変えない
  mod('mod-youon', '小さい字（ゃ・ゅ・ょ など）', 'chiisai ji', {
    sign: composeModifier(kanaSign('ya'), 'mod-youon'),
    describe: {
      viewer: '「や・ゆ・よ」の形のまま、手を自分の方へ引く。例は「ゃ」。小さい「ぁ・ぃ・ぅ・ぇ・ぉ」も同じく、元の文字の形のまま自分の方へ引く。小さい「ぉ」は「を」と同じ動きになるので、前後の文字で見分ける。',
      self: '「きゃ」なら、「き」を表したあとに「や」を作り、胸の方へ引く。小さい「ぁ」なども、元の文字を作ってから胸の方へ引く。小さい「ぉ」は、指文字の「を」と同じ動きになる。',
    },
    confusables: [tip('kana-ya', 'やは動かさない。'), tip('mod-sokuon', '小さい「っ」は、つの形で引く。')],
    variants: '小さい「ぁ・ぃ・ぅ・ぇ・ぉ」を自分の方へ引く説明は便利帳（あ行〜な行のページ）にある。照合した表には、小さい「ぁ」などの欄は無い。',
    // 小さい母音を引く説明は benricho-1（あ行の見出しの下）、ゃ・ゅ・ょ は benricho-2（や行の見出しの下）。2026-11-13 に両ページで確かめた
    text: ['kanagawa-video', 'benricho-2', 'benricho-1'],
    // 宇治市の表には拗音（ゃ・ゅ・ょ）の欄が無い
    tables: ['kanagawa-2025', 'asago-table', 'maebashi-panf'],
    confidence: 'high',
    detailNote: '引く距離は資料に無い。手のひら1つぶん（約10cm）にした（推定）。',
  }),
  mod('mod-chouon', 'のばす音（ー）', 'chouon', {
    sign: SIGNS.chouon,
    describe: {
      viewer: '人差し指を伸ばし、上から下へ線を引くように手を下ろす。',
      self: '前の文字のあとで、人差し指で縦の線を1本書く。',
    },
    confusables: [tip('kana-hi', 'ひは動かさない。'), tip('kana-no', 'のは斜めに「ノ」を書く。')],
    variants: '「ー」を横に書くと説明する資料もある（大阪府臨床検査技師会掲載の表）。照合した4つの表は、どれも上から下へ動かしている。',
    text: ['kanagawa-video', 'lovespo', 'makki', 'osaka-amt'],
    confidence: 'medium',
  }),
];
