/**
 * Tasks 2.1 & 2.2 テスト：空き棚「品切れ」判定・札分離と転倒方向・済スタンプ・パーティクル・バナナ出現パルス・カメラ衝撃振動。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildWorldStatic, storeLayout, type ShelfFace, type SignDef } from '../../src/shared/layout/store';
import { FALL } from '../../src/shared/rules/tuning';
import type { StationsView as StationsState, WorldView } from '../../src/shared/view';
import { FollowCamera } from '../../src/client/render/camera';
import { PALETTE } from '../../src/client/render/palette';
import { MovableSignsView, NoticeStampsView, buildSigns, computeTipRotation, isMovableSignTriggered, partitionSigns, stampScaleCurve } from '../../src/client/render/signs';
import { ShelfMarksView, buildShelfZones, computeShelfZoneStatuses, SHELF_ZONES_PER_FACE } from '../../src/client/render/shelfMarks';
import { FX_MAX_PARTICLES, Fx3dView } from '../../src/client/render/fx3d';
import { StationsView } from '../../src/client/render/stations3d';

const layout = storeLayout();
const SEED = 20261006;

function homeTransforms(world: ReturnType<typeof buildWorldStatic>): { propTransforms: Float32Array; propHidden: Uint8Array } {
  const propTransforms = new Float32Array(world.props.length * 7);
  for (const p of world.props) {
    propTransforms.set([p.home.pos.x, p.home.pos.y, p.home.pos.z, 0, 0, 0, 1], p.id * 7);
  }
  return { propTransforms, propHidden: new Uint8Array(world.props.length) };
}

function emptyStations(): StationsState {
  return {
    pyramid: { collapsed: false, rebuildIn: 0 },
    bowling: { pinsDown: 0, resetIn: 0 },
    samples: { left: 8, refillIn: 0 },
    watermelons: { left: 6, refillIn: 0 },
    pa: { activeSlot: null, holdProgress: 0, cooldown: 0 },
    freezerSlots: [],
  };
}

function makeView(world: ReturnType<typeof buildWorldStatic>, overrides: Partial<WorldView> = {}): WorldView {
  const { propTransforms, propHidden } = homeTransforms(world);
  return {
    phase: 'playing',
    timeLeft: 90,
    duration: 120,
    lastSpurt: false,
    avatars: [
      {
        slot: 0,
        kind: 'human',
        name: '1P',
        character: 'ch/character-female-b',
        pos: { x: 0, y: 0, z: 4 },
        yaw: Math.PI,
        anim: 'idle',
        holding: null,
        ridingCart: null,
        stunned: 0,
        score: 0,
        combo: { level: 0, multiplier: 1, remaining: 0 },
        heat: 0,
        achieved: [],
        secrets: [],
        isLocal: true,
        prompt: null,
        connected: true,
      },
    ],
    npcs: [],
    propTransforms,
    propHidden,
    carts: [],
    peels: [],
    stations: emptyStations(),
    events: [],
    damage: 0,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shelfMarks.ts 空き棚区画の判定', () => {
  const world = buildWorldStatic(SEED);

  it('各 ShelfFace を長手3区画に分割し、初期状態ではすべて未空きになる', () => {
    const zones = buildShelfZones(layout.faces, world);
    expect(zones.length).toBe(layout.faces.length * SHELF_ZONES_PER_FACE);
    const { propTransforms, propHidden } = homeTransforms(world);
    const statuses = computeShelfZoneStatuses(zones, propTransforms, propHidden);
    expect(statuses.length).toBe(zones.length);
    for (const s of statuses) {
      expect(s.ratio).toBe(0);
      expect(s.empty).toBe(false);
    }
  });

  it('区画内商品の70%以上が FALL.moveDistance 以上移動または非表示になると empty が true になる', () => {
    const face = layout.faces.find((f) => f.nx !== 0)!;
    const zones = buildShelfZones([face], world).filter((z) => z.propIds.length >= 2);
    expect(zones.length).toBeGreaterThan(0);
    const zone = zones[0]!;
    const { propTransforms, propHidden } = homeTransforms(world);

    // 1つだけ（2個中1個=50% < 70%）少し動かすだけでは足りないケース
    if (zone.propIds.length === 2) {
      const id0 = zone.propIds[0]!;
      propTransforms[id0 * 7] = world.props[id0]!.home.pos.x + FALL.moveDistance * 0.5;
      const before = computeShelfZoneStatuses([zone], propTransforms, propHidden)[0]!;
      expect(before.empty).toBe(false);

      propTransforms[id0 * 7] = world.props[id0]!.home.pos.x + FALL.moveDistance + 0.01;
      const half = computeShelfZoneStatuses([zone], propTransforms, propHidden)[0]!;
      expect(half.ratio).toBeCloseTo(0.5, 5);
      expect(half.empty).toBe(false);

      // 2つ目を非表示にして 100% >= 70%
      propHidden[zone.propIds[1]!] = 1;
      const after = computeShelfZoneStatuses([zone], propTransforms, propHidden)[0]!;
      expect(after.ratio).toBe(1);
      expect(after.empty).toBe(true);
    } else {
      const need = Math.ceil(zone.propIds.length * 0.7);
      for (let i = 0; i < need - 1; i++) {
        const id = zone.propIds[i]!;
        propTransforms[id * 7] = world.props[id]!.home.pos.x + FALL.moveDistance + 0.05;
      }
      expect(computeShelfZoneStatuses([zone], propTransforms, propHidden)[0]!.empty).toBe(false);
      propHidden[zone.propIds[need - 1]!] = 1;
      expect(computeShelfZoneStatuses([zone], propTransforms, propHidden)[0]!.empty).toBe(true);
    }
  });

  it('商品が0個の区画・空の ShelfFace でも NaN を出さず安全に ratio=0, empty=false を返す', () => {
    const emptyFace: ShelfFace = { id: 999, fixtureId: 999, x: 0, z: 0, nx: 1, nz: 0, halfLen: 0.92, aisle: 'snack' };
    const zones = buildShelfZones([emptyFace], world);
    expect(zones.length).toBe(3);
    const { propTransforms, propHidden } = homeTransforms(world);
    const statuses = computeShelfZoneStatuses(zones, propTransforms, propHidden);
    for (const s of statuses) {
      expect(s.total).toBe(0);
      expect(Number.isNaN(s.ratio)).toBe(false);
      expect(s.ratio).toBe(0);
      expect(s.empty).toBe(false);
    }
  });
});

describe('signs.ts 札の分離・転倒方向・済スタンプ', () => {
  it('style==="pop" && pole の「特売」「本日のおすすめ」を可動札へ分離し、notice 札数は misdeed 付きと一致する', () => {
    const expectedNotice = layout.signs.filter((s) => s.style === 'notice' && s.misdeed);
    const expectedMovable = layout.signs.filter((s) => s.style === 'pop' && s.pole);
    expect(expectedMovable.map((s) => s.text).sort()).toEqual(['特売', '本日のおすすめ'].sort());

    const part = partitionSigns(layout.signs, layout);
    expect(part.noticeSigns.length).toBe(expectedNotice.length);
    expect(part.movableSigns.length).toBe(2);
    expect(part.staticSigns.length).toBe(layout.signs.length - 2);
    expect(part.staticSigns.some((s) => s.style === 'pop' && s.pole)).toBe(false);

    const tokubai = part.movableSigns.find((m) => m.sign.text === '特売')!;
    const susume = part.movableSigns.find((m) => m.sign.text === '本日のおすすめ')!;
    expect(tokubai.trigger).toBe('pyramid');
    expect(susume.trigger).toBe('bowling');
  });

  it('転倒角度は saleTable / bowling レーンから外側へ向かい、約55〜80度の傾きになる', () => {
    const part = partitionSigns(layout.signs, layout);
    const tokubai = part.movableSigns.find((m) => m.sign.text === '特売')!;
    const susume = part.movableSigns.find((m) => m.sign.text === '本日のおすすめ')!;

    // 特売は saleTable の東(+X)にあるため、rotation.z < 0（東へ傾く）
    expect(tokubai.tipRotation.z).toBeLessThan(0);
    // 本日のおすすめは wagon/bowling の西(-X)にあるため、rotation.z > 0（西へ傾く）
    expect(susume.tipRotation.z).toBeGreaterThan(0);

    for (const m of [tokubai, susume]) {
      const magDeg = (Math.hypot(m.tipRotation.x, m.tipRotation.z) * 180) / Math.PI;
      expect(magDeg).toBeGreaterThan(55);
      expect(magDeg).toBeLessThan(80);
    }

    // 任意の配置でも台から離れる向きに傾く
    const westSign: SignDef = { text: '特売', pos: { x: 1.0, y: 1.1, z: 3.8 }, w: 0.9, h: 0.7, style: 'pop', pole: true };
    const rWest = computeTipRotation(westSign, 'pyramid', layout);
    expect(rWest.z).toBeGreaterThan(0);
  });

  it('転倒トリガー条件と済スタンプの弾みカーブが正しく動く', () => {
    const st = emptyStations();
    expect(isMovableSignTriggered('pyramid', st)).toBe(false);
    expect(isMovableSignTriggered('bowling', st)).toBe(false);

    expect(isMovableSignTriggered('pyramid', { ...st, pyramid: { collapsed: true, rebuildIn: 20 } })).toBe(true);
    expect(isMovableSignTriggered('bowling', { ...st, bowling: { pinsDown: 3, resetIn: 6 } })).toBe(true);
    expect(isMovableSignTriggered('bowling', { ...st, watermelons: { left: 0, refillIn: 10 } })).toBe(true);

    expect(stampScaleCurve(0)).toBe(0);
    expect(stampScaleCurve(0.6)).toBeGreaterThan(1.05);
    expect(stampScaleCurve(1)).toBeCloseTo(1, 5);
  });

  it('buildSigns() は既存の戻り値形 { mesh, poles, texture } を維持しつつ、pop&&pole 札を静的メッシュから除外する', () => {
    const fakeCtx = {
      font: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      textAlign: 'center',
      textBaseline: 'middle',
      save() {},
      restore() {},
      beginPath() {},
      moveTo() {},
      arcTo() {},
      closePath() {},
      fill() {},
      stroke() {},
      clip() {},
      fillRect() {},
      fillText() {},
      measureText: (s: string) => ({ width: s.length * 10 }),
    };
    vi.stubGlobal('document', {
      createElement: () => ({ width: 2048, height: 2048, getContext: () => fakeCtx }),
    });

    const built = buildSigns(layout.signs);
    expect(built.mesh).toBeInstanceOf(THREE.Mesh);
    expect(built.poles).not.toBeNull();
    expect(built.texture).toBeInstanceOf(THREE.CanvasTexture);

    // 静的な札の数 = layout.signs.length - 2 (特売・本日のおすすめ)
    const staticCount = layout.signs.length - 2;
    const posAttr = built.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    // 1枚の四角 = non-indexed 2三角形 = 6頂点
    expect(posAttr.count).toBe(staticCount * 6);

    // 残る静的ポールは cart と freezer の2本のみ（各ポール: 6角柱側面12+上下各6=24三角? いや CylinderGeometry 6seg & 12seg の2本分）
    const onlyTwoStaticPoles = buildSigns(layout.signs.filter((s) => !(s.style === 'pop' && s.pole)));
    expect(built.poles!.getAttribute('position').count).toBe(onlyTwoStaticPoles.poles!.getAttribute('position').count);
  });
});

describe('camera.ts FollowCamera 衝撃振動と reduced-motion', () => {
  it('shake() は update() 後にビュー平面オフセットと微小 FOV キックを与え、向き（北固定）を変えず、0.4s 以内に指数減衰して 0 に戻る', () => {
    const cam = new FollowCamera();
    cam.resize(1440, 900);
    const target = { x: 2, y: 0, z: 6 };
    cam.update(1 / 60, target);
    const basePos = cam.camera.position.clone();
    const baseDir = cam.camera.getWorldDirection(new THREE.Vector3());
    const baseFov = cam.camera.fov;

    cam.shake(1.0);
    cam.update(1 / 60, target);
    const shakenPos = cam.camera.position.clone();
    const shakenDir = cam.camera.getWorldDirection(new THREE.Vector3());
    const delta = shakenPos.clone().sub(basePos);

    // オフセットが発生し、上限 0.18m・FOV +1.0度以内
    expect(delta.length()).toBeGreaterThan(0.01);
    expect(delta.length()).toBeLessThanOrEqual(0.185);
    expect(cam.camera.fov - baseFov).toBeGreaterThan(0);
    expect(cam.camera.fov - baseFov).toBeLessThanOrEqual(1.0);

    // ビュー平面に直交（視線方向へのブレなし）かつ北向きの固定角を保持
    expect(Math.abs(delta.dot(baseDir))).toBeLessThan(1e-5);
    expect(shakenDir.distanceTo(baseDir)).toBeLessThan(1e-6);

    // 0.4s (24フレーム) で 0 に減衰する
    for (let i = 0; i < 24; i++) cam.update(1 / 60, target);
    expect(cam.camera.position.distanceTo(basePos)).toBeLessThan(1e-6);
    expect(cam.camera.fov).toBeCloseTo(baseFov, 6);
  });

  it('prefers-reduced-motion: reduce が有効なときは振動も FOV 変化も完全に 0', () => {
    vi.stubGlobal('window', {
      matchMedia: (q: string) => ({ matches: q.includes('prefers-reduced-motion') }),
    });
    const cam = new FollowCamera();
    cam.resize(1440, 900);
    const target = { x: 0, y: 0, z: 5 };
    cam.update(1 / 60, target);
    const basePos = cam.camera.position.clone();
    const baseFov = cam.camera.fov;

    cam.shake(1.0);
    cam.update(1 / 60, target);
    expect(cam.camera.position.distanceTo(basePos)).toBe(0);
    expect(cam.camera.fov).toBe(baseFov);
  });

  it('固定ショット (currentShot !== null) のときは振動も FOV 変化も完全に 0', () => {
    const cam = new FollowCamera();
    cam.resize(1440, 900);
    cam.setShot('S1');
    expect(cam.currentShot).toBe('S1');
    const target = { x: 0, y: 0, z: 5 };
    cam.update(1 / 60, target);
    const shotPos = cam.camera.position.clone();
    const shotFov = cam.camera.fov;

    cam.shake(1.0);
    cam.update(1 / 60, target);
    expect(cam.camera.position.distanceTo(shotPos)).toBe(0);
    expect(cam.camera.fov).toBe(shotFov);
  });

  it('setPose() は位置・見る点・画角を直接上書きし（振動・ばね無効）、null で標準の追従カメラに戻る', () => {
    const cam = new FollowCamera();
    cam.resize(540, 960);
    const target = { x: 2, y: 0, z: 5 };
    cam.update(1 / 60, target);
    const followPos = cam.camera.position.clone();
    const followDir = cam.camera.getWorldDirection(new THREE.Vector3());
    const followFov = cam.camera.fov;

    const customPos: [number, number, number] = [5.5, 2.2, 9.0];
    const customLook: [number, number, number] = [2.0, 0.8, 4.0];
    cam.setPose({ pos: customPos, look: customLook, fov: 62 });
    cam.shake(1.0);
    cam.update(1 / 60, target);

    expect(cam.currentPose).toEqual({ pos: customPos, look: customLook, fov: 62 });
    expect(cam.camera.position.distanceTo(new THREE.Vector3(...customPos))).toBeLessThan(1e-6);
    expect(cam.camera.fov).toBe(62);
    const expectedDir = new THREE.Vector3(...customLook).sub(new THREE.Vector3(...customPos)).normalize();
    expect(cam.camera.getWorldDirection(new THREE.Vector3()).distanceTo(expectedDir)).toBeLessThan(1e-6);

    // ターゲット位置が動いても、pose 中はばね追従・振動の影響を受けない
    cam.update(1 / 60, { x: -10, y: 0, z: -8 });
    expect(cam.camera.position.distanceTo(new THREE.Vector3(...customPos))).toBeLessThan(1e-6);
    expect(cam.camera.fov).toBe(62);

    // fov 省略時は標準画角が使われる
    cam.setPose({ pos: customPos, look: customLook });
    cam.update(1 / 60, target);
    expect(cam.camera.fov).toBe(followFov);

    // null で追従カメラに戻る
    cam.setPose(null);
    expect(cam.currentPose).toBeNull();
    cam.update(1 / 60, target);
    expect(cam.camera.position.distanceTo(followPos)).toBeLessThan(1e-6);
    expect(cam.camera.getWorldDirection(new THREE.Vector3()).distanceTo(followDir)).toBeLessThan(1e-6);
    expect(cam.camera.fov).toBe(followFov);
  });
});

describe('fx3d.ts パーティクルプールと stations3d.ts バナナ出現パルス', () => {
  const world = buildWorldStatic(SEED);

  it('Fx3dView は140粒の単一 InstancedMesh を確保し、イベントと冷凍ケースで発火・減衰し、dispose できる', () => {
    const fx = new Fx3dView();
    expect(fx.mesh).toBeInstanceOf(THREE.InstancedMesh);
    expect(fx.mesh.count).toBe(FX_MAX_PARTICLES);
    expect(fx.activeCount).toBe(0);

    const view = makeView(world, {
      events: [
        { t: 'score', slot: 0, kind: 'pyramid', points: 500, multiplier: 1, pos: { x: 3.5, y: 0.5, z: 3.6 } },
        { t: 'achieve', slot: 0, id: 'pyramid', bonus: 300 },
        { t: 'slip', slot: null, npc: 0, by: 0, pos: { x: -2, y: 0, z: 1 } },
      ],
      stations: { ...emptyStations(), freezerSlots: [0] },
    });
    fx.update(view, 0.12);
    expect(fx.activeCount).toBeGreaterThan(20);

    // 有効な色が PALETTE の色から選ばれていること
    const allowed = new Set(
      [PALETTE.red, PALETTE.yellow, PALETTE.blue, PALETTE.green, PALETTE.pastelSky, PALETTE.cream].map((hex) =>
        new THREE.Color(hex).getHexString(),
      ),
    );
    const c = new THREE.Color();
    fx.mesh.getColorAt(0, c);
    expect(allowed.has(c.getHexString())).toBe(true);

    // 時間経過で消える
    const calm = makeView(world);
    for (let i = 0; i < 30; i++) fx.update(calm, 0.05);
    expect(fx.activeCount).toBe(0);
    fx.dispose();
  });

  it('StationsView は新規バナナの皮出現時に scale 1.5 -> 1.0 のポップを行う', () => {
    const stView = new StationsView(layout, new THREE.MeshLambertMaterial({ vertexColors: true }));
    const view1 = makeView(world, { peels: [{ id: 7, owner: 0, pos: { x: 1, y: 0, z: 2 } }] });
    stView.update(view1, 0.016);
    const m = new THREE.Matrix4();
    const s = new THREE.Vector3();
    (stView.group.children[0] as THREE.InstancedMesh).getMatrixAt(0, m);
    s.setFromMatrixScale(m);
    expect(s.x).toBeGreaterThan(1.3);

    stView.update(view1, 0.4);
    (stView.group.children[0] as THREE.InstancedMesh).getMatrixAt(0, m);
    s.setFromMatrixScale(m);
    expect(s.x).toBeCloseTo(1.0, 3);
    stView.dispose();
  });

  it('NoticeStampsView は未達成で scale=0、達成で右上前方(+0.03m)に 0.25s 弾みスタンプを出し、reset() で消える', () => {
    const part = partitionSigns(layout.signs, layout);
    const stamps = new NoticeStampsView(part.noticeSigns);
    expect(stamps.mesh.count).toBe(part.noticeSigns.length);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();

    stamps.update([], 0.016);
    stamps.mesh.getMatrixAt(0, m);
    s.setFromMatrixScale(m);
    expect(s.x).toBe(0);

    // 達成直後〜0.15s でオーバーシュート、0.25s で定着
    const targetSign = part.noticeSigns[0]!;
    stamps.update([targetSign.misdeed], 0.016);
    stamps.update([targetSign.misdeed], 0.15);
    stamps.mesh.getMatrixAt(0, m);
    s.setFromMatrixScale(m);
    const overScale = s.x;

    stamps.update([targetSign.misdeed], 0.15);
    stamps.mesh.getMatrixAt(0, m);
    p.setFromMatrixPosition(m);
    s.setFromMatrixScale(m);
    expect(overScale).toBeGreaterThan(s.x);
    expect(p.x).toBeGreaterThan(targetSign.pos.x);
    expect(p.y).toBeGreaterThan(targetSign.pos.y);
    expect(p.z).toBeCloseTo(targetSign.pos.z + 0.03, 5);

    stamps.reset();
    stamps.mesh.getMatrixAt(0, m);
    s.setFromMatrixScale(m);
    expect(s.x).toBe(0);
  });

  it('MovableSignsView はトリガーで床を突き抜けず傾き、リセットで直立に戻る', () => {
    const fakeCtx = {
      font: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      textAlign: 'center',
      textBaseline: 'middle',
      save() {},
      restore() {},
      beginPath() {},
      moveTo() {},
      arcTo() {},
      closePath() {},
      fill() {},
      stroke() {},
      clip() {},
      fillRect() {},
      fillText() {},
      measureText: (s: string) => ({ width: s.length * 10 }),
    };
    vi.stubGlobal('document', {
      createElement: () => ({ width: 2048, height: 2048, getContext: () => fakeCtx }),
    });
    const built = buildSigns(layout.signs, layout);
    const mv = new MovableSignsView(built.movable, built.mesh.material as THREE.Material, new THREE.MeshLambertMaterial());
    expect(mv.group.children.filter((c) => c.name.startsWith('movable-sign:')).length).toBe(2);
    expect(mv.group.getObjectByName('movable-sign-bases')).toBeDefined();

    const st = emptyStations();
    mv.update({ ...st, pyramid: { collapsed: true, rebuildIn: 20 } }, 0.016);
    for (let i = 0; i < 40; i++) mv.update({ ...st, pyramid: { collapsed: true, rebuildIn: 20 } }, 0.02);

    const tokubaiPivot = mv.group.children.find((c) => c.name.includes('特売')) as THREE.Group;
    expect(tokubaiPivot.rotation.x).toBeLessThan(0);
    expect(tokubaiPivot.rotation.z).toBeLessThan(-0.9);
    // 両方の看板メッシュのワールド下端が床 (y=0) より上にあること
    mv.update({ ...st, bowling: { pinsDown: 5, resetIn: 8 } }, 0.02);
    for (let i = 0; i < 40; i++) mv.update({ ...st, pyramid: { collapsed: true, rebuildIn: 20 }, bowling: { pinsDown: 5, resetIn: 8 } }, 0.02);
    for (const pivot of mv.group.children.filter((c) => c.name.startsWith('movable-sign:'))) {
      pivot.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject((pivot as THREE.Group).children[0]!);
      expect(box.min.y).toBeGreaterThan(0);
    }

    // リセットで直立に戻る
    for (let i = 0; i < 60; i++) mv.update(st, 0.02);
    expect(Math.abs(tokubaiPivot.rotation.x)).toBeLessThan(0.01);
    expect(Math.abs(tokubaiPivot.rotation.z)).toBeLessThan(0.01);
  });

  it('ShelfMarksView は1本の InstancedMesh で空き区画のみ「品切れ」バッジを表示する', () => {
    const sm = new ShelfMarksView(layout, world);
    expect(sm.mesh).toBeInstanceOf(THREE.InstancedMesh);
    const v = makeView(world);
    sm.update(v, 0.016);
    const m = new THREE.Matrix4();
    const s = new THREE.Vector3();
    sm.mesh.getMatrixAt(0, m);
    s.setFromMatrixScale(m);
    expect(s.x).toBe(0);

    const z0 = sm.zones.find((z) => z.propIds.length >= 2)!;
    for (const id of z0.propIds) v.propHidden[id] = 1;
    for (let i = 0; i < 15; i++) sm.update(v, 0.02);
    sm.mesh.getMatrixAt(z0.id, m);
    s.setFromMatrixScale(m);
    expect(s.x).toBeCloseTo(1.0, 3);
    sm.dispose();
  });
});
