// 木・樹氷・岩を、カメラの周りだけ出し入れして描く。
// 位置は山の問い合わせ（world.obstaclesNear）が返すものをそのまま使う＝当たり判定と同じ場所に立つ。
//
// 作り：96 m の区画ごとに、置く物の行列を一度だけ作って覚える（1コマあたりの時間の上限つき・近い区画から）。
// 毎コマ、視界に入る区画の行列を、種類×変種×細かさ（近・中・遠）ごとのインスタンスの入れ物へ写す。
import * as THREE from 'three/webgpu';
import { buildShapes, createObjectMaterial, SHAPE_VARIANTS, SHAPE_LODS } from './shapes.js';

const CHUNK = 96;
const KINDS = ['monster', 'tree', 'rock'];
const LOD_DIST = [140, 480]; // これより近い＝近く用、次＝中、その先＝遠く用（m）
const LOD_BAND = 24; // 切り替えの距離の幅（行き来でちらつかないように）

function hash01(n) {
  let t = (n ^ 0x9e3779b9) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x85ebca6b);
  t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

/**
 * @param {{scene:object, world:object, tier:object, shapes?:object}} deps
 */
export function createScatter({ scene, world, tier, shapes: given, radius: givenRadius }) {
  // 形：決まった手続きの形（樹氷・木・岩）に、渡された形（作り込んだ針葉樹と岩）を重ねる。渡された種類だけ差し替わる
  const shapes = { ...buildShapes(), ...(given || {}) };
  const material = createObjectMaterial();
  // 置く範囲：遠くの森の部品（far-forest.js）があるときは、近くだけに絞る（その外は、そちらが軽い形で描く）
  const radius = givenRadius ?? tier.treeRadius;
  const capacity = { 0: 900, 1: 5000, 2: 16000 };
  // 入れ物：kind → variant → lod → InstancedMesh
  const bins = {};
  const group = new THREE.Group();
  group.name = 'scatter';
  for (const kind of KINDS) {
    bins[kind] = [];
    for (let v = 0; v < SHAPE_VARIANTS; v++) {
      const lods = [];
      for (let l = 0; l < SHAPE_LODS; l++) {
        const cap = Math.ceil(capacity[l] / (kind === 'rock' ? 4 : 1));
        const mesh = new THREE.InstancedMesh(shapes[kind][v][l], material, cap);
        mesh.count = 0;
        mesh.frustumCulled = false; // 区画ごとに自前で判定する
        mesh.castShadow = l === 0 || (l === 1 && tier.name === 'high');
        mesh.receiveShadow = l < 2;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.name = `${kind}-${v}-lod${l}`;
        group.add(mesh);
        lods.push({ mesh, cap, n: 0 });
      }
      bins[kind].push(lods);
    }
  }
  scene.add(group);

  /** @type {Map<number, object>} 区画の番号 → { cx, cz, minY, maxY, lists, lod, used } */
  const chunks = new Map();
  const queue = [];
  const found = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s3 = new THREE.Vector3();
  const p3 = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const half = world.half;
  const perSide = Math.ceil((half * 2) / CHUNK);
  const frustum = new THREE.Frustum();
  const projView = new THREE.Matrix4();
  const box = new THREE.Box3();
  const stats = { chunks: 0, built: 0, instances: 0, buildMs: 0, pending: 0 };

  function buildChunk(ix, iz) {
    const cx = ix * CHUNK - half + CHUNK / 2;
    const cz = iz * CHUNK - half + CHUNK / 2;
    found.length = 0;
    world.obstaclesNear(cx, cz, CHUNK * 0.7072, found);
    const lists = {};
    let minY = Infinity;
    let maxY = -Infinity;
    const tmp = { monster: [[], [], []], tree: [[], [], []], rock: [[], [], []] };
    for (let i = 0; i < found.length; i++) {
      const o = found[i];
      if (Math.abs(o.x - cx) > CHUNK / 2 || Math.abs(o.z - cz) > CHUNK / 2) continue;
      // 木・樹氷・岩だけを描く。建物やリフトの柱の当たり（2 m おきの点）は、ここでは描かない：
      // 知らない種類を「木」として描いていたので、山荘や小屋の上に、木のかたまりが乗っていた（2026-11-11。建物の形は props.js が描く）
      if (!tmp[o.type]) continue;
      const kind = o.type;
      const key = Math.round(o.x * 7.3) * 73856093 ^ Math.round(o.z * 7.3) * 19349663;
      const v = Math.floor(hash01(key) * SHAPE_VARIANTS) % SHAPE_VARIANTS;
      const yaw = hash01(key + 11) * Math.PI * 2;
      const fat = 0.9 + hash01(key + 23) * 0.3;
      // 岩は半径、木と樹氷は高さを基準にする。根元を雪面へ少し沈めて、浮いて見えないようにする
      const h = kind === 'rock' ? o.radius * 2.2 : o.height;
      // 樹氷は、形の中に風上の向きがあるので回さない（どれも同じ方へ伸びる）。太さは当たりの大きさに合わせる
      q.setFromAxisAngle(yAxis, kind === 'monster' ? (hash01(key + 11) - 0.5) * 0.5 : yaw);
      const wide = kind === 'monster' ? (o.radius / 0.25) * (0.94 + hash01(key + 23) * 0.12) : h * fat;
      s3.set(wide, h, wide);
      p3.set(o.x, o.y - h * (kind === 'rock' ? 0.18 : 0.03), o.z);
      m4.compose(p3, q, s3);
      const arr = tmp[kind][v];
      for (let k = 0; k < 16; k++) arr.push(m4.elements[k]);
      if (o.y < minY) minY = o.y;
      if (o.y + h > maxY) maxY = o.y + h;
    }
    for (const kind of KINDS) lists[kind] = tmp[kind].map((a) => (a.length ? new Float32Array(a) : null));
    if (!Number.isFinite(minY)) { minY = 0; maxY = 0; }
    return { cx, cz, minY, maxY, lists, lod: -1, used: 0, empty: !Number.isFinite(minY) || minY === maxY };
  }

  function wantLod(dist, prev) {
    // 前の段に幅を持たせて、境目での行き来を防ぐ
    const a = LOD_DIST[0] + (prev === 0 ? LOD_BAND : 0);
    const b = LOD_DIST[1] + (prev <= 1 && prev >= 0 ? LOD_BAND : 0);
    return dist < a ? 0 : dist < b ? 1 : 2;
  }

  let frameNo = 0;
  /**
   * @param {THREE.Camera} camera
   * @param {object} renderer
   * @param {number} budgetMs 1コマで区画の準備に使ってよい時間
   * @param {number} maxBuild 1コマで準備する区画の数の上限。時間で区切ると、同じ操作でも実行のたびに木の出るコマが変わる。
   *   撮影や採点（手動送り）では、時間を無制限にして個数で区切り、毎回同じ絵にする
   */
  function update(camera, renderer, budgetMs = 2, maxBuild = Infinity) {
    frameNo++;
    const cxw = camera.position.x;
    const czw = camera.position.z;
    const ix0 = Math.max(0, Math.floor((cxw - radius + half) / CHUNK));
    const ix1 = Math.min(perSide - 1, Math.floor((cxw + radius + half) / CHUNK));
    const iz0 = Math.max(0, Math.floor((czw - radius + half) / CHUNK));
    const iz1 = Math.min(perSide - 1, Math.floor((czw + radius + half) / CHUNK));
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView, renderer.coordinateSystem, camera.reversedDepth === true);
    for (const kind of KINDS) for (const lods of bins[kind]) for (const b of lods) b.n = 0;
    queue.length = 0;
    let instances = 0;
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const ccx = ix * CHUNK - half + CHUNK / 2;
        const ccz = iz * CHUNK - half + CHUNK / 2;
        const dist = Math.hypot(ccx - cxw, ccz - czw);
        if (dist > radius + CHUNK) continue;
        const key = iz * perSide + ix;
        let c = chunks.get(key);
        if (!c) { queue.push(dist, ix, iz); continue; }
        c.used = frameNo;
        if (c.empty) continue;
        // 影のために、視界の少し外（近く）の区画も描く
        box.min.set(c.cx - CHUNK / 2 - 6, c.minY - 2, c.cz - CHUNK / 2 - 6);
        box.max.set(c.cx + CHUNK / 2 + 6, c.maxY + 2, c.cz + CHUNK / 2 + 6);
        if (dist > 160 && !frustum.intersectsBox(box)) continue;
        const lod = wantLod(dist, c.lod);
        c.lod = lod;
        for (const kind of KINDS) {
          const lists = c.lists[kind];
          for (let v = 0; v < SHAPE_VARIANTS; v++) {
            const arr = lists[v];
            if (!arr) continue;
            const b = bins[kind][v][lod];
            const n = arr.length / 16;
            if (b.n + n > b.cap) continue; // 入れ物がいっぱいなら、その区画のその種類は描かない（遠い順に欠ける）
            b.mesh.instanceMatrix.array.set(arr, b.n * 16);
            b.n += n;
            instances += n;
          }
        }
      }
    }
    for (const kind of KINDS) for (const lods of bins[kind]) for (const b of lods) {
      if (b.mesh.count !== b.n || b.n > 0) b.mesh.instanceMatrix.needsUpdate = true;
      b.mesh.count = b.n;
    }
    // まだ無い区画を、近い順に時間の上限まで作る
    stats.pending = queue.length / 3;
    if (queue.length) {
      const t0 = performance.now();
      let built = 0;
      while (queue.length && built < maxBuild && performance.now() - t0 < budgetMs) {
        let best = 0;
        for (let i = 3; i < queue.length; i += 3) if (queue[i] < queue[best]) best = i;
        const ix = queue[best + 1];
        const iz = queue[best + 2];
        queue.splice(best, 3);
        chunks.set(iz * perSide + ix, buildChunk(ix, iz));
        built++;
      }
      stats.buildMs = performance.now() - t0;
      stats.built += built;
    } else stats.buildMs = 0;
    // 遠ざかった区画は捨てる（覚える数に上限を置く）
    if (chunks.size > 2600 && frameNo % 120 === 0) {
      for (const [key, c] of chunks) if (frameNo - c.used > 600) chunks.delete(key);
    }
    stats.chunks = chunks.size;
    stats.instances = instances;
  }

  /** 起動時に、近くの区画を先に作っておく（滑り出しで木が後から現れないように） */
  function prewarm(x, z, r = 320) {
    const ix0 = Math.max(0, Math.floor((x - r + half) / CHUNK));
    const ix1 = Math.min(perSide - 1, Math.floor((x + r + half) / CHUNK));
    const iz0 = Math.max(0, Math.floor((z - r + half) / CHUNK));
    const iz1 = Math.min(perSide - 1, Math.floor((z + r + half) / CHUNK));
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      const key = iz * perSide + ix;
      if (!chunks.has(key)) chunks.set(key, buildChunk(ix, iz));
    }
  }

  return {
    group, stats, update, prewarm,
    dispose() {
      scene.remove(group);
      material.dispose();
      for (const kind of KINDS) for (const lods of bins[kind]) for (const b of lods) b.mesh.geometry.dispose();
    },
  };
}
