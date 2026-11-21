import * as THREE from '../vendor/three.js';
import { CURVE_INFO, curveOwner } from './contract.js';
import { measurePolyline, pointOnPath } from './easing.js';

// 頂点の中心は魚に固定し、幅と矢じりだけを画面のピクセルで広げます。
const vertexShader = `
  attribute vec3 aTangent;
  attribute vec2 aOffset;
  attribute float aArc;
  uniform vec2 uViewport;
  varying float vArc;
  varying float vEdge;
  void main() {
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec4 q = projectionMatrix * modelViewMatrix * vec4(position + aTangent, 1.0);
    vec2 delta = (q.xy * p.w - p.xy * q.w) * uViewport;
    vec2 along = dot(delta, delta) > 1e-10 ? normalize(delta) : vec2(1.0, 0.0);
    vec2 across = vec2(-along.y, along.x);
    p.xy += (along * aOffset.x + across * aOffset.y) * 2.0 * p.w / uViewport;
    p.z -= 0.000025 * p.w;
    vArc = aArc;
    vEdge = aOffset.y;
    gl_Position = p;
  }`;

const fragmentShader = `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uStart;
  uniform float uSpacing;
  uniform vec3 uColor;
  varying float vArc;
  varying float vEdge;
  void main() {
    float alpha = 1.0;
    if (vArc >= 0.0) {
      if (vArc < uStart) discard;
      float d = abs(fract(vArc / uSpacing - uTime * 0.85) - 0.5);
      float aa = clamp(fwidth(vArc / uSpacing), 0.015, 0.09);
      alpha = (1.0 - smoothstep(0.29 - aa, 0.29 + aa, d))
        * (1.0 - smoothstep(1.4, 2.7, abs(vEdge)));
    }
    if (alpha < 0.015) discard;
    gl_FragColor = vec4(uColor, uOpacity * alpha);
    #include <colorspace_fragment>
  }`;

function ribbon(points, anatomy, surface, clock, viewport) {
  const positions = [], tangents = [], offsets = [], arcs = [], indices = [];
  const tangent = new THREE.Vector3(), pos = new THREE.Vector3(), last = new THREE.Vector3();
  let length = 0;
  function vertex(along, across, arc) {
    positions.push(pos.x, pos.y, pos.z);
    tangents.push(tangent.x, tangent.y, tangent.z);
    offsets.push(along, across);
    arcs.push(arc);
  }
  for (let i = 0; i < points.length; i++) {
    pos.fromArray(points[i]);
    if (i) length += last.distanceTo(pos);
    last.copy(pos);
    tangent.fromArray(points[Math.min(i + 1, points.length - 1)])
      .sub(new THREE.Vector3().fromArray(points[Math.max(0, i - 1)])).normalize();
    if (surface) {
      const dy = pos.y - anatomy.profile(pos.x / anatomy.SL).axisY;
      const radius = Math.hypot(dy, pos.z) || 1;
      pos.y += 0.065 * dy / radius;
      pos.z += 0.065 * pos.z / radius;
    }
    vertex(0, -2.7, length);
    vertex(0, 2.7, length);
    if (i) {
      const n = i * 2;
      indices.push(n - 2, n - 1, n, n, n - 1, n + 1);
    }
  }
  const end = arcs.length;
  vertex(-8, -5, -1); vertex(-8, 5, -1); vertex(3, 0, -1);
  indices.push(end, end + 1, end + 2);
  const geometry = new THREE.BufferGeometry();
  for (const [key, data, size] of [['position', positions, 3], ['aTangent', tangents, 3], ['aOffset', offsets, 2], ['aArc', arcs, 1]]) {
    geometry.setAttribute(key, new THREE.Float32BufferAttribute(data, size));
  }
  geometry.setIndex(indices);
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: {
    uViewport: { value: viewport }, uTime: clock, uStart: { value: 0 }, uOpacity: { value: 1 },
    uSpacing: { value: Math.max(0.32, Math.min(anatomy.SL * 0.045, length / 4)) },
    uColor: { value: new THREE.Color('#e5422f') },
  }, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = 8;
  return { mesh, length };
}

