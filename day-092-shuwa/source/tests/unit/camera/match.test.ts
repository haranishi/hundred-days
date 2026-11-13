import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../../src/content';
import { CLASSIFICATION_MARGIN, features, FINGERS, stableFinger, THRESHOLDS, type HandFeatures } from '../../../src/camera/features';
import { createTarget, match, TOLERANCE, type FeatureKey, type Target } from '../../../src/camera/match';
import type { FingerName, HandshapeSpec, Vec3 } from '../../../src/hand/types';
import { forward, item, noise, open, points, rotate } from './fixtures';

const staticItems = ITEMS.filter(i => !i.dynamic);
// 現行特徴は指の交差を測れないため、らとうの差を保証できない。
// 実装の結果から期待値を生成せず、対象外の増減をこの一覧で検知する。
const expectedUnsupported = { 'kana-ra': 'ら：うとの違いである指の交差をカメラの特徴で測れない' };
const supportedItems = staticItems.filter(i => createTarget(i).status === 'supported');

describe('全収録静止形と混同形', () => {
  it('収録済みの全静止形に検査を適用する（空の試験にしない）', () => expect(staticItems.length).toBeGreaterThan(0));
  it('静止形の対象外一覧が、理由つきの想定と同じ', () => {
    expect(staticItems.filter(i => createTarget(i).status === 'unsupported').map(i => i.id).sort()).toEqual(Object.keys(expectedUnsupported).sort());
    expect(supportedItems.length + Object.keys(expectedUnsupported).length).toBe(staticItems.length);
  });
  for (const i of supportedItems) describe(`${i.id}（${i.label}）`, () => {
    for (const hand of ['right', 'left'] as const) {
      it(`${hand}: 自分自身と一致し、宣言された混同形とは一致しない`, () => {
        const target = createTarget(i);
        expect(target.status, target.status === 'unsupported' ? target.reason : '').toBe('supported');
        expect(match(target, features(points(i, hand), hand)).status).toBe('matched');
        for (const conf of i.confusables ?? []) {
          const other = ITEMS.find(candidate => candidate.id === conf.id)!;
          expect(other).toBeDefined();
          // 動く混同形とは動きで区別する（カメラは止まった形だけを見る）。形の比べ合いからは外す方針
          if (other.dynamic) continue;
          expect(match(target, features(points(other, hand), hand)).status, `${i.id} / ${other.id}`).not.toBe('matched');
        }
      });
      it(`${hand}: ±2%の独立ノイズ200通りでも自分自身と一致`, () => {
        const target = createTarget(i), ps = points(i, hand);
        for (let seed = 1; seed <= 200; seed++) {
          expect(match(target, features(noise(ps, seed), hand)).status, `seed=${seed}`).toBe('matched');
        }
        // ノイズ幅の端（±0.02）にも寄せ、平均付近の試行だけで判定しない。
        for (let seed = 1; seed <= 32; seed++) {
          const corners = noise(ps, seed).map((p, j) => p.map((v, k) => ps[j]![k]! + Math.sign(v - ps[j]![k]!) * 0.02) as Vec3);
          expect(match(target, features(corners, hand)).status, `corner=${seed}`).toBe('matched');
        }
      });
      it(`${hand}: 手首中心にX/Y/Zそれぞれ±10度回しても一致`, () => {
        const target = createTarget(i), ps = points(i, hand);
        for (const axis of [0, 1, 2] as const) for (const degree of [-10, 10]) {
          expect(match(target, features(rotate(ps, axis, degree), hand)).status).toBe('matched');
        }
      });
    }
  });
});

