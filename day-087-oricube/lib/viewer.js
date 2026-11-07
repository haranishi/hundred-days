// three.js の場面。紙・折り目・案内・机・視点・描き直しを持つ。
// 作品の中身は知らず、エンジンの frame() の出力と steps[i].guides だけを描く。

import * as THREE from '../vendor/three.js';

const INK = '#2b2623';
const GUIDE = '#d6452d';
const SKY = '#f1e9da';
const EXPLODE_ON = 24;
// 机と影の板は、紙の最下層の下に置く。紙の polygonOffset（斜めから見ると数mm相当）に負けない隙間（紙の大きさ約1に対して3〜4%）。
const DESK_GAP = 0.04;
const SHADOW_GAP = 0.03;
const EXPLODE_MS = 250;
const VIEW_MS = 480;

// 視点のプリセット（極角 phi: 0=真上、方位角 theta: 0=手前から）
const VIEWS = {
  top: { phi: 0.0001, theta: 0 },
  iso: { phi: 0.93, theta: 0.52 },
  side: { phi: Math.PI / 2 - 0.1, theta: 0 },
  // Flat models (heart, envelope, kimono) end as a flat shape: near top-down keeps the outline readable
  // while a little tilt still shows the layers and the motion.
  flat: { phi: 0.5, theta: 0 },
};

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const v3 = (a) => (Array.isArray(a) ? new THREE.Vector3(a[0], a[1], a[2]) : new THREE.Vector3(a.x, a.y, a.z));

function readBounds(b) {
  if (!b) return null;
  const min = b.min, max = b.max;
  if (!min || !max) return null;
  return new THREE.Box3(v3(min), v3(max));
}

// 3次元の折れ線を、幅のある帯（三角形の列）にする。side は帯の幅の向き
function pushRibbon(out, points, side, width) {
  const h = width / 2;
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k], b = points[k + 1];
    const s = side(a, b).multiplyScalar(h);
    const a0 = a.clone().sub(s), a1 = a.clone().add(s), b0 = b.clone().sub(s), b1 = b.clone().add(s);
    out.push(a0.x, a0.y, a0.z, b0.x, b0.y, b0.z, b1.x, b1.y, b1.z);
    out.push(a0.x, a0.y, a0.z, b1.x, b1.y, b1.z, a1.x, a1.y, a1.z);
  }
}

// 線の模様: 谷=破線、山=一点鎖線、中割り=破線＋点2つ、裏返し=長い破線、立ち上げ=実線
const PATTERNS = {
  valley: [0.055, 0.03],
  mountain: [0.06, 0.022, 0.012, 0.022],
  reverse: [0.045, 0.025, 0.02, 0.025, 0.02, 0.025],
  turn: [0.09, 0.04],
  hinge: [1, 0],
};

function dashedPieces(a, b, pattern, unit) {
  const len = a.distanceTo(b);
  if (pattern[1] === 0) return [[a, b]];
  const dir = b.clone().sub(a).normalize();
  const pieces = [];
  let pos = 0, k = 0;
  while (pos < len) {
    const seg = pattern[k % pattern.length] * unit;
    if (k % 2 === 0) {
      const end = Math.min(len, pos + seg);
      pieces.push([a.clone().addScaledVector(dir, pos), a.clone().addScaledVector(dir, end)]);
    }
    pos += seg; k += 1;
  }
  return pieces;
}

function lineSide(up) {
  return (a, b) => {
    const d = b.clone().sub(a).normalize();
    let s = new THREE.Vector3().crossVectors(d, up);
    if (s.lengthSq() < 1e-6) s = new THREE.Vector3().crossVectors(d, new THREE.Vector3(1, 0, 0));
    return s.normalize();
  };
}

