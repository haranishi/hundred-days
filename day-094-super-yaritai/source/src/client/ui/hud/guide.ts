/**
 * HUD の案内に使う、DOM を使わない小さな決まり（試験できるように切り出した）。
 * - 見つかった知らせを出す画面の端（C3）
 * - 補充・積み直し・並び直しの待ち時間の文言（C4）
 * - 一覧の項目を文節で折る区切り（C7）
 */
import type { MisdeedId } from '../../../shared/rules/misdeeds';
import type { StationsView } from '../../../shared/view';

export type Edge = 'left' | 'right' | 'top' | 'bottom';

/**
 * from（自分の画面の位置）から見て to（店員の画面の位置）がある側の、画面の端。
 * to がカメラの後ろ（visible=false）なら、写った位置は反対になるので向きを返す
 */
export function edgeToward(from: { x: number; y: number }, to: { x: number; y: number; visible: boolean }, w: number, h: number): Edge {
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  if (!to.visible) {
    dx = -dx;
    dy = -dy;
  }
  if (Math.abs(dx) / Math.max(1, w) >= Math.abs(dy) / Math.max(1, h)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'top' : 'bottom';
}

/**
 * 元に戻るまで待っている悪事と、その文言（「補充まで14秒」など）。待っていなければ出さない。
 * スイカは、ピンの並び直しとワゴンの補充のどちらか（並び直しを先に出す）
 */
export function waitTexts(st: StationsView | null | undefined): Partial<Record<MisdeedId, string>> {
  const out: Partial<Record<MisdeedId, string>> = {};
  if (!st) return out;
  const sec = (s: number): number => Math.max(1, Math.ceil(s));
  if (st.samples.left <= 0 && st.samples.refillIn > 0) out.samples = `補充まで${sec(st.samples.refillIn)}秒`;
  if (st.pyramid.collapsed) out.pyramid = st.pyramid.rebuildIn > 0 ? `積み直しまで${sec(st.pyramid.rebuildIn)}秒` : '積み直し中';
  if (st.bowling.pinsDown > 0 && st.bowling.resetIn > 0) out.bowling = `並び直しまで${sec(st.bowling.resetIn)}秒`;
  else if (st.watermelons.left <= 0 && st.watermelons.refillIn > 0) out.bowling = `スイカ補充まで${sec(st.watermelons.refillIn)}秒`;
  return out;
}

/**
 * 一覧の項目名を文節で区切った形（<wbr> を入れる所）。1文字だけ次の行に落ちないよう、
 * CSS の word-break: keep-all と組み合わせ、ここで区切った所でだけ折る
 */
const PHRASES: Record<MisdeedId, readonly string[]> = {
  bell: ['呼び出しベルを', '連打する'],
  sweep: ['棚の商品を', 'なぎ払う'],
  cart: ['カートで', '爆走する'],
  pyramid: ['缶ピラミッドを', '崩す'],
  bowling: ['スイカで', 'ボウリング'],
  samples: ['試食を', '食べ尽くす'],
  freezer: ['冷凍ケースで', '涼む'],
  tantrum: ['お菓子売り場で', '駄々をこねる'],
  banana: ['バナナの皮を', '仕掛ける'],
  pa: ['店内放送を', 'ジャックする'],
};

export function misdeedPhrases(id: MisdeedId, name: string): readonly string[] {
  const p = PHRASES[id];
  // 名前が変わったときは、区切らずにそのまま（区切りがずれて字が消えないように）
  return p && p.join('') === name ? p : [name];
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * 店員の吹き出し（下の真ん中が (x, y)、幅 w・高さ h）が HUD の札（点の欄・残り時間・一覧など）に重なるなら、
 * その札のすぐ下へずらした y を返す。重ならなければ y のまま（round4 の F5）
 */
export function bubbleY(x: number, y: number, w: number, h: number, rects: readonly Rect[]): number {
  let ny = y;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const r of rects) {
      if (x + w / 2 > r.left && x - w / 2 < r.right && ny > r.top && ny - h < r.bottom) {
        ny = r.bottom + h + 4;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return ny;
}
