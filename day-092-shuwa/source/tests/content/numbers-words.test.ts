import { describe, expect, it } from 'vitest';
import type { HandshapeSpec, SignSpec, Vec3 } from '../../src/hand/types';
import type { SignItem } from '../../src/content/types';
import { NUMBERS, NUMBER_SHAPES } from '../../src/content/numbers';
import { WORDS, WORD_SHAPES } from '../../src/content/words';
import { SOURCES_EXTRA } from '../../src/content/sources-extra';
import { getSource } from '../../src/content/sources';
import { BODY, armPoleFor, elbowPosition, locationAnchor } from '../../src/hand/core/body';
import { baseAngles } from '../../src/hand/core/framing';
import { computeLandmarks } from '../../src/hand/core/landmarks';
import { add, colX, colY, colZ, cross, dot, mulMV, normalize, segmentDistance, sub } from '../../src/hand/core/math';
import { orientationMatrix } from '../../src/hand/core/orient';
import { DIM, PALM_CENTER, contactGap, pointOf, skeleton } from '../../src/hand/core/skeleton';
import { compileSign, sampleSign, type HandState } from '../../src/hand/core/timeline';
import { stableStringify } from '../../src/hand/core/stable';

const ALL: SignItem[] = [...NUMBERS, ...WORDS];
const byId = new Map(ALL.map((i) => [i.id, i]));
const item = (id: string) => byId.get(id)!;

const NUMBER_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100, 1000].map((n) => `num-${n}`);
const WORD_IDS = [
  'ohayou', 'konnichiwa', 'konbanwa', 'arigatou', 'yoroshiku', 'gomennasai', 'sayounara', 'otsukaresama',
  'hajimemashite', 'namae', 'shuwa', 'wakaru', 'wakaranai', 'suki', 'kirai', 'daijoubu',
].map((w) => `word-${w}`);

/* ───────── 形の計算の小道具 ───────── */

const at = (spec: SignSpec, t: number) => sampleSign(compileSign(spec), t);
const toField = (h: HandState, p: Vec3, mirror = false): Vec3 => add(h.wrist, mulMV(h.rot, mirror ? [0 - p[0], p[1], p[2]] : p));
const tip = (h: HandState, f: 'thumb' | 'index' | 'middle', mirror = false) => toField(h, pointOf(skeleton(h.pose), `${f}.tip`), mirror);
const palmCenter = (h: HandState) => toField(h, PALM_CENTER);

/** 手の表面の部品（骨のカプセルと、手のひらの面の球）。mirror＝左手 */
function handPrims(h: HandState, mirror: boolean): Array<{ a: Vec3; b: Vec3; r: number }> {
  const s = skeleton(h.pose);
  const out: Array<{ a: Vec3; b: Vec3; r: number }> = [];
  for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky'] as const) {
    s[f].bones.forEach((b, i) => {
      const y = colY(b.rot);
      const end: Vec3 = i === 2 ? sub(b.end, [y[0] * b.radius, y[1] * b.radius, y[2] * b.radius]) : b.end;
      out.push({ a: toField(h, b.start, mirror), b: toField(h, end, mirror), r: b.radius });
    });
  }
  for (const x of [-0.33, -0.2, -0.07, 0.06, 0.19, 0.27]) {
    for (const y of [0.1, 0.3, 0.5, 0.7, 0.88]) {
      const p = toField(h, [x, y, 0], mirror);
      out.push({ a: p, b: p, r: DIM.palmHalf });
    }
  }
  return out;
}
/** 頭（楕円体）までの近似の距離（負はめり込み） */
function sdHead(p: Vec3): number {
  const c = BODY.headCenter, r = BODY.headRadius;
  const q: Vec3 = [(p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]];
  const k0 = Math.hypot(...q);
  const k1 = Math.hypot(q[0] / r[0], q[1] / r[1], q[2] / r[2]);
  return (k0 * (k0 - 1)) / k1;
}
/** 胴（src/hand/render/body-rig.ts の CapsuleGeometry(0.9, 2.6) を (1.9, 1, 1.05) に伸ばして y=-0.45 に置いたもの）までの近似の距離 */
function sdTorso(p: Vec3): number {
  const q: Vec3 = [p[0] / 1.9, p[1] + 0.45, p[2] / 1.05];
  const y = Math.max(-1.3, Math.min(1.3, q[1]));
  return (Math.hypot(q[0], q[1] - y, q[2]) - 0.9) * 1.05;
}
/** 右肩の袖の球（body-rig.ts: 肩の関節に半径 0.42） */
const sdShoulderR = (p: Vec3) => Math.hypot(p[0] - BODY.shoulderR[0], p[1] - BODY.shoulderR[1], p[2] - BODY.shoulderR[2]) - 0.42;
/** 首（body-rig.ts: CapsuleGeometry(0.36, 0.7) を (0, 1.85, 0.02) に置いたもの）までの距離 */
function sdNeck(p: Vec3): number {
  const y = Math.max(-0.35, Math.min(0.35, p[1] - 1.85));
  return Math.hypot(p[0], p[1] - 1.85 - y, p[2] - 0.02) - 0.36;
}

