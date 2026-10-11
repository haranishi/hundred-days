/* 第1・第2現場の「周ごとの変化」。同じ座標を押すだけで解けないよう、文言と配置を周ごとに変える。
   どれを出すかは乱数を引数で受け取る純粋関数で決める（テストで乱数を差し替えて確かめられるように）。
   直前に出した変種は続けて選ばないので、同じページでやり直すたびに必ずどこかが変わる。 */

// 第1現場の拒否リンク。辱める調子は残すが、侮辱語・差別的な言葉は使わない（自分を下げる言い回しだけ）
export const REJECT_TEXTS = [
  "いいえ、私は損をするのが大好きなので、定価のまま無駄なお金を払い続けます",
  "いいえ、お得な情報は要りません。賢い買い物には興味がないので",
  "いいえ、割引を捨てて、わざわざ高い買い物をする道を選びます",
  "けっこうです。せっかくの特典は見逃して、あとから悔やむ方を選びます"
];

// 拒否リンクの置き場所。bottom＝推奨ボタンの下／top＝ポップアップの最上部／middle＝推奨ボタンの上
export const STAGE1_LAYOUTS = ["bottom", "top", "middle"];

// 第2現場の、安全な契約へ切り替えるチェックの文言（月額料金を差し込む）
export const SAFE_PLAN_TEXTS = [
  (monthly) => `解約方法を「Webから1クリック解約（月額${monthly}）」に変更する`,
  (monthly) => `電話ではなく、Webでいつでも解約できる月額プラン（${monthly}/月）にする`,
  (monthly) => `年額の自動更新をやめて、月額${monthly}のプランで始める`
];

/* 第2現場の配置。note＝危険な注記の置き場所（accordion＝折りたたみの中／below＝開始ボタン直下の極小注記）、
   check＝チェックボックスを文言の左右どちらに置くか。押す座標が変わる組み合わせを1つの変種として数える */
export const STAGE2_POSITIONS = [
  { note: "accordion", check: "right" },
  { note: "accordion", check: "left" },
  { note: "below", check: "right" },
  { note: "below", check: "left" }
];

/* 0〜count-1 から1つ選ぶ。previous が有効な番号なら、それを除いた残りから等確率で選ぶ。
   random は [0, 1) を返す関数（既定は Math.random） */
export function pickVariant(count, previous = -1, random = Math.random) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`count must be a positive integer: ${count}`);
  if (count === 1) return 0;
  const hasPrevious = Number.isInteger(previous) && previous >= 0 && previous < count;
  const pool = hasPrevious ? count - 1 : count;
  const value = Number(random());
  const ratio = Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.999999) : 0;
  let index = Math.floor(ratio * pool);
  if (hasPrevious && index >= previous) index += 1;
  return index;
}

export function nextStage1Variant(previous = {}, random = Math.random) {
  return {
    text: pickVariant(REJECT_TEXTS.length, previous.text, random),
    layout: pickVariant(STAGE1_LAYOUTS.length, previous.layout, random)
  };
}

export function nextStage2Variant(previous = {}, random = Math.random) {
  return {
    text: pickVariant(SAFE_PLAN_TEXTS.length, previous.text, random),
    position: pickVariant(STAGE2_POSITIONS.length, previous.position, random)
  };
}

/* 第1現場の逃げる×の行き先（元の位置からのずれ、px）。左へ滑るだけにして、ポップアップの上端の余白
   （×の居場所）から出さない。左右の2つの帯を交互に使い、前の位置から必ず12px以上動かす */
export const DODGE_FAR = [-72, -44]; // 左の帯
export const DODGE_NEAR = [-32, -4]; // 右の帯（元の位置寄り）
export const DODGE_Y = 3; // 上下は±3pxまで

export function dodgeOffset(random = Math.random, previousX = 0) {
  const unit = () => {
    const value = Number(random());
    return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
  };
  // 今いるのが右の帯（または元の位置）なら左の帯へ、左の帯なら右の帯へ
  const [from, to] = previousX >= DODGE_NEAR[0] ? DODGE_FAR : DODGE_NEAR;
  const x = Math.round(from + unit() * (to - from));
  const y = Math.round((unit() * 2 - 1) * DODGE_Y);
  return { x, y: y === 0 ? 0 : y };
}
