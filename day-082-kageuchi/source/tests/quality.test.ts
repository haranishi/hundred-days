// OWNER: world-art
// 描画の段階と時刻つきの降下判定。短い停止や中断で段階を下げず、デスクトップの既定を保つことを確かめる。
import { describe, expect, it } from 'vitest';
import { MAX_PIXEL_RATIO } from '../src/art/render/config';
import { adaptiveAllowed, initialTier, QUALITY_TIERS, QualityGovernor } from '../src/art/render/quality';

describe('描画の段階', () => {
  it('4段の表と既存の標準値を保つ', () => {
    expect(QUALITY_TIERS.map((q) => [q.id, q.label, q.maxPixelRatio, q.ao])).toEqual([
      ['high', '標準', MAX_PIXEL_RATIO, true], ['mid', 'やや軽い', 1.25, false],
      ['low', '軽い', 1, false], ['min', '最軽量', 0.75, false],
    ]);
    expect(MAX_PIXEL_RATIO).toBe(1.5);
  });
  for (const touch of [false, true]) {
    it(`touch=${touch} の既定と無効な指定`, () => {
      for (const param of [null, '', 'unknown', 'HIGH', '0', '__proto__']) {
        expect(initialTier({ touch, param })).toEqual({ tier: touch ? 1 : 0, explicit: false });
      }
    });
    it(`touch=${touch} の明示指定は全段階で優先する`, () => {
      QUALITY_TIERS.forEach((q, tier) => {
        expect(initialTier({ touch, param: q.id })).toEqual({ tier, explicit: true });
      });
    });
    for (const explicit of [false, true]) for (const automation of [false, true]) for (const shotOrPerf of [false, true]) {
      it(`自動調整 touch=${touch}, explicit=${explicit}, automation=${automation}, shotOrPerf=${shotOrPerf}`, () => {
        expect(adaptiveAllowed({ touch, explicit, automation, shotOrPerf })).toBe(touch && !explicit && !automation && !shotOrPerf);
      });
    }
  }
});

/** count コマを送る。コマの間隔は frameMs と同じ（実際のコマの並びに近い）。戻り値には段階が変わった時刻も残す。 */
function feed(g: QualityGovernor, from: number, count: number, frameMs: number): { tier: number; at: number }[] {
  const changes: { tier: number; at: number }[] = [];
  for (let i = 0; i < count; i++) {
    const at = from + i * frameMs;
    const tier = g.sample(frameMs, at);
    if (tier !== null) changes.push({ tier, at });
  }
  return changes;
}

/** 時刻の間隔 dt と、コマの長さの並び frames を別々に与える（窓の中の割合を作り込む試験用）。 */
function feedSeq(g: QualityGovernor, from: number, frames: number[], dt: number): { tier: number; at: number }[] {
  const changes: { tier: number; at: number }[] = [];
  frames.forEach((ms, i) => {
    const at = from + i * dt;
    const tier = g.sample(ms, at);
    if (tier !== null) changes.push({ tier, at });
  });
  return changes;
}

/** 最初の判断が起きる時刻：窓に 1.5 秒ぶん（minSpanMs）たまった最初のコマ。 */
const firstDecision = (from: number, frameMs: number): number => from + Math.ceil(1500 / frameMs) * frameMs;

