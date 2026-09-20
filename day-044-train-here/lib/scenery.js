import * as T from '../vendor/three.js';
import { RAILWAYS, PLACES, geo } from './railways.js';
import { PATHS, pointOnPath } from './motion.js';

const box = new T.BoxGeometry(1, 1, 1);
const matrix = new T.Object3D();
const standard = (color, more = {}) => new T.MeshStandardMaterial({ color, roughness: .82, ...more });
export function instances(items, material, geometry = box) {
  const mesh = new T.InstancedMesh(geometry, material, items.length);
  items.forEach((item, i) => {
    matrix.position.set(item.x, item.y, item.z); matrix.rotation.set(0, item.angle || 0, 0); matrix.scale.set(...(item.size || [1, 1, 1])); matrix.updateMatrix(); mesh.setMatrixAt(i, matrix.matrix);
    if (item.color) mesh.setColorAt(i, new T.Color(item.color));
  });
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
function polygon(points, color, y = .02) {
  const shape = new T.Shape();
  points.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)); shape.closePath();
  const mesh = new T.Mesh(new T.ShapeGeometry(shape), standard(color)); mesh.rotation.x = -Math.PI / 2; mesh.position.y = y; mesh.receiveShadow = true; return mesh;
}
function ribbon(points, width, material, offset = 0, height = 0) {
  const positions = [], indices = [];
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const len = Math.max(.001, Math.hypot(b.x - a.x, b.z - a.z)), nx = (b.z - a.z) / len, nz = -(b.x - a.x) / len;
    for (const side of [-1, 1]) positions.push(p.x + nx * (offset + side * width / 2), (p.y || 0) + height, p.z + nz * (offset + side * width / 2));
    if (i) { const j = i * 2; indices.push(j - 2, j, j - 1, j - 1, j, j + 1); }
  });
  const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new T.Mesh(geometry, material); mesh.receiveShadow = true; return mesh;
}
const PARKS = [
  { lng: 139.754, lat: 35.685, width: 18, depth: 24, name: '皇居' },
  { lng: 139.6945, lat: 35.6726, width: 14, depth: 13, name: '代々木公園' },
  { lng: 139.7115, lat: 35.685, width: 12, depth: 9, name: '新宿御苑' },
  { lng: 139.772, lat: 35.716, width: 10, depth: 13, name: '上野公園' },
].map(p => ({ ...p, ...geo(p.lng, p.lat) }));
const river = [[139.805, 35.785], [139.812, 35.759], [139.808, 35.739], [139.801, 35.726], [139.801, 35.709], [139.792, 35.692], [139.791, 35.68], [139.778, 35.659], [139.79, 35.643]].map(([lng, lat]) => ({ ...geo(lng, lat), y: .08 }));
function randomGenerator(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
function distanceToSegment(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
const inWater = (x, z) => z > 38 && x > 41 - (z - 38) * .16;
function buildingTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 128;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 64, 128);
  for (let row = 0; row < 12; row++) for (let col = 0; col < 5; col++) {
    ctx.fillStyle = (row * 3 + col) % 7 ? '#b8c8c5' : '#dce3d2'; ctx.fillRect(col * 12 + 6, row * 10 + 5, 6, 5);
  }
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4; return texture;
}
export function createScenery(scene) {
  const ground = new T.Mesh(new T.PlaneGeometry(850, 700), standard('#e7ebde')); ground.rotation.x = -Math.PI / 2; ground.position.y = -.11; ground.receiveShadow = true; scene.add(ground);
  scene.add(polygon([[41, 38], [34, 82], [10, 174], [260, 230], [300, -100], [100, -100], [74, 18]], '#a7ced0', .035));
  scene.add(ribbon(river, 3.1, standard('#a7ced0'), 0, 0));
  const roads = [];
  for (let x = -179; x < 109; x += 8) roads.push({ x, y: .012, z: 24, size: [.58, .025, 252] });
  for (let z = -100; z < 154; z += 8) roads.push({ x: -34, y: .013, z, size: [290, .026, .58] });
  const roadMesh = instances(roads, standard('#f8f7ed')); roadMesh.castShadow = false; scene.add(roadMesh);
  const parkMaterial = standard('#becda7');
  const parkMeshes = instances(PARKS.map(p => ({ x: p.x, y: .05, z: p.z, size: [p.width, .09, p.depth] })), parkMaterial); parkMeshes.castShadow = false; scene.add(parkMeshes);
  const palace = PARKS[0]; scene.add(polygon([[palace.x - 5, palace.z - 8], [palace.x + 6, palace.z - 5], [palace.x + 7, palace.z + 6], [palace.x - 2, palace.z + 9], [palace.x - 6, palace.z + 3]], '#9fbeb7', .12));

  const occupied = new Set();
  for (const path of PATHS.values()) for (const p of path.samples) {
    const cx = Math.round(p.x / 2), cz = Math.round(p.z / 2);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) occupied.add(`${cx + dx}:${cz + dz}`);
  }
  const rng = randomGenerator(44039), buildings = [], roofs = [], trees = [], trunks = [];
  const hubs = ['Tokyo', 'Shinjuku', 'Shibuya', 'Ikebukuro', 'Shinagawa'].map(id => geo(PLACES.get(id).lng, PLACES.get(id).lat));
  for (let x = -176; x < 101; x += 3.4) for (let z = -93; z < 148; z += 3.4) {
    const px = x + rng() * .8, pz = z + rng() * .8;
    if (inWater(px, pz) || occupied.has(`${Math.round(px / 2)}:${Math.round(pz / 2)}`)) continue;
    if (river.some((p, i) => i && distanceToSegment({ x: px, z: pz }, river[i - 1], p) < 3)) continue;
    if (PARKS.some(p => Math.abs(p.x - px) < p.width / 2 + 1 && Math.abs(p.z - pz) < p.depth / 2 + 1)) continue;
    if (rng() > .76) continue;
    const hubDistance = Math.min(...hubs.map(p => Math.hypot(px - p.x, pz - p.z)));
    const tall = hubDistance < 14 && rng() > .42;
    const h = tall ? 4 + rng() * (14 - hubDistance * .3) : .65 + rng() * 2.6;
    const w = 1 + rng() * 1.4, d = 1 + rng() * 1.6;
    buildings.push({ x: px, y: h / 2, z: pz, size: [w, h, d], color: ['#eeeede', '#e0e5db', '#d2ded8', '#f8f5e9', '#c9d9d6'][Math.floor(rng() * 5)] });
    if (tall) roofs.push({ x: px, y: h + .18, z: pz, size: [w * .55, .36, d * .55] });
  }
  const wall = standard('#ffffff', { map: buildingTexture() });
  const rooftop = standard('#e2e5dc');
  const buildingMesh = instances(buildings, [wall, wall, rooftop, rooftop, wall, wall]);
  const roofMesh = instances(roofs, standard('#bdcac6'));
  scene.add(buildingMesh, roofMesh);
  const obstacles = [
    ...buildings.map((item, index) => ({ item, index, mesh: buildingMesh, hidden: false })),
    ...roofs.map((item, index) => ({ item, index, mesh: roofMesh, hidden: false })),
  ];
  const obstacleBox = new T.Box3(), ray = new T.Ray(), hit = new T.Vector3();
  // 追従中だけ視線を遮る建物を切り欠き、車両と進行方向を見失わないようにする。
  const canopyMaterials = [];
  function revealTrain(eye, targets) {
    let changed = false;
    const opacity = targets.length ? .18 : 1;
    for (const material of canopyMaterials) if (material.opacity !== opacity) { material.opacity = opacity; material.depthWrite = opacity === 1; changed = true; }
    const rays = targets.map(target => ({ direction: target.clone().sub(eye).normalize(), distance: eye.distanceTo(target) }));
    for (const obstacle of obstacles) {
      const { item, index, mesh } = obstacle, [w, h, d] = item.size;
      let hidden = false;
      if (rays.length && Math.hypot(item.x - eye.x, item.z - eye.z) < 36) {
        obstacleBox.min.set(item.x - w / 2 - 1, 0, item.z - d / 2 - 1);
        obstacleBox.max.set(item.x + w / 2 + 1, item.y + h / 2 + .5, item.z + d / 2 + 1);
        hidden = rays.some(r => { ray.set(eye, r.direction); return obstacleBox.containsPoint(eye) || (ray.intersectBox(obstacleBox, hit) && eye.distanceTo(hit) < r.distance); });
      }
      if (hidden === obstacle.hidden) continue;
      changed = true;
      obstacle.hidden = hidden;
      matrix.position.set(item.x, item.y, item.z); matrix.rotation.set(0, 0, 0);
      matrix.scale.set(...(hidden ? [0, 0, 0] : item.size)); matrix.updateMatrix(); mesh.setMatrixAt(index, matrix.matrix); mesh.instanceMatrix.needsUpdate = true;
    }
    return changed;
  }
  for (const park of PARKS) for (let i = 0; i < (park.name === '皇居' ? 120 : 60); i++) {
    const x = park.x + (rng() - .5) * park.width * .96, z = park.z + (rng() - .5) * park.depth * .95;
    if (park.name === '皇居' && Math.abs(x - park.x) < 6 && Math.abs(z - park.z) < 8) continue;
    const h = .65 + rng() * .9;
    trees.push({ x, y: h, z, size: [.6, h, .6], color: ['#819e67', '#95ac76', '#a7bb88'][Math.floor(rng() * 3)] });
    trunks.push({ x, y: .35, z, size: [.11, .7, .11] });
  }
  scene.add(instances(trunks, standard('#a49579')));
  scene.add(instances(trees, standard('#ffffff'), new T.IcosahedronGeometry(1, 0)));

  const routeGroups = new Map();
  for (const route of RAILWAYS) {
    const path = PATHS.get(route.id), group = new T.Group(); group.name = `railway-${route.id}`;
    group.add(ribbon(path.samples, 1.95, standard('#b8beb5'), 0, -.15));
    group.add(ribbon(path.samples, .15, standard(route.color), 1.01, -.12));
    const steel = standard('#62766e', { metalness: .35, roughness: .55 });
    for (const lane of [-.45, .45]) for (const rail of [-.18, .18]) group.add(ribbon(path.samples, .045, steel, lane + rail, .03));
    const sleepers = [], supports = [], platforms = [], canopies = [];
    for (let d = 0; d < path.length; d += .9) {
      const p = pointOnPath(path, d); sleepers.push({ ...p, y: p.y - .03, size: [1.72, .07, .13] });
    }
    for (let d = 2; d < path.length; d += 7.5) {
      const p = pointOnPath(path, d); supports.push({ ...p, y: p.y / 2 - .1, size: [.32, p.y - .2, .55] });
    }
    route.stations.forEach((s, i) => {
      const p = pointOnPath(path, path.stationDistances[i], 1.65);
      platforms.push({ ...p, y: p.y + .06, size: [.95, .16, 4.9] });
      canopies.push({ ...p, y: p.y + 1.05, size: [1.12, .12, 4.6] });
    });
    const canopyMaterial = standard(route.color, { transparent: true }); canopyMaterials.push(canopyMaterial);
    const posts = canopies.flatMap(p => [-1.8, 1.8].map(distance => ({ x: p.x + Math.sin(p.angle) * distance, y: route.height + .55, z: p.z + Math.cos(p.angle) * distance, size: [.09, .9, .09] })));
    group.add(instances(sleepers, standard('#899889')), instances(supports, standard('#aab7ab')), instances(platforms, standard('#eee8d3')), instances(canopies, canopyMaterial), instances(posts, standard('#99a993')));
    routeGroups.set(route.id, group); scene.add(group);
  }
  return { routeGroups, buildingCount: buildings.length, parks: PARKS, revealTrain };
}
