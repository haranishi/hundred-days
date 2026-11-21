import * as THREE from '../vendor/three.js';
import { createViewer } from './view3d.js';
import { buildFishModel, visitPieceMeshes } from './pieces.js';
import { createMaterials } from './materials.js';
import { getSpecies } from './species/index.js';
import { getProcedure } from './procedures/index.js';
import { boardSizeFor, createProcedure, stateAt } from './timeline.js';
import { CURVE_INFO, PIECE_PARENT, curveOwner } from './contract.js';
import { clamp01 } from './easing.js';
import { buildKnife } from './knife.js';
import { createRng, hashString } from './rng.js';
import { createPicker } from './pick.js';
import { createSession, addSample } from './practice.js';
import { composePieceMatrix, groundPoseMatrix, hingePoint, knifeMatrix, slitMatrix } from './pose-compose.js';
import { createGuides, pointAtCutDepth } from './guides.js';
import { createSceneOverlay } from './scene-overlay.js';

// 固定された小物を部品の内側で材質ごとにまとめます。色・UV・断面属性と三角形の向きも引き継ぎます。
// 刃の接触点から、盤の面で前後左右にこの距離（cm）までを、視点の枠に含める。
const WORK_REACH_CM = 4.5;

function batchMeshes(root, geometries) {
  const meshes = root.children.filter(o => o.isMesh && !o.isInstancedMesh && !o.userData.pieceId && !o.children.length);
  const draws = new Map();
  for (const mesh of meshes) {
    const g = mesh.geometry, multi = Array.isArray(mesh.material);
    const ranges = multi ? g.groups : [{ start: 0, count: g.index?.count ?? g.attributes.position.count }];
    for (const { start, count, materialIndex } of ranges) {
      const material = multi ? mesh.material[materialIndex] : mesh.material;
      if (!draws.has(material)) draws.set(material, []);
      draws.get(material).push({ mesh, start, count });
    }
  }
  if (![...draws.values()].some(parts => parts.length > 1)) return;
  const flat = new Map();
  for (const mesh of meshes) {
    mesh.updateMatrix();
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    flat.set(mesh, g.applyMatrix4(mesh.matrix));
    mesh.removeFromParent();
  }
  for (const [material, ranges] of draws) {
    const geometry = new THREE.BufferGeometry();
    const sizes = new Map();
    let total = 0;
    for (const { mesh, count } of ranges) {
      total += count;
      for (const [name, attr] of Object.entries(flat.get(mesh).attributes)) sizes.set(name, attr.itemSize);
    }
    for (const [name, size] of sizes) {
      const data = new Float32Array(total * size);
      let offset = 0;
      for (const { mesh, start, count } of ranges) {
        const attr = flat.get(mesh).attributes[name];
        if (attr) data.set(attr.array.subarray(start * size, (start + count) * size), offset);
        else if (name === 'color') data.fill(1, offset, offset + count * size);
        offset += count * size;
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(data, size));
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = material.name || ranges[0].mesh.name;
    root.add(mesh);
    geometries.add(geometry);
  }
  for (const g of flat.values()) g.dispose();
}

function bindPieces(model, geometries, variants) {
  const { anatomy, pieces, materials } = model;
  const dorsal = anatomy.curve('dorsalMidline').points, ventral = anatomy.curve('ventralMidline').points;
  const entries = [], byId = new Map();
  // 親を先に記録します。部品の根には InstancedMesh（小骨）もあります。
  model.group.traverse(object => {
    const piece = pieces[object.userData.pieceId];
    if (piece?.object === object) entries.push({ piece, board: new THREE.Matrix4(), visible: true });
  });
  const meshBox = new THREE.Box3(), partBox = new THREE.Box3();
  for (const entry of entries) {
    const { piece } = entry;
    byId.set(piece.id, entry);
    batchMeshes(piece.object, geometries);
    const perMaterial = new Map();
    entry.casters = [];
    function variant(base) {
      if (!perMaterial.has(base)) {
        const mat = base.clone();
        mat.onBeforeCompile = base.onBeforeCompile;
        mat.customProgramCacheKey = base.customProgramCacheKey;
        if (base.color) mat.color = base.color;
        if (base.emissive) mat.emissive = base.emissive;
        if (base.isShaderMaterial) mat.uniforms = base.uniforms;
        mat.forceSinglePass = true;
        const ghost = base === materials.skin ? 0.18
          : base === materials.flesh || base === materials.cap ? 0.10 : base === materials.fin ? 0.30 : 1;
        perMaterial.set(base, { base, mat, ghost });
        variants.add(mat);
      }
      return perMaterial.get(base).mat;
    }
    partBox.makeEmpty();
    visitPieceMeshes(piece.object, mesh => {
      mesh.updateWorldMatrix(true, false);
      const shape = mesh.isInstancedMesh ? mesh : mesh.geometry;
      if (!shape.boundingBox) shape.computeBoundingBox();
      partBox.union(meshBox.copy(shape.boundingBox).applyMatrix4(mesh.matrixWorld));
      const bases = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.castShadow = bases.includes(materials.skin) || bases.includes(materials.fin);
      if (mesh.castShadow) entry.casters.push(mesh);
      mesh.receiveShadow = true;
      mesh.renderOrder = bases.includes(materials.skin) ? 3 : bases.includes(materials.flesh) ? 2 : 0;
      mesh.material = Array.isArray(mesh.material) ? bases.map(variant) : variant(mesh.material);
    });
    const x = partBox.isEmpty() ? piece.pivot[0] : (partBox.min.x + partBox.max.x) / 2;
    entry.box = partBox.clone();
    entry.hinges = { dorsalHinge: hingePoint(dorsal, x), ventralHinge: hingePoint(ventral, x) };
    entry.materials = [...perMaterial.values()];
    entry.parent = byId.get(PIECE_PARENT[piece.id]);
    piece.object.matrixAutoUpdate = false;
  }
  const slit = new THREE.Matrix4();
  const inverseGround = new THREE.Matrix4();
  const extent = new THREE.Box3();
  model.group.matrixAutoUpdate = false;
  return {
    extent,
    matrixFor: id => byId.get(id)?.board ?? model.group.matrix,
    visible: id => id == null || byId.get(id)?.visible === true,
    apply(state, boardTop, xray) {
      groundPoseMatrix(state.pose, anatomy.bounds, boardTop, model.group.matrix);
      inverseGround.copy(model.group.matrix).invert();
      model.group.matrixWorldNeedsUpdate = true;
      extent.makeEmpty();
      for (const entry of entries) {
        const { piece, parent, hinges } = entry, { id, object } = piece, own = state.pieces[id];
        entry.ground = parent?.ground ?? model.group.matrix;
        if (own.poseLock) {
          entry.lockGround ??= new THREE.Matrix4();
          entry.ground = groundPoseMatrix(own.poseLock, anatomy.bounds, boardTop, entry.lockGround);
        }
        composePieceMatrix(entry.ground, own, piece.pivot, null, object.matrix, hinges);
        if (state.uniforms.slitOpen && (id === 'L.dorsal' || id === 'R.dorsal')) {
          object.matrix.multiply(slitMatrix(id, state.uniforms.slitOpen, hinges.dorsalHinge, slit));
        }
        // 盤上の行列を先に確定し、固定した根だけを現在の魚のローカル座標へ戻します。
        entry.board.multiplyMatrices(parent?.board ?? entry.ground, object.matrix);
        if (own.poseLock) object.matrix.multiplyMatrices(inverseGround, entry.board);
        object.matrixWorldNeedsUpdate = true;
        object.visible = own.visible;
        entry.visible = own.visible && (parent?.visible ?? true);
        if (entry.visible && own.opacity > 0) extent.union(meshBox.copy(entry.box).applyMatrix4(entry.board));
        // 透視中の皮が不透明な影を落として骨を暗くするのを避けます。
        for (const mesh of entry.casters) mesh.castShadow = own.opacity >= 0.5 && xray <= 0.3;
        for (const { base, mat, ghost } of entry.materials) {
          const alpha = base.opacity * own.opacity * (materials.setXray ? 1 : 1 - xray * (1 - ghost));
          mat.visible = base.visible && alpha > 0;
          mat.opacity = alpha;
          // 透明かどうかを切り替えたら、材質を作り直させます。最初に不透明で作った材質は OPAQUE 定義で
          // 出力の不透明度が1に固定され、あとから transparent を立てても皮が透けません（透視・部品の消え際）。
          const transparent = base.transparent || alpha < 1;
          if (mat.transparent !== transparent) {
            mat.transparent = transparent;
            mat.needsUpdate = true;
          }
          mat.depthWrite = base.depthWrite && alpha >= 1;
        }
      }
    },
  };
}

function createTools(geometries, materials) {
  const holder = new THREE.Group(), cache = new Map();
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshBasicMaterial({ color: '#e5422f', toneMapped: false }));
  geometries.add(glow.geometry);
  materials.add(glow.material);
  holder.matrixAutoUpdate = false;
  holder.add(glow);
  let current;
  function load(tool) {
    const object = buildKnife(tool), bladeBox = new THREE.Box3();
    // 材質でまとめる前に、刃と作業端の局所の箱を取ります。柄や口金は含めません。
    object.updateMatrixWorld(true);
    object.traverse(mesh => {
      if (!mesh.isMesh) return;
      if (['blade', 'head', 'tooth', 'jaw'].includes(mesh.name)) {
        mesh.geometry.computeBoundingBox();
        bladeBox.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
      }
      geometries.add(mesh.geometry);
      for (const mat of [mesh.material].flat()) materials.add(mat);
    });
    batchMeshes(object, geometries);
    // 道具の主要な金属面で影を作ります。
    const metal = object.children.find(o => o.name === 'blade' || o.name === 'head' || o.name === 'jaw');
    for (const part of object.children) part.castShadow = part === metal;
    return { object, bladeBox };
  }
  return {
    holder,
    get bladeBox() { return holder.visible && current && !current.bladeBox.isEmpty() ? current.bladeBox : null; },
    update(knife, pose, practiceCut) {
      holder.visible = Boolean(knife && !practiceCut && pose.visible(knife.owner));
      if (!holder.visible) return;
      if (!cache.has(knife.tool)) cache.set(knife.tool, load(knife.tool));
      const next = cache.get(knife.tool);
      if (next !== current) {
        current?.object.removeFromParent();
        current = next;
        holder.add(next.object);
        glow.position.set(0, 0, 0); // 赤い点は、刃が線に触れる点（接触点）に置く。刃の先に置くと、切り線から離れて見える
      }
      knifeMatrix(knife, pose.matrixFor(knife.owner), holder.matrix);
      holder.matrixWorldNeedsUpdate = true;
    },
    dispose() { holder.clear(); cache.clear(); },
  };
}

