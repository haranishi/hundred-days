/**
 * 試作の形（開発用の一覧ページと試験で使う）。本物の中身のデータは sign-content が書く。
 * 元は調査 r1（.agent-harness/research/r1_yubimoji.json。右手・相手から見た向き）。
 * r1 で未確認とされた角度（え の付け根・か の中指・お の丸め方）は、見た目で決めた仮の値。
 */
import type { HandshapeSpec, Orientation, SignSpec } from '../types';

export interface Sample {
  id: string;
  label: string;
  /** r1 の「相手から見た」説明（照らし合わせ用） */
  r1: { palm: string; fingers: string; relation: string };
  spec: SignSpec;
}

const FACE: Orientation = { palm: 'toViewer', fingers: 'up' };
const still = (shape: HandshapeSpec, orient: Orientation = FACE): SignSpec => ({
  hands: { dominant: { keyframes: [{ t: 0, shape, orient, pos: { at: 'neutral' } }] } },
});

const ka: HandshapeSpec = {
  fingers: { index: 'extended', middle: 'bentMcp', ring: 'curled', pinky: 'curled' },
  thumb: { touch: 'middle.pip' },
  spread: { index: 8, middle: 4 },
  // r1: 中指は「斜め前（相手の方）」で角度は未確認。直角（bentMcp）より浅い 62° にした（親指の腹が第2関節に届く角度）
  adjust: { middle: { mcp: 62 } },
};

export const SAMPLES: Sample[] = [
  {
    id: 'a',
    label: 'あ',
    r1: { palm: '相手の方', fingers: '親指は相手から見て右。握った4指は掌内', relation: '4指を握り、親指を横に出す（前を横切らない）' },
    spec: still({ fingers: { index: 'curled', middle: 'curled', ring: 'curled', pinky: 'curled' }, thumb: 'alongside' }),
  },
  {
    id: 'i',
    label: 'い',
    r1: { palm: '相手の方', fingers: '小指は上', relation: '小指だけを立てる。親指は曲げて収める' },
    spec: still({ fingers: { index: 'curled', middle: 'curled', ring: 'curled', pinky: 'extended' }, thumb: 'acrossFront' }),
  },
  {
    id: 'u',
    label: 'う',
    r1: { palm: '相手の方', fingers: '人差し指・中指は上', relation: '人差し指と中指をそろえて立てる（開いたVではない）' },
    spec: still({
      fingers: { index: 'extended', middle: 'extended', ring: 'curled', pinky: 'curled' },
      thumb: 'acrossFront',
      spread: 'together',
    }),
  },
  {
    id: 'e',
    label: 'え',
    r1: { palm: '相手の方', fingers: '4指先は内側へ折り返す', relation: '4指を第2関節中心に曲げ、掌が見える空間を残す。親指は内側へ曲げる' },
    spec: still({
      fingers: { index: 'hooked', middle: 'hooked', ring: 'hooked', pinky: 'hooked' },
      thumb: 'tuckedUnder',
      spread: 'together',
      // r1: 付け根の曲げ量は未確定。かぎ形のままでは指先が掌から遠いので、付け根も少し曲げる
      adjust: { index: { mcp: 28 }, middle: { mcp: 28 }, ring: { mcp: 28 }, pinky: { mcp: 28 } },
    }),
  },
  {
    id: 'o',
    label: 'お',
    r1: {
      palm: '相手から見て右（小指側を相手へ）',
      fingers: '丸く内側へ向き合う',
      relation: '親指と人差し指の先で輪を閉じ、他の3指も丸めてそろえる',
    },
    spec: still(
      {
        fingers: { index: 'half', middle: 'half', ring: 'half', pinky: 'half' },
        thumb: { touch: 'index.tip' },
        spread: 'together',
        adjust: {
          index: { mcp: 40, pip: 58, dip: 38 },
          middle: { mcp: 42, pip: 62, dip: 40 },
          ring: { mcp: 44, pip: 64, dip: 42 },
          pinky: { mcp: 46, pip: 64, dip: 42 },
        },
      },
      { palm: 'viewerRight', fingers: 'up' },
    ),
  },
  {
    id: 'ka',
    label: 'か',
    r1: {
      palm: '相手の方（正面か小指側を見せる斜めかは資料差）',
      fingers: '人差し指は上。中指は斜め前（相手の方）',
      relation: '人差し指・中指を開き、間から親指の腹を中指の第2関節付近へ当てる',
    },
    spec: still(ka),
  },
  {
    id: 'ki',
    label: 'き',
    r1: { palm: '相手の方', fingers: '人差し指・小指は上。他の3指は互いへ', relation: '親指・中指・薬指の3指先を合わせる（きつね）' },
    spec: still({
      fingers: { index: 'extended', middle: 'half', ring: 'half', pinky: 'extended' },
      thumb: { touch: 'middle.tip' },
      contacts: [['thumb.tip', 'ring.tip']],
      spread: { index: 6, pinky: 10 },
    }),
  },
  {
    id: 'sa',
    label: 'さ',
    r1: { palm: '相手の方', fingers: '全指先は握り込む方向', relation: '4指を握り、親指も曲げて外側（握った指の前）へ' },
    spec: still({ fingers: { index: 'curled', middle: 'curled', ring: 'curled', pinky: 'curled' }, thumb: 'acrossFront' }),
  },
  {
    id: 'ra',
    label: 'ら',
    r1: {
      palm: '相手の方',
      fingers: '人差し指・中指は上（交差に伴う傾き）',
      relation: '中指の腹を人差し指の背側・爪付近へ重ねる（相手からは人差し指が手前、自分からは中指が手前）',
    },
    spec: still({
      fingers: { index: 'extended', middle: 'extended', ring: 'curled', pinky: 'curled' },
      thumb: 'acrossFront',
      cross: { front: 'index', back: 'middle' },
    }),
  },
  {
    id: 'me',
    label: 'め',
    r1: { palm: '相手の方', fingers: '中指・薬指・小指は上。親指・人差し指は互いへ', relation: '親指と人差し指で輪を閉じ、残り3指は伸ばす' },
    spec: still({
      fingers: { index: 'half', middle: 'extended', ring: 'extended', pinky: 'extended' },
      thumb: { touch: 'index.tip' },
      spread: { index: 25, middle: 2, ring: 4, pinky: 8 },
      // r1: 輪の形（真円／横長）は未確定。相手に輪の穴が見えるよう、親指を横へ大きく開き（付け根を固定）、
      // 人差し指は親指の側へ寄せる。人差し指の曲げは接触に合わせて逆運動学で決める
      adjust: { thumb: { cmcFlex: -24 } },
    }),
  },
  {
    id: 'no',
    label: 'の',
    r1: {
      palm: '未確認（手のひらを相手へ向けて仮置き）',
      fingers: '人差し指先で空書',
      relation: '人差し指で「ノ」を書く。表す人の右上→左下＝相手から見て左上→右下',
    },
    spec: {
      hands: {
        dominant: {
          keyframes: [
            {
              t: 0,
              shape: { fingers: { index: 'extended', middle: 'curled', ring: 'curled', pinky: 'curled' }, thumb: 'acrossFront' },
              orient: FACE,
              pos: { at: 'neutral', offset: [-0.3, 0.4, 0] },
            },
          ],
        },
      },
      // 相手から見た点（＝表す人から見た「ノ」を左右反転した点）。指先の出発点からのずれ
      trace: {
        tip: 'index.tip',
        relativeTo: 'tipStart',
        points: [
          [0, 0, 0],
          [0.12, -0.55, 0],
          [0.42, -1.05, 0],
          [0.95, -1.38, 0],
        ],
        tStart: 0.25,
        tEnd: 1.15,
      },
      duration: 1.3,
    },
  },
  {
    id: 'ga',
    label: 'が',
    r1: {
      palm: '「か」と同じ',
      fingers: '「か」と同じ',
      relation: 'かの形のまま、表す人の右へ手全体を動かす（相手から見て左へ）',
    },
    spec: {
      hands: {
        dominant: {
          keyframes: [
            { t: 0, shape: ka, orient: FACE, pos: { at: 'neutral', offset: [0.5, 0, 0] } },
            { t: 0.25, pos: { at: 'neutral', offset: [0.5, 0, 0] } },
            { t: 0.85, pos: { at: 'neutral', offset: [-0.6, 0, 0] }, ease: 'inOut' },
          ],
        },
      },
    },
  },
];