function handToSdf(h: HandState, sdf: (p: Vec3) => number, mirror = false): number {
  let best = Infinity;
  for (const pr of handPrims(h, mirror)) {
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      best = Math.min(best, sdf([pr.a[0] + (pr.b[0] - pr.a[0]) * t, pr.a[1] + (pr.b[1] - pr.a[1]) * t, pr.a[2] + (pr.b[2] - pr.a[2]) * t]) - pr.r);
    }
  }
  return best;
}
function handToHand(a: HandState, b: HandState): number {
  let best = Infinity;
  for (const p of handPrims(a, false)) for (const q of handPrims(b, true)) best = Math.min(best, segmentDistance(p.a, p.b, q.a, q.b) - p.r - q.r);
  return best;
}
/** 左の前腕の袖（body-rig.ts: ひじ→手首の 0.42 手前、半径 約0.3）と右手の距離 */
function handToLeftForearm(r: HandState, l: HandState): number {
  const e = elbowPosition(BODY.shoulderL, l.wrist, armPoleFor('nonDominant', l.wrist), BODY.upperArm, BODY.forearm);
  const d = sub(e, l.wrist);
  const len = Math.hypot(...d);
  const cuff: Vec3 = add(l.wrist, [(d[0] / len) * 0.42, (d[1] / len) * 0.42, (d[2] / len) * 0.42]);
  let best = Infinity;
  for (const p of handPrims(r, false)) best = Math.min(best, segmentDistance(p.a, p.b, cuff, e) - p.r - 0.3);
  return best;
}

/* ───────── 収録・形式 ───────── */

