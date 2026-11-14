/**
 * 単語16語（あいさつ・自己紹介・気持ち）（sign-content が持ち主）。
 * どれも上半身つきで描く（sign.body = true）。右利き・相手から見た向き（場の座標: +X＝相手から見て右, +Y＝上, +Z＝相手の方）。
 * 表す人の右は −X（相手から見て左）。左手（nonDominant）の向きも場の座標で書く（形は描くときに鏡写しになる）。
 *
 * 元は調査 r2（.agent-harness/research/r2_numbers_words.json）の steps（時間の順）。部分の組み合わせ（おはよう＝朝＋あいさつ など）は、
 * 調査の順のまま1つの動きにつなぎ、部分の間に短い間（約0.15秒）を置く。調査に無い準備の動き・手を下ろす後の動きは足さない。
 * 調査で未確認の細部（手のひらの向き・使わない指・顔からの距離）は、自然で無理のない形にして detailNote に「推定」と書く。
 * 照合の記録と確信度の理由は .agent-harness/runs/content-words/verify.md にある（語ごと）。
 *
 * 体の位置は hand-model の体の位置の名前（部位の表面から 0.9 前の点）に offset を足して、部位に触れる位置へ寄せている。
 * 触れる位置は、手の表面と上半身の表面の距離を測って決めた（tests/content/numbers-words.test.ts で確かめる）。
 */
import type { BodyLocation, FingerState, HandshapeSpec, Keyframe, Orientation, Position, SignSpec, Vec3 } from '../hand/types';
// 親指の置き方の角度（描画の警告を指文字と同じ値で消すため）。項目そのものは kana.ts から読み込まない
import { THUMB_OVER_RING } from './kana';
import type { SignItem } from './types';

const F = (index: FingerState, middle: FingerState, ring: FingerState, pinky: FingerState) => ({ index, middle, ring, pinky });
const at = (location: BodyLocation, offset: Vec3): Position => ({ at: location, offset });

/* ───────── 形 ───────── */

export const WORD_SHAPES = {
  /** 握りこぶし（親指は握った指の前） */
  fist: { fingers: F('curled', 'curled', 'curled', 'curled'), thumb: 'acrossFront' },
  /** 人差し指だけを伸ばす（数字の1と同じ） */
  point: { fingers: F('extended', 'curled', 'curled', 'curled'), thumb: 'acrossFront' },
  /** あいさつの終わり: 人差し指を付け根から軽く曲げる（おじぎ）。曲げる角度は推定 */
  bow: { fingers: F('extended', 'curled', 'curled', 'curled'), thumb: 'acrossFront', adjust: { index: { mcp: 45, pip: 8 } } },
  /** 昼: 人差し指と中指をそろえて伸ばす（時計の2本の針を重ねる）。親指は指文字の う と同じ角度（kana.ts の THUMB_OVER_RING） */
  noon: { fingers: F('extended', 'extended', 'curled', 'curled'), thumb: 'acrossFront', spread: 'together', adjust: { thumb: THUMB_OVER_RING } },
  /** 指をそろえて伸ばした手（お願い・感謝の右手・名前と感謝の左手・初めて・わかる） */
  flat: { fingers: F('extended', 'extended', 'extended', 'extended'), thumb: 'alongside', spread: 'together' },
  /** 開いた手（夜・さようなら）。指の開き幅は推定 */
  open: { fingers: F('extended', 'extended', 'extended', 'extended'), thumb: 'extendedOut' },
  /** つまむ前: 親指を人差し指に向き合わせたまま、少し開く（C の形。ほかの3本は握る・推定） */
  pinchOpen: {
    fingers: F('half', 'curled', 'curled', 'curled'),
    thumb: 'extendedOut',
    adjust: { index: { mcp: 20, pip: 25, dip: 15 }, thumb: { cmcFlex: -8, cmcAbd: 30, cmcRot: 10, mcp: 5, ip: 5 } },
  },
  /** つまむ: 親指の先と人差し指の先を合わせる */
  pinch: { fingers: F('half', 'curled', 'curled', 'curled'), thumb: { touch: 'index.tip' } },
  /**
   * 好き・嫌いの開いた形: 親指と人差し指を開いて伸ばす（ほかの3本は握る・推定）。
   * 親指と人差し指の開きは約49°（神奈川県の冊子 p.12・13 の図は 40〜60°）。横に出す置き方の表の値（cmcFlex −30）のままだと約66°開き、
   * 人差し指をのどへ向けると、親指がのどから離れる向きに立った
   */
  spreadTwo: { fingers: F('extended', 'curled', 'curled', 'curled'), thumb: 'extendedOut', adjust: { thumb: { cmcFlex: -12 } } },
  /** 名前: こぶしから親指を出す（親指の腹で押す） */
  thumbOut: { fingers: F('curled', 'curled', 'curled', 'curled'), thumb: 'extendedOut' },
  /** 大丈夫: 親指以外の4本を少し曲げてそろえる。親指の位置は推定（資料で分かれる） */
  curved: { fingers: F('half', 'half', 'half', 'half'), thumb: 'alongside', spread: 'together' },
  /** わからない: 指先で払う開いた手。指の曲げ方は推定 */
  brush: { fingers: F('extended', 'extended', 'extended', 'extended'), thumb: 'extendedOut', adjust: { index: { mcp: 12, pip: 15 }, middle: { mcp: 12, pip: 15 }, ring: { mcp: 12, pip: 15 }, pinky: { mcp: 12, pip: 15 } } },
} satisfies Record<string, HandshapeSpec>;
const S = WORD_SHAPES;

/* ───────── よく使う向き ───────── */

/** 手のひらを相手に向け、指先は上 */
const FACE: Orientation = { palm: 'toViewer', fingers: 'up' };
/** 右手を縦に立て、手のひらを表す人の左（相手から見て右）へ向ける（拝む手・昼の指）。親指の側は表す人の方を向く */
const UPRIGHT_R: Orientation = { palm: 'viewerRight', fingers: 'up' };

/**
 * 止まる区間の書き方。hand-model の位置の補間（Catmull-Rom 曲線）は、同じ位置の Keyframe が続く区間の前後で、
 * 動いてきた向きへ行き過ぎたり、次に動く向きの反対へ戻ったりする（前後の移動量の約7%まで）。
 * 触れた所で止まると、その間に手が部位や反対の手へ 6〜8mm めり込んだ（こんにちは・よろしく・嫌い・ありがとう・はじめまして）。
 * そこで止まる区間の両端に EPS 秒の短い区間を置き、行き過ぎと戻りをその中だけで済ませる（画面の1コマより短い）。
 * 補間の側で「止まる区間の端の接線を 0 にする」直しが入れば、この短い区間は無くてよい。
 */