// 発生位置と初速は一度だけ抽選します。重力は常に盤の下向きで、巻き戻し時も同じ場所に戻ります。
function makeParticles(kind, points, seed) {
  const scales = kind === 'scales', count = scales ? 320 : 144;
  const geometry = scales ? new THREE.CircleGeometry(1, 8) : new THREE.SphereGeometry(1, 6, 4);
  const material = new THREE.MeshStandardMaterial({
    color: scales ? 0xd9e1de : 0x9dcad8, roughness: scales ? 0.26 : 0.18, metalness: scales ? 0.55 : 0.14,
    side: scales ? THREE.DoubleSide : THREE.FrontSide,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const path = measurePolyline(points);
  const particles = Array.from({ length: count }, (_, i) => {
    const along = (i + seed.next()) / count;
    return { birth: along * 0.78, life: seed.range(0.12, 0.22),
      pos: new THREE.Vector3().fromArray(pointOnPath(path, along)),
      vx: seed.range(-4, 4), vy: seed.range(5, 12), vz: seed.range(-4, 4),
      spin: seed.range(-9, 9), tilt: seed.range(0, Math.PI), radius: seed.range(0.065, scales ? 0.16 : 0.125) };
  });
  const particle = new THREE.Object3D();
  function update(t, ownerMatrix, boardTop) {
    let live = 0;
    for (const p of particles) {
      const elapsed = t - p.birth;
      if (elapsed < 0 || elapsed >= p.life) continue;
      const age = elapsed * 3.2, fade = Math.min(1, 9 * (1 - elapsed / p.life));
      particle.position.copy(p.pos).applyMatrix4(ownerMatrix);
      particle.position.x += p.vx * age;
      particle.position.z += p.vz * age;
      particle.position.y = Math.max(boardTop + p.radius * 0.24, particle.position.y + p.vy * age - 18 * age * age);
      particle.rotation.set(p.tilt + p.spin * age, p.spin * age, p.tilt);
      particle.scale.set(p.radius * fade, p.radius * fade * (scales ? 0.74 : 1.2), p.radius * fade);
      particle.updateMatrix();
      mesh.setMatrixAt(live++, particle.matrix);
    }
    mesh.count = live;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = live > 0;
  }
  return { mesh, update };
}

function createTrace(group, radius) {
  const geometry = new THREE.CylinderGeometry(radius, radius, 1, 7);
  const material = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const good = new THREE.Color('#2f8f5b'), off = new THREE.Color('#c9852a');
  const pen = new THREE.Object3D(), previous = new THREE.Vector3(), along = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let mesh, capacity = 0, connected = false;
  function grow() {
    capacity = capacity ? capacity * 2 : 128;
    const next = new THREE.InstancedMesh(geometry, material, capacity);
    next.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    next.renderOrder = 12;
    next.frustumCulled = next.matrixAutoUpdate = false;
    next.count = mesh?.count ?? 0;
    if (mesh) {
      next.instanceMatrix.array.set(mesh.instanceMatrix.array);
      next.setColorAt(0, good);
      next.instanceColor.array.set(mesh.instanceColor.array);
      mesh.removeFromParent();
      mesh.dispose();
    }
    mesh = next;
    group.add(mesh);
  }
  return {
    add(point, within, matrix) {
      if (connected) {
        along.fromArray(point).sub(previous);
        const length = along.length();
        if (length > 0.001) {
          if (!mesh || mesh.count === capacity) grow();
          mesh.matrix.copy(matrix);
          mesh.matrixWorldNeedsUpdate = true;
          pen.position.copy(previous).addScaledVector(along, 0.5);
          pen.quaternion.setFromUnitVectors(up, along.divideScalar(length));
          pen.scale.set(1, length + radius * 0.3, 1);
          pen.updateMatrix();
          mesh.setMatrixAt(mesh.count, pen.matrix);
          mesh.setColorAt(mesh.count++, within ? good : off);
          mesh.instanceMatrix.needsUpdate = mesh.instanceColor.needsUpdate = true;
        }
      }
      previous.fromArray(point);
      connected = true;
    },
    lift() { connected = false; },
    clear() { connected = false; if (mesh) mesh.count = 0; },
    dispose() { mesh?.dispose(); geometry.dispose(); material.dispose(); },
  };
}

export function createGuides(anatomy, rng) {
  const group = new THREE.Group();
  const clock = { value: 0 }, viewport = new THREE.Vector2(1, 1);
  const curves = new Map(), ribbons = new Map(), effects = new Map();
  const trace = createTrace(group, Math.max(0.085, anatomy.SL * 0.0045));
  const keyFor = ({ curve, side, reverse }) => curve + '/' + (side ?? '') + (reverse ? '/r' : '');
  function curvePoints(cut) {
    const key = keyFor(cut);
    if (!curves.has(key)) {
      const { points } = anatomy.curve(cut.curve, cut.side);
      curves.set(key, cut.reverse ? points.slice().reverse() : points);
    }
    return curves.get(key);
  }
  function update(state, step, pose, xray, practiceCut, boardTop) {
    for (const { mesh } of ribbons.values()) mesh.visible = false;
    for (const { mesh } of effects.values()) mesh.visible = false;
    function show(cut, opacity) {
      const owner = curveOwner(cut.curve, cut.side);
      if (!pose.visible(owner) || opacity <= 0) return;
      const key = keyFor(cut);
      const sameLine = c => c.curve === cut.curve && (c.side ?? null) === (cut.side ?? null);
      if (!practiceCut && state.incisions.some(c => sameLine(c) && c.progress >= 1)) return;
      const incision = state.incisions.find(c => sameLine(c) && Boolean(c.reverse) === Boolean(cut.reverse));
      if (!ribbons.has(key)) {
        const item = ribbon(curvePoints(cut), anatomy, !CURVE_INFO[cut.curve].inner, clock, viewport);
        item.mesh.name = key;
        ribbons.set(key, item);
        group.add(item.mesh);
      }
      const { mesh, length } = ribbons.get(key);
      mesh.visible = true;
      mesh.matrix.copy(pose.matrixFor(owner));
      mesh.matrixWorldNeedsUpdate = true;
      mesh.material.depthTest = !(cut.through || (CURVE_INFO[cut.curve].inner && xray > 0.3));
      mesh.material.uniforms.uStart.value = practiceCut ? 0 : (incision?.progress ?? 0) * length;
      mesh.material.uniforms.uOpacity.value = opacity;
    }
    if (practiceCut) { show(practiceCut, 1); return; }
    const cuts = step.cuts ?? [];
    for (const cut of cuts) show(cut, 1);
    for (const h of state.highlights) {
      if (!cuts.some(c => c.curve === h.curve && (c.side ?? null) === h.side)) show(h, h.opacity);
    }
    for (const effect of state.effects) {
      const owner = curveOwner(effect.curve, effect.side);
      if (!pose.visible(owner)) continue;
      const key = effect.kind + '/' + keyFor(effect);
      if (!effects.has(key)) {
        const item = makeParticles(effect.kind, curvePoints(effect), rng.fork(key));
        item.mesh.name = key;
        effects.set(key, item);
        group.add(item.mesh);
      }
      effects.get(key).update(effect.t, pose.matrixFor(owner), boardTop);
    }
  }
  let disposed = false;
  return {
    group, curvePoints, update, trace,
    setTime(t) { clock.value = t; },
    setViewport(w, h) { viewport.set(Math.max(1, w), Math.max(1, h)); },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { mesh } of [...ribbons.values(), ...effects.values()]) {
        if (mesh.isInstancedMesh) mesh.dispose();
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      trace.dispose();
      group.clear();
      group.removeFromParent();
      curves.clear(); ribbons.clear(); effects.clear();
    },
  };
}

// 内側をなぞるときは指の光線を切り面の深さまで通します。横のずれを採点に残します。
const clip = new THREE.Matrix4(), start = new THREE.Vector3(), end = new THREE.Vector3();
export function pointAtCutDepth(camera, ownerWorld, rect, clientX, clientY, points) {
  const x = clientX - rect.left, y = clientY - rect.top;
  clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(ownerWorld);
  start.fromArray(points[0]).applyMatrix4(clip);
  let nearest = Infinity, depth;
  for (let i = 1; i < points.length; i++) {
    end.fromArray(points[i]).applyMatrix4(clip);
    const dx = (end.x - start.x) * rect.width / 2, dy = (start.y - end.y) * rect.height / 2;
    const ox = x - (start.x + 1) * rect.width / 2, oy = y - (1 - start.y) * rect.height / 2;
    const t = THREE.MathUtils.clamp((ox * dx + oy * dy) / (dx * dx + dy * dy || 1), 0, 1);
    const d = (ox - dx * t) ** 2 + (oy - dy * t) ** 2;
    const z = THREE.MathUtils.lerp(start.z, end.z, t);
    if (d < nearest && z >= -1 && z <= 1) { nearest = d; depth = z; }
    start.copy(end);
  }
  if (depth === undefined) return null;
  return end.set(2 * x / rect.width - 1, 1 - 2 * y / rect.height, depth).applyMatrix4(clip.invert()).toArray();
}
