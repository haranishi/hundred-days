// 事件簿（5つの夜）。物語・手がかり・容疑者と、場面の幾何（灯り・道具の位置と奥行き）をまとめる。
// 幾何の数値は設計ツールで逆算して丸めたもの。ねらいの影（目撃者のスケッチ）は、ここにある「正解」の配置から
// 実行時に作るので、正解は必ず合格する。許容幅・一意性・邪魔な道具の扱いは tests/cases.test.mjs が確かめる。
import { SHAPES } from './shapes.js';
import { DEFAULT_THRESHOLD } from './score.js';

// 月影荘の人々。身長は推理の材料（灯りの高さ＝身長×0.6＋踏み台）。
export const PEOPLE = Object.freeze({
  saeki: { name: '佐伯 ふみ', role: '家政婦', height: 150 },
  tsubaki: { name: '椿 みお', role: '料理人', height: 170 },
  uno: { name: '宇野 蒼', role: '画家', height: 160 },
  moriyama: { name: '森山 達也', role: '庭師', height: 165 },
  kuga: { name: '久我 澄', role: '医師', height: 170 },
  kiritani: { name: '桐谷 恒一', role: '管理人', height: 175 },
  hinata: { name: '日向 悠', role: '書生', height: 178 },
  hiiragi: { name: '柊 悟', role: '大工', height: 180 },
  shirase: { name: '白瀬 あきら', role: '運転手', height: 180 },
  hasumi: { name: '蓮見 渉', role: '郵便配達', height: 188 },
});

const fixed = (value) => ({ min: value, max: value, start: value, solution: value });
const slide = (start, solution) => ({ min: 8, max: 232, start, solution });
const LAMP_RANGE = { min: 30, max: 165 };

