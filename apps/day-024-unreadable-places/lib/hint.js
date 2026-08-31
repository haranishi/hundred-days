/* ヒントの段階開示と得点。このアプリの設計の核はここにある。

   読みを隠すと、読めない人は1文字も打てずに終わる。Day018で実測した
   「遅い人ほど消える寸前の皿に縛られ続ける死のループ」と同じ構造なので、
   同じ手当てをする。近づくにつれて読みが1文字ずつ開き、待てば誰でも打てる。

   ただし待つのが最適戦略になってはいけない。そこで
   ①開き切るのは着弾の手前（残りは打ち切るのにギリギリの時間しかない）
   ②得点は開いた文字数が少ないほど高い
   の2つで、「知っているほど強い」を担保する。 */

/** 開示が始まるまでの、考えるための時間 */
export const GRACE_MS = 900;

/** 開き切ってから打ち切るために残す時間（かな1文字あたり）。毎秒4.5打の想定 */
export const PER_KANA_TAIL_MS = 220;

/** 開き切ってもこれだけは点が入る。0にすると開き切ったあと打つ意味が消える */
export const FLOOR_RATIO = 0.2;

export function tailMs(kanaLength) {
  return kanaLength * PER_KANA_TAIL_MS;
}

/**
 * 経過時間から、いま何文字ぶん開いているかを出す。
 * 開き切る時刻は「着弾 − tail」。travelMs が短くて枠に収まらないときは比率で押し込む。
 */
export function revealedCount({ elapsed, travelMs, kanaLength }) {
  if (kanaLength <= 0) return 0;
  const tail = Math.min(tailMs(kanaLength), travelMs * 0.5);
  const start = Math.min(GRACE_MS, travelMs * 0.2);
  const span = Math.max(1, travelMs - tail - start);
  const t = (elapsed - start) / span;
  if (t <= 0) return 0;
  if (t >= 1) return kanaLength;
  return Math.min(kanaLength, Math.floor(t * kanaLength));
}

/** 開示ぶんを伏せ字に置き換えた表示用の文字列 */
export function maskReading(kana, revealed, mask = '○') {
  return kana.slice(0, revealed) + mask.repeat(Math.max(0, kana.length - revealed));
}

/** 難読度（0〜1に正規化したもの）から満点を決める */
export function basePoints(difficulty) {
  const d = Math.min(1, Math.max(0, difficulty));
  return Math.round(100 + d * 400);
}

/** 実際に入る点。開いた文字数が少ないほど高い */
export function scoreFor({ base, revealed, kanaLength }) {
  if (kanaLength <= 0) return 0;
  const kept = 1 - Math.min(1, revealed / kanaLength);
  return Math.round(base * (FLOOR_RATIO + (1 - FLOOR_RATIO) * kept));
}