const EPS = 0.004;
/** 着いた位置（t1 の Keyframe は呼ぶ側で書く）で t2 まで止まる */
const stay = (t1: number, t2: number): Keyframe[] => [{ t: t1 + EPS }, { t: t2 - EPS }, { t: t2 }];
/** 始めの位置で t2 まで止まる */
const stayAtStart = (t2: number): Keyframe[] => [{ t: t2 - EPS }, { t: t2 }];
/** 着いた位置で終わりまで止まる */
const stayToEnd = (t1: number, t2: number): Keyframe[] => [{ t: t1 + EPS }, { t: t2 }];

/**
 * 使わない間の左手の置き場所（上腕を下ろし、前腕を前へ出して、おなかの前で力を抜く）。資料に無い準備の位置なので、意味を持たせない。
 * 形を書かない Keyframe は「力を抜いた手」になる（hand-model の REST_POSE）。体に近すぎるとひじが横へ張り出すので、前へ離した
 */
const REST_LEFT: Keyframe = { t: 0, pos: [1.0, -1.0, 2.7], orient: { palm: [-0.35, -0.9, 0.2], fingers: [-0.35, -0.2, 0.92] } };

/**
 * あいさつ（両手の人差し指を立てて向かい合わせ、近づけながら付け根から軽く曲げる）。t0 に始めの形に着く。
 * 手のひらは互いに向き合う（曲げると指先が相手の指の方へ倒れる、という調査の説明からの向き）。少し表す人の側へ回す（推定）
 */
function aisatsu(t0: number): { dom: Keyframe[]; non: Keyframe[] } {
  const R: Orientation = { palm: [1, 0, -0.25], fingers: 'up' };
  const L: Orientation = { palm: [-1, 0, -0.25], fingers: 'up' };
  return {
    dom: [
      { t: t0, shape: S.point, orient: R, pos: at('chest', [-1.05, 0.55, 0.5]) },
      ...stay(t0, t0 + 0.1),
      { t: t0 + 0.55, shape: S.bow, pos: at('chest', [-0.85, 0.45, 0.5]) },
      ...stayToEnd(t0 + 0.55, t0 + 0.75),
    ],
    non: [
      { t: t0, shape: S.point, orient: L, pos: at('chest', [1.05, 0.55, 0.5]) },
      ...stay(t0, t0 + 0.1),
      { t: t0 + 0.55, shape: S.bow, pos: at('chest', [0.85, 0.45, 0.5]) },
      ...stayToEnd(t0 + 0.55, t0 + 0.75),
    ],
  };
}

/* ───────── 単語ごとの動き ───────── */

/** おはよう＝朝（こぶしをこめかみから下ろす）＋あいさつ */
function ohayou(): SignSpec {
  // こぶしは手のひらを相手に向け、親指の側（相手から見て右）をこめかみに当てる（向きは推定）
  const a = aisatsu(1.2);
  return {
    body: true,
    face: 'smile',
    hands: {
      dominant: {
        keyframes: [
          { t: 0, shape: S.fist, orient: FACE, pos: at('temple', [0.47, -0.33, -0.26]) },
          ...stayAtStart(0.15),
          { t: 0.7, pos: at('temple', [0.47, -1.2, -0.1]) },
          ...stay(0.7, 0.85),
          ...a.dom,
        ],
      },
      nonDominant: { keyframes: [REST_LEFT, ...stayAtStart(0.85), ...a.non] },
    },
  };
}

/** こんにちは＝昼（そろえた2本の指を額の真ん中へ）＋あいさつ */
function konnichiwa(): SignSpec {
  // 指先を少し表す人の側へ倒す（額は上ほど後ろへ下がるので、まっすぐ立てると手のひらが顔に入る）
  const noon: Orientation = { palm: 'viewerRight', fingers: [0, 0.94, -0.34] };
  const a = aisatsu(1.0);
  return {
    body: true,
    face: 'smile',
    hands: {
      dominant: {
        keyframes: [
          { t: 0, shape: S.noon, orient: noon, pos: at('forehead', [0, -0.97, 0.35]) },
          { t: 0.4, pos: at('forehead', [0, -0.97, -0.25]) },
          ...stay(0.4, 0.65),
          ...a.dom,
        ],
      },
      nonDominant: { keyframes: [REST_LEFT, ...stayAtStart(0.65), ...a.non] },
    },
  };
}

/** こんばんは＝夜（開いた両手を顔の左右から寄せて交差）＋あいさつ */
function konbanwa(): SignSpec {
  const a = aisatsu(1.15);
  // 右手を前にして交差させる（どちらを前にするかは資料に無く推定）。交差を解いて「あいさつ」へ移る間も右手を前に保つ（手どうしが通り抜けないように）
  return {
    body: true,
    face: 'smile',
    hands: {
      dominant: {
        keyframes: [
          { t: 0, shape: S.open, orient: FACE, pos: [-2.0, 2.95, 1.1] },
          ...stayAtStart(0.15),
          { t: 0.4, pos: [-1.05, 3.05, 2.2], ease: 'linear' },
          { t: 0.65, pos: [0.3, 3.0, 2.3], ease: 'out' },
          ...stay(0.65, 0.8),
          { t: 0.97, pos: [-0.35, 2.0, 2.6], ease: 'linear' },
          ...a.dom,
        ],
      },
      nonDominant: {
        keyframes: [
          { t: 0, shape: S.open, orient: FACE, pos: [2.0, 2.95, 1.1] },
          ...stayAtStart(0.15),
          { t: 0.4, pos: [1.05, 3.05, 1.55], ease: 'linear' },
          { t: 0.65, pos: [-0.3, 3.0, 1.7], ease: 'out' },
          ...stay(0.65, 0.8),
          { t: 0.97, pos: [0.35, 2.0, 1.85], ease: 'linear' },
          ...a.non,
        ],
      },
    },
  };
}