describe('数字と単語の収録', () => {
  it('数字13・単語16がそろい、ID が重ならない', () => {
    expect(NUMBERS.map((i) => i.id)).toEqual(NUMBER_IDS);
    expect(WORDS.map((i) => i.id)).toEqual(WORD_IDS);
    expect(new Set(ALL.map((i) => i.id)).size).toBe(29);
    expect(NUMBERS.every((i) => i.kind === 'number')).toBe(true);
    expect(WORDS.every((i) => i.kind === 'word')).toBe(true);
  });

  it('説明（相手から・自分で作るコツ）がそろい、表示名が重ならない', () => {
    for (const i of ALL) {
      expect(i.describe.viewer.length, i.id).toBeGreaterThan(10);
      expect(i.describe.self.length, i.id).toBeGreaterThan(10);
    }
    expect(new Set(ALL.map((i) => i.label)).size).toBe(ALL.length);
  });

  it('出典はすべて登録簿（指文字と共通の資料は sources.ts、ほかは SOURCES_EXTRA）にあり、SOURCES_EXTRA の出典はどれかの項目が使っている', () => {
    const ids = SOURCES_EXTRA.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SOURCES_EXTRA) {
      expect(s.title.length, s.id).toBeGreaterThan(0);
      expect(s.url, s.id).toMatch(/^https:\/\//);
    }
    const used = new Set<string>();
    for (const i of ALL) {
      expect(i.sources.length, i.id).toBeGreaterThan(0);
      for (const s of i.sources) {
        // 神奈川県・前橋市の表と岩手県のあいさつは、指文字と同じ資料なので sources.ts の ID を使う
        expect(getSource(s), `${i.id} の出典 ${s}`).toBeDefined();
        used.add(s);
      }
      expect(new Set(i.sources).size, `${i.id} の出典の重複`).toBe(i.sources.length);
    }
    expect(ids.filter((s) => !used.has(s))).toEqual([]);
  });

  it('見間違えやすい項目の参照先がある（数字・単語の中で・自分自身でない）', () => {
    for (const i of ALL) {
      for (const c of i.confusables ?? []) {
        expect(byId.has(c.id), `${i.id} → ${c.id}`).toBe(true);
        expect(c.id).not.toBe(i.id);
        expect(c.tip.length).toBeGreaterThan(5);
      }
    }
  });

  it('見間違えやすい組は、仕様の上で区別できる（形・親指・接触・向き・動きのどれかが違う）', () => {
    const first = (s: SignSpec) => s.hands.dominant.keyframes[0]!;
    for (const i of ALL) {
      for (const c of i.confusables ?? []) {
        const a = i.sign, b = item(c.id).sign;
        expect(stableStringify(a), `${i.id} と ${c.id}`).not.toBe(stableStringify(b));
        if (i.kind === 'number' && item(c.id).kind === 'number' && compileSign(a).isStatic && compileSign(b).isStatic) {
          const fa = first(a), fb = first(b);
          const shapeDiff = stableStringify(fa.shape) !== stableStringify(fb.shape);
          const orientDiff = stableStringify(fa.orient) !== stableStringify(fb.orient);
          expect(shapeDiff || orientDiff, `${i.id} と ${c.id}`).toBe(true);
        }
      }
    }
  });

  it('単語はすべて上半身つき（body: true）で、短い意味がある（意味は重ならない）', () => {
    for (const w of WORDS) {
      expect(w.sign.body, w.id).toBe(true);
      expect(w.meaning?.length ?? 0, w.id).toBeGreaterThan(1);
      expect(w.sign.face, w.id).toBeDefined();
    }
    expect(new Set(WORDS.map((w) => w.meaning)).size).toBe(WORDS.length);
    expect(NUMBERS.every((n) => !n.sign.body)).toBe(true);
  });

  it('確信度: medium は数字の0・大丈夫（調査 r2 の判定）と、わかる（独立照合 第2周：胸をたたく形の資料3つ・なで下ろす形2つに分かれる）。low はない。medium には細部の注記がある', () => {
    expect(ALL.filter((i) => i.confidence === 'medium').map((i) => i.id)).toEqual(['num-0', 'word-wakaru', 'word-daijoubu']);
    expect(ALL.filter((i) => i.confidence === 'low')).toEqual([]);
    for (const i of ALL.filter((x) => x.confidence === 'medium')) expect(i.detailNote?.length ?? 0, i.id).toBeGreaterThan(10);
  });

  it('動きの有無（dynamic）が形のデータと合う（0〜9 は止まった形、10・100・1000 と単語は動く）', () => {
    for (const i of ALL) expect(compileSign(i.sign).isStatic, i.id).toBe(!i.dynamic);
    expect(NUMBERS.filter((n) => n.dynamic).map((n) => n.id)).toEqual(['num-10', 'num-100', 'num-1000']);
    expect(WORDS.every((w) => w.dynamic)).toBe(true);
  });

  it('最初の Keyframe で形・向き・位置を決めている（どの手も）', () => {
    for (const i of ALL) {
      for (const tr of [i.sign.hands.dominant, i.sign.hands.nonDominant]) {
        if (!tr) continue;
        const k = tr.keyframes[0]!;
        expect(k.t, i.id).toBe(0);
        expect(k.orient, i.id).toBeDefined();
        expect(k.pos, i.id).toBeDefined();
      }
      expect(i.sign.hands.dominant.keyframes[0]!.shape, i.id).toBeDefined();
    }
  });

  it('由来（origin）は説明している資料の名前を添える。覚え方の例（mnemonic）を由来と書かない', () => {
    const names = ['前橋市', '神奈川県', '梅花女子大学', '岩手県', '群馬県', '東京都', '鴻巣市', '生駒市', '国立国語研究所'];
    for (const i of ALL) {
      if (!i.memory) continue;
      if (i.memory.kind === 'origin') expect(names.some((n) => i.memory!.text.includes(n)), `${i.id}: ${i.memory.text}`).toBe(true);
      else expect(i.memory.text, i.id).not.toMatch(/由来/);
    }
  });

  it('地域差・別の表し方の注記がある（名前は東西の差を書く）', () => {
    for (const i of ALL) expect(i.variants?.length ?? 0, i.id).toBeGreaterThan(10);
    expect(item('word-namae').variants).toMatch(/東日本/);
    expect(item('word-namae').variants).toMatch(/西日本/);
    expect(item('num-10').variants).toMatch(/大阪/);
  });
});

/* ───────── 数字の形と調査 r2・2つの表 ───────── */

