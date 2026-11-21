import * as THREE from '../vendor/three.js';
import { boundingSphere, cameraAxes, clamp, DEFAULT_FOV, distanceForSphere, limitPan,
  MAX_PITCH, MIN_PITCH, orbitToPosition, presetOrbit, shortestAngle, springStep, validFov, wrapAngle } from './camera-math.js';

const copy = (pose) => ({ ...pose, target: [...pose.target] });
const stopped = () => ({ yaw: 0, pitch: 0, distance: 0, fov: 0, target: [0, 0, 0] });

export function createCameraRig({ fov = DEFAULT_FOV, aspect = 1, bounds, reducedMotion = false } = {}) {
  const lens = validFov(fov);
  const camera = new THREE.PerspectiveCamera(lens, Number.isFinite(aspect) && aspect > 0 ? aspect : 1, 0.05, 500);
  let sphere = boundingSphere(bounds);
  let preset = 'cook', options = {};
  let goal = home(), pose = copy(goal), velocity = stopped();
  let panOrigin = [...pose.target];
  let active = false, manual = false, handedness = 1;
  let coastYaw = 0, coastPitch = 0;

  function home() {
    return presetOrbit(preset, sphere, { ...options, aspect: camera.aspect, fov: lens });
  }

  function place() {
    const [x, y, z] = orbitToPosition(pose);
    camera.position.set(handedness * x, y, z);
    camera.lookAt(handedness * pose.target[0], pose.target[1], pose.target[2]);
    const far = Math.max(500, pose.distance + sphere.radius * 6 + 60);
    if (camera.fov !== pose.fov || camera.far !== far) {
      camera.fov = pose.fov;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  }

  function commit(immediate = false) {
    active = true;
    if (immediate || reducedMotion) {
      pose = copy(goal);
      velocity = stopped();
      active = false;
      place();
    }
  }

  function stopInertia() {
    coastYaw = coastPitch = 0;
  }

  function touch() {
    stopInertia();
    if (manual) return;
    manual = true;
    goal = copy(pose);
    velocity = stopped();
    active = false;
    panOrigin = [...pose.target];
  }

  function reset({ immediate = false } = {}) {
    stopInertia();
    manual = false;
    goal = home();
    commit(immediate);
  }

  function update(dt) {
    if (!(dt > 0)) return false;
    if (coastYaw || coastPitch) {
      const decay = Math.exp(-dt / 0.11), travel = 0.11 * (1 - decay);
      goal.yaw = wrapAngle(goal.yaw + coastYaw * travel);
      goal.pitch = clamp(goal.pitch + coastPitch * travel, MIN_PITCH, MAX_PITCH);
      coastYaw *= decay; coastPitch *= decay;
      if (Math.hypot(coastYaw, coastPitch) < 0.01) stopInertia();
      active = true;
    }
    if (!active) return false;
    let moving = false;
    function advance(value, speed, dest) {
      const step = springStep(value, speed, dest, dt);
      if (Math.abs(step.value - dest) < 1e-7 && Math.abs(step.velocity) < 1e-6) return { value: dest, velocity: 0 };
      moving = true;
      return step;
    }
    for (const key of ['yaw', 'pitch', 'distance', 'fov']) {
      const dest = key === 'yaw' ? pose.yaw + shortestAngle(pose.yaw, goal.yaw) : goal[key];
      const step = advance(pose[key], velocity[key], dest);
      pose[key] = key === 'yaw' ? wrapAngle(step.value) : step.value;
      velocity[key] = step.velocity;
    }
    pose.pitch = clamp(pose.pitch, MIN_PITCH, MAX_PITCH);
    pose.distance = Math.max(0.06, pose.distance);
    pose.fov = clamp(pose.fov, 1, 179);
    pose.target = pose.target.map((value, i) => {
      const step = advance(value, velocity.target[i], goal.target[i]);
      velocity.target[i] = step.velocity;
      return step.value;
    });
    active = moving;
    if (!active) pose = copy(goal);
    place();
    return true;
  }

  place();
  return {
    camera, touch, reset, update, stopInertia,
    get userTouched() { return manual; },
    serialize: () => copy(pose),
    applyPreset(name, framing = {}, { immediate = false, force = false } = {}) {
      preset = name;
      options = { ...framing };
      for (const key of ['focus', 'headDirection']) {
        const p = framing[key];
        if (p) options[key] = p.isVector3 ? p.toArray() : Array.from(p);
      }
      // 操作中も最新の手順を覚え、ダブルタップでその構図へ戻す。
      if (manual && !force) return false;
      reset({ immediate });
      return true;
    },
    orbit(dx, dy) {
      if (!(Number.isFinite(dx) && Number.isFinite(dy))) return;
      touch();
      goal.yaw = wrapAngle(goal.yaw + dx * handedness);
      goal.pitch = clamp(goal.pitch + dy, MIN_PITCH, MAX_PITCH);
      commit();
    },
    // 指を離した瞬間の角速度（ラジアン/秒）。減衰は描画側の時計で進める。
    fling(dx, dy) {
      if (!manual || reducedMotion || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
      coastYaw = clamp(dx * handedness, -6, 6);
      coastPitch = clamp(dy, -6, 6);
    },
    zoomBy(k) {
      if (!(Number.isFinite(k) && k > 0)) return;
      touch();
      const fit = distanceForSphere(sphere.radius, lens, camera.aspect);
      goal.distance = clamp(goal.distance / k, Math.max(0.1, sphere.radius * 0.15), Math.max(fit * 5, home().distance));
      commit();
    },
    // 入力は画面の右・上方向への注視点の移動量（cm）。
    pan(dx, dy) {
      if (!(Number.isFinite(dx) && Number.isFinite(dy))) return;
      touch();
      const { right, up } = cameraAxes(goal.yaw, goal.pitch);
      const point = goal.target.map((v, i) => v + dx * handedness * right[i] + dy * up[i]);
      goal.target = limitPan(point, panOrigin, sphere.radius * 1.25);
      commit();
    },
    setBounds(bounds, { immediate = true } = {}) {
      sphere = boundingSphere(bounds);
      if (!manual) reset({ immediate });
    },
    setAspect(ratio) {
      if (!(Number.isFinite(ratio) && ratio > 0) || ratio === camera.aspect) return;
      camera.aspect = ratio;
      camera.updateProjectionMatrix();
      if (!manual) reset({ immediate: true });
    },
    setReducedMotion(value) {
      reducedMotion = Boolean(value);
      if (reducedMotion) {
        stopInertia();
        if (active) commit(true);
      }
    },
    setMirror(value) {
      handedness = value ? -1 : 1;
      place();
    },
  };
}