/**
 * 上半身つきの表示を確かめるための形（開発用。手話の単語のデータではない）。
 * 体の位置の名前・両手・顔の表情・うなずきが描けるかを見る。
 */
const flatHand: HandshapeSpec = {
  fingers: { index: 'extended', middle: 'extended', ring: 'extended', pinky: 'extended' },
  thumb: 'alongside',
  spread: 'together',
};
const point: HandshapeSpec = {
  fingers: { index: 'extended', middle: 'curled', ring: 'curled', pinky: 'curled' },
  thumb: 'acrossFront',
};

export const BODY_SAMPLES: Sample[] = [
  {
    id: 'body-chin',
    label: '体：あご（笑顔）',
    r1: { palm: '体の側', fingers: '上', relation: '人差し指をあごの前へ（位置の名前 chin）' },
    spec: {
      body: true,
      face: 'smile',
      hands: { dominant: { keyframes: [{ t: 0, shape: point, orient: { palm: 'toSigner', fingers: 'up' }, pos: { at: 'chin', offset: [0, -0.45, -0.3] } }] } },
    },
  },
  {
    id: 'body-chest',
    label: '体：両手を胸の前で下ろす（うなずき）',
    r1: { palm: '下', fingers: '相手の方', relation: '両手を胸の前（chest）から下へ' },
    spec: {
      body: true,
      face: 'nod',
      hands: {
        dominant: {
          keyframes: [
            { t: 0, shape: flatHand, orient: { palm: 'down', fingers: 'toViewer' }, pos: { at: 'chest', offset: [-0.7, 0.2, 0.3] } },
            { t: 0.7, pos: { at: 'chest', offset: [-0.7, -0.6, 0.3] } },
          ],
        },
        nonDominant: {
          keyframes: [
            { t: 0, shape: flatHand, orient: { palm: 'down', fingers: 'toViewer' }, pos: { at: 'chest', offset: [0.7, 0.2, 0.3] } },
            { t: 0.7, pos: { at: 'chest', offset: [0.7, -0.6, 0.3] } },
          ],
        },
      },
    },
  },
  {
    id: 'body-temple',
    label: '体：こめかみ（ふつうの顔）',
    r1: { palm: '下', fingers: '体の側', relation: '握った手をこめかみの横（temple）へ' },
    spec: {
      body: true,
      face: 'neutral',
      hands: {
        dominant: {
          keyframes: [{ t: 0, shape: { ...point, fingers: { ...point.fingers, index: 'curled' } }, orient: { palm: 'toSigner', fingers: 'up' }, pos: { at: 'temple' } }],
        },
      },
    },
  },
];
