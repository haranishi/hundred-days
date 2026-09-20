import * as T from '../vendor/three.js';
import { RAILWAYS, RAILWAY_BY_ID, PLACES, VIEWS, geo } from './railways.js';
import { CAR_COUNT, trainCars, pointOnPath, PATHS } from './motion.js';
import { createScenery } from './scenery.js';

const MAX_CARS = 2000;
const material = (color, more = {}) => new T.MeshStandardMaterial({ color, roughness: .6, ...more });
export function createCityScene({ canvas, labels, onSelect, onCameraMode, onFailure }) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3;
  const scene = new T.Scene(); scene.background = new T.Color('#e8f0eb'); scene.fog = new T.Fog('#e8f0eb', 230, 570);
  scene.add(new T.HemisphereLight('#e6f5ff', '#a1ad8a', 2.5));
  const sunlight = new T.DirectionalLight('#fff0d2', 3.5); sunlight.position.set(-70, 160, 70); sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048); Object.assign(sunlight.shadow.camera, { left: -180, right: 180, top: 160, bottom: -160, near: 1, far: 420 });
  sunlight.shadow.normalBias = .15; sunlight.shadow.bias = -.0002; scene.add(sunlight);
  const city = createScenery(scene);
  const camera = new T.PerspectiveCamera(40, 1, .15, 1000);
  const controls = new T.OrbitControls(camera, canvas);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  controls.enableDamping = true; controls.dampingFactor = .085; controls.minDistance = 5; controls.maxDistance = 580;
  controls.minPolarAngle = .15; controls.maxPolarAngle = Math.PI / 2 - .035; controls.screenSpacePanning = false;
  controls.maxTargetRadius = 240; controls.cursor.set(-20, 0, 20); controls.rotateSpeed = .55; controls.zoomSpeed = .9;
  controls.listenToKeyEvents(canvas);
  const box = new T.BoxGeometry(1, 1, 1), rounded = new T.RoundedBoxGeometry(1, 1, 1, 2, .095);
  const parts = [
    { name: 'body', geometry: rounded, material: material('#f5f4e8', { metalness: .18 }), size: [.64, .48, 1.38], offset: [0, .33, 0] },
    { name: 'windows', material: material('#284b50', { metalness: .15 }), size: [.655, .135, 1.14], offset: [0, .42, 0] },
    { name: 'stripe', material: material('#ffffff'), size: [.661, .072, 1.32], offset: [0, .245, 0], colored: true },
    { name: 'roof', material: material('#d8e0d9', { metalness: .15 }), size: [.55, .065, 1.24], offset: [0, .586, 0] },
    { name: 'aircon', material: material('#a6b9b1'), size: [.29, .105, .42], offset: [0, .65, 0] },
    { name: 'chassis', material: material('#344840'), size: [.5, .09, 1.15], offset: [0, .07, 0] },
    { name: 'cab', material: material('#25434a'), size: [.46, .22, .025], offset: [0, .385, .698] },
    { name: 'doors', material: material('#e1e6db'), size: [.671, .32, .075], offset: [0, .365, .39] },
    { name: 'doors-back', material: material('#e1e6db'), size: [.671, .32, .075], offset: [0, .365, -.39] },
  ];
  for (const part of parts) {
    part.mesh = new T.InstancedMesh(part.geometry || box, part.material, MAX_CARS); part.mesh.count = 0;
    part.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); part.mesh.frustumCulled = false; scene.add(part.mesh);
  }
  const headlights = new T.InstancedMesh(box, new T.MeshBasicMaterial({ color: '#fff4bd' }), MAX_CARS / 2);
  headlights.count = 0; headlights.frustumCulled = false; headlights.instanceMatrix.setUsage(T.DynamicDrawUsage); scene.add(headlights);
  const ring = new T.Mesh(new T.RingGeometry(1.25, 1.4, 48), new T.MeshBasicMaterial({ color: '#f6c674', side: T.DoubleSide, depthTest: false, transparent: true, opacity: .85 }));
  ring.rotation.x = -Math.PI / 2; ring.visible = false; ring.renderOrder = 5; scene.add(ring);
  const transform = new T.Object3D(), partOffset = new T.Vector3();
  let trains = [], ids = [], selected = null, mode = 'free', labelsVisible = true, activeRoutes = new Set(RAILWAYS.map(r => r.id));
  let transition = null, lastLabelsAt = 0, lastMetricsAt = 0, lastRevealAt = 0, lost = false, needsRender = true, trainKey = '';
  controls.addEventListener('change', () => { needsRender = true; });
  const pickRay = new T.Raycaster(), pointer = new T.Vector2();
  const majorNames = ['Tokyo', 'Shinjuku', 'Shibuya', 'Ikebukuro', 'Ueno', 'Shinagawa', 'Akihabara', 'Nakano', 'Kichijoji', 'Mitaka', 'Akabane', 'Kamata', 'Kinshicho', 'Osaki'];
  const labelObjects = majorNames.map(id => { const place = PLACES.get(id); return { ...geo(place.lng, place.lat), y: 2.5, name: place.name, className: 'station-label-3d', routes: new Set(RAILWAYS.filter(r => r.stations.some(s => s.id === id)).map(r => r.id)) }; });
  labelObjects.forEach(label => { label.el = document.createElement('span'); label.el.className = label.className; label.el.textContent = label.name; labels.append(label.el); label.point = new T.Vector3(label.x, label.y, label.z); });
  function frameSelection() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (mode === 'follow' && w <= 680) camera.setViewOffset(w, h, 0, h * .11, w, h);
    else camera.clearViewOffset();
    needsRender = true;
  }
  function setMode(next) { if (mode === next) return; mode = next; frameSelection(); canvas.dataset.cameraMode = mode; onCameraMode(mode); }
  function stopFollowing() { transition = null; setMode('free'); }
  controls.addEventListener('start', stopFollowing);
  let press = null;
  canvas.addEventListener('pointerdown', event => { if (event.isPrimary && event.button === 0) press = { x: event.clientX, y: event.clientY }; else press = null; });
  canvas.addEventListener('pointercancel', () => { press = null; });
  canvas.addEventListener('pointerup', event => {
    if (!press || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 7) { press = null; return; }
    press = null;
    const rect = canvas.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    pickRay.setFromCamera(pointer, camera);
    const hit = pickRay.intersectObject(parts[0].mesh, false)[0];
    if (hit && ids[hit.instanceId]) onSelect(ids[hit.instanceId]);
  });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true; canvas.dataset.renderState = 'lost'; onFailure('3D描画が一時的に停止しました。再読み込みすると、街を作り直せます。'); });
  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    renderer.setSize(rect.width, rect.height, false); camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix(); frameSelection();
  }
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
  function view(id, immediate = false) {
    const preset = VIEWS.find(v => v.id === id) || VIEWS[0];
    const place = preset.place && PLACES.get(preset.place);
    const target = place ? new T.Vector3(geo(place.lng, place.lat).x, 0, geo(place.lng, place.lat).z) : new T.Vector3(...preset.target);
    const offset = new T.Vector3(...preset.offset);
    if (camera.aspect < .85 && id === 'city') offset.multiplyScalar(1.4);
    const position = target.clone().add(offset); setMode('free');
    if (immediate) { camera.position.copy(position); controls.target.copy(target); controls.update(); transition = null; }
    else transition = { position, target };
  }
  function drawTrains(next) {
    trains = next.filter(t => activeRoutes.has(t.railway));
    const key = selected + ':' + trains.map(t => `${t.id}:${t.distance.toFixed(5)}:${t.direction}`).join('|');
    if (key === trainKey) return;
    trainKey = key; needsRender = true; ids = [];
    let count = 0, lightCount = 0; ring.visible = false;
    for (const train of trains) {
      const poses = trainCars(train), color = new T.Color(RAILWAY_BY_ID.get(train.railway).color);
      for (let i = 0; i < poses.length && count < MAX_CARS; i++, count++) {
        const p = poses[i]; ids.push(train.id);
        for (const part of parts) {
          transform.position.set(p.x, p.y, p.z); transform.rotation.set(0, p.angle, 0);
          partOffset.set(...part.offset).applyAxisAngle(T.Object3D.DEFAULT_UP, p.angle); transform.position.add(partOffset);
          transform.scale.set(...part.size); transform.updateMatrix(); part.mesh.setMatrixAt(count, transform.matrix);
          if (part.colored) part.mesh.setColorAt(count, color);
        }
        if (i === 0) for (const side of [-1, 1]) {
          transform.position.set(p.x, p.y, p.z); partOffset.set(side * .19, .265, .721).applyAxisAngle(T.Object3D.DEFAULT_UP, p.angle); transform.position.add(partOffset);
          transform.rotation.set(0, p.angle, 0); transform.scale.set(.08, .045, .02); transform.updateMatrix(); headlights.setMatrixAt(lightCount++, transform.matrix);
        }
        if (i === 0 && train.id === selected) { ring.visible = true; ring.position.set(p.x, p.y + .015, p.z); }
      }
    }
    for (const part of parts) { part.mesh.count = count; part.mesh.instanceMatrix.needsUpdate = true; if (part.colored && part.mesh.instanceColor) part.mesh.instanceColor.needsUpdate = true; }
    parts[0].mesh.boundingSphere = null;
    headlights.count = lightCount; headlights.instanceMatrix.needsUpdate = true;
    canvas.dataset.renderedTrains = String(trains.length);
  }
  function updateLabels() {
    const width = canvas.clientWidth, height = canvas.clientHeight, placed = [];
    for (const label of labelObjects) {
      const p = label.point.clone().project(camera);
      const x = (p.x * .5 + .5) * width, y = (-p.y * .5 + .5) * height;
      const visible = labelsVisible && p.z < 1 && p.z > -1 && x > 38 && x < width - 38 && y > 25 && y < height - 25 && (!label.routes || Array.from(label.routes).some(r => activeRoutes.has(r))) && !placed.some(q => Math.abs(q.x - x) < 65 && Math.abs(q.y - y) < 24);
      label.el.hidden = !visible;
      if (visible) { label.el.style.transform = `translate(${x}px,${y}px)`; placed.push({ x, y }); }
    }
  }
  function render(delta, timestamp) {
    if (lost) return;
    const factor = reduceMotion.matches ? 1 : 1 - Math.exp(-delta * 7);
    controls.enableDamping = !reduceMotion.matches;
    if (transition) {
      camera.position.lerp(transition.position, factor); controls.target.lerp(transition.target, factor);
      if (camera.position.distanceTo(transition.position) < .03) transition = null;
    }
    const targetTrain = trains.find(t => t.id === selected);
    if (mode !== 'free' && targetTrain) {
      const p = trainCars(targetTrain)[0];
      const forward = new T.Vector3(Math.sin(p.angle), 0, Math.cos(p.angle)), sideways = new T.Vector3(forward.z, 0, -forward.x);
      const center = new T.Vector3(p.x, p.y + .5, p.z);
      if (mode === 'follow') center.addScaledVector(forward, -2.4);
      const eye = mode === 'ride' ? center.clone().addScaledVector(forward, 1.8).add(new T.Vector3(0, 1.6, 0)) : center.clone().addScaledVector(forward, -10).addScaledVector(sideways, 10).add(new T.Vector3(0, 7, 0));
      if (mode === 'follow' && canvas.clientWidth <= 680) eye.sub(center).multiplyScalar(1.35).add(center);
      const look = center.clone().addScaledVector(forward, mode === 'ride' ? 14 : 0);
      camera.position.lerp(eye, factor); controls.target.lerp(look, factor);
    } else if (mode !== 'free') setMode('free');
    controls.update();
    if (timestamp - lastRevealAt > 100) {
      const targets = mode !== 'free' && targetTrain ? trainCars(targetTrain).map(p => new T.Vector3(p.x, p.y + .4, p.z)) : [];
      if (mode === 'ride') targets.push(controls.target.clone());
      if (city.revealTrain(camera.position, targets)) needsRender = true;
      lastRevealAt = timestamp;
    }
    if (needsRender) { renderer.render(scene, camera); needsRender = false; }
    if (timestamp - lastLabelsAt > 100) { updateLabels(); lastLabelsAt = timestamp; }
    if (timestamp - lastMetricsAt > 400) {
      canvas.dataset.camera = camera.position.toArray().map(n => n.toFixed(2)).join(','); canvas.dataset.drawCalls = String(renderer.info.render.calls); lastMetricsAt = timestamp;
    }
  }
  view('city', true); render(.016, 200); canvas.dataset.renderState = 'ready'; canvas.dataset.cameraMode = 'free';
  return {
    drawTrains, render, view,
    select(id) { selected = id; setMode('free'); drawTrains(trains); },
    follow(type) { if (!selected || !trains.some(t => t.id === selected)) return; transition = null; setMode(type); },
    stopFollowing,
    routes(routeIds) { activeRoutes = new Set(routeIds); for (const [id, group] of city.routeGroups) group.visible = activeRoutes.has(id); renderer.shadowMap.needsUpdate = true; needsRender = true; },
    labels(value) { labelsVisible = value; updateLabels(); },
    zoom(amount) { stopFollowing(); amount > 0 ? controls.dollyIn(1.3) : controls.dollyOut(1.3); controls.update(); },
    rotate(amount) { stopFollowing(); controls.rotateLeft(amount); controls.update(); },
    reset() { selected = null; view('city'); },
    dispose() { observer.disconnect(); controls.dispose(); renderer.dispose(); },
  };
}
