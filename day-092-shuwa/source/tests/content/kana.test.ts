import { describe, expect, it } from 'vitest';
import { getItem, ITEMS } from '../../src/content';
import { composeModifier, MODIFIER_MOVES, type MovingModifier } from '../../src/content/compose';
import { KANA_ITEMS, MODIFIER_ITEMS, SHAPES, TABLE_SOURCE_IDS } from '../../src/content/kana';
import { getSource, SOURCES } from '../../src/content/sources';
import { fingerspellTokens, tokenSpec } from '../../src/content/spell';
import type { SignItem } from '../../src/content/types';
import { createCourses, KANA_IDS } from '../../src/course/course';
import { baseAngles, forwardness, selfAngles } from '../../src/hand/core/framing';
import { computeLandmarks } from '../../src/hand/core/landmarks';
import { angleBetween, colY, colZ, cross, DEG, dot, normalize, sub } from '../../src/hand/core/math';
import { orientationMatrix } from '../../src/hand/core/orient';
import { solveHandshape } from '../../src/hand/core/shapes';
import { DIM, skeleton } from '../../src/hand/core/skeleton';
import { compileSign, sampleSign } from '../../src/hand/core/timeline';
import type { HandshapeSpec, Orientation, SignSpec, Vec3 } from '../../src/hand/types';

const MOD_IDS = ['mod-dakuon', 'mod-handakuon', 'mod-sokuon', 'mod-youon', 'mod-chouon'];
const TABLES = new Set<string>(TABLE_SOURCE_IDS);
const item = (id: string): SignItem => {
  const found = getItem(id);
  if (!found) throw new Error(`${id} がありません`);
  return found;
};

/** 2つの方向のなす角（度） */
const deg = (a: Vec3, b: Vec3) => angleBetween(a, b) / DEG;

/** 最初の時点の形と向き（Keyframe は省略した値を前から引き継ぐ） */
function firstPose(spec: SignSpec): { shape: HandshapeSpec; orient: Orientation } {
  const frames = [...spec.hands.dominant.keyframes].sort((a, b) => a.t - b.t);
  const shape = frames.find((k) => k.shape)?.shape;
  const orient = frames.find((k) => k.orient)?.orient;
  if (!shape || !orient) throw new Error('形か向きがありません');
  return { shape, orient };
}

/** 動きの始めと終わりの手（手首の位置・回転・関節角度） */
function ends(spec: SignSpec) {
  const c = compileSign(spec);
  return { c, start: sampleSign(c, 0).dominant, end: sampleSign(c, c.duration).dominant };
}

/** 動きの向き（手首の移動、または空中に書く跡の始めから終わり）。動きが無ければ null */
function motion(spec: SignSpec): { static: boolean; trace: boolean; dir: Vec3 | null; shapeChanges: boolean } {
  const { c, start, end } = ends(spec);
  if (c.isStatic) return { static: true, trace: false, dir: null, shapeChanges: false };
  const path = c.trace?.path;
  const d = path ? sub(path[path.length - 1]!, path[0]!) : sub(end.wrist, start.wrist);
  return { static: false, trace: !!path, dir: Math.hypot(...d) > 1e-6 ? d : null, shapeChanges: JSON.stringify(start.pose) !== JSON.stringify(end.pose) };
}

/** 見間違えやすい組の仕様が、5つの観点のどれで異なるか */
function differences(a: SignSpec, b: SignSpec): string[] {
  const pa = firstPose(a), pb = firstPose(b);
  const out: string[] = [];
  const fingerKey = (s: HandshapeSpec) => JSON.stringify([s.fingers, s.cross ?? null, s.spread ?? null]);
  if (fingerKey(pa.shape) !== fingerKey(pb.shape)) out.push('指の状態');
  if (JSON.stringify(pa.shape.thumb) !== JSON.stringify(pb.shape.thumb)) out.push('親指');
  const contactKey = (s: HandshapeSpec) => JSON.stringify((s.contacts ?? []).map((c) => [...c].sort().join('-')).sort());
  if (contactKey(pa.shape) !== contactKey(pb.shape)) out.push('接触');
  const ra = orientationMatrix(pa.orient), rb = orientationMatrix(pb.orient);
  if (deg(colZ(ra), colZ(rb)) > 25 || deg(colY(ra), colY(rb)) > 25) out.push('向き');
  const ma = motion(a), mb = motion(b);
  const motionDiffers =
    ma.static !== mb.static ||
    ma.trace !== mb.trace ||
    ma.shapeChanges !== mb.shapeChanges ||
    (!!ma.dir && !!mb.dir && deg(ma.dir, mb.dir) > 30);
  if (motionDiffers) out.push('動き');
  return out;
}