function buildGuideGeometry(guides, unit) {
  const lines = [], arrows = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (const g of guides || []) {
    if (g.line && g.line.length >= 2) {
      const a = v3(g.line[0]), b = v3(g.line[1]);
      for (const [p, q] of dashedPieces(a, b, PATTERNS[g.kind] || PATTERNS.valley, unit)) {
        pushRibbon(lines, [p, q], lineSide(up), (g.kind === 'reverse' ? 0.026 : 0.018) * unit);
      }
    }
    const pts = g.arrow?.points?.map(v3) || [];
    if (pts.length >= 2) {
      // 弧の面の法線を帯の幅の向きにする（上から見ても横から見ても読める）
      const first = pts[0], last = pts[pts.length - 1], mid = pts[Math.floor(pts.length / 2)];
      let normal = new THREE.Vector3().crossVectors(last.clone().sub(first), mid.clone().sub(first));
      const fixed = normal.lengthSq() > 1e-10 ? normal.normalize() : null;
      const side = fixed ? () => fixed.clone() : lineSide(up);
      const head = g.arrow.head;
      const tip = head?.position ? v3(head.position) : last.clone();
      const dir = head?.direction ? v3(head.direction).normalize() : last.clone().sub(pts[pts.length - 2]).normalize();
      const headLen = 0.075 * unit, headW = 0.06 * unit;
      // 矢じりの根元までで軸を止める
      const shaft = pts.slice();
      const baseCenter = tip.clone().addScaledVector(dir, -headLen);
      shaft[shaft.length - 1] = baseCenter;
      pushRibbon(arrows, shaft, side, 0.014 * unit);
      const w = side(baseCenter, tip).multiplyScalar(headW / 2);
      const l = baseCenter.clone().sub(w), r = baseCenter.clone().add(w);
      arrows.push(l.x, l.y, l.z, r.x, r.y, r.z, tip.x, tip.y, tip.z);
    }
  }
  const make = (arr) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return geo;
  };
  return { lines: make(lines), arrows: make(arrows) };
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(70,52,35,0.55)');
  grad.addColorStop(0.55, 'rgba(70,52,35,0.22)');
  grad.addColorStop(1, 'rgba(70,52,35,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createViewer({ canvas, testGfx = false, reducedMotion = () => false, onTick = () => false }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !testGfx, alpha: false, powerPreference: 'default' });
  renderer.setPixelRatio(testGfx ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 6, 16);

  scene.add(new THREE.HemisphereLight('#fffaf1', '#e2d3bb', 1.5));
  const sun = new THREE.DirectionalLight('#fff4e2', 1.15);
  sun.position.set(1.4, 3.2, 2.1);
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#f4f0ff', 0.35);
  fill.position.set(-2.2, 1.2, -0.8);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.02, 40);
  camera.position.set(0, 2, 2);

  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.rotateSpeed = 0.75;
  controls.zoomSpeed = 0.9;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  canvas.style.touchAction = 'none';

  // 机と影
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: '#f3eadb', roughness: 1, metalness: 0 }));
  desk.rotation.x = -Math.PI / 2;
  desk.position.y = -DESK_GAP;
  scene.add(desk);
  // 影の板は、紙の最下層から十分に下げて置く（SHADOW_GAP）。紙は polygonOffset で奥へ押されており、斜めから見ると
  // 数mm相当になる。板との隙間がそれより小さいと、紙の上に影が縞になって出た（ソフトウェア描画で再現・DESK_GAP も同じ理由）。
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.6 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 1;
  shadow.visible = !testGfx;
  scene.add(shadow);

  // 紙: 前面（表の色）と背面（裏の色）を同じ形で2つ
  const paperMat = (side) => new THREE.MeshStandardMaterial({
    side, roughness: 0.88, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    vertexColors: true, // エンジンの shade（下の層ほど少し暗い）を掛ける
  });
  const frontMat = paperMat(THREE.FrontSide);
  const backMat = paperMat(THREE.BackSide);
  let paperGeo = new THREE.BufferGeometry();
  const frontMesh = new THREE.Mesh(paperGeo, frontMat);
  const backMesh = new THREE.Mesh(paperGeo, backMat);
  frontMesh.frustumCulled = backMesh.frustumCulled = false;
  scene.add(frontMesh, backMesh);

  const creaseMat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.5 });
  let creaseGeo = new THREE.BufferGeometry();
  const creases = new THREE.LineSegments(creaseGeo, creaseMat);
  creases.frustumCulled = false;
  scene.add(creases);
  // 紙そのものの縁。折り目と同じ墨色で少し濃く
  const outlineMat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.6 });
  let outlineGeo = new THREE.BufferGeometry();
  const outlines = new THREE.LineSegments(outlineGeo, outlineMat);
  outlines.frustumCulled = false;
  scene.add(outlines);

  const guideMat = () => new THREE.MeshBasicMaterial({ color: GUIDE, side: THREE.DoubleSide, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 });
  const guideLineMat = guideMat();
  const guideLines = new THREE.Mesh(new THREE.BufferGeometry(), guideLineMat);
  const guideArrows = new THREE.Mesh(new THREE.BufferGeometry(), guideMat());
  guideLines.renderOrder = guideArrows.renderOrder = 10;
  guideLines.frustumCulled = guideArrows.frustumCulled = false;
  scene.add(guideLines, guideArrows);

  let model = null;
  let topologyKey = null;
  let pose = { i: 0, t: 0, guides: 'none' };
  let poseDirty = true;
  let explode = 1, explodeGoal = 1, explodeFrom = 1, explodeStart = 0;
  let guideCache = new Map();
  let shownGuideStep = -1;
  let fitCache = new Map();
  let fit = null; // { center, dist, box }
  let currentBox = null; // 今の姿勢の箱（試験用の占有率に使う）
  let currentCenter = null; // 今の姿勢の中心。視点はこれを緩やかに追う
  let zoomFactor = 1;
  let homeView = 'iso'; // the view the reset button returns to: the current step's recommended view
  // Until the person turns, zooms or picks a view, the camera follows the view each step recommends.
  let userMoved = false;
  let autoName = 'iso'; // the recommended view the camera was last sent to
  let viewAnim = null;
  let interacting = false;
  let needsRender = true;
  let raf = 0;
  let last = 0;
  let lastRenderAt = 0;
  let renders = 0;
  let inLoop = false, wakeAsked = false, lastWhy = '';
  // 完成のとき: 寄せは最後の姿勢だけで取り、ゆっくりちょうど1周回して始めの向きへ戻す
  let finished = false;
  let insets = { top: 0, bottom: 0 }; // 3Dの上下に重なっている帯（ヒント・視点ボタン・完成の札）の高さ(px)
  let spin = null; // { start, theta, phi }; start is null while a view change is still running
  const SPIN_MS = 6500;
  function stopSpin() { spin = null; }
  function stepSpin(now) {
    if (!spin) return false;
    // The lap starts from the view the camera settles on, so it waits for a running view change.
    if (spin.start === null) {
      if (viewAnim) return true;
      const d = currentDir();
      spin = { start: now, theta: d.theta, phi: d.phi };
    }
    const p = Math.min(1, (now - spin.start) / SPIN_MS);
    offset.copy(camera.position).sub(controls.target);
    spherical.setFromVector3(offset);
    // 最後のフレームでは始めの向きにそろえる（途中の向きで止まって、紙が細い線に見えるのを避ける）
    spherical.theta = p >= 1 ? spin.theta : spin.theta + Math.PI * 2 * ease(p);
    spherical.phi = spin.phi;
    camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
    camera.lookAt(controls.target);
    needsRender = true;
    if (p >= 1) spin = null;
    return true;
  }
  let disposed = false;
  const spherical = new THREE.Spherical();
  const offset = new THREE.Vector3();

  controls.addEventListener('start', () => { interacting = true; userMoved = true; viewAnim = null; stopSpin(); wake(); });
  controls.addEventListener('change', () => { needsRender = true; wake(); });
  controls.addEventListener('end', () => {
    interacting = false;
    if (fit) zoomFactor = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) / fit.dist, 0.4, 2.6);
    wake();
  });

  function unit() {
    if (!model) return 1;
    return Math.max(0.6, Math.min(1.6, Math.max(model.paper?.width || 1, model.paper?.height || 1)));
  }

  function fitFor(i) {
    const key = `${i}:${explodeGoal}:${finished ? 'end' : 'all'}`;
    if (fitCache.has(key)) return fitCache.get(key);
    const box = new THREE.Box3();
    const chunks = [];
    for (const t of finished ? [1] : [0, 0.5, 1]) {
      const frame = model.frame(i, t, { explode: explodeGoal });
      const b = readBounds(frame.bounds);
      if (b) box.union(b);
      chunks.push(frame.positions.slice()); // 枠の配列は使い回されるので、写しを持つ
    }
    // 寄せは8隅ではなく、紙の頂点そのものの射影で測る（斜めに細長い紙は、箱の隅よりずっと小さく見える）
    const points = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of chunks) { points.set(c, at); at += c.length; }
    const info = { box, points, center: box.getCenter(new THREE.Vector3()), radius: Math.max(0.2, box.getSize(new THREE.Vector3()).length() / 2) };
    fitCache.set(key, info);
    return info;
  }

  // 作品が占める割合の目安（枠の幅か高さの約66%）。上下に重なる帯の内側には必ず収める
  const FILL = 0.7;
  const FREE_FILL = 0.92;
  const SPHERE_FLOOR = 0.6;

  function freeFraction() {
    const h = canvas.clientHeight || 1;
    return Math.max(0.3, (h - insets.top - insets.bottom) / h);
  }

  // 球で寄せる距離（どの向きから見ても枠全体に収まる）。回されても大きく切れないための下限に使う
  function sphereDistance(radius) {
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const half = Math.min(Math.atan(tanV), Math.atan(tanV * camera.aspect));
    return (radius / Math.sin(half)) * 1.1;
  }

  // 今の視点の向きで、箱の8隅を射影して収まる距離を求める
  function projectedDistance(points, center, dirSph) {
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const tanH = tanV * camera.aspect;
    const limY = Math.min(tanV * FILL, tanV * freeFraction() * FREE_FILL);
    const limX = tanH * FILL;
    const back = new THREE.Vector3().setFromSpherical(new THREE.Spherical(1, dirSph.phi, dirSph.theta)).normalize(); // 中心→カメラ
    const worldUp = Math.abs(back.y) > 0.999 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(worldUp, back).normalize();
    const up = new THREE.Vector3().crossVectors(back, right).normalize();
    let d = 0;
    const r = new THREE.Vector3();
    for (let k = 0; k < points.length; k += 3) {
      r.set(points[k], points[k + 1], points[k + 2]).sub(center);
      const depthOff = r.dot(back);
      d = Math.max(d, depthOff + Math.abs(r.dot(right)) / limX, depthOff + Math.abs(r.dot(up)) / limY);
    }
    return d;
  }

  function fitDistance(info, dirSph) {
    const sphere = sphereDistance(info.radius);
    const projected = projectedDistance(info.points, currentCenter || info.center, dirSph);
    return Math.max(projected, sphere * SPHERE_FLOOR);
  }

  // 今の姿勢が画面の幅・高さの何割を占めるか（8隅の射影）。試験と調整用
  function coverage() {
    if (!currentBox) return null;
    camera.updateMatrixWorld();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const v = new THREE.Vector3();
    for (let k = 0; k < 8; k++) {
      v.set(k & 1 ? currentBox.max.x : currentBox.min.x, k & 2 ? currentBox.max.y : currentBox.min.y, k & 4 ? currentBox.max.z : currentBox.min.z).project(camera);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    }
    return { w: (x1 - x0) / 2, h: (y1 - y0) / 2, top: (1 - y1) / 2, bottom: (1 - y0) / 2, left: (x0 + 1) / 2, right: (x1 + 1) / 2 };
  }

  // Where the paper itself is drawn, as fractions of the canvas (its vertices, not the box). For tests.
  function paperRect() {
    const pos = paperGeo.getAttribute('position');
    if (!pos) return null;
    camera.updateMatrixWorld();
    const count = Math.min(pos.count, paperGeo.drawRange.count === Infinity ? pos.count : paperGeo.drawRange.count);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const v = new THREE.Vector3();
    for (let k = 0; k < count; k++) {
      v.fromBufferAttribute(pos, k).project(camera);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    }
    if (!(x1 >= x0)) return null;
    return { left: (x0 + 1) / 2, right: (x1 + 1) / 2, top: (1 - y1) / 2, bottom: (1 - y0) / 2 };
  }

  function currentDir() {
    offset.copy(camera.position).sub(controls.target);
    const sp = new THREE.Spherical().setFromVector3(offset);
    return { phi: sp.phi, theta: sp.theta };
  }

  // 手順が変わるとき・視点ボタン・リサイズ・帯の変化のときだけ呼ぶ（回している最中は距離を変えない）
  function updateFit(immediate = false, dirSph = null) {
    if (!model) return;
    const info = fitFor(pose.i);
    const dist = fitDistance(info, dirSph || currentDir());
    fit = { center: (currentCenter || info.center).clone(), dist, box: info.box };
    controls.minDistance = dist * 0.4;
    controls.maxDistance = dist * 2.6;
    // 机と影は今の手順の最下点の下へ
    desk.position.y = Math.min(0, info.box.min.y) - DESK_GAP;
    if (immediate) {
      controls.target.copy(fit.center);
      offset.copy(camera.position).sub(controls.target);
      spherical.setFromVector3(offset);
      spherical.radius = fit.dist * zoomFactor;
      camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
      camera.lookAt(controls.target);
    }
  }

  // 帯を除いた「空いている高さ」の中央に紙の中心が来るよう、描く範囲をずらす
  function applyShift() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const shift = Math.round((insets.bottom - insets.top) / 2);
    if (shift !== 0 && w && h) camera.setViewOffset(w, h, 0, shift, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  // 視点を手順の大きさへ緩やかに寄せる（回した向きは保つ）
  function easeCamera(dt) {
    if (!fit || interacting) return false;
    const k = 1 - Math.exp(-dt / 220);
    let moving = false;
    if (controls.target.distanceToSquared(fit.center) > 1e-8 * fit.dist * fit.dist) {
      const shift = fit.center.clone().sub(controls.target).multiplyScalar(k);
      controls.target.add(shift);
      camera.position.add(shift);
      moving = true;
    }
    offset.copy(camera.position).sub(controls.target);
    spherical.setFromVector3(offset);
    const goal = fit.dist * zoomFactor;
    if (Math.abs(spherical.radius - goal) > 5e-4 * goal) {
      spherical.radius += (goal - spherical.radius) * k;
      camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
      moving = true;
    }
    if (moving) needsRender = true;
    return moving;
  }

  function stepView(now) {
    if (!viewAnim) return false;
    const p = Math.min(1, (now - viewAnim.start) / viewAnim.ms);
    const e = ease(p);
    offset.copy(camera.position).sub(controls.target);
    spherical.setFromVector3(offset);
    spherical.phi = viewAnim.from.phi + (viewAnim.to.phi - viewAnim.from.phi) * e;
    spherical.theta = viewAnim.from.theta + (viewAnim.to.theta - viewAnim.from.theta) * e;
    spherical.makeSafe();
    camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
    camera.lookAt(controls.target);
    needsRender = true;
    if (p >= 1) viewAnim = null;
    return !!viewAnim;
  }

  function rebuildPaper(frame) {
    paperGeo.dispose();
    paperGeo = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(frame.positions.length), 3);
    const nor = new THREE.BufferAttribute(new Float32Array(frame.normals.length), 3);
    pos.setUsage(THREE.DynamicDrawUsage); nor.setUsage(THREE.DynamicDrawUsage);
    paperGeo.setAttribute('position', pos);
    paperGeo.setAttribute('normal', nor);
    const col = new THREE.BufferAttribute(new Float32Array(frame.positions.length).fill(1), 3);
    col.setUsage(THREE.DynamicDrawUsage);
    paperGeo.setAttribute('color', col);
    frontMesh.geometry = paperGeo;
    backMesh.geometry = paperGeo;
  }

  function applyPose() {
    if (!model || !poseDirty) return;
    poseDirty = false;
    const frame = model.frame(pose.i, pose.t, { explode });
    const posAttr = paperGeo.getAttribute('position');
    if (frame.topologyKey !== topologyKey || !posAttr || posAttr.array.length !== frame.positions.length) {
      topologyKey = frame.topologyKey;
      rebuildPaper(frame);
    }
    const p = paperGeo.getAttribute('position'), n = paperGeo.getAttribute('normal');
    p.array.set(frame.positions); p.needsUpdate = true;
    n.array.set(frame.normals); n.needsUpdate = true;
    // エンジンの配列は使い回されるので、毎回こちらの属性へ写す
    const col = paperGeo.getAttribute('color');
    if (frame.shade && frame.shade.length === col.array.length) col.array.set(frame.shade);
    else col.array.fill(1);
    col.needsUpdate = true;
    paperGeo.setDrawRange(0, frame.triCount * 3);

    // 視点の中心と影は今の姿勢に合わせる（大きさは手順全体で決めるので、寄ったり離れたりはしない）
    const now = readBounds(frame.bounds);
    if (now) {
      currentCenter = now.getCenter(new THREE.Vector3());
      currentBox = now;
      if (fit) fit.center.copy(currentCenter);
      const size = now.getSize(new THREE.Vector3());
      shadow.position.set(currentCenter.x, desk.position.y + (DESK_GAP - SHADOW_GAP), currentCenter.z);
      shadow.scale.set(Math.max(0.25, size.x * 1.35), Math.max(0.25, size.z * 1.35), 1);
    }

    const segs = frame.creaseSegments || new Float32Array(0);
    const cAttr = creaseGeo.getAttribute('position');
    if (!cAttr || cAttr.array.length !== segs.length) {
      creaseGeo.dispose();
      creaseGeo = new THREE.BufferGeometry();
      creaseGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs.length), 3));
      creases.geometry = creaseGeo;
    }
    const ca = creaseGeo.getAttribute('position');
    ca.array.set(segs); ca.needsUpdate = true;

    const outs = frame.outlineSegments || new Float32Array(0);
    const oAttr = outlineGeo.getAttribute('position');
    if (!oAttr || oAttr.array.length !== outs.length) {
      outlineGeo.dispose();
      outlineGeo = new THREE.BufferGeometry();
      outlineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(outs.length), 3));
      outlines.geometry = outlineGeo;
    }
    const oa = outlineGeo.getAttribute('position');
    oa.array.set(outs); oa.needsUpdate = true;

    if (shownGuideStep !== pose.i) {
      shownGuideStep = pose.i;
      let g = guideCache.get(pose.i);
      if (!g) { g = buildGuideGeometry(model.steps[pose.i]?.guides, unit()); guideCache.set(pose.i, g); }
      guideLines.geometry = g.lines;
      guideArrows.geometry = g.arrows;
    }
    guideLines.visible = pose.guides === 'full' || pose.guides === 'line' || pose.guides === 'faint';
    guideLineMat.opacity = pose.guides === 'faint' ? 0.4 : 0.95;
    guideArrows.visible = pose.guides === 'full';
    needsRender = true;
  }


  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    applyShift();
    updateFit(false);
    needsRender = true;
    wake();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  function loop(now) {
    raf = 0;
    if (disposed || document.hidden) { last = 0; return; }
    const dt = last ? Math.min(250, now - last) : 16;
    last = now;
    inLoop = true;
    wakeAsked = false;
    let active = false;
    const why = [];
    if (onTick(dt)) { active = true; why.push('tick'); }
    if (explode !== explodeGoal) {
      const p = reducedMotion() ? 1 : Math.min(1, (now - explodeStart) / EXPLODE_MS);
      explode = explodeFrom + (explodeGoal - explodeFrom) * ease(p);
      if (p >= 1) explode = explodeGoal;
      poseDirty = true;
      active = true;
      why.push('explode');
    }
    applyPose();
    if (stepView(now)) { active = true; why.push('view'); }
    if (easeCamera(dt)) { active = true; why.push('fit'); }
    if (stepSpin(now)) { active = true; why.push('spin'); }
    if (controls.update()) { needsRender = true; active = true; why.push('controls'); }
    if (needsRender) {
      if (testGfx && now - lastRenderAt < 45) active = true;
      else { renderer.render(scene, camera); renders += 1; lastRenderAt = now; needsRender = false; }
    }
    lastWhy = why.join(',');
    inLoop = false;
    if (active || needsRender || wakeAsked) raf = requestAnimationFrame(loop);
    else last = 0;
  }

  function wake() {
    if (inLoop) { wakeAsked = true; return; }
    if (!raf && !disposed && !document.hidden) raf = requestAnimationFrame(loop);
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = 0; wake(); } });

  const api = {
    // view: the view to open on. moved: true when the person chose it (a view= link), so steps do not move it.
    setModel(next, { view, moved = false } = {}) {
      model = next;
      explode = explodeGoal = explodeFrom = 1;
      topologyKey = null;
      currentCenter = null;
      guideCache = new Map();
      fitCache = new Map();
      shownGuideStep = -1;
      zoomFactor = 1;
      finished = false;
      stopSpin();
      frontMat.color.set(model.paper?.front || '#2e7bd0');
      backMat.color.set(model.paper?.back || '#f8f5ee');
      pose = { i: 0, t: 0, guides: 'none' };
      poseDirty = true;
      updateFit(false);
      homeView = VIEWS[view] ? view : 'iso';
      autoName = homeView;
      userMoved = !!moved;
      api.setView(homeView, { immediate: true });
      updateFit(true);
      wake();
    },
    setPose(i, t, guides = 'none') {
      if (i === pose.i && t === pose.t && guides === pose.guides) return;
      const stepChanged = i !== pose.i;
      pose = { i, t, guides };
      poseDirty = true;
      if (stepChanged) updateFit(false);
      wake();
    },
    setExplode(on) {
      const goal = on ? EXPLODE_ON : 1;
      if (goal === explodeGoal) return;
      explodeFrom = explode; explodeGoal = goal; explodeStart = performance.now();
      updateFit(false);
      // 真上からでは層の間隔が見えないので、広げるときだけ斜めへ寄せる（戻すときは動かさない）
      if (on) {
        offset.copy(camera.position).sub(controls.target);
        spherical.setFromVector3(offset);
        if (spherical.phi < 0.5) api.setView('tilt', { phi: 0.9, theta: spherical.theta });
      }
      wake();
    },
    // Sent by the app when the step changes. Moves (smoothly) to the step's view, unless the person has
    // moved the camera since the model or the reset, or the camera is already there.
    followView(name) {
      if (!VIEWS[name]) return false;
      homeView = name;
      if (userMoved || name === autoName) return false;
      autoName = name;
      api.setView(name);
      return true;
    },
    // The view buttons (top / iso): the person chose a view, so steps stop moving it.
    pickView(name) {
      userMoved = true;
      api.setView(name);
    },
    // The reset button: back to the given recommended view, and steps move the camera again.
    resetView(name) {
      if (VIEWS[name]) homeView = name;
      autoName = homeView;
      userMoved = false;
      api.setView('reset');
    },
    setView(name, { immediate = false, phi, theta } = {}) {
      stopSpin();
      const preset = name === 'tilt' ? { phi, theta } : name === 'reset' ? VIEWS[homeView] : VIEWS[name] || VIEWS.iso;
      if (name === 'reset') zoomFactor = 1;
      offset.copy(camera.position).sub(controls.target);
      spherical.setFromVector3(offset);
      let to = { ...preset };
      // 近い向きへ回る
      const twoPi = Math.PI * 2;
      while (to.theta - spherical.theta > Math.PI) to.theta -= twoPi;
      while (to.theta - spherical.theta < -Math.PI) to.theta += twoPi;
      updateFit(false, to);
      if (immediate || reducedMotion()) {
        spherical.phi = to.phi; spherical.theta = to.theta; spherical.makeSafe();
        if (fit) spherical.radius = fit.dist * zoomFactor;
        camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
        camera.lookAt(controls.target);
        viewAnim = null;
      } else {
        viewAnim = { from: { phi: spherical.phi, theta: spherical.theta }, to, start: performance.now(), ms: VIEW_MS };
      }
      needsRender = true;
      wake();
    },
    // 完成になった／外れた。完成では最後の姿勢に寄せ直し、動きを減らす設定でなければ回して見せる
    setFinished(on) {
      on = !!on;
      if (on === finished) return;
      finished = on;
      if (on && !reducedMotion()) spin = { start: null, theta: 0, phi: 0 };
      else stopSpin();
      updateFit(false);
      needsRender = true;
      wake();
    },
    stopSpin() { stopSpin(); },
    // 3Dの上と下に重なっている帯の高さ(px)。紙はその間の空いた所の中央に、そこへ収まる大きさで置く
    setInsets({ top = 0, bottom = 0 } = {}) {
      const next = { top: Math.max(0, Math.round(top)), bottom: Math.max(0, Math.round(bottom)) };
      if (next.top === insets.top && next.bottom === insets.bottom) return;
      insets = next;
      applyShift();
      updateFit(false);
      needsRender = true;
      wake();
    },
    wake,
    requestRender() { needsRender = true; wake(); },
    stats() {
      const off = camera.position.clone().sub(controls.target);
      const s = new THREE.Spherical().setFromVector3(off);
      return { renders, running: !!raf, why: lastWhy, spinning: !!spin, finished, coverage: coverage(), paperRect: paperRect(), explode, userMoved, view: autoName, viewMoving: !!viewAnim, distance: s.radius, phi: s.phi, theta: s.theta, fitDistance: fit?.dist ?? null, zoomFactor };
    },
    dispose() {
      disposed = true; ro.disconnect(); controls.dispose(); renderer.dispose();
      if (raf) cancelAnimationFrame(raf);
    },
  };
  return api;
}

export const VIEW_NAMES = Object.keys(VIEWS);