describe('数字の形（調査 r2・神奈川県 p.15・前橋市 p.12）', () => {
  const fingers = (id: string) => (item(id).sign.hands.dominant.keyframes[0]!.shape as HandshapeSpec).fingers;
  const ext = (id: string) => Object.entries(fingers(id)).filter(([, s]) => s === 'extended').map(([f]) => f);

  it('伸ばす指: 1〜4 は人差し指から順に、5 は親指だけ、6〜9 は親指（5）に1〜4本を足す', () => {
    expect(ext('num-1')).toEqual(['index']);
    expect(ext('num-2')).toEqual(['index', 'middle']);
    expect(ext('num-3')).toEqual(['index', 'middle', 'ring']);
    expect(ext('num-4')).toEqual(['index', 'middle', 'ring', 'pinky']);
    expect(ext('num-5')).toEqual([]);
    expect(ext('num-6')).toEqual(['index']);
    expect(ext('num-7')).toEqual(['index', 'middle']);
    expect(ext('num-8')).toEqual(['index', 'middle', 'ring']);
    expect(ext('num-9')).toEqual(['index', 'middle', 'ring', 'pinky']);
    for (const k of ['five', 'six', 'seven', 'eight', 'nine'] as const) expect(NUMBER_SHAPES[k].thumb, k).toBe('extendedOut');
  });

  it('1〜5 は手のひらを相手に向ける。1〜4 は指先が上', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const h = at(item(`num-${n}`).sign, 0).dominant;
      expect(dot(colZ(h.rot), [0, 0, 1]), `num-${n}`).toBeGreaterThan(0.9);
      if (n <= 4) expect(dot(colY(h.rot), [0, 1, 0]), `num-${n}`).toBeGreaterThan(0.9);
    }
  });

  it('5 の親指は横（相手から見て右）へ出る', () => {
    const h = at(item('num-5').sign, 0).dominant;
    const d = sub(tip(h, 'thumb'), palmCenter(h));
    expect(d[0]).toBeGreaterThan(0.5);
    expect(Math.abs(d[1])).toBeLessThan(d[0]);
  });

  it('6〜9 は手の甲を相手に向け、伸ばす指は横（相手から見て右）、親指は上', () => {
    for (const n of [6, 7, 8, 9]) {
      const h = at(item(`num-${n}`).sign, 0).dominant;
      expect(dot(colZ(h.rot), [0, 0, -1]), `num-${n}`).toBeGreaterThan(0.9);
      expect(dot(colY(h.rot), [1, 0, 0]), `num-${n}`).toBeGreaterThan(0.9);
      const d = sub(tip(h, 'thumb'), palmCenter(h));
      expect(d[1], `num-${n} の親指`).toBeGreaterThan(0.5);
    }
  });

  it('10 は 1 の形から人差し指を折り曲げる', () => {
    const ks = item('num-10').sign.hands.dominant.keyframes;
    expect(ks[0]!.shape).toBe(NUMBER_SHAPES.one);
    expect(ks.filter((k) => k.shape).map((k) => k.shape)).toEqual([NUMBER_SHAPES.one, NUMBER_SHAPES.ten]);
    const c = compileSign(item('num-10').sign);
    expect(sampleSign(c, c.duration).dominant.pose.index.pip).toBeGreaterThan(sampleSign(c, 0).dominant.pose.index.pip + 60);
  });

  it('100 は横に向けた人差し指を上へはね上げる', () => {
    const c = compileSign(item('num-100').sign);
    const s = sampleSign(c, 0).dominant, e = sampleSign(c, c.duration).dominant;
    expect(dot(colY(s.rot), [1, 0, 0])).toBeGreaterThan(0.95);
    expect(colY(e.rot)[1]).toBeGreaterThan(0.7);
    expect(tip(e, 'index')[1]).toBeGreaterThan(tip(s, 'index')[1] + 0.8);
  });

  it('1000 は人差し指を横に向けたまま「千」を書く（相手から見て ノ＝左上→右下、一＝右→左、｜＝上→下）', () => {
    const spec = item('num-1000').sign;
    const c = compileSign(spec);
    // 位置が変わる Keyframe（画の始めと終わり）を順に拾う
    const ts: number[] = [];
    let last = '';
    for (const k of spec.hands.dominant.keyframes) {
      const key = stableStringify(k.pos);
      if (k.pos && key !== last) ts.push(k.t);
      last = k.pos ? key : last;
    }
    const p = ts.map((t) => tip(sampleSign(c, t).dominant, 'index'));
    expect(p.length).toBe(6);
    const [a, b, c2, d, e, f] = p as [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3];
    expect(b[0]).toBeGreaterThan(a[0]); // ノ: 相手から見て右へ
    expect(b[1]).toBeLessThan(a[1]); //      下へ
    expect(d[0]).toBeLessThan(c2[0] - 1); // 一: 相手から見て右→左
    expect(Math.abs(d[1] - c2[1])).toBeLessThan(0.05);
    expect(f[1]).toBeLessThan(e[1] - 1); // ｜: 上→下
    expect(Math.abs(f[0] - e[0])).toBeLessThan(0.05);
    for (const t of ts) expect(dot(colY(sampleSign(c, t).dominant.rot), [1, 0, 0])).toBeGreaterThan(0.95);
  });
});

