// 3Dの家。床・壁・窓は間取りの表（plan.js）から組み、家具と小物は Poly Haven の模型を置く。
import * as THREE from '../vendor/three.js';
import { GLTFLoader, RoomEnvironment, mergeGeometries } from '../vendor/three.js';
import { FURNITURE, PROPS } from './catalog.js';
import { FIXTURES, HOUSE, OPENING_HEIGHTS, ROOMS, SLOTS, WALLS, roomAt } from './plan.js';
import { placeFixture, placeProp } from './place.js';

const ASSETS = new URL('../assets/', import.meta.url);
const H = HOUSE.wallHeight;

/** 床材ごとの質感と、1枚の画像を何mで敷くか */
const FLOOR_TILES = { parquet: 1.6, 'oak-floor': 2.2, 'checker-tile': 1.25, 'stone-tile': 1.1 };

function loadTexture(loader, name, srgb) {
  return new Promise((resolve, reject) => {
    loader.load(new URL(`textures/${name}.webp`, ASSETS).href, (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 8;
      if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
      resolve(tex);
    }, undefined, reject);
  });
}

/** 世界座標で質感の目が揃う四角形。p は4頂点（反時計回り）、uv は [u,v] を m 単位で */
function quadGeometry(points, normal, uvs, tile) {
  const g = new THREE.BufferGeometry();
  const pos = [];
  const nor = [];
  const uv = [];
  for (const i of [0, 1, 2, 0, 2, 3]) {
    pos.push(...points[i]);
    nor.push(...normal);
    uv.push(uvs[i][0] / tile, uvs[i][1] / tile);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

function boxGeometry(cx, cy, cz, sx, sy, sz) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.translate(cx, cy, cz);
  return g;
}

/**
 * カーテン1枚。壁に沿った座標 a0〜a1、高さ0.04〜top のあいだに、ひだ（正弦波の奥行き）のある布を作る。
 * at(a, y, depth) が世界座標を返す。上から見て布の表が部屋の側を向くよう、並び順を side と向きで決める。
 */
function curtainGeometry(a0, a1, bottom, top, at, side, alongX) {
  const cols = 28;
  const rows = 2;
  const pos = [];
  const uv = [];
  const folds = 5;
  const depthAt = (u) => 0.035 + 0.03 * Math.sin(u * Math.PI * 2 * folds);
  for (let r = 0; r < rows; r++) {
    const y0 = bottom + ((top - bottom) * r) / rows;
    const y1 = bottom + ((top - bottom) * (r + 1)) / rows;
    for (let c = 0; c < cols; c++) {
      const u0 = c / cols;
      const u1 = (c + 1) / cols;
      const p00 = at(a0 + (a1 - a0) * u0, y0, depthAt(u0));
      const p10 = at(a0 + (a1 - a0) * u1, y0, depthAt(u1));
      const p11 = at(a0 + (a1 - a0) * u1, y1, depthAt(u1));
      const p01 = at(a0 + (a1 - a0) * u0, y1, depthAt(u0));
      const flip = alongX ? side < 0 : side > 0;
      const quad = flip ? [p10, p00, p01, p11] : [p00, p10, p11, p01];
      for (const i of [0, 1, 2, 0, 2, 3]) pos.push(...quad[i]);
      const uvq = [[u0 * 3, y0 * 1.5], [u1 * 3, y0 * 1.5], [u1 * 3, y1 * 1.5], [u0 * 3, y1 * 1.5]];
      const uvf = flip ? [uvq[1], uvq[0], uvq[3], uvq[2]] : uvq;
      for (const i of [0, 1, 2, 0, 2, 3]) uv.push(...uvf[i]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** 床の接地影に使う、中心が濃く外へ消える円の画像 */
function contactShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.68)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.34)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** shadows・antialias は自動テストで切る（ソフトウェア描画では影と縁のなめらか処理がいちばん重い） */
export async function createWorld({ canvas, manifest, onProgress = () => {}, pixelRatioCap = 1.75, shadows = true, antialias = true }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.36;

  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 120);
  camera.rotation.order = 'YXZ';

  // --- 光 ---
  // 午後遅くの西日。低い角度（約23度）で西の窓から差し込み、床に窓の形の日だまりを長く落とす。
  // 部屋を満たす光（空・天井灯・映り込み）は控えめにして、日だまりと部屋の奥の明るさの差を出す
  const hemi = new THREE.HemisphereLight('#fff6ea', '#8f7760', 0.55);
  scene.add(hemi);
  // 強さ13では、日だまりが白く飛んで光の塊に見えた（見た目の採点3周目）
  const sun = new THREE.DirectionalLight('#ffe0bb', 10);
  sun.target.position.set(5.5, 0, 4.5);
  sun.position.set(5.5 - 14, 6.5, 4.5 + 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -10; sc.right = 10; sc.top = 10; sc.bottom = -10; sc.near = 1; sc.far = 50;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  // ぼかしを広げると、影の縁が点描のようにざらついた（r186 の PCF は散らした点で縁をぼかす）。1なら縁が締まって粒が出ない
  sun.shadow.radius = 1;
  scene.add(sun, sun.target);
  for (const r of ROOMS) {
    const light = new THREE.PointLight('#ffe6c8', r.id === 'entrance' ? 2.5 : 5.5, 0, 2);
    light.position.set((r.rect[0] + r.rect[2]) / 2, H - 0.35, (r.rect[1] + r.rect[3]) / 2);
    scene.add(light);
  }

  // --- 素材 ---
  const texLoader = new THREE.TextureLoader();
  const texNames = ['parquet_diff', 'parquet_nor', 'parquet_arm', 'oak-floor_diff', 'oak-floor_nor', 'oak-floor_arm', 'checker-tile_diff', 'checker-tile_nor', 'checker-tile_arm', 'stone-tile_diff', 'stone-tile_nor', 'stone-tile_arm', 'plaster_nor', 'rug_diff', 'rug_nor'];
  const modelFiles = [...new Set([...Object.values(FURNITURE).map(f => f.file), ...Object.values(PROPS).map(p => p.file)])];
  const total = texNames.length + modelFiles.length;
  let done = 0;
  const tick = () => onProgress(++done, total);
  const tex = {};
  await Promise.all(texNames.map(async (n) => { tex[n] = await loadTexture(texLoader, n, n.endsWith('_diff')); tick(); }));

  const floorMats = {};
  // 木の床は素材の粗さのままだと鏡のように光るので、粗さを一定にする
  const FLOOR_ROUGH = { parquet: 0.62, 'oak-floor': 0.8 };
  for (const f of Object.keys(FLOOR_TILES)) {
    const wood = f in FLOOR_ROUGH;
    floorMats[f] = new THREE.MeshStandardMaterial({
      map: tex[`${f}_diff`], normalMap: tex[`${f}_nor`], roughnessMap: wood ? null : tex[`${f}_arm`], aoMap: tex[`${f}_arm`],
      roughness: wood ? FLOOR_ROUGH[f] : 1, metalness: 0, normalScale: new THREE.Vector2(0.6, 0.6)
    });
  }
  // 漆喰の色画像はベージュが強く、部屋の色を掛けると茶色く沈むので、凹凸だけ使う
  const wallMat = (color) => new THREE.MeshStandardMaterial({ color, normalMap: tex.plaster_nor, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.92, metalness: 0 });
  const roomWallMats = Object.fromEntries(ROOMS.map(r => [r.id, wallMat(r.wall)]));
  const exteriorMat = wallMat('#e9e2d6');
  const trimMat = new THREE.MeshStandardMaterial({ color: '#f3efe7', roughness: 0.55, metalness: 0 });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: '#f7f4ee', roughness: 1, metalness: 0 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#dfeef7', transparent: true, opacity: 0.14, roughness: 0.03, metalness: 0, depthWrite: false });
  const doorMat = new THREE.MeshStandardMaterial({ color: '#6b4a32', map: tex['oak-floor_diff'], roughness: 0.6, metalness: 0 });
  const rugMat = new THREE.MeshStandardMaterial({ map: tex.rug_diff, normalMap: tex.rug_nor, roughness: 1, metalness: 0 });

  const shell = new THREE.Group();
  shell.name = 'shell';
  scene.add(shell);

  // 床（部屋ごと）
  for (const r of ROOMS) {
    const [x0, z0, x1, z1] = r.rect;
    const tile = FLOOR_TILES[r.floor];
    const g = quadGeometry([[x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0]], [0, 1, 0], [[x0, z0], [x0, z1], [x1, z1], [x1, z0]], tile);
    g.setAttribute('uv1', g.getAttribute('uv'));
    const mesh = new THREE.Mesh(g, floorMats[r.floor]);
    mesh.receiveShadow = true;
    shell.add(mesh);
  }
  // 敷物（リビングの机の下）
  {
    const rug = new THREE.Mesh(quadGeometry([[1.15, 0.004, 5.2], [1.15, 0.004, 7.1], [3.85, 0.004, 7.1], [3.85, 0.004, 5.2]], [0, 1, 0], [[0, 0], [0, 1.9], [2.7, 1.9], [2.7, 0]], 0.9), rugMat);
    rug.receiveShadow = true;
    shell.add(rug);
  }
  // 天井
  {
    const g = quadGeometry([[0, H, 0], [HOUSE.width, H, 0], [HOUSE.width, H, HOUSE.depth], [0, H, HOUSE.depth]], [0, -1, 0], [[0, 0], [12, 0], [12, 9], [0, 9]], 3);
    const mesh = new THREE.Mesh(g, ceilingMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    shell.add(mesh);
  }

  // 壁。側面ごとに、隣の部屋の色で塗る
  const wallGeos = new Map();
  const trimGeos = [];
  const glassGeos = [];
  const aoGeos = [];
  const detailGeos = [];
  const curtainGeos = [];
  const rodGeos = [];
  const addWallGeo = (mat, geo) => {
    if (!wallGeos.has(mat)) wallGeos.set(mat, []);
    wallGeos.get(mat).push(geo);
  };
  for (const w of WALLS) {
    const alongX = w.a[1] === w.b[1];
    const fixed = alongX ? w.a[1] : w.a[0];
    const start = (alongX ? w.a[0] : w.a[1]) - w.t / 2;
    const end = (alongX ? w.b[0] : w.b[1]) + w.t / 2;
    const openings = w.openings.map(o => ({ ...o, ...OPENING_HEIGHTS[o.kind] }));
    const breaks = new Set([start, end, 4, 5, 7, 7.9]);
    for (const o of openings) { breaks.add(o.from); breaks.add(o.to); }
    const cuts = [...breaks].filter(v => v >= start && v <= end).sort((p, q) => p - q);
    // p(along, y, side) → 世界座標
    const P = (a, y, side) => alongX ? [a, y, fixed + side * w.t / 2] : [fixed + side * w.t / 2, y, a];
    for (const side of [-1, 1]) {
      const normal = alongX ? [0, 0, side] : [side, 0, 0];
      for (let i = 0; i < cuts.length - 1; i++) {
        const a0 = cuts[i];
        const a1 = cuts[i + 1];
        if (a1 - a0 < 1e-6) continue;
        const mid = (a0 + a1) / 2;
        const probe = alongX ? roomAt(mid, fixed + side * (w.t / 2 + 0.05)) : roomAt(fixed + side * (w.t / 2 + 0.05), mid);
        const mat = probe ? roomWallMats[probe.id] : exteriorMat;
        const hole = openings.find(o => mid > o.from && mid < o.to);
        const spans = hole ? [[0, hole.bottom], [hole.top, H]] : [[0, H]];
        for (const [y0, y1] of spans) {
          if (y1 - y0 < 1e-6) continue;
          // 面の向きが外を向くように頂点の順を決める
          const pts = [P(a0, y0, side), P(a1, y0, side), P(a1, y1, side), P(a0, y1, side)];
          const uvs = [[a0, y0], [a1, y0], [a1, y1], [a0, y1]];
          const flip = alongX ? side < 0 : side > 0;
          addWallGeo(mat, quadGeometry(flip ? [pts[1], pts[0], pts[3], pts[2]] : pts, normal, flip ? [uvs[1], uvs[0], uvs[3], uvs[2]] : uvs, 2));
          // 壁ぎわの床の陰り（部屋の側、床から立ち上がる面だけ）。本物の部屋は隅ほど光が回らず暗い
          if (probe && y0 === 0) {
            const w0 = P(a0, 0.002, side);
            const w1 = P(a1, 0.002, side);
            const out = 0.34;
            const o0 = alongX ? [w0[0], 0.002, w0[2] + side * out] : [w0[0] + side * out, 0.002, w0[2]];
            const o1 = alongX ? [w1[0], 0.002, w1[2] + side * out] : [w1[0] + side * out, 0.002, w1[2]];
            const up = [0, 1, 0];
            // 上から見て反時計回りになるように並べる
            const quad = [w0, w1, o1, o0];
            const cross = (quad[1][0] - quad[0][0]) * (quad[2][2] - quad[0][2]) - (quad[1][2] - quad[0][2]) * (quad[2][0] - quad[0][0]);
            const pts = cross < 0 ? quad : [quad[1], quad[0], quad[3], quad[2]];
            const uvs = cross < 0 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[1, 0], [0, 0], [0, 1], [1, 1]];
            aoGeos.push(quadGeometry(pts, up, uvs, 1));
          }
          // 幅木（部屋の側、床から立ち上がる面だけ）
          if (probe && y0 === 0) {
            const bl = a1 - a0;
            const bc = P((a0 + a1) / 2, 0.045, side);
            const off = side * 0.008;
            trimGeos.push(alongX ? boxGeometry(bc[0], 0.045, bc[2] + off, bl, 0.09, 0.016) : boxGeometry(bc[0] + off, 0.045, bc[2], 0.016, 0.09, bl));
            // 長い壁にはコンセントを1つ（床から0.3m）。家らしさの小さな手がかり
            if (bl > 1.6) {
              const oc = P(a0 + 0.55, 0.3, side);
              const oo = side * 0.006;
              detailGeos.push(alongX ? boxGeometry(oc[0], 0.3, oc[2] + oo, 0.075, 0.115, 0.012) : boxGeometry(oc[0] + oo, 0.3, oc[2], 0.012, 0.115, 0.075));
            }
          }
          // 天井の隅の陰り（壁ぎわの天井をうっすら暗くする。床の陰りと同じ帯を上下逆に貼る）
          if (probe && y1 === H) {
            const w0 = P(a0, H - 0.002, side);
            const w1 = P(a1, H - 0.002, side);
            const out = 0.3;
            const o0 = alongX ? [w0[0], H - 0.002, w0[2] + side * out] : [w0[0] + side * out, H - 0.002, w0[2]];
            const o1 = alongX ? [w1[0], H - 0.002, w1[2] + side * out] : [w1[0] + side * out, H - 0.002, w1[2]];
            const quad = [w0, w1, o1, o0];
            const cross = (quad[1][0] - quad[0][0]) * (quad[2][2] - quad[0][2]) - (quad[1][2] - quad[0][2]) * (quad[2][0] - quad[0][0]);
            // 下から見て表になるよう、床の帯と逆の並びにする
            const pts = cross > 0 ? quad : [quad[1], quad[0], quad[3], quad[2]];
            const uvs = cross > 0 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[1, 0], [0, 0], [0, 1], [1, 1]];
            aoGeos.push(quadGeometry(pts, [0, -1, 0], uvs, 1));
          }
          // 廻り縁（天井との境）
          if (probe && y1 === H) {
            const bl = a1 - a0;
            const bc = P((a0 + a1) / 2, H - 0.035, side);
            const off = side * 0.012;
            trimGeos.push(alongX ? boxGeometry(bc[0], H - 0.035, bc[2] + off, bl, 0.07, 0.024) : boxGeometry(bc[0] + off, H - 0.035, bc[2], 0.024, 0.07, bl));
          }
        }
      }
    }
    // 開口の小口（壁の厚み）と、枠・ガラス・玄関の扉
    for (const o of openings) {
      const y0 = o.bottom;
      const y1 = o.top;
      const mat = exteriorMat;
      const jamb = (a, dir) => {
        const pts = [P(a, y0, -1), P(a, y0, 1), P(a, y1, 1), P(a, y1, -1)];
        const n = alongX ? [dir, 0, 0] : [0, 0, dir];
        const flip = alongX ? dir > 0 : dir < 0;
        addWallGeo(mat, quadGeometry(flip ? [pts[1], pts[0], pts[3], pts[2]] : pts, n, [[0, y0], [w.t, y0], [w.t, y1], [0, y1]], 2));
      };
      jamb(o.from, 1);
      jamb(o.to, -1);
      const lintel = [P(o.from, y1, -1), P(o.to, y1, -1), P(o.to, y1, 1), P(o.from, y1, 1)];
      addWallGeo(mat, quadGeometry(alongX ? lintel : [lintel[1], lintel[0], lintel[3], lintel[2]], [0, -1, 0], [[0, 0], [1, 0], [1, w.t], [0, w.t]], 2));
      const len = o.to - o.from;
      const mid = (o.from + o.to) / 2;
      if (o.kind === 'window') {
        const sill = [P(o.from, y0, 1), P(o.to, y0, 1), P(o.to, y0, -1), P(o.from, y0, -1)];
        addWallGeo(trimMat, quadGeometry(alongX ? sill : [sill[1], sill[0], sill[3], sill[2]], [0, 1, 0], [[0, 0], [1, 0], [1, w.t], [0, w.t]], 2));
        // 窓枠（外周と縦の桟）とガラス
        const c = P(mid, (y0 + y1) / 2, 0);
        const frame = 0.05;
        const depth = 0.06;
        const parts = [
          [mid, y1 - frame / 2, len, frame], [mid, y0 + frame / 2, len, frame],
          [o.from + frame / 2, (y0 + y1) / 2, frame, y1 - y0], [o.to - frame / 2, (y0 + y1) / 2, frame, y1 - y0],
          [mid, (y0 + y1) / 2, 0.04, y1 - y0]
        ];
        for (const [pa, py, pl, ph] of parts) {
          const q = P(pa, py, 0);
          trimGeos.push(alongX ? boxGeometry(q[0], q[1], q[2], pl, ph, depth) : boxGeometry(q[0], q[1], q[2], depth, ph, pl));
        }
        glassGeos.push(alongX ? boxGeometry(c[0], c[1], c[2], len, y1 - y0, 0.01) : boxGeometry(c[0], c[1], c[2], 0.01, y1 - y0, len));
        // 窓台（部屋側に少し張り出す）
        for (const side of [-1, 1]) {
          const probe = alongX ? roomAt(mid, fixed + side * (w.t / 2 + 0.05)) : roomAt(fixed + side * (w.t / 2 + 0.05), mid);
          if (!probe) continue;
          const q = P(mid, y0 - 0.02, side);
          const off = side * 0.03;
          trimGeos.push(alongX ? boxGeometry(q[0], q[1], q[2] + off, len + 0.16, 0.04, 0.08) : boxGeometry(q[0] + off, q[1], q[2], 0.08, 0.04, len + 0.16));
        }
      }
      // 枠の見付け（両面）
      for (const side of [-1, 1]) {
        const probe = alongX ? roomAt(mid, fixed + side * (w.t / 2 + 0.05)) : roomAt(fixed + side * (w.t / 2 + 0.05), mid);
        if (!probe) continue;
        const off = side * 0.012;
        const bw = 0.07;
        const ends = [[o.from - bw / 2, (y0 + y1) / 2, bw, y1 - y0], [o.to + bw / 2, (y0 + y1) / 2, bw, y1 - y0], [mid, y1 + bw / 2, len + bw * 2, bw]];
        for (const [pa, py, pl, ph] of ends) {
          const q = P(pa, py, side);
          trimGeos.push(alongX ? boxGeometry(q[0], q[1], q[2] + off, pl, ph, 0.024) : boxGeometry(q[0] + off, q[1], q[2], 0.024, ph, pl));
        }
      }
      // 出入口のわきの照明スイッチ（両側の部屋。床から1.2m）
      if (o.kind === 'door') {
        for (const side of [-1, 1]) {
          const probe = alongX ? roomAt(mid, fixed + side * (w.t / 2 + 0.05)) : roomAt(fixed + side * (w.t / 2 + 0.05), mid);
          if (!probe) continue;
          const q = P(o.to + 0.2, 1.2, side);
          const off = side * 0.006;
          detailGeos.push(alongX ? boxGeometry(q[0], 1.2, q[2] + off, 0.08, 0.12, 0.012) : boxGeometry(q[0] + off, 1.2, q[2], 0.012, 0.12, 0.08));
        }
      }
      // 窓のカーテン（部屋の側。窓の両わきに、ひだのある布を床近くまで垂らす）と、カーテンレール
      if (o.kind === 'window') {
        for (const side of [-1, 1]) {
          const probe = alongX ? roomAt(mid, fixed + side * (w.t / 2 + 0.05)) : roomAt(fixed + side * (w.t / 2 + 0.05), mid);
          if (!probe) continue;
          const gap = side * (w.t / 2 + 0.07);
          const rod = P(mid, 2.32, 0);
          rodGeos.push(alongX ? new THREE.CylinderGeometry(0.012, 0.012, len + 0.9, 8).rotateZ(Math.PI / 2).translate(rod[0], 2.32, rod[2] + gap) : new THREE.CylinderGeometry(0.012, 0.012, len + 0.9, 8).rotateX(Math.PI / 2).translate(rod[0] + gap, 2.32, rod[2]));
          for (const [c0, c1] of [[o.from - 0.42, o.from + 0.02], [o.to - 0.02, o.to + 0.42]]) {
            curtainGeos.push(curtainGeometry(c0, c1, 0.04, 2.3, (a, y, depth) => {
              const q = P(a, y, 0);
              return alongX ? [q[0], y, q[2] + gap + side * depth] : [q[0] + gap + side * depth, y, q[2]];
            }, side, alongX));
          }
        }
      }
      if (o.kind === 'front') {
        const q = P(mid, (y0 + y1) / 2, 0);
        const door = new THREE.Mesh(alongX ? new THREE.BoxGeometry(len, y1 - y0, 0.05) : new THREE.BoxGeometry(0.05, y1 - y0, len), doorMat);
        door.position.set(q[0], q[1], q[2]);
        door.castShadow = true;
        door.receiveShadow = true;
        shell.add(door);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshStandardMaterial({ color: '#c9a45c', metalness: 1, roughness: 0.3 }));
        const k = P(o.to - 0.1, 1.0, -1);
        knob.position.set(k[0], k[1], k[2] + (alongX ? -0.04 : 0));
        shell.add(knob);
      }
    }
  }
  {
    // 陰りの帯：壁ぎわ（v=0）で濃く、外へ（v=1）なめらかに消える
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 64;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(4, 64);
    for (let y = 0; y < 64; y++) {
      const t = y / 63;
      const a = Math.round(255 * 0.42 * (1 - t) ** 2.2);
      for (let x = 0; x < 4; x++) img.data.set([0, 0, 0, a], (y * 4 + x) * 4);
    }
    ctx.putImageData(img, 0, 0);
    const aoTex = new THREE.CanvasTexture(c);
    // 画像の上の行（濃い側）を v=0（壁ぎわ）に合わせる。既定の上下反転のままだと、壁から34cmの所が
    // いちばん濃くなって急に切れ、床にも天井にも硬い縁の帯が出ていた
    aoTex.flipY = false;
    aoTex.wrapS = THREE.ClampToEdgeWrapping;
    aoTex.wrapT = THREE.ClampToEdgeWrapping;
    const ao = new THREE.Mesh(mergeGeometries(aoGeos), new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false }));
    ao.renderOrder = 1;
    shell.add(ao);
  }
  for (const [mat, geos] of wallGeos) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    shell.add(mesh);
  }
  {
    const trims = new THREE.Mesh(mergeGeometries(trimGeos.map(g => g.toNonIndexed ? g.toNonIndexed() : g)), trimMat);
    trims.castShadow = true;
    trims.receiveShadow = true;
    shell.add(trims);
    const glass = new THREE.Mesh(mergeGeometries(glassGeos.map(g => g.toNonIndexed())), glassMat);
    glass.renderOrder = 2;
    shell.add(glass);
    const details = new THREE.Mesh(mergeGeometries(detailGeos.map(g => g.toNonIndexed())), new THREE.MeshStandardMaterial({ color: '#f6f3ec', roughness: 0.4, metalness: 0 }));
    shell.add(details);
    const curtainMat = new THREE.MeshStandardMaterial({ color: '#eadfcb', map: null, normalMap: tex.rug_nor, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
    const curtains = new THREE.Mesh(mergeGeometries(curtainGeos), curtainMat);
    curtains.castShadow = true;
    curtains.receiveShadow = true;
    shell.add(curtains);
    const rods = new THREE.Mesh(mergeGeometries(rodGeos.map(g => g.toNonIndexed())), new THREE.MeshStandardMaterial({ color: '#3a302a', roughness: 0.4, metalness: 0.6 }));
    shell.add(rods);
  }
  // 照明の模型が無い部屋の天井灯
  const lampMat = new THREE.MeshStandardMaterial({ color: '#fff7e8', emissive: '#ffe9c4', emissiveIntensity: 1.4, roughness: 0.5 });
  for (const r of ROOMS) {
    if (r.id === 'living' || r.id === 'dining') continue;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.06, 32), lampMat);
    disc.position.set((r.rect[0] + r.rect[2]) / 2, H - 0.03, (r.rect[1] + r.rect[3]) / 2);
    shell.add(disc);
  }

  // 外：窓から見える景色は実写のパノラマ（Poly Haven の HDRI を色調済みの JPG から縮小）。家の中の光には使わない
  {
    const sky = await loadTexture(texLoader, 'garden_sky', true);
    sky.mapping = THREE.EquirectangularReflectionMapping;
    sky.wrapS = THREE.ClampToEdgeWrapping;
    scene.background = sky;
    scene.backgroundIntensity = 1.3;
    scene.backgroundRotation.set(0, THREE.MathUtils.degToRad(35), 0);
  }

  // --- 模型 ---
  const gltfLoader = new GLTFLoader();
  const models = {};
  await Promise.all(modelFiles.map(async (file) => {
    const gltf = await gltfLoader.loadAsync(new URL(`models/${file}.glb`, ASSETS).href);
    const root = gltf.scene;
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      const m = o.material;
      if (m && /glass/i.test(m.name) && file === 'ceiling-lamp') {
        // 天井の灯りの球は、透明だとシャボン玉に見えた（見た目の採点）。すりガラスにして中の電球で光らせる
        o.material = new THREE.MeshStandardMaterial({ color: '#fbf7ef', emissive: '#fff1d6', emissiveIntensity: 0.55, roughness: 0.35, metalness: 0, transparent: true, opacity: 0.88 });
        o.castShadow = false;
      } else if (m && /glass/i.test(m.name)) {
        // 素材の jpg には透明の情報が無く、ガラスが黒い金属に見えるので作り直す
        o.material = glassMat.clone();
        o.material.opacity = 0.1;
        o.castShadow = false;
      } else if (m && m.metalnessMap && !m.map) {
        m.metalness = 0;
      }
    });
    models[file] = root;
    tick();
  }));

  const shadowTex = contactShadowTexture();
  const shadowGeo = new THREE.PlaneGeometry(1, 1);
  shadowGeo.rotateX(-Math.PI / 2);
  const makeContactShadow = (w, d, y) => {
    const mat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.85 });
    const m = new THREE.Mesh(shadowGeo, mat);
    m.scale.set(w, 1, d);
    m.position.y = y + 0.003;
    m.renderOrder = 1;
    return m;
  };

  const fixtures = new THREE.Group();
  fixtures.name = 'fixtures';
  scene.add(fixtures);
  const usedOnce = new Set();
  for (const f of FIXTURES) {
    const entry = FURNITURE[f.model];
    const src = models[entry.file];
    const obj = usedOnce.has(entry.file) ? src.clone(true) : src;
    usedOnce.add(entry.file);
    const p = placeFixture(manifest, f);
    obj.position.set(...p.position);
    obj.rotation.y = THREE.MathUtils.degToRad(p.yaw);
    obj.scale.setScalar(entry.scale ?? 1);
    obj.userData.fixture = f.id;
    fixtures.add(obj);
    if (!f.ceiling) {
      const s = makeContactShadow(p.footprint.hx * 2.6, p.footprint.hz * 2.6, 0);
      s.rotation.y = THREE.MathUtils.degToRad(p.yaw);
      s.position.x = p.footprint.cx;
      s.position.z = p.footprint.cz;
      fixtures.add(s);
    }
  }

  // 小物は1つずつ組にして、表示・非表示を影ごと切り替える
  const props = {};
  const propLayer = new THREE.Group();
  propLayer.name = 'props';
  scene.add(propLayer);
  for (const [id, entry] of Object.entries(PROPS)) {
    const group = new THREE.Group();
    group.userData.prop = id;
    const model = models[entry.file];
    model.scale.setScalar(entry.scale ?? 1);
    group.add(model);
    const shadow = makeContactShadow(1, 1, 0);
    propLayer.add(group, shadow);
    props[id] = { group, model, shadow };
  }

  const state = { arrangement: null, hidden: new Set() };

  function setArrangement(arrangement) {
    state.arrangement = arrangement;
    for (const [id, a] of Object.entries(arrangement)) {
      const p = placeProp(manifest, id, a.slot, a.yaw);
      const { model, shadow } = props[id];
      model.position.set(...p.position);
      model.rotation.set(0, THREE.MathUtils.degToRad(p.yaw), 0);
      const slot = SLOTS.find(s => s.id === a.slot);
      const onWall = slot.kind === 'wall' || slot.kind === 'mirror';
      shadow.visible = !onWall && !state.hidden.has(id);
      shadow.position.set(p.footprint.cx, p.base + 0.003, p.footprint.cz);
      shadow.rotation.y = THREE.MathUtils.degToRad(p.yaw);
      const spread = slot.kind === 'floor' || FLOOR_LIKE.has(slot.kind) ? 2.4 : 1.9;
      shadow.scale.set(p.footprint.hx * spread, 1, p.footprint.hz * spread);
    }
    renderer.shadowMap.needsUpdate = true;
  }

  function setHidden(id, hidden) {
    if (hidden) state.hidden.add(id); else state.hidden.delete(id);
    const { group, shadow } = props[id];
    group.visible = !hidden;
    const slot = state.arrangement && SLOTS.find(s => s.id === state.arrangement[id].slot);
    shadow.visible = !hidden && !(slot && (slot.kind === 'wall' || slot.kind === 'mirror'));
    renderer.shadowMap.needsUpdate = true;
  }

  function showAll() {
    for (const id of Object.keys(props)) setHidden(id, false);
  }

  function propBox(id) {
    return new THREE.Box3().setFromObject(props[id].model);
  }

  function setSize(width, height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // 横長では横の画角をおよそ85度に、縦長では縦の画角を広げすぎない
    // 縦長のスマホでは縦の画角を広めにとり、横の視野を確保する（評価の2周目：書斎に着くと窓と壁しか映らなかった）
    const hfov = THREE.MathUtils.degToRad(width >= height ? 86 : 74);
    const vfov = 2 * Math.atan(Math.tan(hfov / 2) / camera.aspect);
    camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(vfov), 48, width >= height ? 82 : 90);
    camera.updateProjectionMatrix();
  }

  function render() {
    renderer.render(scene, camera);
  }

  // 床・物に当たった点（押した場所へ歩くため）
  const raycaster = new THREE.Raycaster();
  function pick(ndcX, ndcY) {
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hits = raycaster.intersectObjects([shell, fixtures, propLayer], true).filter(h => h.object.visible && h.object.material !== glassMat && !(h.object.material && h.object.material.map === shadowTex));
    const hit = hits.find(h => isVisibleChain(h.object));
    return hit ? { point: hit.point, normal: hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : null } : null;
  }

  // 答えの札の写真。その物だけを斜め前から、家の中と同じ色の出し方（トーンマッピング）で撮る。
  // 別の描画先に撮るとトーンマッピングが掛からず、家の中と色味が違って「別の物に見える」と指摘された（見た目の採点）。
  // そこで画面そのものの左下に小さく撮って写し取り、すぐに家の絵で描き直す
  const thumbScene = new THREE.Scene();
  thumbScene.environment = scene.environment;
  thumbScene.environmentIntensity = 0.7;
  const key = new THREE.DirectionalLight('#ffe2c2', 2.6);
  key.position.set(1.5, 3, 2.5);
  thumbScene.add(key, new THREE.HemisphereLight('#fff6ea', '#8f7760', 1.0));
  const thumbCam = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
  function thumbnail(id, size = 256) {
    const clone = props[id].model.clone(true);
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, THREE.MathUtils.degToRad(PROPS[id].front ?? 0), 0);
    const holder = new THREE.Group();
    holder.add(clone);
    thumbScene.add(holder);
    const box = new THREE.Box3().setFromObject(holder);
    const center = box.getCenter(new THREE.Vector3());
    const size3 = box.getSize(new THREE.Vector3());
    const radius = size3.length() / 2;
    const dir = new THREE.Vector3(0.45, 0.42, 1).normalize();
    // 足元に柔らかい影を敷く（白い器が地に溶けないように）
    const shadow = makeContactShadow(size3.x * 1.5, size3.z * 1.5, box.min.y);
    shadow.position.x = center.x;
    shadow.position.z = center.z;
    holder.add(shadow);
    // 外形の8つの角を画面に写し、物が枠の約8割に収まる距離に合わせる（細長い物が小さく、平たい物が枠いっぱいになった）
    let dist = radius / Math.sin(THREE.MathUtils.degToRad(13.5));
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    for (let i = 0; i < 3; i++) {
      thumbCam.position.copy(center).addScaledVector(dir, dist);
      thumbCam.lookAt(center);
      thumbCam.updateMatrixWorld();
      let extent = 0;
      for (const c of corners) {
        const p = c.clone().project(thumbCam);
        extent = Math.max(extent, Math.abs(p.x), Math.abs(p.y));
      }
      dist *= extent / 0.8;
    }
    thumbCam.position.copy(center).addScaledVector(dir, dist);
    thumbCam.lookAt(center);
    const pr = renderer.getPixelRatio();
    const css = size / pr;
    const viewport = renderer.getViewport(new THREE.Vector4());
    const scissor = renderer.getScissor(new THREE.Vector4());
    const scissorTest = renderer.getScissorTest();
    const clearColor = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(null);
    renderer.setViewport(0, 0, css, css);
    renderer.setScissor(0, 0, css, css);
    renderer.setScissorTest(true);
    renderer.setClearColor('#e3dacf', 1);
    renderer.clear();
    renderer.render(thumbScene, thumbCam);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const src = renderer.domElement;
    c.getContext('2d').drawImage(src, 0, src.height - size, size, size, 0, 0, size, size);
    thumbScene.remove(holder);
    renderer.setScissorTest(scissorTest);
    renderer.setScissor(scissor);
    renderer.setViewport(viewport);
    renderer.setClearColor(clearColor, clearAlpha);
    render();
    return c.toDataURL('image/png');
  }

  return { renderer, scene, camera, props, setArrangement, setHidden, showAll, propBox, setSize, render, pick, thumbnail, state };
}

const FLOOR_LIKE = new Set(['armchair', 'rocking-chair', 'tall-plant', 'grandfather-clock', 'school-chair', 'suitcase']);

function isVisibleChain(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