describe('指文字の収録範囲', () => {
  it('清音46文字が course.ts の KANA_ROWS と同じ ID・同じ並びでそろう', () => {
    expect(KANA_ITEMS.map((i) => i.id)).toEqual(KANA_IDS);
    expect(KANA_ITEMS).toHaveLength(46);
    for (const i of KANA_ITEMS) expect(i.kind, i.id).toBe('kana');
  });
  it('変化5種（濁音・半濁音・促音・拗音・長音）がそろう', () => {
    expect(MODIFIER_ITEMS.map((i) => i.id)).toEqual(MOD_IDS);
    for (const i of MODIFIER_ITEMS) expect(i.kind, i.id).toBe('modifier');
  });
  it('公開窓口から全項目を引ける・ID が重複しない', () => {
    // 指文字51件＋数字13件＋単語16件（数字と単語は tests/content/numbers-words.test.ts が中身を見る）
    expect(ITEMS.filter((i) => i.kind === 'kana' || i.kind === 'modifier')).toHaveLength(51);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    for (const id of [...KANA_IDS, ...MOD_IDS]) expect(getItem(id)?.id).toBe(id);
  });
});

describe('出典', () => {
  it('出典の ID は重複せず、照合に使った4つの表も登録してある', () => {
    expect(new Set(SOURCES.map((s) => s.id)).size).toBe(SOURCES.length);
    for (const id of TABLE_SOURCE_IDS) expect(getSource(id), id).toBeDefined();
    for (const s of SOURCES) expect(s.url, s.id).toMatch(/^https:\/\//);
  });
  it('全項目の出典 ID が登録済みで、1項目に2つ以上ある', () => {
    for (const i of ITEMS) {
      expect(i.sources.length, i.id).toBeGreaterThanOrEqual(2);
      expect(new Set(i.sources).size, `${i.id} の出典が重複`).toBe(i.sources.length);
      for (const s of i.sources) expect(getSource(s), `${i.id} → ${s}`).toBeDefined();
    }
  });
  it('登録した出典はどれかの項目が使っている', () => {
    const used = new Set(ITEMS.flatMap((i) => i.sources));
    for (const s of SOURCES) expect(used.has(s.id), s.id).toBe(true);
  });
  it('指文字の確信度 high は、文章の資料2つ以上と照合した表2つ以上を出典に持つ', () => {
    // 表で照合できるのは指文字だけ（単語の表は無い。数字は numbers-words.test.ts が見る）
    for (const i of [...KANA_ITEMS, ...MODIFIER_ITEMS].filter((x) => x.confidence === 'high')) {
      expect(i.sources.filter((s) => !TABLES.has(s)).length, i.id).toBeGreaterThanOrEqual(2);
      expect(i.sources.filter((s) => TABLES.has(s)).length, i.id).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('項目の中身', () => {
  it('説明（相手から・自分で作るとき）と覚え方の文が空でない', () => {
    for (const i of ITEMS) {
      expect(i.describe.viewer.trim().length, i.id).toBeGreaterThan(0);
      expect(i.describe.self.trim().length, i.id).toBeGreaterThan(0);
      if (i.memory) expect(i.memory.text.trim().length, i.id).toBeGreaterThan(0);
      if (i.detailNote !== undefined) expect(i.detailNote.trim().length, i.id).toBeGreaterThan(0);
      expect(['high', 'medium', 'low']).toContain(i.confidence);
    }
  });
  it('dynamic の印が、形のデータの動きの有無と一致する', () => {
    for (const i of ITEMS) expect(i.dynamic, i.id).toBe(!compileSign(i.sign).isStatic);
  });
  it('動きのない項目は Keyframe が1つで、形と向きを持つ（カメラ判定が読む形）', () => {
    for (const i of ITEMS.filter((x) => !x.dynamic)) {
      const frames = i.sign.hands.dominant.keyframes;
      expect(frames, i.id).toHaveLength(1);
      expect(frames[0]!.shape, i.id).toBeDefined();
      expect(frames[0]!.orient, i.id).toBeDefined();
      expect(i.sign.trace, i.id).toBeUndefined();
    }
  });
  it('指定した接触（親指の先を指につける等）が、形を解いたときにすべて届いている', () => {
    for (const i of ITEMS) {
      const failed = compileSign(i.sign).warnings.filter((w) => w.includes('接触できませんでした'));
      expect(failed, i.id).toEqual([]);
    }
  });
});

describe('見間違えやすい組', () => {
  it('参照先の項目があり、自分自身を指さず、見分け方の文がある', () => {
    for (const i of ITEMS) {
      const ids = (i.confusables ?? []).map((c) => c.id);
      expect(new Set(ids).size, i.id).toBe(ids.length);
      for (const c of i.confusables ?? []) {
        expect(getItem(c.id), `${i.id} → ${c.id}`).toBeDefined();
        expect(c.id, i.id).not.toBe(i.id);
        expect(c.tip.trim().length, `${i.id} → ${c.id}`).toBeGreaterThan(0);
      }
    }
  });
  it('組の仕様が「指の状態・親指・接触・向き・動き」のどれかで異なる', () => {
    for (const i of ITEMS) {
      for (const c of i.confusables ?? []) {
        const diff = differences(i.sign, item(c.id).sign);
        expect(diff.length, `${i.id}（${i.label}）と ${c.id} の仕様が同じ`).toBeGreaterThan(0);
      }
    }
  });
  it('観点の判定そのものを確かめる（同じ形は差なし・向きだけ違えば「向き」）', () => {
    expect(differences(item('kana-u').sign, item('kana-u').sign)).toEqual([]);
    expect(differences(item('kana-u').sign, item('kana-to').sign)).toEqual(['向き']);
    expect(differences(item('kana-tsu').sign, item('mod-sokuon').sign)).toEqual(['動き']);
    expect(differences(item('kana-ra').sign, item('kana-u').sign)).toEqual(['指の状態']);
  });
});

describe('コース', () => {
  it('createCourses() の全レッスンに確信度 low の項目が入っていない', () => {
    for (const course of createCourses()) for (const unit of course.units) for (const lesson of unit.lessons) {
      for (const id of [...lesson.newItems, ...(lesson.reviewItems ?? [])]) {
        expect(getItem(id), id).toBeDefined();
        expect(getItem(id)!.confidence, id).not.toBe('low');
      }
    }
  });
  it('low でない指文字と変化は、すべて指文字のコースのどこかで学べる', () => {
    const kana = createCourses().find((c) => c.id === 'kana')!;
    const taught = new Set(kana.units.flatMap((u) => u.lessons.flatMap((l) => l.newItems)));
    for (const i of [...KANA_ITEMS, ...MODIFIER_ITEMS].filter((x) => x.confidence !== 'low')) {
      expect(taught.has(i.id), i.id).toBe(true);
    }
  });
});

describe('変化の合成（compose.ts と tokenSpec）', () => {
  const near = (a: Vec3, b: Vec3) => Math.hypot(...sub(a, b)) < 1e-6;
  const one = (text: string) => {
    const tokens = fingerspellTokens(text);
    expect(tokens).toHaveLength(1);
    const spec = tokenSpec(tokens[0]!);
    if (!spec) throw new Error(`${text} の形がありません`);
    return { token: tokens[0]!, spec };
  };
  /** 元の文字の形と向きのまま、手首だけが want だけ動く */
  function expectMove(text: string, base: string, modifier: MovingModifier, want: Vec3) {
    const { token, spec } = one(text);
    expect(token.base).toBe(base);
    expect(token.modifier).toBe(modifier);
    expect(firstPose(spec)).toEqual(firstPose(item(base).sign));
    const { c, start, end } = ends(spec);
    expect(c.isStatic).toBe(false);
    expect(near(sub(end.wrist, start.wrist), want), `${text}: ${sub(end.wrist, start.wrist).map((v) => v.toFixed(3))}`).toBe(true);
    expect(end.rot).toEqual(start.rot);
    expect(end.pose).toEqual(start.pose);
  }

  it('が＝「か」の形のまま、表す人の右（相手から見て左）へ手のひら1つぶん動く', () => {
    expectMove('が', 'kana-ka', 'mod-dakuon', [-1, 0, 0]);
  });
  it('ぱ＝「は」の形のまま上へ動く', () => {
    expectMove('ぱ', 'kana-ha', 'mod-handakuon', [0, 1, 0]);
  });
  it('っ＝「つ」の形のまま、表す人の体の方（相手から遠ざかる向き）へ引く', () => {
    expectMove('っ', 'kana-tsu', 'mod-sokuon', [0, 0, -1]);
  });
  it('ゃ＝「や」の形のまま、表す人の体の方へ引く', () => {
    expectMove('ゃ', 'kana-ya', 'mod-youon', [0, 0, -1]);
  });
  it('ー＝のばす音の項目そのもの。人差し指で上から下へ縦に書く', () => {
    const { token, spec } = one('ー');
    expect(token.base).toBeUndefined();
    expect(token.modifier).toBe('mod-chouon');
    expect(spec).toBe(item('mod-chouon').sign);
    const path = compileSign(spec).trace?.path;
    expect(path).toBeDefined();
    const d = sub(path![path!.length - 1]!, path![0]!);
    expect(d[1]).toBeLessThanOrEqual(-1);
    expect(Math.abs(d[0]) + Math.abs(d[2])).toBeLessThan(0.05);
  });
  it('清音はそのままの形を返し、合成は元の形を変えない', () => {
    expect(one('か').spec).toBe(item('kana-ka').sign);
    const before = JSON.stringify(item('kana-ka').sign);
    composeModifier(item('kana-ka').sign, 'mod-dakuon');
    expect(JSON.stringify(item('kana-ka').sign)).toBe(before);
  });
  it('変化の項目の形は、その例（が・ぱ・っ・ゃ）の合成と同じ', () => {
    expect(item('mod-dakuon').sign).toEqual(composeModifier(item('kana-ka').sign, 'mod-dakuon'));
    expect(item('mod-handakuon').sign).toEqual(composeModifier(item('kana-ha').sign, 'mod-handakuon'));
    expect(item('mod-sokuon').sign).toEqual(composeModifier(item('kana-tsu').sign, 'mod-sokuon'));
    expect(item('mod-youon').sign).toEqual(composeModifier(item('kana-ya').sign, 'mod-youon'));
  });
  it('動きの向きの表は、濁音だけが横・半濁音が上・促音と拗音が手前', () => {
    expect(MODIFIER_MOVES).toEqual({
      'mod-dakuon': [-1, 0, 0],
      'mod-handakuon': [0, 1, 0],
      'mod-sokuon': [0, 0, -1],
      'mod-youon': [0, 0, -1],
    });
  });
  it('濁点・半濁点・小さい字のつく文字は、すべて動きのある形になる', () => {
    for (const ch of [...'がぎぐげござじずぜぞだぢづでどばびぶべぼゔぱぴぷぺぽっゃゅょぁぃぅぇぉゎ']) {
      const { spec } = one(ch);
      expect(compileSign(spec).isStatic, ch).toBe(false);
    }
  });
});

/**
 * 独立照合 第1周（.agent-harness/runs/content-review-1/report.md）の指摘を、相手から見た絵の幾何で確かめる。
 * カメラの向きは描画の「相手から」の基準の向き（framing.ts の baseAngles）に合わせ、手の21点を画面の座標（右・上）にして測る。
 * それぞれ、直す前の値では条件を満たさないことも確かめる（試験が違いを見分けられることの確認）。
 */
describe('独立照合 第1周の指摘（相手から見た見え方）', () => {
  function viewerScreen(p: Vec3): [number, number] {
    const { yaw, pitch } = baseAngles('viewer', 'right');
    const dir: Vec3 = [Math.cos(pitch * DEG) * Math.sin(yaw * DEG), Math.sin(pitch * DEG), Math.cos(pitch * DEG) * Math.cos(yaw * DEG)];
    const right = normalize(cross([0, 1, 0], dir));
    const up = cross(dir, right);
    return [dot(p, right), dot(p, up)];
  }
  /** 21点（並びは MediaPipe と同じ: 5〜8＝人差し指、9〜12＝中指、2＝親指の付け根の関節、4＝親指の先、17〜20＝小指） */
  const screen = (shape: HandshapeSpec, orient: Orientation) => computeLandmarks(shape, orient).map(viewerScreen);
  const screenOf = (id: string) => {
    const { shape, orient } = firstPose(item(id).sign);
    return screen(shape, orient);
  };

  /** ろ・ぬ：人差し指と中指の基節（付け根〜第2関節）の中点の、相手から見た横のずれ */
  const twoFingerGap = (p: Array<[number, number]>) => Math.abs((p[5]![0] + p[6]![0]) / 2 - (p[9]![0] + p[10]![0]) / 2);
  it('ろ：相手から人差し指と中指が2本に見え、1本のぬと見分けられる', () => {
    // 奥の指の縁が見えるには、2本の軸が指の太さの半分（半径）以上ずれている必要がある
    expect(twoFingerGap(screenOf('kana-ro'))).toBeGreaterThanOrEqual(DIM.rad.index[0]);
    expect(firstPose(item('kana-nu').sign).shape.fingers.middle).toBe('curled');
    // 直す前（小指の側を真正面）では中指が人差し指の真後ろに重なっていた
    expect(twoFingerGap(screen(SHAPES.ro, { palm: 'viewerRight', fingers: 'up' }))).toBeLessThan(DIM.rad.index[0]);
  });

  /** ら：相手から見て2本が交わる高さ（人差し指の付け根から指先までの高さに対する割合）と、指先の左右の離れ */
  function crossing(p: Array<[number, number]>): { at: number | null; tipGap: number } {
    const idx = [5, 6, 7, 8].map((i) => p[i]!), mid = [9, 10, 11, 12].map((i) => p[i]!);
    const xAt = (line: Array<[number, number]>, h: number): number | null => {
      for (let i = 0; i + 1 < line.length; i++) {
        const [x0, y0] = line[i]!, [x1, y1] = line[i + 1]!;
        if ((y0 - h) * (y1 - h) <= 0 && y0 !== y1) return x0 + ((h - y0) / (y1 - y0)) * (x1 - x0);
      }
      return null;
    };
    const base = idx[0]![1], top = idx[3]![1];
    let prev: number | null = null;
    let at: number | null = null;
    for (let k = 0; k <= 200; k++) {
      const h = base + ((top - base) * k) / 200;
      const a = xAt(idx, h), b = xAt(mid, h);
      if (a === null || b === null) continue;
      if (prev !== null && Math.sign(a - b) !== Math.sign(prev)) {
        at = k / 200;
        break;
      }
      prev = a - b;
    }
    return { at, tipGap: mid[3]![0] - idx[3]![0] };
  }
  it('ら：相手から見て、2本が指の中ほどで交わり、指先が左右に分かれる（X 字に見える）', () => {
    const p = screenOf('kana-ra');
    // 付け根では人差し指が相手から見て右（親指の側）
    expect(p[5]![0]).toBeGreaterThan(p[9]![0]);
    const r = crossing(p);
    expect(r.at).not.toBeNull();
    expect(r.at!).toBeGreaterThan(0.3);
    expect(r.at!).toBeLessThan(0.65);
    // 指先では左右が入れ替わり、末節の太さ（直径）以上離れる
    expect(r.tipGap).toBeGreaterThanOrEqual(2 * DIM.rad.index[2]);
    // 直す前（cross だけ）は指先の近くで交わり、指先がほとんど分かれていなかった
    const before = crossing(screen({ ...SHAPES.ra, adjust: undefined }, { palm: 'toViewer', fingers: 'up' }));
    expect(before.tipGap).toBeLessThan(2 * DIM.rad.index[2]);
  });

  /** へ：相手から見た、親指（付け根の関節→先）と小指（付け根→先）の向き（右が 0°、下が −90°） */
  function heAngles(p: Array<[number, number]>) {
    const ang = (a: number, b: number) => Math.atan2(p[b]![1] - p[a]![1], p[b]![0] - p[a]![0]) / DEG;
    return { thumb: ang(2, 4), pinky: ang(17, 20) };
  }
  it('へ：相手から見て親指は水平から20〜50°下へ開き、小指との開きが75°以上ある（「ヘ」の山形）', () => {
    const a = heAngles(screenOf('kana-he'));
    expect(a.thumb).toBeGreaterThan(-50);
    expect(a.thumb).toBeLessThan(-20);
    expect(Math.abs(a.thumb - a.pinky)).toBeGreaterThanOrEqual(75);
    // 直す前（付け根の寄せ 5°）は親指が下を向きすぎ、開きが狭かった
    const before = heAngles(screen({ ...SHAPES.he, adjust: { thumb: { cmcFlex: 5 } } }, { palm: 'toSigner', fingers: 'down' }));
    expect(Math.abs(before.thumb - before.pinky)).toBeLessThan(75);
  });

  it('こ：親指が人差し指にめり込まない（描画の警告が出ない）', () => {
    expect(compileSign(item('kana-ko').sign).warnings).toEqual([]);
  });

  it('ん：カタカナの「ン」のように、払う画が下ろす画より長く、払い終わりが書き始めより高い', () => {
    const path = compileSign(item('kana-n').sign).trace!.path;
    let low = 0;
    for (let i = 1; i < path.length; i++) if (path[i]![1] < path[low]![1]) low = i;
    const arc = (a: number, b: number) => {
      let s = 0;
      for (let i = a + 1; i <= b; i++) s += Math.hypot(...sub(path[i]!, path[i - 1]!));
      return s;
    };
    const last = path.length - 1;
    expect(arc(low, last)).toBeGreaterThanOrEqual(1.4 * arc(0, low));
    expect(path[last]![1]).toBeGreaterThan(path[0]![1]);
    // 相手から見て左へ払う（表す人から見た「ン」の左右反転）
    expect(path[last]![0]).toBeLessThan(path[0]![0] - 1);
  });

  it('も：絵は閉じながら手を下げ、説明文にもその動きを書く', () => {
    const { start, end } = ends(item('kana-mo').sign);
    expect(end.wrist[1]).toBeLessThan(start.wrist[1] - 0.3);
    expect(item('kana-mo').describe.viewer).toMatch(/下げる/);
  });

  it('小さい字：小さい母音（ぁ など）も含む呼び方にし、画面に出る文で「拗音」と呼ばない', () => {
    const small = item('mod-youon');
    expect(small.label).toMatch(/小さい字/);
    expect(small.describe.viewer).toMatch(/ぁ/);
    for (const ch of 'ぁぃぅぇぉ') expect(fingerspellTokens(ch)[0]?.modifier, ch).toBe('mod-youon');
    // 画面に出る文（表示名・読み・説明・覚え方・地域差の注記・見分け方）。小さい母音は拗音ではない
    for (const i of [...KANA_ITEMS, ...MODIFIER_ITEMS]) {
      const texts = [i.label, i.reading ?? '', i.describe.viewer, i.describe.self, i.memory?.text ?? '', i.variants ?? '', ...(i.confusables ?? []).map((c) => c.tip)];
      for (const t of texts) expect(t, i.id).not.toMatch(/拗音|youon/);
    }
  });
});

/**
 * 独立照合 第2周（.agent-harness/runs/content-review-2/report.md）の指摘を、見え方の数で確かめる（第3周で直した）。
 * カメラは描画の基準の向き（相手から＝baseAngles、自分から＝selfAngles）に合わせ、手の21点を画面の座標（右・上）にして測る。
 * それぞれ、直す前の値では条件を満たさないことも確かめる（試験が違いを見分けられることの確認）。
 */
describe('独立照合 第2周の指摘（見え方・説明文・撮影の警告）', () => {
  /** 角度（度）の向きから見た画面の座標（右・上） */
  function screenFrom({ yaw, pitch }: { yaw: number; pitch: number }) {
    const dir: Vec3 = [Math.cos(pitch * DEG) * Math.sin(yaw * DEG), Math.sin(pitch * DEG), Math.cos(pitch * DEG) * Math.cos(yaw * DEG)];
    const right = normalize(cross([0, 1, 0], dir));
    const up = cross(dir, right);
    return (p: Vec3): [number, number] => [dot(p, right), dot(p, up)];
  }
  const viewer = screenFrom(baseAngles('viewer', 'right'));
  const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

  it('ろ：相手から2本のかぎ（人差し指と中指の中節）が、太さの和より離れて横に並んで見える', () => {
    /** 21点: 6・7＝人差し指の第2・第1関節、10・11＝中指の第2・第1関節。中節の中点どうしの画面上の距離 */
    const hooks = (shape: HandshapeSpec, orient: Orientation) => {
      const L = computeLandmarks(shape, orient).map(viewer);
      return dist(mid(L[6]!, L[7]!), mid(L[10]!, L[11]!));
    };
    const both = DIM.rad.index[1] + DIM.rad.middle[1];
    const { shape, orient } = firstPose(item('kana-ro').sign);
    expect(hooks(shape, orient)).toBeGreaterThanOrEqual(both);
    // 第2周の時点（手のひらを相手の方へ30°回した形）では、2本のかぎが重なって1本分の太さに見えた
    expect(hooks(shape, { palm: [0.87, 0, 0.5], fingers: 'up' })).toBeLessThan(0.75 * both);
    // ぬ は横向き（小指の側を相手へ）のまま。ろ とは向きでも見分けられる
    expect(firstPose(item('kana-nu').sign).orient).toEqual({ palm: 'viewerRight', fingers: 'up' });
  });

  it('ぬ：親指は曲げて握りの中に収め、握った中指より手のひらの側へ出ない（自分から見て C 字にならない）', () => {
    /** 手の座標の z（手のひらの側が＋）。親指の先と第1関節が、握った中指の第2関節より手前に出るか */
    const reach = (shape: HandshapeSpec) => {
      const s = skeleton(solveHandshape(shape).pose);
      return { thumb: Math.max(s.thumb.joints[3][2], s.thumb.joints[2][2]), middlePip: s.middle.joints[1][2] };
    };
    const now = reach(SHAPES.nu);
    expect(now.thumb).toBeLessThan(now.middlePip);
    // 第2周の時点（握った指の前に添える acrossFront）では、親指が握った中指の前へ立ち上がっていた
    const before = reach({ ...SHAPES.nu, thumb: 'acrossFront' });
    expect(before.thumb).toBeGreaterThan(before.middlePip);
  });

  it('め：自分から見て、中指・薬指・小指の先が末節の太さより離れて並ぶ（相手から見た輪はそのまま）', () => {
    const { shape, orient } = firstPose(item('kana-me').sign);
    const self = screenFrom(selfAngles('right', forwardness(compileSign(item('kana-me').sign))));
    const tips = (sh: HandshapeSpec) => {
      const L = computeLandmarks(sh, orient).map(self);
      return [dist(L[12]!, L[16]!), dist(L[16]!, L[20]!)];
    };
    const enough = 1.1 * 2 * DIM.rad.ring[2];
    for (const d of tips(shape)) expect(d).toBeGreaterThanOrEqual(enough);
    // 第2周の時点（開き 中指2・薬指4・小指8）では、薬指と小指の先がほぼ重なった
    expect(Math.min(...tips({ ...shape, spread: { index: 25, middle: 2, ring: 4, pinky: 8 } }))).toBeLessThan(enough);
    // 輪（親指の先と人差し指の先）は閉じたまま
    const ring = solveHandshape(shape).contacts.find((c) => c.b === 'index.tip');
    expect(ring?.gap ?? 1).toBeLessThan(0.02);
  });

  it('撮影の警告（親指のめり込み・置き場所からの離れ）が、全項目と、濁点・半濁点・小さい字の合成で出ない', () => {
    for (const i of ITEMS) expect(compileSign(i.sign).warnings, i.id).toEqual([]);
    for (const ch of [...'がぎぐげござじずぜぞだぢづでどばびぶべぼゔぱぴぷぺぽっゃゅょぁぃぅぇぉゎ']) {
      const spec = tokenSpec(fingerspellTokens(ch)[0]!);
      expect(spec, ch).toBeDefined();
      expect(compileSign(spec!).warnings, ch).toEqual([]);
    }
    // 直す前（親指を逆運動学の解のまま）では、う は親指が薬指にめり込み、け は親指の先が置き場所から離れた
    const warn = (shape: HandshapeSpec) => compileSign({ hands: { dominant: { keyframes: [{ t: 0, shape, orient: { palm: 'toViewer', fingers: 'up' }, pos: { at: 'neutral' } }] } } }).warnings.join(' ');
    expect(warn({ ...SHAPES.u, adjust: undefined })).toMatch(/めり込んでいます/);
    expect(warn({ ...SHAPES.ke, adjust: undefined })).toMatch(/離れています/);
  });

  it('小さい字の説明は「自分の方へ引く」にそろえ、小さい「ぉ」が「を」と同じ動きになることを書く', () => {
    const small = item('mod-youon');
    for (const t of [small.describe.viewer, small.describe.self, small.variants ?? '', item('kana-wo').memory?.text ?? '']) expect(t).not.toMatch(/手前/);
    expect(small.describe.viewer).toMatch(/自分の方へ引く/);
    expect(small.describe.self).toMatch(/「ぉ」.*「を」/);
    // 合成の上でも、小さい「ぉ」は「を」と同じ形と動き
    expect(tokenSpec(fingerspellTokens('ぉ')[0]!)).toEqual(item('kana-wo').sign);
  });
});