describe('QualityGovernor', () => {
  it('準備完了の start 前は判断しない', () => {
    expect(feed(new QualityGovernor(), 10000, 200, 40)).toEqual([]);
  });
  it('速いコマだけなら下げない', () => {
    const g = new QualityGovernor();
    g.start(0, 0);
    expect(feed(g, 0, 500, 16)).toEqual([]);
    expect(g.tier).toBe(0);
  });
  it('30fps ちょうど（33.3ms）が続いても下げない', () => {
    const g = new QualityGovernor();
    g.start(0, 0);
    expect(feed(g, 3000, 300, 33.3)).toEqual([]);
  });
  it('250ms超の外れ値1回では下げない', () => {
    const g = new QualityGovernor();
    g.start(1, 0);
    feed(g, 3000, 100, 16);
    expect(g.sample(1000, 4700)).toBeNull();
    expect(feed(g, 4716, 200, 16)).toEqual([]);
    expect(g.tier).toBe(1);
  });
  it('起動3秒は窓に数えず、その後 1.5 秒ぶん遅ければ 1 段だけ下げる', () => {
    const g = new QualityGovernor();
    g.start(0, 10000);
    expect(feed(g, 10000, 74, 40)).toEqual([]); // 10000〜12920：数えない
    const at = firstDecision(13000, 40);
    expect(feed(g, 13000, 60, 40)).toEqual([{ tier: 1, at }]); // 次の降下は 4 秒後なので、ここまでは 1 段だけ
    expect(g.tier).toBe(1);
  });
  it('15fps（66ms）でも下げる（コマ数ではなく時間で見る）', () => {
    const g = new QualityGovernor();
    g.start(0, 0);
    const changes = feed(g, 3000, 60, 66);
    expect(changes[0]).toEqual({ tier: 1, at: firstDecision(3000, 66) });
  });
  it('4fps（250ms）でも下げる', () => {
    const g = new QualityGovernor();
    g.start(0, 0);
    expect(feed(g, 3000, 20, 250)[0]).toEqual({ tier: 1, at: firstDecision(3000, 250) });
  });
  it('250ms超が窓の中に4回続けば、止まり続けているとして下げる', () => {
    const g = new QualityGovernor();
    g.start(0, 0);
    expect(g.sample(400, 3000)).toBeNull();
    expect(g.sample(400, 3400)).toBeNull();
    expect(g.sample(400, 3800)).toBeNull();
    expect(g.sample(400, 4200)).toBe(1);
  });
  it('250ms超が窓の外に散らばっているだけなら下げない', () => {
    const g = new QualityGovernor();
    g.start(0, 0);
    for (let i = 0; i < 6; i++) expect(g.sample(900, 3000 + i * 2500)).toBeNull();
    expect(g.tier).toBe(0);
  });
  it('下げた直後の4秒は待ち、4秒後に遅いならもう1段下げる', () => {
    const g = new QualityGovernor();
    g.start(0, 0);
    const at1 = firstDecision(3000, 40);
    const changes = feed(g, 3000, 180, 40); // 3000〜10160：3 段目（at1+8000）の手前まで
    expect(changes).toEqual([{ tier: 1, at: at1 }, { tier: 2, at: at1 + 4000 }]);
  });
  it('速くなっても上げず、古い遅いコマを窓から外す', () => {
    const g = new QualityGovernor();
    g.start(0, 0);
    feed(g, 3000, 60, 40);
    expect(g.tier).toBe(1);
    expect(feed(g, 6000, 400, 16)).toEqual([]);
    expect(g.tier).toBe(1);
  });
  it('最下段3で止まる', () => {
    const g = new QualityGovernor();
    g.start(2, 0);
    expect(feed(g, 3000, 600, 40).map((c) => c.tier)).toEqual([3]);
    expect(g.tier).toBe(3);
  });
  it('指定した floorTier で止まる', () => {
    const g = new QualityGovernor({ floorTier: 2 });
    g.start(1, 0);
    expect(feed(g, 3000, 600, 40).map((c) => c.tier)).toEqual([2]);
  });
  it('中断で窓を空にし、その後1.5秒は窓に数えない', () => {
    const g = new QualityGovernor();
    g.start(0, 0);
    feed(g, 3000, 30, 40); // 窓にたまりかけ（まだ 1.5 秒に届かない）
    g.discontinuity(4200);
    expect(feed(g, 4200, 37, 40)).toEqual([]); // 4200〜5640：待ち（warmup の半分=1.5 秒）に当たる
    const resumed = 4200 + 1500; // 5700 から数え始める
    expect(feed(g, resumed, 200, 40)[0]).toEqual({ tier: 1, at: firstDecision(resumed, 40) });
  });
  it('中断が窓の遅いコマを消す：中断の前後をまたいで 1.5 秒に数えない', () => {
    const g = new QualityGovernor();
    g.start(0, 0);
    feed(g, 3000, 30, 40);
    g.discontinuity(4200);
    expect(g.sample(40, 5800)).toBeNull();
  });
  it('起動直後の中断で起動3秒の待ちを短くしない', () => {
    const g = new QualityGovernor();
    g.start(0, 0);
    g.discontinuity(100);
    expect(feed(g, 100, 72, 40)).toEqual([]); // 100〜2940
    expect(feed(g, 3000, 200, 40)[0]).toEqual({ tier: 1, at: firstDecision(3000, 40) });
  });
  it('中断で4秒の降下間隔を短くしない', () => {
    const g = new QualityGovernor();
    g.start(0, 0);
    const at1 = firstDecision(3000, 40);
    feed(g, 3000, 40, 40);
    expect(g.tier).toBe(1);
    g.discontinuity(at1 + 100);
    expect(feed(g, at1 + 1600, 40, 40)).toEqual([]);
    expect(feed(g, at1 + 3200, 40, 40)[0]).toEqual({ tier: 2, at: at1 + 4000 });
  });
  it('nearest-rank の90%点：100個のうち 90 番目が 34ms なら下げない、35ms なら下げる', () => {
    const seq = (slow: number): number[] => [...Array(100 - slow).fill(16), ...Array(slow).fill(35)];
    const a = new QualityGovernor({ warmupMs: 0 });
    a.start(0, 0);
    // 10 個が 35ms（90 番目は 16ms）→ 下げない
    expect(feedSeq(a, 0, seq(10), 16)).toEqual([]);
    const b = new QualityGovernor({ warmupMs: 0 });
    b.start(0, 0);
    // 11 個が 35ms（90 番目は 35ms）→ 下げる
    expect(feedSeq(b, 0, seq(11), 16).map((c) => c.tier)).toEqual([1]);
  });
  it('34ms ちょうどは下げない', () => {
    const g = new QualityGovernor({ warmupMs: 0 });
    g.start(0, 0);
    expect(feedSeq(g, 0, Array(150).fill(34), 16)).toEqual([]);
  });
  it('250msちょうどは外れ値でなく窓に入り、251msは外れ値', () => {
    const g = new QualityGovernor({ warmupMs: 0, stallCount: 99 });
    g.start(0, 0);
    expect(feed(g, 0, 8, 250)[0]).toEqual({ tier: 1, at: firstDecision(0, 250) }); // 250ms は窓に入る
    const h = new QualityGovernor({ warmupMs: 0, stallCount: 99 });
    h.start(0, 0);
    expect(feed(h, 0, 20, 251)).toEqual([]); // 251ms は窓に入らず、stallCount も満たさない
  });
  it('時計の巻き戻りで窓を捨て、待った後は判定を再開する', () => {
    const g = new QualityGovernor();
    g.start(0, 0);
    feed(g, 3000, 30, 40);
    expect(() => g.sample(40, 1000)).not.toThrow();
    expect(feed(g, 1040, 30, 40)).toEqual([]);
    expect(feed(g, 2500, 100, 40).map((c) => c.tier)).toEqual([1]); // 巻き戻ったあとも、待ちを経て 1 段下げる
    expect(() => g.discontinuity(0)).not.toThrow();
  });
  it('start のやり直しは段階・窓・待ちを初期化する', () => {
    const g = new QualityGovernor();
    g.start(0, 0);
    feed(g, 3000, 60, 40);
    expect(g.tier).toBe(1);
    g.start(0, 10000);
    expect(g.tier).toBe(0);
    expect(feed(g, 10000, 74, 40)).toEqual([]);
    expect(feed(g, 13000, 200, 40)[0]).toEqual({ tier: 1, at: firstDecision(13000, 40) });
  });
});