export const CASES = Object.freeze([
  {
    id: 'rack',
    no: 1,
    title: '玄関の紳士',
    place: '月影荘 玄関ホール',
    summary: '外套掛けの影が、壁に紳士を立たせた。',
    intro: '停電の夜、月影荘の金庫から、主人の懐中時計が消えた。料理人の椿は、そのとき玄関の壁に人影を見たという。',
    witness: { person: 'tsubaki', quote: '玄関の壁に、帽子をかぶった背の高い紳士が立っていました。声をかけようとしたら、すうっと消えてしまって……。' },
    sceneNote: '玄関ホールで大きな物は、外套掛けだけ。壁の紳士は、その影ではないか。灯りを動かして確かめよう。',
    footprint: '玄関の床に、立ち止まった足跡が一組。壁から260cm、壁の左端から150cmの位置にある。灯りは、その足跡の真上で提げられていた。',
    guide: 'on',
    coach: '灯りの玉を上下にドラッグして、影を朱のガイドに重ねよう。',
    coachNoGuide: '灯りの玉を上下にドラッグして、影を証言のスケッチの形に重ねよう。',
    showsHeight: true,
    hints: [
      '灯りは上下にだけ動く。足跡の位置から、横には動かせない。',
      '灯りを上げると、影は下がる。壁の影が、紳士の形に重なる高さを探そう。',
    ],
    deductionHint: '身長が合う人を探す。アリバイが確かな人は、外してよい。',
    stage: {
      distance: 260,
      lamp: { x: 150, ...LAMP_RANGE, start: 150, solution: 99 },
      props: [
        { id: 'rack', shape: 'coatRack', label: '外套掛け', scale: 0.563, z: 97.5, y: 91, x: fixed(131.5) },
      ],
    },
    clues: [
      { id: 'rule', kind: 'rule', text: '灯りは、胸の高さに提げる。月影荘の決まりで、高さは身長のちょうど6割。' },
      { id: 'alibi', kind: 'alibi', text: '日向は、停電のあいだずっと二階で電話をしていた。通話記録が残っている。', rulesOut: ['hinata'] },
    ],
    suspects: [
      { id: 'saeki', statement: '台所で、夕食の片づけをしていました。' },
      { id: 'moriyama', statement: '庭の見回りをしていました。玄関には入っていません。' },
      { id: 'hinata', statement: '二階の自室で、電話をしていました。' },
    ],
    culprit: 'moriyama',
    stool: 0,
    reveal: '壁の紳士は、外套掛けの影だった。灯りがあったのは、床から99cmの高さ。',
    closing: '身長165cmの人が提げる灯りは、99cm。庭の見回りのはずの森山が、玄関から金庫のある部屋へ向かっていた。',
  },
  {
    id: 'hat',
    no: 2,
    title: '宙に浮く帽子',
    place: '月影荘 書斎',
    summary: '帽子と外套の影が、灯りの高さでつながる。',
    intro: '二日目の夜、書斎から古い地図が消えた。管理人の桐谷は、書斎の壁で奇妙なものを見たという。',
    witness: { person: 'kiritani', quote: '最初は、帽子だけが壁に浮いていました。灯りが揺れると、その下に外套が現れて——帽子をかぶった人の形になったんです。' },
    sceneNote: '書斎には、帽子をのせた棚と、外套をかけたスタンドが別々にある。灯りの高さを変えると、2つの影のつながりも変わるはずだ。',
    footprint: '書斎の床に、足跡が一組。壁から240cm、壁の左端から110cmの位置にある。',
    guide: 'off',
    coach: '灯りを動かすと、帽子と外套の影は同じ速さでは動かない。スケッチの形になる高さを探そう。',
    hints: [
      '灯りに近い物ほど、影は大きく動く。帽子の影と外套の影は、同じ速さでは動かない。',
      '帽子の影が、外套の襟の上にのる高さを探そう。',
    ],
    deductionHint: '身長の6割が灯りの高さ。2人の身長に0.6をかけて、96cmと比べよう。',
    stage: {
      distance: 240,
      lamp: { x: 110, ...LAMP_RANGE, start: 45, solution: 96 },
      props: [
        { id: 'coat', shape: 'coat', label: '外套', scale: 0.533, z: 80, y: 89.5, x: fixed(116.5) },
        { id: 'hat', shape: 'hat', label: '帽子', scale: 0.414, z: 135.5, y: 114.5, x: fixed(114.5) },
      ],
      // 夜1より少し厳しく：帽子と外套を、それぞれ75%以上重ねる（灯りの許容が約±4cmになり、夜1の約±5.5cmより狭い）。
      threshold: { union: 0.8, part: 0.75, decoyArea: 0.05, near: 0.7, warm: 0.5 },
    },
    clues: [
      { id: 'rule', kind: 'rule', text: '灯りは、胸の高さに提げる。月影荘の決まりで、高さは身長のちょうど6割。' },
      { id: 'alibi', kind: 'alibi', text: '日向は、停電のあいだ玄関で来客の相手をしていた。来客がそれを覚えている。', rulesOut: ['hinata'] },
    ],
    suspects: [
      { id: 'kuga', statement: '往診の支度で、自室にいました。' },
      { id: 'uno', statement: 'アトリエで、絵を描いていました。' },
      { id: 'hinata', statement: '玄関で、お客さんの相手をしていました。' },
    ],
    culprit: 'uno',
    stool: 0,
    reveal: '帽子と外套は、別々の棚にあった。灯りが96cmの高さにあるとき、2つの影がつながって人の形になる。',
    closing: '96cmは、身長160cmの人が提げる灯り。アトリエにいたはずの宇野が、書斎の前に立っていた。',
  },
  {
    id: 'bag',
    no: 3,
    title: '鞄を提げた男',
    place: '月影荘 渡り廊下',
    summary: '縦は灯りで、横は道具で合わせる。',
    intro: '三日目の夜、蔵から掛け軸が消えた。書生の日向は、渡り廊下の壁に、鞄を提げた男を見たという。',
    witness: { person: 'hinata', quote: '鞄を提げた男が、廊下の奥の壁を、ゆっくり歩いていました。帽子も外套も、こっちを向かないまま……。' },
    sceneNote: '廊下の棚に、帽子と外套と鞄がある。置き方はばらばら。道具は、棚の上を横にすべらせられる。',
    footprint: '廊下の床に、足跡が一組。壁から280cm、壁の左端から120cmの位置にある。',
    guide: 'off',
    coach: '縦は灯り、横は道具。道具をつかんで、左右にすべらせよう。',
    hints: [
      '縦の位置は、灯りの高さで決まる。横の位置は、道具をすべらせて合わせる。',
      'まず、帽子・外套・鞄の上下のつながりが合う灯りの高さを探す。そのあと、横をそろえよう。',
    ],
    deductionHint: '灯り102cmに合う身長の人が、2人いる。アリバイが確かな人は、外せる。',
    stage: {
      distance: 280,
      lamp: { x: 120, ...LAMP_RANGE, start: 150, solution: 102 },
      props: [
        { id: 'hat', shape: 'hat', label: '帽子', scale: 0.455, z: 152.5, y: 127.5, x: slide(30, 120) },
        { id: 'coat', shape: 'coat', label: '外套', scale: 0.482, z: 115.5, y: 105.5, x: slide(205, 120) },
        { id: 'bag', shape: 'bag', label: '鞄', scale: 0.885, z: 64.5, y: 79, x: slide(70, 92.5) },
      ],
    },
    clues: [
      { id: 'rule', kind: 'rule', text: '灯りは、胸の高さに提げる。月影荘の決まりで、高さは身長のちょうど6割。' },
      { id: 'alibi', kind: 'alibi', text: '椿は、停電のあいだ厨房で火の始末をしていた。見習いが、ずっと隣にいた。', rulesOut: ['tsubaki'] },
    ],
    suspects: [
      { id: 'saeki', statement: '管理人室で、帳簿の手伝いをしていました。' },
      { id: 'tsubaki', statement: '厨房で、火の始末をしていました。' },
      { id: 'kuga', statement: '診察室で、薬を整えていました。' },
    ],
    culprit: 'kuga',
    stool: 0,
    reveal: '男はいなかった。帽子と外套と鞄の影が、灯りの高さ102cmでそろっただけだった。',
    closing: '102cmは、身長170cmの人が提げる灯り。同じ170cmの椿には、厨房に見習いがいた。診察室にいたはずの久我が、廊下に立っていた。',
  },
  {
    id: 'chair',
    no: 4,
    title: '座る影',
    place: '月影荘 書斎の隅',
    summary: '足もとの跡が、灯りの高さを変えていた。',
    intro: '四日目の夜、書斎の机から通帳が消えた。画家の宇野は、椅子に座る人影を見たという。',
    witness: { person: 'uno', quote: '誰かが椅子に座っているみたいでした。帽子をかぶって、ぴくりとも動かない人影が、壁に……。' },
    sceneNote: '書斎の隅に、帽子、外套、肘掛け椅子がある。足跡のまわりには、別の跡も残っていた。',
    footprint: '床に、足跡が一組。壁から250cm、壁の左端から140cmの位置にある。足跡の下には、四角い踏み台の跡。踏み台の高さは20cm。',
    guide: 'off',
    coach: '椅子の影が下半身になる。灯りの高さと、道具の横位置を合わせよう。',
    hints: [
      '椅子の影が、座った人の下半身になる。帽子と外套を、その上に重ねよう。',
      '縦のつながりは灯りの高さで合わせ、横は道具をすべらせて合わせる。',
    ],
    deductionHint: '踏み台に立つと、灯りは20cm高くなる。灯りから20cmを引いてから、6割で割る。',
    stool: 20,
    stage: {
      distance: 250,
      lamp: { x: 140, ...LAMP_RANGE, start: 60, solution: 125 },
      props: [
        { id: 'chair', shape: 'armchair', label: '椅子', scale: 0.571, z: 71.5, y: 75, x: slide(195, 124.5) },
        { id: 'coat', shape: 'coat', label: '外套', scale: 0.412, z: 103, y: 110.5, x: slide(40, 126) },
        { id: 'hat', shape: 'hat', label: '帽子', scale: 0.409, z: 136.5, y: 134, x: slide(215, 129) },
      ],
    },
    clues: [
      { id: 'rule', kind: 'rule', text: '灯りは、胸の高さに提げる。月影荘の決まりで、高さは身長のちょうど6割。' },
      { id: 'stool', kind: 'stool', text: '犯人は、20cmの踏み台の上に立って灯りを提げた。灯りの高さは、身長の6割に、踏み台の20cmを足した高さになる。' },
      { id: 'alibi', kind: 'alibi', text: '佐伯は、停電のあいだ地下の食料庫で在庫を数えていた。台帳に時刻が残っている。', rulesOut: ['saeki'] },
    ],
    suspects: [
      { id: 'saeki', statement: '食料庫で、在庫を数えていました。' },
      { id: 'kiritani', statement: '管理人室で、帳簿を付けていました。' },
      { id: 'hasumi', statement: '夕方の配達のあと、帰りに寄っただけです。' },
    ],
    culprit: 'kiritani',
    reveal: '灯りがあったのは、床から125cm。踏み台に乗った人が、胸の高さに提げた灯りだった。',
    closing: '125cmから踏み台の20cmを引くと105cm。身長175cmの桐谷だ。管理人室にいたはずの桐谷が、書斎にいた。',
  },
  {
    id: 'umbrella',
    no: 5,
    title: '傘の人',
    place: '月影荘 門のポーチ',
    summary: '関係のない影は、壁の外へ追い出す。',
    intro: '最後の夜、主人の金庫が空になった。家政婦の佐伯は、門の白壁に、傘をさした人影を見たという。',
    witness: { person: 'saeki', quote: '雨の中、傘をさした人が、白い壁に立っていました。長い外套に、長靴で。顔は見えませんでした。' },
    sceneNote: 'ポーチには、開いた傘、長い外套、長靴がある。山高帽と地球儀も置かれているが、人影に関係があるとは限らない。',
    footprint: 'ポーチの床に、足跡が一組。壁から300cm、壁の左端から120cmの位置にある。',
    guide: 'off',
    coach: '関係ない道具の影は、壁の端へ追い出そう。',
    hints: [
      '人影に関係のない道具の影は、壁の左右の端へ追い出そう。',
      '傘・外套・長靴の上下のつながりは、灯りの高さで決まる。そのあと、横をそろえよう。',
    ],
    deductionHint: '灯り108cmに合う身長の人が、2人いる。アリバイが確かなほうを外そう。',
    stool: 0,
    stage: {
      distance: 300,
      lamp: { x: 120, ...LAMP_RANGE, start: 50, solution: 108 },
      props: [
        { id: 'umbrella', shape: 'umbrellaOpen', label: '傘', scale: 0.474, z: 142, y: 128, x: slide(40, 120) },
        { id: 'coat', shape: 'longCoat', label: '長い外套', scale: 0.52, z: 100, y: 92.5, x: slide(200, 120) },
        { id: 'boots', shape: 'boots', label: '長靴', scale: 0.64, z: 60, y: 34.5, x: slide(80, 120) },
        { id: 'bowler', shape: 'bowler', label: '山高帽', scale: 0.45, z: 150, y: 118, decoy: true, x: slide(140, 10) },
        { id: 'globe', shape: 'globe', label: '地球儀', scale: 0.531, z: 112.5, y: 78, decoy: true, x: slide(100, 230) },
      ],
      threshold: { union: 0.84, part: 0.6, decoyArea: 0.05, near: 0.7, warm: 0.5 },
    },
    clues: [
      { id: 'rule', kind: 'rule', text: '灯りは、胸の高さに提げる。月影荘の決まりで、高さは身長のちょうど6割。' },
      { id: 'alibi', kind: 'alibi', text: '白瀬は、雨の夕方から主人の送迎で車を出していた。同乗した客が、それを覚えている。', rulesOut: ['shirase'] },
    ],
    suspects: [
      { id: 'shirase', statement: '車で、お客さんを送っていました。' },
      { id: 'hiiragi', statement: '納屋で、棚の修理をしていました。' },
      { id: 'hasumi', statement: '配達の帰りに、門のそばを通っただけです。' },
    ],
    culprit: 'hiiragi',
    reveal: '傘の人は、開いた傘・長い外套・長靴の影だった。山高帽と地球儀は関係ない。灯りは108cm。',
    closing: '108cmは、身長180cmの人が提げる灯り。同じ180cmの白瀬には、客を乗せた車の記録がある。蓮見の188cmなら約113cmで、5cm高い。納屋にいたはずの柊が、門に立っていた。',
  },
]);

export const EPILOGUE = Object.freeze({
  title: '五つの夜が明けた',
  text: '五つの夜の人影は、どれも道具の影だった。影は嘘をつかない。嘘をつくのは、いつも人のほうだ。',
});

// 計算用の場面（道具に形を結びつけたもの）。
export function stageOf(caseDef) {
  const { stage } = caseDef;
  return {
    id: caseDef.id,
    distance: stage.distance,
    lamp: stage.lamp,
    threshold: stage.threshold ?? DEFAULT_THRESHOLD,
    props: stage.props.map((prop) => ({ ...prop, polygons: SHAPES[prop.shape] })),
  };
}
