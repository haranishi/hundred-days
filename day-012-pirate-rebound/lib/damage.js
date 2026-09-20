/* 敵船の壊れ方。

   ドンピシャで打ち返した弾が「実際に敵船へ届いた回数」だけ進む。
   打った瞬間ではなく届いた瞬間に進めるのは、打つ→飛ぶ→当たる→崩れる、という
   因果を目で追えるようにするため。おしいの弾は失速して海に落ちるので、船には届かない。

   段は7つ。全部で31回打てるので、上手い人は最後の段まで見られて、
   そうでない人でも3〜4段目までは必ず見える配り方にしてある。 */

export const STAGES = [
  { at: 0, label: '無傷' },
  { at: 2, label: '帆が裂けた' },
  { at: 5, label: '上の帆が落ちた' },
  { at: 9, label: 'マストが折れた' },
  { at: 14, label: '帆をすべて失った' },
  { at: 20, label: '船体が傾いた' },
  { at: 27, label: '大破' }
];

/** 届いた回数 → 段。 */
export function stageOf(hits) {
  const count = Number.isFinite(hits) ? Math.max(0, Math.floor(hits)) : 0;
  let stage = 0;
  for (let index = 0; index < STAGES.length; index += 1) {
    if (count >= STAGES[index].at) stage = index;
  }
  return stage;
}

/** 段 → 見出しの言葉。 */
export function labelOf(stage) {
  const index = Math.max(0, Math.min(STAGES.length - 1, Math.floor(stage) || 0));
  return STAGES[index].label;
}

/** 次の段まであと何発か。0なら最後の段。 */
export function toNextStage(hits) {
  const count = Math.max(0, Math.floor(hits) || 0);
  const next = STAGES.find((one) => one.at > count);
  return next ? next.at - count : 0;
}