describe('必須特徴とヒント', () => {
  // 全形を相互に混同形とする総当たりは行わない。交差・指の開きなど、
  // 現行特徴で測れない差があり、教材に宣言された混同形との区別を上で検証する。
  it('安定性の基準は既存の関節・親指の許容幅25度を確保する', () => {
    expect(CLASSIFICATION_MARGIN).toBe(25);
    expect(CLASSIFICATION_MARGIN).toBe(TOLERANCE.joint);
    expect(CLASSIFICATION_MARGIN).toBe(TOLERANCE.thumbFlex);
  });

  it.each([
    [10, 0, true], [10.01, 0, false], [85, 98, true], [84.99, 98, false],
    [0, 10, true], [0, 10.01, false], [86, 85, true], [86, 84.99, false],
    [35, 45, false], [0, 92, true], [88, 0, true],
  ] as const)('関節(%s, %s)の境界からの余裕：必須にできる=%s', (mcp, pip, expected) => {
    // extended境界35°から25°下=10°、curled境界60°から25°上=85°。
    // MCP/PIPの両方を確かめ、境界に近い浅い曲がりを除く。
    expect(stableFinger({ mcp, pip, state: 'bent' })).toBe(expected);
  });

  it('浅い曲がりは必須から外し、大きな違いだけを案内する', () => {
    const goal = item('half', { ...open, fingers: { ...open.fingers, index: 'half' } });
    const target = createTarget(goal);
    expect(target.status).toBe('supported');
    if (target.status !== 'supported') throw new Error('向きなどの安定した特徴で判定できます');
    expect(target.required).not.toContain('index');
    const actual = features(points(goal))!;
    actual.fingers.index.pip += 40;
    expect(match(target, actual).status).toBe('matched');
    actual.fingers.index.pip += 20;
    expect(match(target, actual)).toMatchObject({ status: 'hint', feature: 'index' });
  });

  it('ほの親指63.6度は境界65度に近いため必須にしない', () => {
    const goal = staticItems.find(i => i.id === 'kana-ho')!;
    const target = createTarget(goal);
    expect(target.status).toBe('supported');
    if (target.status !== 'supported') throw new Error('ほは他の安定した特徴で区別できます');
    expect(target.expected.thumb.flex).toBeCloseTo(63.6, 1);
    expect(Math.abs(target.expected.thumb.flex - THRESHOLDS.thumbFlex)).toBeLessThan(CLASSIFICATION_MARGIN);
    expect(target.required).not.toContain('thumbExtended');
    for (const flex of [10, 130]) {
      const actual = structuredClone(target.expected);
      actual.thumb.flex = flex; actual.thumb.extended = flex <= THRESHOLDS.thumbFlex;
      expect(match(target, actual).status).toBe('matched');
    }
  });
  it('混同形との差のある特徴だけを自動選択し、右手/左手どちらも拒否する', () => {
    const a = item('a'), b = item('b', { ...open, fingers: { ...open.fingers, middle: 'curled' } });
    a.confusables = [{ id: 'b', tip: '' }]; b.confusables = [{ id: 'a', tip: '' }];
    for (const [goal, other] of [[a, b], [b, a]] as const) {
      const target = createTarget(goal, [a, b]);
      expect(target.status).toBe('supported');
      if (target.status !== 'supported') return;
      expect(target.required).toContain('middle');
      expect(target.required).not.toContain('palm');
      expect(target.required).not.toContain('index');
      for (const hand of ['right', 'left'] as const) {
        expect(match(target, features(points(goal, hand), hand)).status).toBe('matched');
        expect(match(target, features(points(other, hand), hand))).toMatchObject({ status: 'hint', feature: 'middle' });
        for (let seed = 1; seed <= 50; seed++) expect(match(target, features(noise(points(goal, hand), seed), hand)).status).toBe('matched');
      }
    }
  });

  it('空の必須特徴で、どんな手でも成功することを防ぐ', () => {
    const goal = item('goal');
    const target = createTarget(goal);
    expect(target.status === 'supported' && target.required.length).toBeGreaterThan(0);
    const fist: HandshapeSpec = { ...open, fingers: { index: 'curled', middle: 'curled', ring: 'curled', pinky: 'curled' } };
    expect(match(target, features(points(item('fist', fist)))).status).toBe('hint');
  });

  it('向き→指の状態→親指の順でヒントを1つ返す', () => {
    const goal = item('goal'), target = createTarget(goal);
    const changed = item('changed', { ...open, fingers: { ...open.fingers, index: 'curled', middle: 'curled' } }, { palm: 'toSigner', fingers: 'down' });
    expect(match(target, features(points(changed)))).toMatchObject({ status: 'hint', hint: '手のひらをカメラに向けましょう' });
    changed.sign.hands.dominant.keyframes[0]!.orient = { palm: 'toViewer', fingers: 'down' };
    expect(match(target, features(points(changed)))).toMatchObject({ hint: '指先を上に向けましょう' });
    changed.sign.hands.dominant.keyframes[0]!.orient = forward;
    expect(match(target, features(points(changed)))).toMatchObject({ hint: '人差し指をまっすぐ伸ばしましょう' });
  });

  it.each(FINGERS)('%sの名前と曲げ方を案内する', f => {
    const names: Record<FingerName, string> = { index: '人差し指', middle: '中指', ring: '薬指', pinky: '小指' };
    const curled = item('curled', { ...open, fingers: { ...open.fingers, [f]: 'curled' } });
    expect(match(createTarget(curled), features(points(item('open'))))).toMatchObject({ hint: `${names[f]}を握りましょう` });
    const bent = item('bent', { ...open, fingers: { ...open.fingers, [f]: 'bentMcp' } });
    expect(match(createTarget(bent), features(points(item('open'))))).toMatchObject({ hint: `${names[f]}の付け根を曲げましょう` });
  });

  function isolated(key: FeatureKey, change: (f: HandFeatures) => void, expectedChange?: (f: HandFeatures) => void) {
    const expected = features(points(item('goal')))!;
    expectedChange?.(expected);
    const actual = structuredClone(expected); change(actual);
    const target: Target = { status: 'supported', expected, required: [key] };
    return match(target, actual);
  }
  it('指の3分類が同じbentでも、付け根と第2関節の曲げ方を取り違えない', () => {
    expect(isolated('index', a => { a.fingers.index = { state: 'bent', mcp: 0, pip: 92 }; },
      e => { e.fingers.index = { state: 'bent', mcp: 88, pip: 0 }; })).toMatchObject({ status: 'hint', feature: 'index' });
  });
  it('親指の接触・前後・伸びを具体的な文で案内する', () => {
    expect(isolated('thumbDistance:index', a => { a.thumb.distances.index = 0.8; }, e => { e.thumb.distances.index = 0.05; })).toMatchObject({ hint: '親指の先を人差し指の先につけましょう' });
    expect(isolated('thumbDepth', a => { a.thumb.depth = -0.5; }, e => { e.thumb.depth = 0.5; })).toMatchObject({ hint: '親指を握った指の前に出しましょう' });
    expect(isolated('thumbExtended', a => { a.thumb.flex = 130; a.thumb.extended = false; })).toMatchObject({ hint: '親指をまっすぐ伸ばしましょう' });
  });

  it('手が無い時はヒントを固定し、成功にしない', () => expect(match(createTarget(item('goal')), null)).toEqual({ status: 'no-hand', hint: '手をカメラに写してください' }));
});