/* ───────── 単語の動きと調査 r2 の steps ───────── */

describe('単語の動き（調査 r2 の steps の順）', () => {
  const shapes = (id: string) => item(id).sign.hands.dominant.keyframes.filter((k) => k.shape).map((k) => k.shape);
  const S = WORD_SHAPES;

  it('右手の形の順が steps と合う', () => {
    expect(shapes('word-ohayou')).toEqual([S.fist, S.point, S.bow]);
    expect(shapes('word-konnichiwa')).toEqual([S.noon, S.point, S.bow]);
    expect(shapes('word-konbanwa')).toEqual([S.open, S.point, S.bow]);
    expect(shapes('word-arigatou')).toEqual([S.flat]);
    expect(shapes('word-yoroshiku')).toEqual([S.fist, S.flat]);
    expect(shapes('word-gomennasai')).toEqual([S.pinchOpen, S.pinch, S.flat]);
    expect(shapes('word-sayounara')).toEqual([S.open]);
    expect(shapes('word-otsukaresama')).toEqual([S.fist]);
    expect(shapes('word-hajimemashite')).toEqual([S.flat, S.point]);
    expect(shapes('word-namae')).toEqual([S.thumbOut]);
    expect(shapes('word-shuwa')).toEqual([S.point]);
    expect(shapes('word-wakaru')).toEqual([S.flat]);
    expect(shapes('word-wakaranai')).toEqual([S.brush]);
    expect(shapes('word-suki')).toEqual([S.spreadTwo, S.pinch]);
    expect(shapes('word-kirai')).toEqual([S.pinch, S.spreadTwo]);
    expect(shapes('word-daijoubu')).toEqual([S.curved]);
  });

  it('両手を使う語だけが左手を持つ', () => {
    const two = WORDS.filter((w) => w.sign.hands.nonDominant).map((w) => w.id);
    expect(two).toEqual(['word-ohayou', 'word-konnichiwa', 'word-konbanwa', 'word-arigatou', 'word-otsukaresama', 'word-hajimemashite', 'word-namae', 'word-shuwa']);
  });

  it('顔: あいさつは笑顔、感謝・お願い・謝る・労う・大丈夫（肯定）はうなずき、嫌いは嫌な顔', () => {
    const face = Object.fromEntries(WORDS.map((w) => [w.id.replace('word-', ''), w.sign.face]));
    expect(face).toEqual({
      ohayou: 'smile', konnichiwa: 'smile', konbanwa: 'smile', arigatou: 'nod', yoroshiku: 'nod', gomennasai: 'nod',
      sayounara: 'smile', otsukaresama: 'nod', hajimemashite: 'smile', namae: 'neutral', shuwa: 'neutral', wakaru: 'neutral',
      // 嫌いの嫌な顔（frown）は hand-r2 で描けるようにした
      wakaranai: 'neutral', suki: 'smile', kirai: 'frown', daijoubu: 'nod',
    });
  });

  it('左右: 朝は右のこめかみ、さようならは顔の右横、わからないは右肩（どれも相手から見て左）', () => {
    expect(palmCenter(at(item('word-ohayou').sign, 0).dominant)[0]).toBeLessThan(-0.5);
    expect(palmCenter(at(item('word-sayounara').sign, 0).dominant)[0]).toBeLessThan(-1);
    expect(tip(at(item('word-wakaranai').sign, 0).dominant, 'middle')[0]).toBeLessThan(-1.2);
  });

  it('大丈夫は、表す人の左胸（相手から見て右）から右胸（相手から見て左）へ移す', () => {
    const c = compileSign(item('word-daijoubu').sign);
    expect(tip(sampleSign(c, 0).dominant, 'middle')[0]).toBeGreaterThan(0.3);
    expect(tip(sampleSign(c, c.duration).dominant, 'middle')[0]).toBeLessThan(-0.3);
  });

  it('回数: お疲れさまは2回たたく、わからないは2回払う、さようならは左右に2往復、手話は2回まわす', () => {
    const series = (id: string, f: (h: HandState) => number) => {
      const c = compileSign(item(id).sign);
      return Array.from({ length: 241 }, (_, i) => f(sampleSign(c, (c.duration * i) / 240).dominant));
    };
    /** 端（一番下・一番上など）の近くへ何回行ったか（続けて近くにいる間は1回と数える） */
    const visits = (v: number[], inside: (x: number) => boolean) => {
      let n = 0;
      let was = false;
      for (const x of v) {
        const now = inside(x);
        if (now && !was) n++;
        was = now;
      }
      return n;
    };
    const tap = series('word-otsukaresama', (h) => palmCenter(h)[1]);
    expect(visits(tap, (y) => y < Math.min(...tap) + 0.05)).toBe(2);
    const brush = series('word-wakaranai', (h) => palmCenter(h)[1]);
    expect(visits(brush, (y) => y > Math.max(...brush) - 0.05)).toBe(2);
    const wave = series('word-sayounara', (h) => palmCenter(h)[0]);
    expect(visits(wave, (x) => x < Math.min(...wave) + 0.03)).toBe(2);
    expect(visits(wave, (x) => x > Math.max(...wave) - 0.03)).toBe(2);
    // 手話: 右手の位置の、上下・前後の面での回り角が 2 周ぶん進む（前へ回す＝上で相手の方へ動く向き）
    const c = compileSign(item('word-shuwa').sign);
    // 回す中心（words.ts の shuwa: 胸の位置の名前の点＋[-1.45, 0.5, 0.5]）
    const center = add(locationAnchor('chest'), [-1.45, 0.5, 0.5]);
    let total = 0;
    let prev: number | null = null;
    for (let i = 0; i <= 400; i++) {
      const p = palmCenter(sampleSign(c, (c.duration * i) / 400).dominant);
      const ang = Math.atan2(p[2] - center[2], p[1] - center[1]); // 0＝上、＋＝前
      if (prev !== null) {
        let d = ang - prev;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        total += d;
      }
      prev = ang;
    }
    expect(total / (2 * Math.PI)).toBeGreaterThan(1.9);
  });
});

