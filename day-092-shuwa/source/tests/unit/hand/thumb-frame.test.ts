/**
 * 小さな画像の枠と、縁のぼかし（hand-r3）。見た目の採点 第2周の指摘:
 *  - 袖が札の中で直線に切れて見える（小さな画像の縁で切れた袖が、白い札の中の切れ目に見えた）
 *  - 半濁音・のばす音の手が小さく上に浮く（動き全体を収める大きな表示の枠を、止まった1枚の絵にも使っていた）
 * 大きな表示（HandView）の枠と見え方は変えない。
 */
import { describe, expect, it } from 'vitest';
import { ShaderLib } from 'three';
import type { Vec3 } from '../../../src/hand/types';
import { ITEMS, getItem } from '../../../src/content';
import { MODIFIER_MOVES } from '../../../src/content/compose';
import { fingerspellTokens, tokenSpec } from '../../../src/content/spell';
import { add, cross, dot, mulMV, normalize, sub } from '../../../src/hand/core/math';
import { HAND_RADIUS_MIN, THUMB_TRACE_MAX_SPREAD, baseAngles, cameraPosition, nonDominantResting, signBounds, thumbnailBounds, type Bounds } from '../../../src/hand/core/framing';
import { compileSign, handPointsInField, sampleSign } from '../../../src/hand/core/timeline';
import { thumbnailTime } from '../../../src/hand/core/thumb-time';
import { edgeFadeUniforms, fadeAtEdges, materials } from '../../../src/hand/render/materials';
import { HandRig } from '../../../src/hand/render/hand-rig';
import { Stage } from '../../../src/hand/render/stage';
import { MeshStandardMaterial, type Material, type Mesh } from 'three';

const thumbOf = (spec: Parameters<typeof compileSign>[0], dominant: 'right' | 'left' = 'right') => {
  const c = compileSign(spec);
  return thumbnailBounds(c, thumbnailTime(spec, c, undefined), dominant, !!spec.body);
};
const sign = (id: string) => getItem(id)!.sign;
const composed = (ch: string) => tokenSpec(fingerspellTokens(ch)[0]!)!;
const expectSameBounds = (a: Bounds, b: Bounds, what: string) => {
  expect(a.radius, what).toBeCloseTo(b.radius, 9);
  for (let k = 0; k < 3; k++) expect(a.center[k], what).toBeCloseTo(b.center[k]!, 9);
};