describe('判定の対象外', () => {
  it('収録済みの動く形は全て対象外にする', () => {
    for (const i of ITEMS.filter(i => i.dynamic)) expect(createTarget(i).status).toBe('unsupported');
    const dynamic = { ...item('dynamic'), dynamic: true };
    expect(match(createTarget(dynamic), features(points(item('open'))))).toMatchObject({ status: 'unsupported', reason: expect.stringContaining('判定の対象外') });
  });
  it('同じ特徴の混同形や参照先がない場合は対象外にする', () => {
    const a = item('a'), b = item('b'); a.confusables = [{ id: 'b', tip: '' }];
    expect(createTarget(a, [a, b]).status).toBe('unsupported');
    expect(createTarget(a, [a]).status).toBe('unsupported');
    // 混同形が動く形だけなら、形の比べ合いから外す（動きで区別できる）。判定の条件は空にせず、安定した特徴すべてで判定する
    b.dynamic = true; const onlyDynamic = createTarget(a, [a, b]);
    expect(onlyDynamic.status).toBe('supported');
    if (onlyDynamic.status === 'supported') expect(onlyDynamic.required.length).toBeGreaterThan(0);
  });
  it('両手・軌跡・複数キーフレーム・不足する/無効な形は対象外にする', () => {
    const a = item('a'); a.sign.hands.nonDominant = a.sign.hands.dominant;
    expect(createTarget(a).status).toBe('unsupported');
    const b = item('b'); b.sign.trace = { points: [[0, 0, 0]], tStart: 0, tEnd: 1 };
    expect(createTarget(b).status).toBe('unsupported');
    const c = item('c'); c.sign.hands.dominant.keyframes.push({ t: 1 });
    expect(createTarget(c).status).toBe('unsupported');
    const d = item('d'); delete d.sign.hands.dominant.keyframes[0]!.shape;
    expect(createTarget(d).status).toBe('unsupported');
    const e = item('e', { ...open, adjust: { index: { mcp: NaN } } });
    expect(createTarget(e).status).toBe('unsupported');
  });
});