/** 盤上の魚と道具。描画先や入力機器に依存せず、同じ手順と進度で同じ配置を再現します。 */
export function createFishDisplay(model, raw, { boardTop = 0, rng = createRng(97) } = {}) {
  const group = new THREE.Group(), geometries = new Set(), materials = new Set();
  let guides, tools, disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    guides?.dispose();
    tools?.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    model.dispose();
    group.clear();
  }
  try {
    const proc = createProcedure(raw, model.anatomy);
    const pose = bindPieces(model, geometries, materials);
    tools = createTools(geometries, materials);
    guides = createGuides(proc.anatomy, rng);
    group.add(model.group, guides.group, tools.holder);
    const triangles = Object.values(model.pieces).reduce((sum, piece) => sum + piece.triangles, 0);
    const rest = new THREE.Box3(new THREE.Vector3().fromArray(model.anatomy.bounds.min),
      new THREE.Vector3().fromArray(model.anatomy.bounds.max));
    const bounds = new THREE.Box3(), focus = new THREE.Vector3(), head = new THREE.Vector3();
    const workSphere = new THREE.Sphere(new THREE.Vector3(), 0), workBox = new THREE.Box3();
    function apply(state, step, xray, practiceCut) {
      const m = model.materials, uniforms = state.uniforms;
      const seeInside = practiceCut && (practiceCut.through || CURVE_INFO[practiceCut.curve].inner);
      const amount = xray || seeInside ? 1 : uniforms.xray;
      m.setScale?.(uniforms.scale);
      m.setScutes?.(uniforms.scutes);
      if (m.setSlitOpen) m.setSlitOpen(uniforms.slitOpen);
      else m.setProgress?.('slitOpen', uniforms.slitOpen);
      m.setXray?.(amount);
      m.setIncisions?.(state.incisions.map(c => ({ points: guides.curvePoints(c), progress: c.progress, through: c.through })));
      pose.apply(state, boardTop, amount);
      bounds.copy(rest).applyMatrix4(model.group.matrix).union(pose.extent);
      guides.update(state, step, pose, amount, practiceCut, boardTop);
      tools.update(state.knife, pose, practiceCut);
      if (tools.holder.visible) {
        // 刃の接触点のまわりだけを枠に足す。上下に広げすぎると外接球が膨らみ、魚が画面で小さくなる。
        workSphere.center.setFromMatrixPosition(tools.holder.matrix);
        const c = workSphere.center;
        bounds.union(workBox.set(new THREE.Vector3(c.x - WORK_REACH_CM, c.y - 0.5, c.z - WORK_REACH_CM),
          new THREE.Vector3(c.x + WORK_REACH_CM, c.y + 1.5, c.z + WORK_REACH_CM)));
      }
      const key = step.camera.focus;
      const pivot = typeof key === 'string' && key.startsWith('piece:') && model.pieces[key.slice(6)]?.pivot;
      focus.fromArray(pivot || state.camera.focusPoint).applyMatrix4(pose.matrixFor(state.camera.focusOwner));
      head.set(-1, 0, 0).transformDirection(model.group.matrix);
    }
    return { group, model, proc, pose, guides, knife: tools.holder, get bladeBox() { return tools.bladeBox; },
      triangles, bounds, focus, head, apply, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

function connectPracticeInput(canvas, { target, pickPoint, display, emit }) {
  const events = new AbortController(), listener = { signal: events.signal };
  let pointer = null, stroke = null, owner = null, lifted = true;
  function release() {
    const id = pointer;
    pointer = null;
    if (id !== null && canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
  }
  function draw(sample) {
    const { guides, pose } = display();
    if (sample.lifted) guides.trace.lift();
    guides.trace.add(sample.p, sample.d <= stroke.tolerance, pose.matrixFor(owner));
  }
  function sample(phase, point, event, cut) {
    addSample(stroke, point, event.timeStamp);
    const last = stroke.samples.at(-1);
    last.lifted = lifted;
    draw(last);
    lifted = false;
    emit('practice-sample', { phase, point, tMs: event.timeStamp, cutId: cut.id, curvePoints: stroke.curvePoints });
  }
  canvas.addEventListener('pointerdown', e => {
    const cut = target();
    if (!cut || pointer !== null || e.button !== 0 || e.isPrimary === false) return;
    const point = pickPoint(e, cut);
    if (!point) return;
    const d = display();
    d.guides.trace.clear();
    owner = curveOwner(cut.curve, cut.side);
    stroke = createSession({ curvePoints: d.guides.curvePoints(cut), tolerance: cut.tolerance });
    pointer = e.pointerId;
    lifted = true;
    canvas.focus?.({ preventScroll: true });
    try { canvas.setPointerCapture?.(pointer); } catch { /* 捕捉のない端末でも盤上の入力を受けます。 */ }
    sample('start', point, e, cut);
  }, listener);
  canvas.addEventListener('pointermove', e => {
    if (pointer !== e.pointerId) return;
    const cut = target(), point = cut && pickPoint(e, cut);
    if (point) sample('move', point, e, cut);
    else lifted = true;
  }, listener);
  function finish(e) {
    if (pointer === null || (e.pointerId !== undefined && pointer !== e.pointerId)) return;
    const cut = target();
    release();
    if (!cut) return;
    // 魚の外で離したときも、最後に魚へ触れた位置で一筆を閉じます。
    const point = e.type === 'pointerup' && pickPoint(e, cut);
    sample('end', point || stroke.samples.at(-1).p, e, cut);
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) {
    canvas.addEventListener(type, finish, listener);
  }
  function clear() {
    release();
    stroke = null; lifted = true;
    display()?.guides.trace.clear();
  }
  return {
    clear,
    redraw() {
      if (stroke) for (const point of stroke.samples) draw(point);
    },
    dispose() { events.abort(); clear(); },
  };
}

function sceneError(cause) {
  return cause instanceof Error && /[ぁ-んァ-ン一-龯]/u.test(cause.message) ? cause
    : new Error('魚の3D表示を初期化できませんでした。', { cause });
}

export function createFishScene({ container, speciesId = 'aji', quality = 'auto', debug = false } = {},
  { makeViewer = createViewer, makeOverlay = createSceneOverlay, procedureFor = getProcedure } = {}) {
  const doc = container?.ownerDocument, host = doc?.defaultView ?? globalThis;
  const params = new URLSearchParams(host.location?.search);
  const frozen = params.get('freeze') === '1' || params.has('t');
  const reduced = host.matchMedia?.('(prefers-reduced-motion: reduce)');
  const seedText = params.get('seed');
  const seed = seedText === null ? hashString(speciesId) : Number.isFinite(Number(seedText)) ? Number(seedText) : hashString(seedText);
  const listeners = new Map();
  const events = new AbortController();
  let pendingShot = null;
  let viewer, display, overlay, input, picker, disposed = false;
  let step = 0, u = 0, leftHanded = false, xray = false, labels = false, chosenView = null;
  let requestedCut = null, practiceCut = null, dirty = true, still = frozen, viewSync = null;
  let state, lastStep, lastU, lastLeft, seconds = 0, forceCamera = false;
  const cameraBox = new THREE.Box3(), cameraFocus = new THREE.Vector3(), cameraHead = new THREE.Vector3();
  let preset, zoom;
  const point = new THREE.Vector3(), inverse = new THREE.Matrix4();

  function emit(name, payload) {
    for (const callback of listeners.get(name) ?? []) callback(payload);
  }
  function selectCut() {
    const current = display?.proc.steps[step];
    const cut = current?.cuts?.find(c => c.id === requestedCut);
    practiceCut = cut ? { ...cut, tolerance: current.practice?.tolerance ?? 0.5 } : null;
    viewer?.controls.setEnabled(!practiceCut);
    viewer?.rig.setReducedMotion(Boolean(practiceCut || frozen || reduced?.matches));
  }
  function apply(immediate = false) {
    if (!display || disposed) return;
    const at = practiceCut?.window[0] ?? u;
    const changed = !state || step !== lastStep || at !== lastU || leftHanded !== lastLeft;
    if (!dirty && !changed && !immediate) return;
    const rawStep = display.proc.steps[step];
    if (changed) {
      state = stateAt(display.proc, step, at, { leftHanded });
      seconds = at * rawStep.durationMs / 1000;
      lastStep = step; lastU = at; lastLeft = leftHanded;
    }
    display.apply(state, rawStep, xray, practiceCut);
    display.guides.setTime(seconds);
    overlay?.setMarks(state, labels, display.pose, display.model, display);
    const nextPreset = chosenView ?? state.camera.preset;
    const boundsChanged = !cameraBox.equals(display.bounds);
    viewer.stage.setContactBounds(display.pose.extent);
    if (boundsChanged) {
      cameraBox.copy(display.bounds);
      viewer.rig.setBounds(cameraBox, { immediate: false });
    }
    if (immediate || forceCamera || boundsChanged || nextPreset !== preset || zoom !== state.camera.zoom
      || !cameraFocus.equals(display.focus) || !cameraHead.equals(display.head)) {
      preset = nextPreset; zoom = state.camera.zoom;
      cameraFocus.copy(display.focus); cameraHead.copy(display.head);
      // rig は手で動かした間も復帰先を覚えます。視点ボタン・撮影時だけ強制して戻します。
      viewer.rig.applyPreset(preset, { focus: cameraFocus, headDirection: cameraHead, zoom },
        { immediate: immediate || still || Boolean(practiceCut || reduced?.matches), force: forceCamera });
    }
    forceCamera = dirty = false;
  }
  function frame(dt) {
    viewSync = null;
    apply();
    if (!display || disposed) return;
    const elapsed = still || reduced?.matches ? 0 : dt;
    seconds += elapsed;
    display.guides.setTime(seconds);
    display.guides.setViewport(container.clientWidth, container.clientHeight);
    display.model.materials.setSpeed?.(seconds);
    display.model.materials.update?.(elapsed);
  }

  function clearDebug() {
    const api = debug && host.__sabaki;
    if (display && api && api.model === display.model) {
      delete api.model; delete api.anatomy; delete api.proc;
    }
  }
  function cancelShot() {
    if (!pendingShot) return;
    pendingShot.reject(new Error('固定した画面の撮影を中断しました。'));
    pendingShot = null;
  }
  function install(tier) {
    const species = getSpecies(speciesId);
    if (!species) throw new Error('この魚の3Dはまだ準備中です');
    // 重い画質と軽い画質の描画資源を同時に抱えず、練習中の点列だけを入力側に残します。
    clearDebug();
    display?.dispose();
    display = state = null;
    const rng = createRng(seed);
    const model = buildFishModel(species, { quality: tier, rng, materialFactory: createMaterials });
    const raw = procedureFor(speciesId);
    if (!raw) { model.dispose(); throw new Error('この魚の手順はまだ準備中です'); }
    display = createFishDisplay(model, raw, { boardTop: viewer.stage.boardTop, rng: rng.fork('粒') });
    const { width, depth } = boardSizeFor(model.anatomy.TL);
    viewer.stage.setBoardSize(width, depth);
    viewer.scene.add(display.group);
    step = Math.min(step, display.proc.steps.length - 1);
    dirty = true;
    selectCut();
    apply(!input || still);
    input?.redraw();
    if (debug) Object.assign(host.__sabaki ??= {}, { model, anatomy: model.anatomy, proc: display.proc });
  }
  function pickPoint(e, cut) {
    apply();
    const hit = picker(e.clientX, e.clientY);
    if (!hit) return null;
    const owner = curveOwner(cut.curve, cut.side);
    if (!display.pose.visible(owner)) return null;
    if (cut.through || CURVE_INFO[cut.curve].inner) {
      const object = display.model.pieces[owner]?.object ?? display.model.group;
      return pointAtCutDepth(viewer.camera, object.matrixWorld, viewer.renderer.domElement.getBoundingClientRect(),
        e.clientX, e.clientY, display.guides.curvePoints(cut));
    }
    // 皮と身が別々に動いたあとも、当たった部品から切りの持ち主の FLF へ戻します。
    return point.fromArray(hit.point).applyMatrix4(display.pose.matrixFor(hit.pieceId))
      .applyMatrix4(inverse.copy(display.pose.matrixFor(owner)).invert()).toArray();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelShot();
    events.abort();
    clearDebug();
    input?.dispose();
    overlay?.dispose();
    display?.dispose();
    viewer?.dispose();
    listeners.clear();
    input = overlay = display = viewer = picker = state = null;
  }
  const ready = Promise.resolve().then(() => {
    if (disposed) throw new Error('3D表示を終了しました。');
    viewer = makeViewer({ container, quality, reducedMotion: frozen ? true : undefined,
      onFrame: frame,
      onQualityChange(tier) {
        try { install(tier); } catch (error) { dispose(); throw sceneError(error); }
      },
      onCameraUser() { emit('camera-user', viewer.rig.serialize()); },
      onTap(p) { apply(); const hit = picker?.(p.x, p.y); if (hit) emit('pick', hit); },
    });
    // viewer が光・盤を含む stage を所有し、画素比と影の段をそろえます。
    const canvas = viewer.renderer.domElement;
    canvas.classList.add('stage-canvas');
    viewer.setMirror(leftHanded);
    install(viewer.quality);
    overlay = makeOverlay(container);
    overlay.setMarks(state, labels, display.pose, display.model, display);
    viewer.scene.onAfterRender = () => {
      overlay.project(viewer.camera);
      if (pendingShot && --pendingShot.frames === 0) {
        pendingShot.resolve();
        pendingShot = null;
      }
    };
    canvas.addEventListener('webglcontextlost', cancelShot, { signal: events.signal });
    picker = createPicker({ camera: viewer.camera, domElement: canvas, meshes: () => display.model.group });
    input = connectPracticeInput(canvas, { target: () => practiceCut, pickPoint, display: () => display, emit });
    viewer.stage.update(0);
    frame(0);
    if (!viewer.render(0)) throw new Error('魚の最初の画面を描画できませんでした。');
    if (doc?.body) doc.body.dataset.ready = 'true';
    viewer.start();
    return { triangles: display.triangles, quality: viewer.quality, gl: viewer.stats().gl };
  }).catch(error => {
    dispose();
    throw sceneError(error);
  });

  return {
    ready,
    setStep(i) {
      const n = Math.min(display ? display.proc.steps.length - 1 : Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(Number(i) || 0)));
      viewSync = 'step';
      if (step === n) return;
      step = n;
      requestedCut = null;
      input?.clear();
      selectCut();
      dirty = true;
    },
    setProgress(value) {
      u = clamp01(Number(value));
      if (viewSync === 'step') viewSync = 'progress';
    },
    setView(value) {
      if (!['cook', 'side', 'top'].includes(value)) return;
      // 手順移動ごとに画面が再送する既定値では、各手順の接写や真上の指定を生かします。
      const sync = viewSync === 'progress';
      viewSync = null;
      if (sync && (value === chosenView || (!chosenView && value === 'cook'))) return;
      chosenView = value; forceCamera = dirty = true;
    },
    setXray(value) { if (xray !== Boolean(value)) { xray = Boolean(value); dirty = true; } },
    setLabels(value) { if (labels !== Boolean(value)) { labels = Boolean(value); dirty = true; } },
    setLeftHanded(value) {
      if (leftHanded === Boolean(value)) return;
      leftHanded = Boolean(value);
      viewer?.setMirror(leftHanded);
      dirty = true;
    },
    setPractice(config) {
      if (!config && !requestedCut) return;
      input?.clear();
      requestedCut = config?.cutId ?? null;
      selectCut();
      dirty = true;
      apply();
    },
    resetCamera({ immediate = false, capture = false } = {}) {
      if (!viewer) return;
      if (capture) still = true;
      forceCamera = dirty = true;
      apply(immediate);
      if (capture) {
        seconds = lastU * display.proc.steps[step].durationMs / 1000;
        frame(0);
        cancelShot();
        if (viewer.renderer.getContext?.().isContextLost()) throw new Error('3D表示が中断しています。');
        return new Promise((resolve, reject) => { pendingShot = { resolve, reject, frames: 3 }; });
      }
    },
    async snapshot() {
      await ready;
      if (!viewer) throw new Error('3D表示の終了後は画像を書き出せません。');
      frame(0);
      return viewer.snapshot();
    },
    on(name, cb) {
      if (disposed || typeof cb !== 'function') return () => {};
      if (!listeners.has(name)) listeners.set(name, new Set());
      const set = listeners.get(name);
      set.add(cb);
      return () => set.delete(cb);
    },
    stats() {
      return { stepCount: display?.proc.steps.length ?? 0, triangles: display?.triangles ?? 0,
        quality: viewer?.quality ?? quality, fps: viewer?.stats().fps ?? 0 };
    },
    dispose,
  };
}