/** ありがとう＝感謝（左手の甲に立てた右手の小指の側を乗せ、右手だけを上げる） */
function arigatou(): SignSpec {
  // 右手は指先を相手の方（少し左寄り）へ向けて縦に立てる。親指の側が上、小指の側が下
  const blade: Orientation = { palm: [1, 0, -0.35], fingers: [0.35, 0.1, 1] };
  return {
    body: true,
    face: 'nod',
    hands: {
      dominant: {
        keyframes: [
          { t: 0, shape: S.flat, orient: blade, pos: at('chest', [0.65, 0.335, 0.85]) },
          ...stayAtStart(0.25),
          { t: 0.85, pos: at('chest', [0.65, 1.52, 0.85]) },
          ...stayToEnd(0.85, 1.05),
        ],
      },
      nonDominant: { keyframes: [{ t: 0, shape: S.flat, orient: { palm: 'down', fingers: 'viewerLeft' }, pos: at('chest', [0.35, -0.3, 0.85]) }] },
    },
  };
}

/** よろしくお願いします＝良い（こぶしを鼻から前へ）＋お願い（立てた手を前へ下ろす） */
function yoroshiku(): SignSpec {
  return {
    body: true,
    face: 'nod',
    // 一礼は後半の「お願い」で（調査 r2 の steps[1]「軽く一礼」）。下ろす動き（1.05〜1.6秒）の真ん中で一番深くなる時刻から始める（hand-r2）
    faceTimeline: [{ t: 0.98, face: 'nod' }],
    hands: {
      dominant: {
        keyframes: [
          // こぶしの親指の側を鼻に当てる（向きは推定）
          { t: 0, shape: S.fist, orient: UPRIGHT_R, pos: at('nose', [-0.1, -0.33, -0.58]) },
          ...stayAtStart(0.15),
          { t: 0.55, pos: at('nose', [-0.1, -0.33, 0.22]) },
          ...stay(0.55, 0.7),
          // その手を開いて、顔の前に縦に立てる（片手で拝む形）
          { t: 0.95, shape: S.flat, pos: at('nose', [-0.05, -0.3, 0.3]) },
          ...stay(0.95, 1.05),
          { t: 1.6, orient: { palm: 'viewerRight', fingers: [0, 1, 0.45] }, pos: at('nose', [-0.05, -1.5, 0.95]) },
          ...stayToEnd(1.6, 1.75),
        ],
      },
    },
  };
}

/** ごめんなさい＝迷惑（眉間をつまむ）＋お願い（立てた手を下ろす） */
function gomennasai(): SignSpec {
  // つまむ手は顔の右下から眉間へ指先を向け、手のひらを顔の左下（鼻の方）へ向ける（向きは推定）。
  // 以前は手を顔の真ん前に立て、手のひらを顔へ向けていたので、相手からは手の甲が顔をほぼ覆い、つまむ形が見えなかった（独立照合 第2周）。
  // 手首を外へ回して手を顔の右へずらすと、前橋市のパンフレット（p.10）の図のように親指と人差し指でつまむ形が見え、左の目と口も見える
  const pinchO: Orientation = { palm: [0.655, -0.525, -0.544], fingers: [0.349, 0.848, -0.399] };
  return {
    body: true,
    face: 'nod',
    // 頭を下げるのは後半の「お願い」で（調査 r2 の steps[1]「頭を下げる」）。下ろす動き（0.95〜1.45秒）の真ん中で一番深くなる時刻から始める（hand-r2）
    faceTimeline: [{ t: 0.85, face: 'nod' }],
    hands: {
      dominant: {
        keyframes: [
          { t: 0, shape: S.pinchOpen, orient: pinchO, pos: at('forehead', [-0.438, -0.589, 0.456]) },
          { t: 0.35, shape: S.pinch, pos: at('forehead', [-0.354, -0.608, 0.024]) },
          ...stay(0.35, 0.55),
          { t: 0.85, shape: S.flat, orient: UPRIGHT_R, pos: at('nose', [-0.05, 0.0, 0.35]) },
          ...stay(0.85, 0.95),
          { t: 1.45, orient: { palm: 'viewerRight', fingers: [0, 1, 0.25] }, pos: at('nose', [-0.05, -1.1, 0.6]) },
          ...stayToEnd(1.45, 1.6),
        ],
      },
    },
  };
}

/** さようなら（開いた手を顔の横で左右に振る。2往復） */
function sayounara(): SignSpec {
  const c: Vec3 = [-0.2, -0.45, 0.75];
  const p = (dx: number): Position => at('temple', [c[0] + dx, c[1], c[2]]);
  const tilt = (s: number): Orientation => ({ palm: 'toViewer', fingers: [s, 1, 0] });
  return {
    body: true,
    face: 'smile',
    hands: {
      dominant: {
        keyframes: [
          { t: 0, shape: S.open, orient: tilt(0), pos: p(0) },
          { t: 0.25, orient: tilt(-0.25), pos: p(-0.22) },
          { t: 0.55, orient: tilt(0.25), pos: p(0.22) },
          { t: 0.85, orient: tilt(-0.25), pos: p(-0.22) },
          { t: 1.15, orient: tilt(0.25), pos: p(0.22) },
          { t: 1.4, orient: tilt(0), pos: p(0) },
          ...stayToEnd(1.4, 1.5),
        ],
      },
    },
  };
}

/** お疲れさま＝労い（右のこぶしの小指の側で、左の腕を2回たたく） */
function otsukaresama(): SignSpec {
  // 左のこぶしは手のひらを下にし、前腕の向きにそろえる（手首を曲げない）。左腕は体の前に斜めに置く（向きと高さは推定）
  const leftFist: Orientation = { palm: 'down', fingers: [-0.91, 0.287, 0.3] };
  // 右のこぶしは指の背を表す人の左へ向け、手のひらの側を体へ、小指の側を下にする（前腕が胴に入らない向き。推定）
  const hammer: Orientation = { palm: [0.2, 0, -1], fingers: [1, 0, 0.2] };
  // たたく点は左手首から 0.6（約6cm）ひじ寄りの、前腕の上の面（手の表面と袖の距離を測って決めた）
  const hit = at('chest', [1.2, -0.154, -0.509]);
  const up = at('chest', [1.2, 0.246, -0.509]);
  return {
    body: true,
    face: 'nod',
    hands: {
      dominant: {
        keyframes: [
          { t: 0, shape: S.fist, orient: hammer, pos: up },
          { t: 0.22, pos: hit, ease: 'out' },
          { t: 0.42, pos: up },
          { t: 0.64, pos: hit, ease: 'out' },
          ...stay(0.64, 0.72),
          { t: 0.9, pos: at('chest', [1.2, 0.0, -0.509]) },
          ...stayToEnd(0.9, 1.0),
        ],
      },
      nonDominant: { keyframes: [{ t: 0, shape: S.fist, orient: leftFist, pos: at('chest', [0.1, -0.7, -0.1]) }] },
    },
  };
}