/** カメラ（相手から）から見た画面の上の位置（枠の縁が ±1） */
function screen(b: Bounds, c: ReturnType<typeof compileSign>, p: Vec3): [number, number] {
  const a = baseAngles('viewer', 'right', c);
  const cam = cameraPosition(b, a.yaw, a.pitch, 28);
  const fwd = normalize(sub(b.center, cam));
  const right = normalize(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const v = sub(p, cam), z = dot(v, fwd), t = Math.tan((14 * Math.PI) / 180);
  return [dot(v, right) / (z * t), dot(v, up) / (z * t)];
}
const EDGE: Vec3[] = [[-0.41, 0.56, 0], [0.342, 0.62, 0], [0, -0.3, 0], [0.24, -0.22, 0], [-0.24, -0.22, 0]];

const handOnly = ITEMS.filter((i) => !i.sign.body);
const staticRadii = handOnly.filter((i) => compileSign(i.sign).isStatic).map((i) => signBounds(compileSign(i.sign), 'right', false).radius);

describe('小さな画像の枠（手だけ）', () => {
  it('動きのない形は、大きな表示と同じ枠（今までの小さな画像と変わらない）', () => {
    for (const i of handOnly.filter((x) => compileSign(x.sign).isStatic)) {
      expectSameBounds(thumbOf(i.sign), signBounds(compileSign(i.sign), 'right', false), i.id);
    }
  });

  it('変化（濁音・半濁音・促音・小さい字）と合成の例は、元の文字と同じ大きさで、動いた先へ同じだけずれた所が真ん中（絵が同じになる）', () => {
    const cases: Array<[string, Parameters<typeof compileSign>[0], string, keyof typeof MODIFIER_MOVES]> = [
      ['mod-dakuon', sign('mod-dakuon'), 'kana-ka', 'mod-dakuon'],
      ['mod-handakuon', sign('mod-handakuon'), 'kana-ha', 'mod-handakuon'],
      ['mod-sokuon', sign('mod-sokuon'), 'kana-tsu', 'mod-sokuon'],
      ['mod-youon', sign('mod-youon'), 'kana-ya', 'mod-youon'],
      ['が', composed('が'), 'kana-ka', 'mod-dakuon'],
      ['じ', composed('じ'), 'kana-shi', 'mod-dakuon'],
      ['ぱ', composed('ぱ'), 'kana-ha', 'mod-handakuon'],
      ['ぴ', composed('ぴ'), 'kana-hi', 'mod-handakuon'],
      ['っ', composed('っ'), 'kana-tsu', 'mod-sokuon'],
      ['ゃ', composed('ゃ'), 'kana-ya', 'mod-youon'],
      ['ぉ', composed('ぉ'), 'kana-o', 'mod-youon'],
    ];
    for (const [what, spec, base, mod] of cases) {
      const b = thumbOf(spec), o = thumbOf(sign(base));
      expect(b.radius, what).toBeCloseTo(o.radius, 9);
      const d = MODIFIER_MOVES[mod];
      for (let k = 0; k < 3; k++) expect(b.center[k]! - o.center[k]!, what).toBeCloseTo(d[k]!, 9);
    }
    // 直す前は、動き全体を収めていたので半径が大きかった（ぱ 1.62・は 1.37）
    expect(signBounds(compileSign(composed('ぱ')), 'right', false).radius).toBeGreaterThan(thumbOf(sign('kana-ha')).radius * 1.15);
  });

  it('動く形（を・も・10・100・1000 と変化）の枠は、動きのない形の半径の範囲に入り、描く時点の手は枠に収まる', () => {
    const moving = [...handOnly.filter((i) => !compileSign(i.sign).isStatic && !i.sign.trace).map((i) => i.sign), ...Array.from('がじぱぴっゃぉ').map(composed)];
    expect(moving.length).toBeGreaterThan(10);
    const lo = Math.min(...staticRadii), hi = Math.max(...staticRadii);
    for (const spec of moving) {
      const c = compileSign(spec);
      const t = thumbnailTime(spec, c, undefined);
      const b = thumbnailBounds(c, t, 'right', false);
      expect(b.radius).toBeGreaterThanOrEqual(Math.max(lo, HAND_RADIUS_MIN) - 1e-9);
      expect(b.radius).toBeLessThanOrEqual(hi + 1e-9);
      const h = sampleSign(c, t).dominant;
      for (const p of [...handPointsInField(h, false), ...EDGE.map((e) => add(h.wrist, mulMV(h.rot, e)))]) {
        const [x, y] = screen(b, c, p);
        expect(Math.max(Math.abs(x), Math.abs(y))).toBeLessThan(1);
      }
    }
  });

  it('空中に書く跡（の・り・ん・のばす音）は、跡の 2/3 が見えるまで（上限 1.3 倍）枠を広げ、手は枠に収まる。のばす音はほかの札とほぼ同じ大きさ', () => {
    const traced = handOnly.filter((i) => i.sign.trace);
    expect(traced.map((i) => i.id).sort()).toEqual(['kana-n', 'kana-no', 'kana-ri', 'mod-chouon']);
    for (const i of traced) {
      const c = compileSign(i.sign);
      const t = thumbnailTime(i.sign, c, undefined);
      const own = thumbnailBounds(c, t, 'right', false, 'viewer', 1);
      const b = thumbnailBounds(c, t, 'right', false);
      expect(b.radius, i.id).toBeLessThanOrEqual(own.radius * THUMB_TRACE_MAX_SPREAD + 1e-9);
      // 跡のうち画面の内側（縁から 1 割より中）に入る長さの割合。上限まで広げた の 以外は 2/3 以上
      const path = c.trace!.path;
      let total = 0, shown = 0;
      for (let k = 1; k < path.length; k++) {
        const len = Math.hypot(...sub(path[k]!, path[k - 1]!));
        const [x, y] = screen(b, c, [(path[k]![0] + path[k - 1]![0]) / 2, (path[k]![1] + path[k - 1]![1]) / 2, (path[k]![2] + path[k - 1]![2]) / 2]);
        total += len;
        if (Math.max(Math.abs(x), Math.abs(y)) <= 0.8) shown += len;
      }
      if (b.radius < own.radius * THUMB_TRACE_MAX_SPREAD - 1e-9) expect(shown / total, i.id).toBeGreaterThanOrEqual(0.6);
      else expect(shown / total, i.id).toBeGreaterThan(0.5);
      const h = sampleSign(c, t).dominant;
      for (const p of handPointsInField(h, false)) {
        const [x, y] = screen(b, c, p);
        expect(Math.max(Math.abs(x), Math.abs(y)), i.id).toBeLessThan(1);
      }
    }
    // 書き始める前（跡をまだ描かない時点）は、跡のために枠を広げない
    for (const i of traced) {
      const c0 = compileSign(i.sign);
      expectSameBounds(thumbnailBounds(c0, 0, 'right', false), thumbnailBounds(c0, 0, 'right', false, 'viewer', 1), `${i.id} の書き始める前`);
    }
    // のばす音は、手だけの枠とほぼ同じ（直す前は動き全体と跡を収めて 1.27 倍・手が小さく下に寄った）
    const c = compileSign(sign('mod-chouon'));
    expect(thumbOf(sign('mod-chouon')).radius).toBeLessThan(thumbnailBounds(c, c.duration, 'right', false, 'viewer', 1).radius * 1.05);
    expect(signBounds(c, 'right', false).radius).toBeGreaterThan(thumbOf(sign('mod-chouon')).radius * 1.2);
  });

  it('左利きは、中心を X で反転するだけ（半径は同じ）', () => {
    for (const spec of [sign('kana-a'), sign('mod-handakuon'), sign('kana-no'), composed('が')]) {
      const r = thumbOf(spec, 'right'), l = thumbOf(spec, 'left');
      expect(l.radius).toBeCloseTo(r.radius, 12);
      expect(l.center[0]).toBeCloseTo(-r.center[0], 12);
      expect(l.center[1]).toBeCloseTo(r.center[1], 12);
      expect(l.center[2]).toBeCloseTo(r.center[2], 12);
    }
  });
});

describe('小さな画像の枠（上半身つき）と、休めている手', () => {
  it('上半身つきの単語は、大きな表示と同じ枠', () => {
    for (const w of ITEMS.filter((i) => i.sign.body)) expectSameBounds(thumbOf(w.sign), signBounds(compileSign(w.sign), 'right', true), w.id);
  });

  it('反対の手が形を作る前は「休めている」（おはよう・こんにちはの小さな画像の時点）。片手の語・最初から両手の語は休めていない', () => {
    const resting = (id: string) => {
      const s = sign(id), c = compileSign(s);
      return nonDominantResting(c, thumbnailTime(s, c, undefined));
    };
    expect(resting('word-ohayou')).toBe(true);
    expect(resting('word-konnichiwa')).toBe(true);
    for (const id of ['word-konbanwa', 'word-arigatou', 'word-namae', 'word-wakaru', 'word-suki', 'kana-a']) expect(resting(id), id).toBe(false);
  });
});

describe('縁のぼかし（描画。WebGL なしで確かめられる所）', () => {
  it('ぼかす幅は小さな画像の舞台だけ。大きな表示の舞台は 0（何もしない）', () => {
    const big = new Stage();
    big.setEdgeFadeFor(600, 400);
    expect(edgeFadeUniforms.uEdgeFade.value.toArray()).toEqual([600, 400, 0]);
    const thumb = new Stage();
    thumb.edgeFade = 0.2;
    thumb.setEdgeFadeFor(192, 192);
    expect(edgeFadeUniforms.uEdgeFade.value.z).toBeCloseTo(38.4, 9);
    big.setEdgeFadeFor(600, 400);
    expect(edgeFadeUniforms.uEdgeFade.value.z).toBe(0);
  });

  it('袖・腕・胴・跡の材質は縁でぼかし、手（肌・爪・輪郭線）と頭（髪・顔）の材質はぼかさない', () => {
    const M = materials();
    const faded = (m: Material) => m.customProgramCacheKey() === 'tekotoba-edge-fade';
    for (const m of [M.sleeve, M.sleeveRim, M.shirt, M.shirtSeeThrough, M.skinFaded, M.nailFaded]) expect(faded(m)).toBe(true);
    for (const m of [M.skin, M.nail, M.hair, M.face, M.skinSeeThrough, M.hairSeeThrough]) expect(faded(m)).toBe(false);
    expect(M.sleeveOutline.fragmentShader).toContain('edgeFade(gl_FragColor)');
    expect(M.outlineFaded.fragmentShader).toContain('edgeFade(gl_FragColor)');
    expect(M.outline.fragmentShader).not.toContain('edgeFade');
    expect(M.sleeveOutline.uniforms.uEdgeFade).toBe(edgeFadeUniforms.uEdgeFade);
  });

  it('three.js の標準の材質（standard・basic）の終わりに、ぼかしの処理が差し込まれる（three.js を上げて差し込む目印が消えたら落ちる）', () => {
    for (const lib of ['standard', 'basic'] as const) {
      const shader = { uniforms: {} as Record<string, unknown>, fragmentShader: ShaderLib[lib].fragmentShader, vertexShader: '' };
      const m = fadeAtEdges(new MeshStandardMaterial());
      (m.onBeforeCompile as (s: typeof shader) => void)(shader);
      expect(shader.fragmentShader).toContain('gl_FragColor = edgeFade( gl_FragColor );');
      expect(shader.fragmentShader.indexOf('vec4 edgeFade(')).toBeLessThan(shader.fragmentShader.indexOf('void main()'));
      expect(shader.uniforms.uEdgeFade).toBe(edgeFadeUniforms.uEdgeFade);
    }
  });

  it('休めている手だけ、手の肌・爪・輪郭線もぼかす材質に入れ替える（舞台は反対の手だけを入れ替える）', () => {
    const M = materials();
    const rig = new HandRig({ mirrored: true, cuff: true });
    const used = () => {
      const s = new Set<Material>();
      for (const root of [rig.group, rig.cuff]) root.traverse((o) => { if ((o as Mesh).isMesh) s.add((o as Mesh).material as Material); });
      return s;
    };
    expect(used().has(M.skin)).toBe(true);
    rig.setEdgeFade(true);
    const on = used();
    expect(on.has(M.skin) || on.has(M.nail) || on.has(M.outline)).toBe(false);
    expect(on.has(M.skinFaded) && on.has(M.nailFaded) && on.has(M.outlineFaded)).toBe(true);
    rig.setEdgeFade(false);
    const off = used();
    expect(off.has(M.skinFaded) || off.has(M.nailFaded) || off.has(M.outlineFaded)).toBe(false);
  });
});