/* ───────── 触れる場面（体の位置の点が変わったら気づくため） ───────── */

describe('触れる場面で、手が部位に触れている（離れすぎ・めり込みすぎがない）', () => {
  const near = (d: number) => {
    expect(d).toBeGreaterThan(-0.05);
    expect(d).toBeLessThan(0.05);
  };

  it('頭: 朝（こめかみ）・昼（額）・良い（鼻）・迷惑（眉間）', () => {
    near(handToSdf(at(item('word-ohayou').sign, 0).dominant, sdHead));
    near(handToSdf(at(item('word-konnichiwa').sign, 0.4).dominant, sdHead));
    near(handToSdf(at(item('word-yoroshiku').sign, 0).dominant, sdHead));
    near(handToSdf(at(item('word-gomennasai').sign, 0.35).dominant, sdHead));
  });

  it('両手: ありがとう（右手の小指の側を左手の甲へ）・名前（右の親指を左の手のひらへ）・はじめまして（重ねた手）', () => {
    for (const [id, t] of [['word-arigatou', 0], ['word-namae', 0.55], ['word-hajimemashite', 0]] as const) {
      const f = at(item(id).sign, t);
      near(handToHand(f.dominant, f.nonDominant!));
    }
    // 名前は親指の先で押す
    const f = at(item('word-namae').sign, 0.55);
    const L = f.nonDominant!;
    const palmFace = toField(L, [0, 0.62, DIM.palmHalf], true);
    const n = colZ(L.rot);
    expect(Math.abs(dot(sub(tip(f.dominant, 'thumb'), palmFace), n))).toBeLessThan(0.15);
  });

  it('お疲れさま: 右のこぶしが左の前腕をたたく（2回とも）', () => {
    for (const t of [0.22, 0.64]) {
      const f = at(item('word-otsukaresama').sign, t);
      near(handToLeftForearm(f.dominant, f.nonDominant!));
    }
  });

  it('胴と肩: わかる（手のひらを胸に）・大丈夫（指先を胸に）・わからない（指先を右肩に）', () => {
    for (const t of [0, 0.75]) near(handToSdf(at(item('word-wakaru').sign, t).dominant, sdTorso));
    for (const t of [0, 0.65]) near(handToSdf(at(item('word-daijoubu').sign, t).dominant, sdTorso));
    near(handToSdf(at(item('word-wakaranai').sign, 0).dominant, sdShoulderR));
  });

  it('どの時刻でも、手が頭・もう一方の手に深くめり込まない', () => {
    for (const w of WORDS) {
      const c = compileSign(w.sign);
      for (let i = 0; i <= 40; i++) {
        const f = sampleSign(c, (c.duration * i) / 40);
        expect(handToSdf(f.dominant, sdHead), `${w.id} 頭`).toBeGreaterThan(-0.08);
        if (f.nonDominant) expect(handToHand(f.dominant, f.nonDominant), `${w.id} 両手`).toBeGreaterThan(-0.08);
      }
    }
  });
});

