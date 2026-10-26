import * as THREE from '../vendor/three.module.js';
import { createItemModel } from './models.js';

const COLORS = { ink: 0x163e3b, sage: 0xb8cebd, cream: 0xe7e9dc, steel: 0xaab9b8, lime: 0xd9f47d, cyan: 0x68e5dc, green: 0x287e6b, amber: 0xe3ad53, red: 0xc75a43 };
const easeOut = (t) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/** An independent, locally rendered miniature terminal. Game rules remain in engine.js. */
export function createInspectionScene(canvas, { onReady, onError, reducedMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  const mobile = matchMedia('(max-width: 700px)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.8));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.97;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd6e0d5);
  scene.fog = new THREE.Fog(0xd6e0d5, 20, 46);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 70);
  const materials = new Map();
  const geometries = new Map();
  const textures = [];
  const rollers = [];
  const laneLights = {};
  const departures = [];
  let current = null;
  let active = true;
  let disposed = false;
  let contextLost = false;
  let view = 'overview';
  let width = 1;
  let height = 1;
  let time = 0;
  let lastFrame = 0;
  let frames = 0;
  let ready = false;
  let pulse = 0;
  let xray = false;
  let dragX = 0;
  let dragY = 0;
  const target = new THREE.Vector3(0, 1, -0.65);
  const desiredCamera = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  const world = new THREE.Group();
  scene.add(world);

  function material(name, color, roughness = 0.65, metalness = 0) {
    if (!materials.has(name)) materials.set(name, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
    return materials.get(name);
  }
  const steel = material('steel', COLORS.steel, 0.29, 0.78);
  const darkSteel = material('darkSteel', 0x31423f, 0.36, 0.55);
  const plastic = material('plastic', 0xe7ede1, 0.46, 0.03);
  const bodyMat = material('body', 0xa7c4b0, 0.48, 0.18);
  const ink = material('ink', COLORS.ink, 0.56, 0.08);
  const rubber = material('rubber', 0x283734, 0.92);
  const chrome = material('chrome', 0xaebfbb, 0.22, 0.91);
  const floorMat = material('floor', 0xd3d8c8, 0.74, 0.02);

  function box(parent, size, pos, mat = plastic, radius = 0) {
    const key = `box:${size.join(',')}:${radius}`;
    if (!geometries.has(key)) {
      if (radius > 0) {
        const shape = new THREE.Shape();
        const [w, h, d] = size;
        const r = Math.min(radius, w / 2, h / 2);
        shape.moveTo(-w / 2 + r, -h / 2);
        shape.lineTo(w / 2 - r, -h / 2);
        shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
        shape.lineTo(w / 2, h / 2 - r);
        shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
        shape.lineTo(-w / 2 + r, h / 2);
        shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
        shape.lineTo(-w / 2, -h / 2 + r);
        shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
        const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, d - r * 0.5), bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: r * 0.25, bevelThickness: r * 0.25, curveSegments: 4 });
        geo.translate(0, 0, -d / 2 + r * 0.25);
        geometries.set(key, geo);
      } else geometries.set(key, new THREE.BoxGeometry(...size));
    }
    const mesh = new THREE.Mesh(geometries.get(key), mat);
    mesh.position.set(...pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function cylinder(parent, radius, length, pos, mat = steel, axis = 'y', segments = 20) {
    const key = `cylinder:${radius}:${length}:${segments}`;
    if (!geometries.has(key)) geometries.set(key, new THREE.CylinderGeometry(radius, radius, length, segments));
    const mesh = new THREE.Mesh(geometries.get(key), mat);
    mesh.position.set(...pos);
    if (axis === 'x') mesh.rotation.z = Math.PI / 2;
    if (axis === 'z') mesh.rotation.x = Math.PI / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function emissive(name, color, strength = 1) {
    const mat = material(name, color, 0.3);
    mat.emissive.setHex(color);
    mat.emissiveIntensity = strength;
    return mat;
  }
  function label(text, sub, color = '#d6efb1', background = '#163e3b', w = 2.6, h = 0.72) {
    const image = document.createElement('canvas');
    image.width = 768; image.height = 224;
    const ctx = image.getContext('2d');
    ctx.fillStyle = background; ctx.fillRect(0, 0, 768, 224);
    ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 68px sans-serif'; ctx.fillText(text, 38, sub ? 87 : 115, 690);
    if (sub) { ctx.font = '26px sans-serif'; ctx.fillText(sub, 40, 165, 690); }
    const map = new THREE.CanvasTexture(image);
    map.colorSpace = THREE.SRGBColorSpace;
    textures.push(map);
    const mat = new THREE.MeshBasicMaterial({ map, toneMapped: false });
    materials.set(`label${materials.size}`, mat);
    const geo = new THREE.PlaneGeometry(w, h); geometries.set(`label${geometries.size}`, geo);
    return new THREE.Mesh(geo, mat);
  }
  function sign(parent, text, sub, pos, w = 2.8, color, bg) {
    box(parent, [w + 0.09, 0.83, 0.12], pos, ink, 0.05);
    const face = label(text, sub, color, bg, w, 0.73);
    face.position.set(pos[0], pos[1], pos[2] + 0.067); parent.add(face);
  }

  // One coherent soft daylight environment gives metal edges a real reflected highlight.
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0xc3d9d3);
  const envRoom = new THREE.Mesh(new THREE.BoxGeometry(25, 18, 25), new THREE.MeshBasicMaterial({ color: 0xacc0af, side: THREE.BackSide }));
  envScene.add(envRoom);
  const envLight = new THREE.Mesh(new THREE.PlaneGeometry(12, 9), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  envLight.position.set(-7, 7, 2); envLight.lookAt(0, 0, 0); envScene.add(envLight);
  const envFill = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), new THREE.MeshBasicMaterial({ color: 0xe9e5c5 }));
  envFill.position.set(8, 4, -6); envFill.lookAt(0, 0, 0); envScene.add(envFill);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(envScene, 0.08);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.65;
  pmrem.dispose();
  envScene.traverse((o) => { o.geometry?.dispose(); if (o.material) o.material.dispose(); });
  scene.add(new THREE.HemisphereLight(0xdcefeb, 0x3f5f50, 1.6));
  const key = new THREE.DirectionalLight(0xffe5b0, 3.15);
  key.position.set(-5, 10, 7); key.castShadow = true;
  key.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 28 });
  key.shadow.normalBias = 0.045; key.shadow.bias = -0.00035;
  key.target.position.set(0, 0, -1); scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xa9e2dd, 1.25);
  fill.position.set(6, 4, -7); scene.add(fill);

  const floorImage = document.createElement('canvas'); floorImage.width = 256; floorImage.height = 256;
  const floorContext = floorImage.getContext('2d'); floorContext.fillStyle = '#d3d8c8'; floorContext.fillRect(0, 0, 256, 256);
  let grainSeed = 77;
  for (let i = 0; i < 6000; i++) {
    grainSeed = (Math.imul(grainSeed, 1664525) + 1013904223) >>> 0;
    const x = grainSeed & 255, z = (grainSeed >>> 8) & 255;
    floorContext.fillStyle = i % 3 === 0 ? '#c0c8b8' : '#e1e4d6'; floorContext.fillRect(x, z, 1, 1);
  }
  const floorTexture = new THREE.CanvasTexture(floorImage); floorTexture.colorSpace = THREE.SRGBColorSpace;
  floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping; floorTexture.repeat.set(22, 22); textures.push(floorTexture);
  floorMat.map = floorTexture; floorMat.color.setHex(0xffffff);

  // Terminal architecture. Thin joints and contact shadows ground the miniature.
  box(world, [34, 0.3, 32], [0, -0.18, -4], floorMat);
  const tilePositions = [];
  for (let i = -13; i <= 13; i += 1) {
    tilePositions.push(-16, -0.021, i * 1.25 - 3, 16, -0.021, i * 1.25 - 3);
    tilePositions.push(i * 1.25, -0.021, -19, i * 1.25, -0.021, 12);
  }
  const tileGeo = new THREE.BufferGeometry(); tileGeo.setAttribute('position', new THREE.Float32BufferAttribute(tilePositions, 3));
  geometries.set('tiles', tileGeo);
  const tileMat = new THREE.LineBasicMaterial({ color: 0xaebcad, transparent: true, opacity: 0.45 }); materials.set('tileLines', tileMat);
  world.add(new THREE.LineSegments(tileGeo, tileMat));
  box(world, [30, 5.6, 0.4], [0, 2.6, -10], material('wall', 0xb7cdbb, 0.88));
  box(world, [30, 0.3, 0.16], [0, 0.1, -9.73], material('skirt', 0x7e9a88, 0.55));
  box(world, [30, 0.15, 0.5], [0, 5.35, -9.7], plastic);
  // Large blue green glazing with milky bright sky and repeated structural mullions.
  const glass = material('glass', 0xb7d8d8, 0.22, 0.24);
  for (let i = 0; i < 6; i++) {
    box(world, [3.1, 3.5, 0.12], [i * 3.2 - 9.5, 3.05, -9.72], glass);
    box(world, [0.07, 3.7, 0.22], [i * 3.2 - 11.05, 3.05, -9.55], plastic);
    box(world, [3.18, 0.06, 0.2], [i * 3.2 - 9.5, 3, -9.52], plastic);
    box(world, [0.18, 5.3, 0.5], [i * 3.2 - 11.1, 2.5, -9.2], plastic);
  }
  box(world, [24, 0.22, 1.2], [0, 5.2, -4.8], plastic);
  box(world, [23, 0.025, 0.14], [0, 5.07, -4.5], emissive('ceiling', 0xfff5d6, 1.5));
  sign(world, 'DEPARTURES  ↗', 'TERMINAL 01    /    GATES 01–12', [-6.5, 4.5, -9.25], 3.8);
  sign(world, 'SECURITY CHECK', 'PLEASE PREPARE YOUR BELONGINGS', [2, 4.5, -9.25], 4.3);
  // Gate posts and webbing beyond the working area.
  for (const x of [-7.1, -4.9, -2.7]) {
    cylinder(world, 0.22, 0.08, [x, 0.04, -6.1], darkSteel);
    cylinder(world, 0.045, 1.12, [x, 0.64, -6.1], steel);
    cylinder(world, 0.085, 0.12, [x, 1.22, -6.1], ink);
  }
  box(world, [4.4, 0.11, 0.025], [-4.9, 1.17, -6.1], ink);
  // Back wall luggage and empty tray stack show how the space is used.
  function suitcase(x, z, color, scale = 1) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale); world.add(g);
    const mat = material(`case${color}`, color, 0.49, 0.1);
    box(g, [0.82, 1.2, 0.48], [0, 0.75, 0], mat, 0.1);
    for (let i = -2; i <= 2; i++) box(g, [0.025, 0.96, 0.025], [i * 0.13, 0.75, 0.25], darkSteel);
    for (const sx of [-0.28, 0.28]) { cylinder(g, 0.085, 0.1, [sx, 0.12, 0.15], rubber, 'x'); cylinder(g, 0.025, 0.45, [sx * 0.5, 1.55, 0], steel); }
    box(g, [0.38, 0.07, 0.08], [0, 1.78, 0], rubber, 0.025);
    box(g, [0.08, 0.08, 0.04], [0.42, 0.8, 0.05], steel);
    return g;
  }
  suitcase(-7.8, -7.6, 0x466f5e, 1.05); suitcase(-6.9, -7.7, 0xd1ab68, 0.8); suitcase(7, -7.8, 0x527d7f, 1.05);

  const rollerImage = document.createElement('canvas'); rollerImage.width = 128; rollerImage.height = 16;
  const rollerContext = rollerImage.getContext('2d');
  rollerContext.fillStyle = '#adb8b4'; rollerContext.fillRect(0, 0, 128, 16);
  rollerContext.fillStyle = '#5f756e'; rollerContext.fillRect(5, 0, 3, 16);
  const rollerMap = new THREE.CanvasTexture(rollerImage); rollerMap.colorSpace = THREE.SRGBColorSpace;
  rollerMap.wrapS = THREE.RepeatWrapping; textures.push(rollerMap);
  const rollerMaterial = material('rollers', 0xaebbb4, 0.23, 0.88); rollerMaterial.map = rollerMap;
  function conveyor(x, z, length, rotation = 0, width = 2.22) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotation; world.add(g);
    box(g, [width + 0.16, 0.23, length], [0, 0.91, 0], darkSteel, 0.04);
    box(g, [width - 0.12, 0.05, length - 0.08], [0, 1.04, 0], rubber);
    for (const xx of [-1, 1]) {
      box(g, [0.11, 0.17, length + 0.06], [xx * width / 2, 1.13, 0], steel, 0.025);
      box(g, [0.025, 0.055, length], [xx * (width / 2 + 0.075), 1.12, 0], plastic);
      for (const zz of [-length * 0.36, length * 0.36]) {
        box(g, [0.1, 0.83, 0.11], [xx * (width / 2 - 0.14), 0.42, zz], steel);
        box(g, [0.24, 0.07, 0.25], [xx * (width / 2 - 0.14), 0.04, zz], rubber, 0.03);
      }
    }
    const count = Math.floor(length / 0.19);
    const geo = new THREE.CylinderGeometry(0.074, 0.074, width - 0.2, 14);
    geometries.set(`rollers${geometries.size}`, geo);
    const mesh = new THREE.InstancedMesh(geo, rollerMaterial, count);
    const matrix = new THREE.Matrix4(); const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
    for (let i = 0; i < count; i++) matrix.compose(new THREE.Vector3(0, 1.085, -length / 2 + 0.13 + i * 0.19), q, new THREE.Vector3(1, 1, 1)), mesh.setMatrixAt(i, matrix);
    mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); rollers.push({ mesh, count, width, length });
    return g;
  }
  conveyor(0, -0.9, 7.8);
  conveyor(-3.15, 0.95, 4.3, Math.PI / 2, 1.94);
  conveyor(3.15, 0.95, 4.3, Math.PI / 2, 1.94);

  function laneSign(action, x, z, text, sub, color) {
    const mat = emissive(`lane${action}`, color, 0.25); laneLights[action] = mat;
    box(world, [1.85, 0.03, 0.065], [x, 1.25, z], mat);
    const g = new THREE.Group(); world.add(g);
    cylinder(g, 0.035, 1.7, [x, 1.35, z - 0.95], steel);
    sign(g, text, sub, [x, 2.3, z - 0.95], 2.1, '#eef6df', action === 'prohibited' ? '#843d2f' : action === 'checked' ? '#79602f' : '#235f53');
    const face = label(action === 'checked' ? '↑' : action === 'carry_on' ? '←' : '→', '', '#edf3dc', '#315f52', 0.7, 0.4);
    face.rotation.x = -Math.PI / 2; face.position.set(x, 1.19, z - 0.1); world.add(face);
  }
  laneSign('carry_on', -3.75, 1, '01  CARRY-ON', 'CABIN BAGGAGE', COLORS.green);
  laneSign('checked', 0, -5.4, '02  CHECKED', 'HOLD BAGGAGE', COLORS.amber);
  laneSign('prohibited', 3.8, 1, '03  REJECT', 'NOT PERMITTED', COLORS.red);

  // Scanner is an actual open portal, with layered housing, rubber curtains, and edge light.
  const scanner = new THREE.Group(); scanner.position.set(0, 0, -2.5); world.add(scanner);
  box(scanner, [0.7, 2.8, 1.95], [-1.55, 1.43, 0], bodyMat, 0.09);
  box(scanner, [0.7, 2.8, 1.95], [1.55, 1.43, 0], bodyMat, 0.09);
  box(scanner, [3.1, 0.58, 1.95], [0, 2.58, 0], bodyMat, 0.08);
  box(scanner, [3.35, 0.12, 2.04], [0, 2.94, 0], plastic, 0.035);
  box(scanner, [0.14, 1.65, 0.12], [-1.18, 1.86, 1], ink);
  box(scanner, [0.14, 1.65, 0.12], [1.18, 1.86, 1], ink);
  box(scanner, [2.48, 0.14, 0.12], [0, 2.64, 1], ink);
  const glow = emissive('scannerGlow', COLORS.cyan, 1.7);
  box(scanner, [0.035, 1.47, 0.035], [-1.09, 1.87, 1.075], glow);
  box(scanner, [0.035, 1.47, 0.035], [1.09, 1.87, 1.075], glow);
  box(scanner, [2.18, 0.035, 0.035], [0, 2.59, 1.075], glow);
  for (let i = 0; i < 12; i++) {
    const curtain = box(scanner, [0.165, 1.25 + (i % 3) * 0.03, 0.035], [-0.98 + i * 0.18, 1.88, 0.75], rubber);
    curtain.rotation.x = i % 2 ? -0.035 : 0.025;
  }
  sign(scanner, 'X-RAY  /  077', 'SECURITY INSPECTION', [0, 2.67, 1.085], 2.15);
  for (let i = 0; i < 5; i++) box(scanner, [0.34, 0.025, 0.04], [1.55, 1.75 + i * 0.1, 0.99], darkSteel);
  box(scanner, [0.39, 0.39, 0.08], [1.55, 2.28, 1.04], ink, 0.025);
  const statusLight = emissive('status', COLORS.lime, 0.8);
  cylinder(scanner, 0.085, 0.045, [1.55, 2.28, 1.11], statusLight, 'z');
  box(scanner, [0.4, 0.04, 1.2], [-1.55, 0.46, 1.03], ink);
  const safety = label('CAUTION', 'X-RAY EQUIPMENT', '#172d28', '#e6cd70', 0.41, 0.23);
  safety.position.set(-1.55, 1.82, 1.02); scanner.add(safety);

  // Service panels, captive screws, feet and warning strips follow the machine's actual construction.
  for (const side of [-1, 1]) {
    box(scanner, [0.42, 0.82, 0.025], [side * 1.55, 1.05, 1.005], material('servicePanel', 0x839f8c, 0.42, 0.2), 0.025);
    for (const xx of [-0.17, 0.17]) for (const yy of [-0.32, 0.32]) {
      cylinder(scanner, 0.018, 0.018, [side * 1.55 + xx, 1.05 + yy, 1.027], chrome, 'z', 8);
    }
    box(scanner, [0.56, 0.11, 1.7], [side * 1.55, 0.12, 0], ink, 0.035);
    const hazard = new THREE.Group(); scanner.add(hazard);
    for (let i = 0; i < 6; i++) {
      const mark = box(hazard, [0.045, 0.14, 0.025], [side * 1.55 - 0.13 + i * 0.052, 0.5, 1.03], i % 2 ? ink : material('warningYellow', 0xdcb94d, 0.65));
      mark.rotation.z = -0.28;
    }
  }

  // A second physical operator station and tray stack add scale without visual clutter.
  const station = new THREE.Group(); station.position.set(3.45, 0, -3.7); world.add(station);
  box(station, [1.9, 0.15, 1], [0, 1.14, 0], plastic, 0.04);
  for (const xx of [-0.76, 0.76]) box(station, [0.075, 1.1, 0.7], [xx, 0.57, 0], steel);
  box(station, [0.1, 0.5, 0.1], [0, 1.48, -0.22], darkSteel);
  box(station, [1.25, 0.84, 0.12], [0, 1.85, -0.19], ink, 0.06);
  const screen = label('SCAN  CLEAR', 'SYSTEM READY  /  LANE 077', '#a0e6c7', '#1c3a34', 1.11, 0.68);
  screen.position.set(0, 1.85, -0.12); station.add(screen);
  box(station, [0.75, 0.035, 0.3], [0, 1.25, 0.2], darkSteel, 0.025);
  for (let i = 0; i < 4; i++) makeTray(world, -3.5, 0.14 + i * 0.11, -3.4, 0.66);

  // Floor route markings, assembled as actual geometry for consistent perspective.
  for (const [xx, color] of [[-3.7, COLORS.green], [3.7, COLORS.red]]) {
    const mat = material(`route${color}`, color, 0.85);
    for (let i = 0; i < 7; i++) box(world, [0.045, 0.008, 0.38], [xx + (xx < 0 ? -1 : 1) * 1.3, 0.005, i * 0.65 - 1], mat);
  }

  const trayBase = new THREE.Vector3(0, 1.19, 1.07);

  function makeTray(parent, x = 0, y = 0, z = 0, scale = 1) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(scale); parent.add(g);
    const trayMat = materials.get('tray') || material('tray', 0x46675e, 0.48, 0.06);
    box(g, [2, 0.09, 1.52], [0, 0.065, 0], trayMat, 0.06);
    for (const sx of [-1, 1]) {
      const side = box(g, [0.08, 0.23, 1.52], [sx * 1, 0.17, 0], trayMat, 0.035);
      side.rotation.z = -sx * 0.08;
      box(g, [0.12, 0.06, 1.59], [sx * 1.015, 0.295, 0], trayMat, 0.03);
    }
    for (const sz of [-1, 1]) {
      const side = box(g, [2.03, 0.23, 0.075], [0, 0.17, sz * 0.75], trayMat, 0.03);
      side.rotation.x = sz * 0.1;
      box(g, [2.12, 0.06, 0.12], [0, 0.295, sz * 0.77], trayMat, 0.035);
      box(g, [0.43, 0.07, 0.01], [0, 0.21, sz * 0.795], darkSteel, 0.025);
    }
    for (let i = -4; i <= 4; i++) box(g, [0.018, 0.008, 1.16], [i * 0.2, 0.114, 0], trayMat);
    return g;
  }

  // Merge the immutable terminal by material; repeated fine details should not cost a draw call each.
  world.updateMatrixWorld(true);
  const buckets = new Map(); const staticMeshes = [];
  world.traverse((mesh) => {
    if (!mesh.isMesh || mesh.isInstancedMesh) return;
    const key = `${mesh.material.uuid}:${mesh.castShadow}`;
    if (!buckets.has(key)) buckets.set(key, { mat: mesh.material, shadows: mesh.castShadow, parts: [] });
    const transformed = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    transformed.applyMatrix4(mesh.matrixWorld); buckets.get(key).parts.push(transformed); staticMeshes.push(mesh);
  });
  staticMeshes.forEach((mesh) => mesh.removeFromParent());
  for (const { mat, shadows, parts } of buckets.values()) {
    const merged = new THREE.BufferGeometry();
    for (const attribute of ['position', 'normal', 'uv']) {
      const count = parts.reduce((sum, part) => sum + part.getAttribute(attribute).array.length, 0);
      const data = new Float32Array(count); let offset = 0;
      for (const part of parts) { const values = part.getAttribute(attribute).array; data.set(values, offset); offset += values.length; }
      merged.setAttribute(attribute, new THREE.BufferAttribute(data, attribute === 'uv' ? 2 : 3));
    }
    parts.forEach((part) => part.dispose()); merged.computeBoundingSphere();
    geometries.set(`merged${geometries.size}`, merged);
    const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = shadows; mesh.receiveShadow = true; world.add(mesh);
  }

  function removeActor(actor) {
    if (!actor) return;
    scene.remove(actor.group);
    actor.model.userData.dispose?.();
  }
  function showItem(item) {
    if (disposed || !item) return;
    if (current) removeActor(current);
    const group = makeTray(scene);
    const model = createItemModel(item);
    model.position.y = 0.13; group.add(model);
    current = { group, model, born: time, item };
    group.position.copy(trayBase);
    if (ready && !reducedMotion) group.position.z -= 2.4;
    model.userData.setXray?.(xray);
    canvas.dataset.itemId = item.id;
    renderOnce();
  }
  function setXray(enabled) {
    xray = Boolean(enabled); current?.model.userData.setXray?.(xray);
    canvas.dataset.xray = String(xray);
    glow.emissiveIntensity = xray ? 3.4 : 1.7;
    scene.background.setHex(xray ? 0xb8d5d0 : 0xd6e0d5);
    renderOnce();
  }
  function sort(action, correct) {
    if (!current || disposed) return;
    const actor = current; current = null;
    actor.from = actor.group.position.clone(); actor.start = time; actor.action = action;
    actor.model.userData.setXray?.(false); departures.push(actor);
    pulse = 1;
    const mat = laneLights[action]; if (mat) mat.emissiveIntensity = 2.4;
    statusLight.emissive.setHex(correct ? COLORS.lime : COLORS.red);
    statusLight.color.setHex(correct ? COLORS.lime : COLORS.red);
    canvas.dataset.lastAction = action;
    renderOnce();
  }
  function setDrag(dx, dy) {
    dragX = THREE.MathUtils.clamp(Number(dx) || 0, -150, 150) * 0.008;
    dragY = THREE.MathUtils.clamp(Number(dy) || 0, -120, 80) * 0.007;
    renderOnce();
  }
  function setView(name) {
    view = name === 'close' ? 'close' : 'overview'; canvas.dataset.view = view;
    if (reducedMotion) { getCameraPose(); camera.position.copy(desiredCamera); target.copy(desiredTarget); }
    renderOnce();
  }
  function getCameraPose() {
    const portrait = width / height < 1.15;
    if (view === 'close') {
      desiredCamera.set(portrait ? 3.1 : 3.8, portrait ? 4.8 : 4.9, portrait ? 6.4 : 6.3);
      desiredTarget.set(0, 1.2, 0.45);
    } else {
      desiredCamera.set(portrait ? 4.8 : 6.1, portrait ? 6.2 : 5.65, portrait ? 8.65 : 8.0);
      desiredTarget.set(0, 1.0, -0.3);
    }
    // Keeping a large tray in portrait is preferable to shrinking it to fit the whole terminal.
    camera.fov = portrait ? 49 : 43;
  }
  function update(dt) {
    time += dt;
    if (!reducedMotion) rollerMap.offset.x = time * 0.35;
    getCameraPose(); camera.position.lerp(desiredCamera, reducedMotion ? 1 : 1 - Math.exp(-dt * 5));
    target.lerp(desiredTarget, reducedMotion ? 1 : 1 - Math.exp(-dt * 5));
    camera.lookAt(target); camera.updateProjectionMatrix();
    if (current) {
      const t = reducedMotion ? 1 : easeOut((time - current.born) / 0.56);
      current.group.position.set(trayBase.x + dragX, trayBase.y + Math.abs(dragX) * 0.05, trayBase.z - (1 - t) * 2.4 + dragY);
      current.group.rotation.set(dragY * 0.08, dragX * 0.09, -dragX * 0.07);
    }
    for (let i = departures.length - 1; i >= 0; i--) {
      const actor = departures[i]; const t = reducedMotion ? 1 : Math.min(1, (time - actor.start) / 0.62);
      const eased = easeOut(t);
      const dx = actor.action === 'carry_on' ? -5.5 : actor.action === 'prohibited' ? 5.5 : 0;
      const dz = actor.action === 'checked' ? -6.2 : 0;
      actor.group.position.copy(actor.from).addScaledVector(new THREE.Vector3(dx, 0, dz), eased);
      actor.group.rotation.y = Math.sin(t * Math.PI) * (actor.action === 'checked' ? 0 : dx * 0.025);
      if (t >= 1) { removeActor(actor); departures.splice(i, 1); }
    }
    pulse = Math.max(0, pulse - dt * 2);
    for (const mat of Object.values(laneLights)) mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, 0.25, Math.min(1, dt * 5));
    if (!pulse) { statusLight.emissive.setHex(COLORS.lime); statusLight.color.setHex(COLORS.lime); }
  }
  function renderOnce() {
    if (!disposed && !contextLost && width > 1 && height > 1) {
      update(0); renderer.render(scene, camera); frames++;
      if (!ready) { ready = true; canvas.dataset.ready = 'true'; onReady?.(); }
    }
  }
  function frame(stamp) {
    if (disposed || contextLost || !active || document.hidden) return;
    const dt = lastFrame ? Math.min(0.12, (stamp - lastFrame) / 1000) : 0;
    if (lastFrame && dt < 0.026 && mobile) return;
    lastFrame = stamp; update(dt); renderer.render(scene, camera); frames++;
    if (!ready) { ready = true; canvas.dataset.ready = 'true'; onReady?.(); }
  }
  function syncLoop() {
    lastFrame = 0;
    renderer.setAnimationLoop(active && !document.hidden && !disposed && !contextLost ? frame : null);
    if (active && !document.hidden) renderOnce();
  }
  function setActive(value) { active = Boolean(value); syncLoop(); }
  function resize() {
    if (disposed) return;
    const rect = canvas.getBoundingClientRect(); width = Math.max(1, rect.width); height = Math.max(1, rect.height);
    renderer.setSize(width, height, false); camera.aspect = width / height;
    getCameraPose(); camera.position.copy(desiredCamera); target.copy(desiredTarget); camera.lookAt(target);
    camera.updateProjectionMatrix(); renderOnce();
  }
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  function handleLost(event) { event.preventDefault(); contextLost = true; canvas.dataset.ready = 'false'; syncLoop(); onError?.(new Error('3D描画が中断しました。ページを再読み込みしてください。')); }
  function handleRestored() { contextLost = false; ready = false; resize(); syncLoop(); }
  canvas.addEventListener('webglcontextlost', handleLost);
  canvas.addEventListener('webglcontextrestored', handleRestored);
  document.addEventListener('visibilitychange', syncLoop);
  function dispose() {
    if (disposed) return;
    disposed = true; renderer.setAnimationLoop(null); observer.disconnect();
    canvas.removeEventListener('webglcontextlost', handleLost); canvas.removeEventListener('webglcontextrestored', handleRestored);
    document.removeEventListener('visibilitychange', syncLoop);
    removeActor(current); departures.forEach(removeActor); departures.length = 0;
    for (const geo of geometries.values()) geo.dispose();
    for (const mat of materials.values()) mat.dispose();
    textures.forEach((t) => t.dispose()); environment.dispose(); renderer.dispose();
    canvas.dataset.ready = 'false';
  }
  resize(); syncLoop();
  return { showItem, setXray, setActive, setDrag, sort, setView, dispose,
    getStats: () => ({ frames, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, departures: departures.length, itemId: current?.item.id || null, view, active: active && !document.hidden && !contextLost, width, height }) };
}
