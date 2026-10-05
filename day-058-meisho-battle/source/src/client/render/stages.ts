// 組み立ての進み具合 p（0〜1）の配分。docs/03「手がかりの出る順」と同じ境目を、ここ1か所に置く。
// 時間の長さ（BUILD_MS）は src/shared/config.ts が正本。ここでは読むだけ。
import { BUILD_MS } from '../../shared/config'

/** 部品の段階。1〜3 は白い粘土、4 は最初から色つき（docs/04） */
export type StageNo = 1 | 2 | 3 | 4

/** 台座だけを見せる区間の終わり（0〜0.05 は台座だけ） */
export const PEDESTAL_END = 0.05

/** 各段階の部品が落ちてくる区間 [始まり, 終わり]。終わりの時点で、その段階の部品は全部止まっている */
export const STAGE_RANGES: Readonly<Record<StageNo, readonly [number, number]>> = {
  1: [0.05, 0.4],
  2: [0.4, 0.62],
  3: [0.62, 0.72],
  4: [0.8, 1.0],
}

/** 色塗りの区間。白い部品と地面が、本当の色へ変わる */
export const PAINT_START = 0.72
export const PAINT_END = 0.8

/** 部品が落ちて止まるまでの長さ（秒）と、それを p に直した値 */
export const FALL_SECONDS = 0.35
export const FALL_P = FALL_SECONDS / (BUILD_MS / 1000)

/** 落ちる動きのうち、何割の時点で地面に触れるか。着地の知らせはこの瞬間に出す。残りは小さな跳ね */
export const CONTACT_AT = 0.7

/** 部品が落ち始める高さ（台座の単位。台座の半径は5） */
export const DROP_HEIGHT = 1.8

/** 跳ねの高さ（台座の単位） */
export const BOUNCE_HEIGHT = 0.12

/** 同じ段階の中で「下から上へ」を決めるときの高さの刻み。この刻みの中では中心に近い部品が先 */
export const HEIGHT_BAND = 0.3