/* ───────── 独立照合 第2周の指摘（第3周で直した） ───────── */

/**
 * 独立照合 第2周（.agent-harness/runs/content-review-2/report.md）の指摘を、相手から見た見え方の数で確かめる。
 * カメラは描画の「相手から」の基準の向き（framing.ts の baseAngles）。それぞれ、直す前の値では条件を満たさないことも確かめる。
 */
describe('独立照合 第2周の指摘（相手から見た見え方）', () => {
  const { yaw, pitch } = baseAngles('viewer', 'right');
  const r = Math.PI / 180;
  const VIEW: Vec3 = [Math.cos(pitch * r) * Math.sin(yaw * r), Math.sin(pitch * r), Math.cos(pitch * r) * Math.cos(yaw * r)];
  const right = normalize(cross([0, 1, 0], VIEW));
  const up = cross(VIEW, right);
  const screen = (p: Vec3): [number, number] => [dot(p, right), dot(p, up)];
  /** 開いた2本（V）は手のひらの面に開く。手のひらの向きが視線に近いほど、相手に V の間が見える */
  const vFacing = (rot: HandState['rot']) => Math.abs(dot(colZ(rot), VIEW));
  /** 閉じた2本の輪は、親指の側（手の座標の x）から見ると穴が見える */
  const ringFacing = (rot: HandState['rot']) => Math.abs(dot(colX(rot), VIEW));
  const ends = (id: string) => {
    const c = compileSign(item(id).sign);
    return { s: sampleSign(c, 0).dominant, e: sampleSign(c, c.duration).dominant };
  };
  const tipGap = (h: HandState) => contactGap(skeleton(h.pose), 'thumb.tip', 'index.tip');

  it('好き：始めは開いた V の間が相手に見え、終わりは閉じた輪を親指の側から見せる。人差し指の先はのどへ向く', () => {
    const { s, e } = ends('word-suki');
    expect(vFacing(s.rot)).toBeGreaterThan(0.8);
    expect(ringFacing(e.rot)).toBeGreaterThan(0.6);
    // 相手から見て、始めは親指と人差し指の先が離れ（開いた形）、終わりは触れる（閉じた形）
    const [ts, is] = [screen(tip(s, 'thumb')), screen(tip(s, 'index'))];
    expect(Math.hypot(ts[0] - is[0], ts[1] - is[1])).toBeGreaterThan(0.6);
    expect(tipGap(e)).toBeLessThan(0.02);
    // 人差し指の先はのどの近く（首から 3cm 以内）で、表す人の右からのど（相手から見て右）へ向く
    expect(handToSdf(s, sdNeck)).toBeGreaterThan(0);
    expect(handToSdf(s, sdNeck)).toBeLessThan(0.3);
    expect(colY(s.rot)[0]).toBeGreaterThan(0.6);
    // 前の斜め下へ下ろす
    expect(palmCenter(e)[1]).toBeLessThan(palmCenter(s)[1] - 0.4);
    expect(palmCenter(e)[2]).toBeGreaterThan(palmCenter(s)[2] + 0.4);
    // 直す前（手のひらを下・指先をのどへ）では、V の面が相手に向かず、拳を下ろすだけに見えた
    expect(vFacing(orientationMatrix({ palm: 'down', fingers: [0.45, 0, -0.9] }))).toBeLessThan(0.3);
  });

  it('嫌い：始めは閉じた輪を親指の側から見せ（拳に見えない）、終わりは開いた V の間が相手に見える', () => {
    const { s, e } = ends('word-kirai');
    expect(ringFacing(s.rot)).toBeGreaterThan(0.6);
    expect(tipGap(s)).toBeLessThan(0.02);
    expect(vFacing(e.rot)).toBeGreaterThan(0.8);
    // 始めの指先は上（あご）を向く
    expect(colY(s.rot)[1]).toBeGreaterThan(0.6);
    // 直す前は、始めの輪も終わりの V も、相手からは縁しか見えなかった
    expect(ringFacing(orientationMatrix({ palm: [0, -0.77, -0.64], fingers: [0.35, 0.6, -0.72] }))).toBeLessThan(0.45);
    expect(vFacing(orientationMatrix({ palm: [0, -0.94, -0.34], fingers: [0.42, -0.3, -0.86] }))).toBeLessThan(0.3);
  });

  it('好き・嫌い：動きの間、手が頭・首・胴にめり込まない', () => {
    for (const id of ['word-suki', 'word-kirai']) {
      const c = compileSign(item(id).sign);
      for (let i = 0; i <= 100; i++) {
        const h = sampleSign(c, (c.duration * i) / 100).dominant;
        expect(handToSdf(h, sdHead), `${id} 頭 ${i}`).toBeGreaterThan(-0.005);
        expect(handToSdf(h, sdNeck), `${id} 首 ${i}`).toBeGreaterThan(-0.005);
        expect(handToSdf(h, sdTorso), `${id} 胴 ${i}`).toBeGreaterThan(-0.005);
      }
    }
  });

  it('ごめんなさい：つまむ間、手が顔の真ん前をふさがず、表す人の左目が相手から見える（指先は眉間に触れたまま）', () => {
    // 目の位置（body-rig.ts: 顔の中心から (±0.3, 0.12, 0.84)）。表す人の左目は場の +X
    const eye = screen(add(BODY.headCenter, [0.3, 0.12, 0.84]));
    /** 手の部品（骨のカプセル・手のひらの面の球）を相手から見た画面へ写し、目の点との距離から太さを引く（負なら目が手に隠れる） */
    const clearance = (h: HandState) => {
      let best = Infinity;
      for (const pr of handPrims(h, false)) {
        for (let k = 0; k <= 8; k++) {
          const q = screen([pr.a[0] + ((pr.b[0] - pr.a[0]) * k) / 8, pr.a[1] + ((pr.b[1] - pr.a[1]) * k) / 8, pr.a[2] + ((pr.b[2] - pr.a[2]) * k) / 8]);
          best = Math.min(best, Math.hypot(q[0] - eye[0], q[1] - eye[1]) - pr.r);
        }
      }
      return best;
    };
    for (const t of [0, 0.35, 0.5]) expect(clearance(at(item('word-gomennasai').sign, t).dominant), `${t}秒`).toBeGreaterThan(0.05);
    // 直す前（手のひらを顔へ向けて、手を顔の真ん前に立てた形）では、左目が手に隠れた
    const before: SignSpec = {
      body: true,
      hands: { dominant: { keyframes: [{ t: 0, shape: WORD_SHAPES.pinch, orient: { palm: [0, -0.6, -0.8], fingers: [0, 0.8, -0.6] }, pos: { at: 'forehead', offset: [0.294, -0.552, 0.122] } }] } },
    };
    expect(clearance(at(before, 0).dominant)).toBeLessThan(0);
  });

  it('6〜9：相手から見て、親指は真上に近い（2つの数字の表）', () => {
    const tilt = (shape: HandshapeSpec) => {
      const L = computeLandmarks(shape, { palm: 'toSigner', fingers: 'viewerRight' }).map(screen);
      return (Math.atan2(L[4]![0] - L[2]![0], L[4]![1] - L[2]![1]) * 180) / Math.PI;
    };
    for (const n of [6, 7, 8, 9]) {
      const k = item(`num-${n}`).sign.hands.dominant.keyframes[0]!;
      expect(Math.abs(tilt(k.shape!)), `num-${n}`).toBeLessThan(8);
    }
    // 直す前（横に出す置き方の表の値のまま）では、指先の側（相手から見て右）へ約22°傾いた
    expect(tilt({ ...NUMBER_SHAPES.six, adjust: undefined })).toBeGreaterThan(15);
  });

  it('わかる：2つの表（神奈川県・前橋市）が胸をたたく形を載せていることを、地域差の注記に書く（主の形はなで下ろす）', () => {
    const v = item('word-wakaru').variants ?? '';
    expect(v).toMatch(/神奈川県/);
    expect(v).toMatch(/前橋市/);
    expect(v).toMatch(/たたく/);
    expect(item('word-wakaru').describe.viewer).toMatch(/なで下ろす/);
  });
});