/** はじめまして＝初めて（重ねた手から右手を上げて人差し指を残す）＋会う（両手の人差し指を左右から近づける） */
function hajimemashite(): SignSpec {
  const flatDown: Orientation = { palm: 'down', fingers: 'toViewer' };
  const meetR: Orientation = { palm: [1, 0, -0.7], fingers: 'up' };
  const meetL: Orientation = { palm: [-1, 0, -0.7], fingers: 'up' };
  return {
    body: true,
    face: 'smile',
    hands: {
      dominant: {
        keyframes: [
          { t: 0, shape: S.flat, orient: flatDown, pos: at('chest', [0.1, -0.37, 1.1]) },
          ...stayAtStart(0.15),
          { t: 0.7, shape: S.point, orient: FACE, pos: at('chest', [0.05, 0.95, 1.1]) },
          ...stay(0.7, 0.85),
          { t: 1.15, orient: meetR, pos: at('chest', [-1.1, 0.4, 0.5]) },
          ...stay(1.15, 1.25),
          { t: 1.65, pos: at('chest', [-0.62, 0.4, 0.5]) },
          ...stayToEnd(1.65, 1.8),
        ],
      },
      nonDominant: {
        keyframes: [
          { t: 0, shape: S.flat, orient: flatDown, pos: at('chest', [0.2, -0.7, 1.05]) },
          ...stayAtStart(0.85),
          { t: 1.15, shape: S.point, orient: meetL, pos: at('chest', [1.1, 0.4, 0.5]) },
          ...stay(1.15, 1.25),
          { t: 1.65, pos: at('chest', [0.62, 0.4, 0.5]) },
          ...stayToEnd(1.65, 1.8),
        ],
      },
    },
  };
}

/** 名前（捺印型: 相手に向けた左の手のひらへ、右の親指の腹を押し当てる） */
function namae(): SignSpec {
  // 右手は指の背を相手に向け、親指を上に立てる（親指の腹が表す人の側＝左の手のひらの方を向く）
  const press: Orientation = { palm: [0, -0.5, -0.87], fingers: 'viewerRight' };
  return {
    body: true,
    face: 'neutral',
    hands: {
      dominant: {
        keyframes: [
          { t: 0, shape: S.thumbOut, orient: press, pos: at('chest', [0.549, -0.321, 1.855]) },
          ...stayAtStart(0.15),
          { t: 0.55, pos: at('chest', [0.549, -0.321, 1.455]) },
          ...stayToEnd(0.55, 0.8),
        ],
      },
      nonDominant: { keyframes: [{ t: 0, shape: S.flat, orient: FACE, pos: at('chest', [0.55, 0.3, 0.4]) }] },
    },
  };
}

/** 手話（向かい合わせた両手の人差し指を、上下を入れ替えるように交互に前へ回す。2回） */
function shuwa(): SignSpec {
  const r = 0.4;
  const cR: Vec3 = [-1.45, 0.5, 0.5];
  const cL: Vec3 = [1.45, 0.5, 0.5];
  // θ=0 が上。θ が増えると上→前（相手の方）→下→後ろと回る（前へ回す）
  const ptAt = (c: Vec3, th: number): Position => at('chest', [c[0], c[1] + r * Math.cos(th), c[2] + r * Math.sin(th)]);
  const steps = 16;
  const dt = 0.075;
  const dom: Keyframe[] = [{ t: 0, shape: S.point, orient: { palm: 'toSigner', fingers: 'viewerRight' }, pos: ptAt(cR, 0) }, ...stayAtStart(0.15)];
  const non: Keyframe[] = [{ t: 0, shape: S.point, orient: { palm: 'toSigner', fingers: 'viewerLeft' }, pos: ptAt(cL, Math.PI) }, ...stayAtStart(0.15)];
  for (let i = 1; i <= steps; i++) {
    const th = (i * Math.PI * 2) / 8;
    dom.push({ t: 0.15 + i * dt, pos: ptAt(cR, th), ease: 'linear' });
    non.push({ t: 0.15 + i * dt, pos: ptAt(cL, th + Math.PI), ease: 'linear' });
  }
  const last = 0.15 + steps * dt;
  dom.push(...stayToEnd(last, last + 0.15));
  non.push(...stayToEnd(last, last + 0.15));
  return { body: true, face: 'neutral', hands: { dominant: { keyframes: dom }, nonDominant: { keyframes: non } } };
}

/** わかる（手のひらで胸をなで下ろす） */
function wakaru(): SignSpec {
  // 指先は左上へ向ける（推定）
  const onChest: Orientation = { palm: 'toSigner', fingers: [0.7, 0.7, 0] };
  return {
    body: true,
    face: 'neutral',
    hands: {
      dominant: {
        keyframes: [
          { t: 0, shape: S.flat, orient: onChest, pos: at('chest', [-0.2, 0.2, -0.78]) },
          ...stayAtStart(0.15),
          { t: 0.75, pos: at('chest', [-0.2, -0.9, -0.78]) },
          ...stayToEnd(0.75, 0.9),
        ],
      },
    },
  };
}

/** わからない（指先を右肩に当て、上へ2回払い上げる） */
function wakaranai(): SignSpec {
  const touch: Orientation = { palm: [0, -0.91, -0.41], fingers: [0.09, 0.41, -0.91] };
  const flick: Orientation = { palm: [0, -0.41, -0.91], fingers: [0.1, 0.9, -0.4] };
  const on = at('shoulder', [0.275, -0.448, 0.481]);
  const off = at('shoulder', [0.325, 0.012, 0.681]);
  return {
    body: true,
    face: 'neutral',
    hands: {
      dominant: {
        keyframes: [
          { t: 0, shape: S.brush, orient: touch, pos: on },
          ...stayAtStart(0.1),
          { t: 0.35, orient: flick, pos: off, ease: 'out' },
          { t: 0.6, orient: touch, pos: on },
          { t: 0.85, orient: flick, pos: off, ease: 'out' },
          ...stayToEnd(0.85, 1.0),
        ],
      },
    },
  };
}

