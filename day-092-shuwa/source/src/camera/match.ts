import { ITEMS } from '../content';
import type { SignItem } from '../content/types';
import { landmarks } from '../hand';
import type { FingerName } from '../hand/types';
import { angle, CLASSIFICATION_MARGIN, DIRECTIONS, features, FINGERS, stableFinger, THRESHOLDS, type Direction, type HandFeatures } from './features';

/** 合成21点に対する許容幅。回転10度、独立した座標ノイズ±0.02を許す。
 * 必須特徴は、この幅で混同形を拒否できるものだけを使う。 */
export const TOLERANCE = { orientation: 35, joint: 25, distance: 0.18, depth: 0.18, thumbFlex: 25 } as const;
export type FeatureKey = 'palm' | 'pointing' | FingerName | 'thumbExtended' | 'thumbDepth' | `thumbDistance:${FingerName}`;
const ALL: readonly FeatureKey[] = ['palm', 'pointing', ...FINGERS, 'thumbExtended', ...FINGERS.map(f => `thumbDistance:${f}` as const), 'thumbDepth'];
const NAMES: Record<FingerName, string> = { index: '人差し指', middle: '中指', ring: '薬指', pinky: '小指' };
export type Target =
  | { status: 'supported'; expected: HandFeatures; required: readonly FeatureKey[] }
  | { status: 'unsupported'; reason: string };
export type MatchResult =
  | { status: 'matched' }
  | { status: 'hint'; hint: string; feature: FeatureKey }
  | { status: 'no-hand'; hint: string }
  | { status: 'unsupported'; reason: string };

function stable(key: FeatureKey, expected: HandFeatures): boolean {
  if (key === 'thumbExtended') return Math.abs(expected.thumb.flex - THRESHOLDS.thumbFlex) >= CLASSIFICATION_MARGIN;
  if (FINGERS.includes(key as FingerName)) return stableFinger(expected.fingers[key as FingerName]);
  // 向き・距離・深さは連続値の比較で、分類の境界を使わない。
  return true;
}

function jointAgrees(expected: number, actual: number, extended: number, curled: number): boolean {
  if (expected <= extended) return actual <= extended + TOLERANCE.joint;
  if (expected >= curled) return actual >= curled - TOLERANCE.joint;
  return Math.abs(expected - actual) <= TOLERANCE.joint;
}

function agrees(key: FeatureKey, expected: HandFeatures, actual: HandFeatures): boolean {
  if (key === 'palm' || key === 'pointing') return angle(expected[key], actual[key]) <= TOLERANCE.orientation;
  if (key === 'thumbExtended') {
    return expected.thumb.extended ? actual.thumb.flex <= THRESHOLDS.thumbFlex + TOLERANCE.thumbFlex
      : actual.thumb.flex >= THRESHOLDS.thumbFlex - TOLERANCE.thumbFlex;
  }
  if (key === 'thumbDepth') return Math.abs(expected.thumb.depth - actual.thumb.depth) <= TOLERANCE.depth;
  if (key.startsWith('thumbDistance:')) {
    const f = key.slice('thumbDistance:'.length) as FingerName;
    return Math.abs(expected.thumb.distances[f] - actual.thumb.distances[f]) <= TOLERANCE.distance;
  }
  const f = key as FingerName, e = expected.fingers[f], a = actual.fingers[f];
  // 曲がり方を関節ごとに比べる。付け根だけ曲げる形と第2関節だけ曲げる形も区別する。
  // 目標の角度からの差ではなく、分類境界に既存の許容幅を持たせる。
  return jointAgrees(e.mcp, a.mcp, THRESHOLDS.extendedMcp, THRESHOLDS.curledMcp)
    && jointAgrees(e.pip, a.pip, THRESHOLDS.extendedPip, THRESHOLDS.curledPip);
}

function prototype(item: SignItem): HandFeatures | null {
  const frames = item.sign.hands.dominant.keyframes;
  if (item.dynamic || item.sign.trace || item.sign.hands.nonDominant || frames.length !== 1) return null;
  const frame = frames[0];
  if (!frame?.shape || !frame.orient) return null;
  try { return features(landmarks(frame.shape, frame.orient)); } catch { return null; }
}

/** confusablesは収録カタログから解決。カタログ引数は試験/追加教材にも使える。
 * 比較不能な混同形を黙って無視しない。特徴が同じ形も対象外にする。 */
export function createTarget(item: SignItem, catalog: readonly SignItem[] = ITEMS): Target {
  const unsupported = (why: string): Target => ({ status: 'unsupported', reason: `判定の対象外です。${why}` });
  const expected = prototype(item);
  if (!expected) return unsupported('この形は手本を見て、自分で確かめましょう。');
  const candidates = ALL.filter(key => stable(key, expected));
  const required = new Set<FeatureKey>();
  for (const confusable of item.confusables ?? []) {
    const other = catalog.find(i => i.id === confusable.id);
    if (!other) return unsupported('見間違えやすい形のデータを確認できません。');
    // 動く混同形（数字の10・100、指文字の を など）とは動きで区別できる。カメラは止まった形だけを見るので、比べる相手から外す。
    if (other.dynamic) continue;
    const otherFeatures = prototype(other);
    if (!otherFeatures) return unsupported('見間違えやすい形との違いを読み取れません。');
    const differences = candidates.filter(key => !agrees(key, expected, otherFeatures));
    if (differences.length === 0) return unsupported('見間違えやすい形との違いを読み取れません。');
    for (const key of differences) required.add(key);
  }
  // 混同形が未収録でも、何でも成功となる空の条件にはしない。
  if (required.size === 0) for (const key of candidates) required.add(key);
  const target: Target = { status: 'supported', expected, required: ALL.filter(key => required.has(key)) };
  if (match(target, expected).status !== 'matched') return unsupported('この形を安定して読み取れません。');
  return target;
}

const DIR_TEXT: Record<Direction, string> = {
  toViewer: 'カメラ', toSigner: '自分', up: '上', down: '下', viewerLeft: '相手から見て左', viewerRight: '相手から見て右',
};
function hint(key: FeatureKey, e: HandFeatures, a: HandFeatures): string {
  if (key === 'palm' || key === 'pointing') {
    const values = key === 'palm' ? e.palmAngles : e.pointingAngles;
    const dir = DIRECTIONS.reduce((best, d) => values[d] < values[best] ? d : best, 'toViewer');
    return `${key === 'palm' ? '手のひら' : '指先'}を${DIR_TEXT[dir]}に向けましょう`;
  }
  if (key === 'thumbExtended') return e.thumb.extended ? '親指をまっすぐ伸ばしましょう' : '親指を曲げましょう';
  if (key === 'thumbDepth') return e.thumb.depth > a.thumb.depth ? '親指を握った指の前に出しましょう' : '親指を握った指の後ろに入れましょう';
  if (key.startsWith('thumbDistance:')) {
    const f = key.slice('thumbDistance:'.length) as FingerName;
    if (e.thumb.distances[f] < 0.35) return `親指の先を${NAMES[f]}の先につけましょう`;
    return e.thumb.distances[f] < a.thumb.distances[f] ? `親指の先を${NAMES[f]}に近づけましょう` : `親指の先を${NAMES[f]}から離しましょう`;
  }
  const f = key as FingerName, expected = e.fingers[f];
  if (expected.state === 'extended') return `${NAMES[f]}をまっすぐ伸ばしましょう`;
  if (expected.state === 'curled') return `${NAMES[f]}を握りましょう`;
  return `${NAMES[f]}の${expected.mcp > expected.pip ? '付け根' : '第2関節'}を曲げましょう`;
}

/** 必須特徴以外は、向き70度/関節55度の大きな違いだけを案内する。
 * 必須かどうかにかかわらず、向き→人差し指〜小指→親指の順を守る。 */
export function match(target: Target, actual: HandFeatures | null): MatchResult {
  if (target.status === 'unsupported') return target;
  if (!actual) return { status: 'no-hand', hint: '手をカメラに写してください' };
  const e = target.expected;
  for (const key of ALL) {
    let ok = true;
    if (target.required.includes(key)) ok = agrees(key, e, actual);
    else if (key === 'palm' || key === 'pointing') ok = angle(e[key], actual[key]) <= 70;
    else if (FINGERS.includes(key as FingerName)) {
      const f = key as FingerName;
      ok = Math.abs(e.fingers[f].mcp - actual.fingers[f].mcp) <= 55 && Math.abs(e.fingers[f].pip - actual.fingers[f].pip) <= 55;
    }
    if (!ok) return { status: 'hint', hint: hint(key, e, actual), feature: key };
  }
  return { status: 'matched' };
}