/**
 * 好き・嫌い: のどの横（好き）・あごの下（嫌い）から斜め前下へ下ろしながら、親指と人差し指を閉じる（好き）／開く（嫌い）。
 * 開いた2本（V）は手のひらの面に開くので、手のひらが下を向くと相手からは V の縁しか見えず、拳を下ろすだけに見えた（独立照合 第2周）。
 * 閉じた2本の輪は親指の側から見ないと穴が見えない。そこで神奈川県の冊子（p.12・13）の図に合わせて、開いた形は手の甲を相手へ向け、
 * 閉じた形は親指の側を相手の方へ回す。下ろす間に手首を返す（向きと角度は推定。.agent-harness/runs/content-r3/ で候補を並べて決めた）。
 *  - 好き: 開いた2本をのどの横に置き、人差し指の先をのどへ向ける（相手から V が見える）。閉じながら前の斜め下へ下ろし、
 *    終わりは親指の側を相手へ向けて輪を見せる
 *  - 嫌い: 閉じた2本をあごの下に置き、指先を上（あご）へ向け、親指の側を相手の方へ回して輪を見せる。開きながら前の斜め下へ下ろし、
 *    終わりは手の甲を相手へ向けて V を見せる
 * 胸は前へ張り出しているので、手を胸に入れずにのどへ寄せられるのは、のどから約2cm（好き）・あごの下（嫌い）まで
 */
function throatDown(word: 'suki' | 'kirai'): SignSpec {
  const suki = word === 'suki';
  const V_ORIENT: Orientation = suki ? { palm: [-0.568, -0.061, -0.821], fingers: [0.816, 0.087, -0.571] } : { palm: [0.153, 0.057, -0.987], fingers: [0.925, 0.342, 0.163] };
  const RING_ORIENT: Orientation = suki ? { palm: [-0.713, 0.682, -0.165], fingers: [0.619, 0.722, 0.309] } : { palm: [-0.728, 0.329, -0.601], fingers: [0.612, 0.707, -0.354] };
  const start: Keyframe = suki
    ? { t: 0, shape: S.spreadTwo, orient: V_ORIENT, pos: at('chin', [-1.077, -0.417, -0.334]) }
    : { t: 0, shape: S.pinch, orient: RING_ORIENT, pos: at('chin', [0.038, -0.473, -0.367]) };
  const end: Keyframe = suki
    ? { t: 0.8, shape: S.pinch, orient: RING_ORIENT, pos: at('chin', [-1.377, -1.017, 0.466]) }
    : { t: 0.8, shape: S.spreadTwo, orient: V_ORIENT, pos: at('chin', [-0.262, -1.073, 0.433]) };
  return {
    body: true,
    face: suki ? 'smile' : 'frown',
    hands: { dominant: { keyframes: [start, ...stayAtStart(0.2), end, ...stayToEnd(0.8, 0.95)] } },
  };
}

/** 大丈夫（少し曲げた4本の指先を、表す人の左胸に当ててから右胸へ移して当てる） */
function daijoubu(): SignSpec {
  const o: Orientation = { palm: 'toSigner', fingers: 'up' };
  return {
    body: true,
    face: 'nod',
    hands: {
      dominant: {
        keyframes: [
          { t: 0, shape: S.curved, orient: o, pos: at('chest', [0.65, -0.55, -0.28]) },
          ...stayAtStart(0.2),
          { t: 0.42, pos: at('chest', [0.0, -0.5, 0.4]), ease: 'linear' },
          { t: 0.65, pos: at('chest', [-0.65, -0.55, -0.28]), ease: 'out' },
          ...stayToEnd(0.65, 0.85),
        ],
      },
    },
  };
}

/* ───────── 項目 ───────── */

const AISATSU_TAIL = '両手の人差し指を立てて向かい合わせ、近づけながら軽く曲げる（あいさつ）。';

export const WORDS: SignItem[] = [
  {
    id: 'word-ohayou',
    kind: 'word',
    label: 'おはよう',
    reading: 'ohayou',
    meaning: '朝のあいさつ',
    sign: ohayou(),
    describe: {
      viewer: `こぶしをこめかみに当てて、下ろす（朝）。${AISATSU_TAIL}`,
      self: '右のこぶしを右のこめかみに当て、枕から頭を起こすように下ろす。続けて、胸の前で両手の人差し指を向かい合わせ、おじぎをするように指を曲げる。',
    },
    memory: { kind: 'origin', text: '「朝」は枕から頭を離すしぐさ、「あいさつ」はおじぎのしぐさと説明されている（梅花女子大学のサイトの教材）。' },
    confusables: [
      { id: 'word-konnichiwa', tip: 'こんにちはは、そろえた2本の指を額に当ててから「あいさつ」をする' },
      { id: 'word-konbanwa', tip: 'こんばんはは、開いた両手を顔の前で交差させてから「あいさつ」をする' },
    ],
    variants: 'こぶしを下ろした後、人差し指の「あいさつ」の代わりに、自分で軽くおじぎをする表し方もある（戸田市・橋本市）。',
    sources: ['akita-shuwa', 'obihiro-shuwa', 'baika-aisatsu', 'toda-2020-09', 'hashimoto-shuwa'],
    confidence: 'high',
    detailNote:
      'こぶしの向き（指の側を相手へ）・下ろす長さ・人差し指を曲げる角度は資料に指定がなく推定。資料には「あいさつ」で軽く会釈するとあるが、この表示の顔は笑顔だけ（会釈は描いていない）。',
    dynamic: true,
  },
  {
    id: 'word-konnichiwa',
    kind: 'word',
    label: 'こんにちは',
    reading: 'konnichiwa',
    meaning: '昼のあいさつ',
    sign: konnichiwa(),
    describe: {
      viewer: `人差し指と中指をそろえて立て、額の真ん中に当てる（昼）。${AISATSU_TAIL}`,
      self: '人差し指と中指をそろえて、時計の針が12時を指すように立て、人差し指の側を額の真ん中に当てる。続けて「あいさつ」をする。',
    },
    memory: { kind: 'origin', text: '「昼」は時計の2本の針が12時（正午）で重なる形、「あいさつ」はおじぎのしぐさと説明されている（梅花女子大学のサイトの教材）。' },
    confusables: [
      { id: 'word-ohayou', tip: 'おはようは、こぶしをこめかみから下ろしてから「あいさつ」をする' },
      { id: 'word-konbanwa', tip: 'こんばんはは、開いた両手を顔の前で交差させてから「あいさつ」をする' },
    ],
    variants:
      '群馬県は、目の前で交差させた両手を左右へ開く形を紹介している（別の表し方なのかは確かめていない）。額に当てた指を下ろした後、自分で軽くおじぎをする表し方もある（戸田市）。',
    sources: ['tottori-shuwa', 'akita-shuwa', 'obihiro-shuwa', 'baika-aisatsu', 'gunma-aisatsu', 'toda-2020-09'],
    confidence: 'high',
    detailNote: '手のひらの向き（相手から見て右）は「人差し指の側を額に当てる」という説明からの推定。額に当てる強さ・指を倒す角度も推定。',
    dynamic: true,
  },
  {
    id: 'word-konbanwa',
    kind: 'word',
    label: 'こんばんは',
    reading: 'konbanwa',
    meaning: '夜のあいさつ',
    sign: konbanwa(),
    describe: {
      viewer: `両手を開いて手のひらを相手に向け、顔の左右から弧を描くように寄せて、顔の前で交差させる（夜）。${AISATSU_TAIL}`,
      self: 'カーテンを閉めるように、開いた両手を顔の横から前へ寄せて交差させる。続けて「あいさつ」をする。',
    },
    memory: { kind: 'origin', text: '「夜」は日が暮れる様子（東京都）、カーテンを閉める様子（梅花女子大学のサイトの教材）と説明されている。' },
    confusables: [
      { id: 'word-ohayou', tip: 'おはようは、こぶしをこめかみから下ろしてから「あいさつ」をする' },
      { id: 'word-konnichiwa', tip: 'こんにちはは、そろえた2本の指を額に当ててから「あいさつ」をする' },
      { id: 'word-sayounara', tip: 'さようならは、開いた片手を顔の横で左右に振るだけ' },
    ],
    variants: '資料に地域の指定はない（地域差がないとは言い切れない）。',
    sources: ['tottori-shuwa', 'tokyo-deaflympics', 'baika-aisatsu'],
    confidence: 'high',
    detailNote: 'どちらの手を前にして交差させるか・交差させる高さは資料に指定がない（右手を前にした推定）。',
    dynamic: true,
  },
  {
    id: 'word-arigatou',
    kind: 'word',
    label: 'ありがとう',
    reading: 'arigatou',
    meaning: '感謝を伝える',
    sign: arigatou(),
    describe: {
      viewer: '左手を手のひらを下にして体の前に置き、その甲に、縦に立てた右手の小指の側を乗せる。右手だけをまっすぐ上げる。',
      self: '左手の甲に、右手を刃物のように縦に立てて乗せ、右手だけを上へ上げる。軽く頭を下げる。',
    },
    memory: { kind: 'origin', text: '相撲の手刀（てがたな）のイメージと説明されている（岩手県の資料）。' },
    confusables: [{ id: 'word-otsukaresama', tip: 'お疲れさまは、右のこぶしで左の腕を2回たたく' }],
    variants: '神奈川県のチラシは、立てた右手の小指の側で左手の甲を軽くたたく、と説明している（上げる動きは書いていない）。上げる形と別の表し方なのかは確かめていない。',
    sources: ['tokyo-deaflympics', 'obihiro-shuwa', 'hashimoto-shuwa', 'iwate', 'baika-aisatsu', 'kanagawa-chirashi'],
    confidence: 'high',
    detailNote:
      '右手の指先の向き（相手の方へ少し左寄り）と上げる高さは推定。資料には軽く頭を下げるとあり、この表示では再生の始めにうなずく。',
    dynamic: true,
  },
  {
    id: 'word-yoroshiku',
    kind: 'word',
    label: 'よろしくお願いします',
    reading: 'yoroshiku onegaishimasu',
    meaning: 'これからの付き合いや頼みごとをお願いする',
    sign: yoroshiku(),
    describe: {
      viewer: 'こぶしを鼻に当てて、少し前へ出す（良い）。手を開いて指をそろえ、顔の前に縦に立てて、前へ出しながら下ろす（お願い）。',
      self: 'こぶしを鼻の前から前へ出したら、その手を開いて片手で拝むように立て、前へ下ろす。軽く頭を下げる。',
    },
    memory: { kind: 'origin', text: '「良い」と「お願い」の2つの手話を続けた形（梅花女子大学のサイトの教材・神奈川県のチラシ）。' },
    confusables: [{ id: 'word-gomennasai', tip: 'ごめんなさいは、こぶしではなく、親指と人差し指で眉間をつまんでから「お願い」をする' }],
    variants: '「お願い」の動きは、前へ出す（群馬県）、下ろす（梅花女子大学のサイトの教材）、前へ下ろす（高齢・障害・求職者雇用支援機構・神奈川県）と、説明に幅がある。前橋市のパンフレット（p.10）は、眉間をつまんだ指先を開きながら前へ出す形を載せている。',
    sources: ['gunma-aisatsu', 'jeed-manual', 'obihiro-shuwa', 'kanagawa-chirashi', 'baika-aisatsu'],
    confidence: 'high',
    detailNote:
      'こぶしの向き（親指の側を鼻に当てる）・前へ出す長さは推定。資料のとおり、後半の「お願い」で手を下ろす動きに合わせて軽く一礼する。',
    dynamic: true,
  },
  {
    id: 'word-gomennasai',
    kind: 'word',
    label: 'ごめんなさい',
    reading: 'gomennasai',
    meaning: '謝る',
    sign: gomennasai(),
    describe: {
      viewer: '親指と人差し指で眉間をつまむようにする（迷惑）。手を開いて指をそろえ、顔の前に縦に立てて、下ろす（お願い）。',
      self: '眉間にしわを寄せるように、親指と人差し指で眉間をつまむ。続けて、片手で拝むように立てた手を下ろし、頭を下げる。',
    },
    memory: { kind: 'origin', text: '眉間にしわを寄せる様子の「迷惑」に、「お願い」を続けた形と説明されている（梅花女子大学のサイトの教材）。' },
    confusables: [{ id: 'word-yoroshiku', tip: 'よろしくお願いしますは、こぶしを鼻から前へ出してから「お願い」をする' }],
    variants: '「すみません」も同じ形で表す資料がある（高齢・障害・求職者雇用支援機構）。ただし、呼びかけや頼みごとの「すみません」まで同じ形かは確かめていない。',
    sources: ['gunma-aisatsu', 'tokyo-deaflympics', 'jeed-manual', 'baika-aisatsu'],
    confidence: 'high',
    detailNote:
      'つまむ手の向き（顔の右下から手を添え、手のひらを鼻の方へ向ける）・ほかの3本の指（握る）は推定。前橋市のパンフレット（p.10）の図のように、つまむ形が相手に見える向きにした。強くつままなくてよい。資料のとおり、後半の「お願い」の動きに合わせて頭を下げる。',
    dynamic: true,
  },
  {
    id: 'word-sayounara',
    kind: 'word',
    label: 'さようなら',
    reading: 'sayounara',
    meaning: '別れのあいさつ',
    sign: sayounara(),
    describe: {
      viewer: '開いた手のひらを相手に向け、顔の横で左右に軽く振る。',
      self: '手を開いて顔の横に上げ、手のひらを相手に向けて左右に軽く振る。',
    },
    memory: { kind: 'origin', text: '手を振って別れるしぐさと説明されている（梅花女子大学のサイトの教材）。' },
    confusables: [{ id: 'word-konbanwa', tip: 'こんばんはは、開いた両手を顔の前で交差させてから「あいさつ」をする' }],
    variants: '資料に地域の指定はない（地域差がないとは言い切れない）。',
    sources: ['gunma-aisatsu', 'iwate', 'baika-aisatsu'],
    confidence: 'high',
    detailNote: '振る回数（この表示では2往復）・指の開き方は資料に指定がなく推定。笑顔は、大学の教材があいさつ全般にすすめているもの。',
    dynamic: true,
  },
  {
    id: 'word-otsukaresama',
    kind: 'word',
    label: 'お疲れさま',
    reading: 'otsukaresama',
    meaning: '相手の苦労をねぎらう',
    sign: otsukaresama(),
    describe: {
      viewer: '左手をこぶしにして体の前に出し、右のこぶしの小指の側で、左の腕（手首とひじの間）を軽く2回たたく。',
      self: '左腕を体の前に横たえ、右のこぶしで手首の近くを2回、軽くたたく。軽く頭を下げる。',
    },
    memory: { kind: 'origin', text: '肩をたたいてねぎらう様子と説明されている（梅花女子大学のサイトの教材）。たたくのは肩ではなく、左の腕。' },
    confusables: [{ id: 'word-arigatou', tip: 'ありがとうは、左手の甲に立てた右手を乗せて上げる' }],
    variants: 'たたく場所は、手首の近く（岩手県）から手首とひじの間（東京都）まで、資料に幅がある。橋本市は、2回たたいた後に右手を開いて上げる表し方も紹介している。',
    sources: ['tokyo-deaflympics', 'jeed-manual', 'fukuoka-video', 'iwate', 'hashimoto-shuwa', 'baika-aisatsu'],
    confidence: 'high',
    detailNote: '左手をこぶしにするのは一部の資料。左腕の向きと高さは推定。資料には軽く一礼するとあり、この表示では再生の始めにうなずく。',
    dynamic: true,
  },
  {
    id: 'word-hajimemashite',
    kind: 'word',
    label: 'はじめまして',
    reading: 'hajimemashite',
    meaning: '初めて会った人へのあいさつ',
    sign: hajimemashite(),
    describe: {
      viewer:
        '手のひらを下にした左手の甲に、右手のひらを重ねる。右手を上げながら、人差し指だけを残して握る（初めて）。両手の人差し指を立てて、左右から近づける（会う）。',
      self: '重ねた手から右手を上げて、人差し指の「1」にする。続けて、両手の人差し指を人に見立てて、左右から近づける（指は曲げない）。',
    },
    memory: { kind: 'origin', text: '「初めて」と「会う」を続けた形。「会う」の人差し指は、それぞれ人を表す（群馬県の説明）。' },
    confusables: [{ id: 'word-ohayou', tip: '「あいさつ」は近づけた人差し指を曲げる。「会う」は曲げずに近づけるだけ' }],
    variants: '群馬県は、左手を使わず、右手を体の前の低い位置から、人差し指を残して上げる形で説明している。',
    sources: ['maniwa-koza', 'jeed-manual', 'gunma-aisatsu'],
    confidence: 'high',
    detailNote: '手の高さ・指先の向き（前）・2本の人差し指をどこまで近づけるか（触れない）は資料に指定がなく推定。笑顔も推定（資料に表情の指定はない）。',
    dynamic: true,
  },
  {
    id: 'word-namae',
    kind: 'word',
    label: '名前',
    reading: 'namae',
    meaning: '人や物の名前',
    sign: namae(),
    describe: {
      viewer: '左手を開いて手のひらを相手に向けて立て、その手のひらに右手の親指の腹を押し当てる。',
      self: '左の手のひらを相手に向けて立て、右手の親指で、はんこを押すように手のひらへ押し当てる。',
    },
    memory: { kind: 'origin', text: '拇印（指で押すはんこ）を押す様子と説明されている（梅花女子大学のサイトの教材・国立国語研究所）。' },
    variants:
      '東日本では、この拇印の形を使う。関西・西日本では、親指と人差し指で作った輪を胸に当てる「名札」の形を使う（国立国語研究所・立命館大学・橋本市）。どの地域でどちらをどれだけ使うかまでは分かっていない。',
    sources: ['kushiro-video', 'oizumi-onepoint', 'baika-yubimoji', 'ninjal-dialect', 'ritsumei-club', 'hashimoto-shuwa'],
    confidence: 'high',
    detailNote: '右手のほかの4本（握る）と、親指を当てる向き（上へ立てる）は推定。',
    dynamic: true,
  },
  {
    id: 'word-shuwa',
    kind: 'word',
    label: '手話',
    reading: 'shuwa',
    meaning: '手で表す言葉（手話）',
    sign: shuwa(),
    describe: {
      viewer: '両手の人差し指を横に向けて向かい合わせ、上下に置く。糸を巻くように、両手を交互に前へ回す。',
      self: '人差し指どうしを向かい合わせ、上下を入れ替えるように、前へくるくると回す。',
    },
    memory: { kind: 'origin', text: '手話をするときの手や指の動きを表すと説明されている（鴻巣市）。' },
    variants: '資料に地域の指定はない（地域差がないとは言い切れない）。',
    sources: ['akita-shuwa', 'ishikawa-sign', 'kanagawa-chirashi', 'kounosu-809'],
    confidence: 'high',
    detailNote: '手のひらの向き（自分の側）・回す大きさと回数（この表示では2回）は資料に指定がなく推定。',
    dynamic: true,
  },
  {
    id: 'word-wakaru',
    kind: 'word',
    label: 'わかる',
    reading: 'wakaru',
    meaning: '理解できる',
    sign: wakaru(),
    describe: {
      viewer: '手のひらを胸に当てて、なで下ろす。地域によっては、手のひらで胸を2回たたく形も使う（神奈川県・前橋市の資料）。',
      self: '右の手のひらを胸の上の方に当て、下へなで下ろす。',
    },
    memory: { kind: 'mnemonic', text: '「胸に落ちる（納得する）」と結びつけて覚える。' },
    confusables: [
      { id: 'word-wakaranai', tip: 'わからないは、指先で肩を上へ払い上げる' },
      { id: 'word-daijoubu', tip: '大丈夫は、少し曲げた指先を胸の左右に当てる' },
    ],
    variants:
      '福岡県の「わかった」は、手のひらで胸をたたく形。神奈川県の冊子（p.12）と前橋市のパンフレット（p.10）の図も、手のひらで胸をたたく形を載せている（神奈川県は2回）。なで下ろす形との違いが、地域の違いか使い方の違いかは確かめていない。',
    sources: ['obihiro-shuwa', 'ishikawa-sign', 'fukuoka-video', 'kanagawa-2025', 'maebashi-panf'],
    confidence: 'medium',
    detailNote: '指先の向き（左上）・なで下ろす長さは推定。資料で形が分かれる（胸をなで下ろす形：帯広市・石川県／胸をたたく形：福岡県・神奈川県・前橋市）ため、確信度は中にしている。',
    dynamic: true,
  },
  {
    id: 'word-wakaranai',
    kind: 'word',
    label: 'わからない',
    reading: 'wakaranai',
    meaning: '理解できない',
    sign: wakaranai(),
    describe: {
      viewer: '開いた手の指先を肩（相手から見て左の肩）に当て、上へ払い上げる。これを2回くり返す。',
      self: '開いた右手の指先で、右肩のほこりを払うように、上へ2回払う。',
    },
    memory: { kind: 'mnemonic', text: '「わかる」は胸をなで下ろし、「わからない」は肩を上へ払う。下と上で対にして覚える。' },
    confusables: [{ id: 'word-wakaru', tip: 'わかるは、手のひらで胸をなで下ろす' }],
    variants: '帯広市は右胸の脇から、福岡県は胸元から払い上げる形で説明している（始める位置が違う）。梅花女子大学のサイトの教材は、「知らない」も同じ形で表すと説明している。',
    sources: ['ishikawa-sign', 'baika-aisatsu', 'obihiro-shuwa', 'fukuoka-video'],
    confidence: 'high',
    detailNote: '手のひらの向き・指の曲げ方・払い上げる高さは推定。回数は石川県の説明（2回）に合わせた（大学の教材は「数回」）。',
    dynamic: true,
  },
  {
    id: 'word-suki',
    kind: 'word',
    label: '好き',
    reading: 'suki',
    meaning: '好きだと思う気持ち',
    sign: throatDown('suki'),
    describe: {
      viewer: '親指と人差し指を開いてのどの横に置き、指先をのどへ向ける。2本を閉じながら、前の斜め下へ下ろす。',
      self: '開いた親指と人差し指の先をのどへ向け、つまむように閉じながら、前の斜め下へ引くように下ろす。',
    },
    memory: { kind: 'mnemonic', text: '「のどから手が出るほど欲しい」と覚える（生駒市の広報が紹介している覚え方）。' },
    confusables: [{ id: 'word-kirai', tip: '嫌いは、閉じた2本を開きながら下ろす（好きの反対）' }],
    variants: '下へ下ろす（総社市・人吉市）のほかに、前へ出す・手首を前へ返すという説明もある（生駒市）。',
    sources: ['soja-monthly', 'hitoyoshi-2025-08', 'ikoma-2026-06'],
    confidence: 'high',
    detailNote:
      '中指・薬指・小指（握る）、手の向き、のどからの距離は資料に指定がなく推定。神奈川県の冊子（p.12・13）の図に合わせ、開いた2本の間が相手に見えるよう手の甲を相手へ向け、閉じながら手首を返して、閉じた2本を親指の側から見せた。気持ちは表情でも表す（人吉市）。',
    dynamic: true,
  },
  {
    id: 'word-kirai',
    kind: 'word',
    label: '嫌い',
    reading: 'kirai',
    meaning: '嫌だと思う気持ち',
    sign: throatDown('kirai'),
    describe: {
      viewer: '親指と人差し指の先を合わせてあごの下に置き、指先を上へ向ける。2本を開きながら、前の斜め下へ下ろす。',
      self: '「好き」の反対の動き。閉じた2本をあごの下から前の斜め下へ下ろしながら、ぱっと開く。',
    },
    memory: { kind: 'mnemonic', text: '嫌なものを吐き出す、と覚える（生駒市の広報が紹介している覚え方）。' },
    confusables: [{ id: 'word-suki', tip: '好きは、開いた2本を閉じながら下ろす（嫌いの反対）' }],
    variants: '下へ下ろす（総社市・人吉市）のほかに、手首を前へ返して開くという説明もある（生駒市）。首をかしげると「嫌い？」と尋ねる形になる（人吉市）。',
    sources: ['soja-monthly', 'hitoyoshi-2025-08', 'ikoma-2026-06'],
    confidence: 'high',
    detailNote:
      '中指・薬指・小指（握る）と手の向きは推定。神奈川県の冊子（p.13）の図に合わせ、始めは閉じた2本の先を親指の側から見せ、終わりは開いた2本の間が相手に見える向きにした。嫌な気持ちは表情でも表す。この表示では眉を寄せ、口をへの字にした顔で表す（表情の細部は推定）。',
    dynamic: true,
  },
  {
    id: 'word-daijoubu',
    kind: 'word',
    label: '大丈夫',
    reading: 'daijoubu',
    meaning: '問題ない・できる',
    sign: daijoubu(),
    describe: {
      viewer: '指を少し曲げ、4本の指先を胸の片側（相手から見て右）に当ててから、反対側（相手から見て左）へ移してもう一度当てる。',
      self: '少し曲げた4本の指先を、自分の左胸に当ててから右胸に当てる。「大丈夫ですよ」と伝えるときは、うなずく。',
    },
    memory: { kind: 'origin', text: '胸を打って「任せてくれ」と示すしぐさと説明されている（鴻巣市）。' },
    confusables: [{ id: 'word-wakaru', tip: 'わかるは、手のひら全体で胸をなで下ろす' }],
    variants:
      '指先を当てるのは親指を除く4本（渋川市・梅花女子大学のサイトの教材）とする資料と、5本をそろえる（相模原市）とする資料がある。「できる（可能）」の意味でも使う（渋川市）。「大丈夫？」と尋ねるときは首をかしげる（相模原市）。',
    sources: ['shibukawa-310', 'baika-aisatsu', 'tokyo-deaflympics', 'sagamihara-shuwa', 'kounosu-809'],
    confidence: 'medium',
    detailNote: '親指を含めるか（4本か5本か）が資料で分かれる。親指の位置・手のひらの向き・胸から離す高さは推定。',
    dynamic: true,
  },
];
