// 確認用のカメラ。滑走中のカメラ（ride-feedback）が無いときに使う。ドラッグで見回し、ホイールで前後に動く。
// ポインターロックは使わない。
import * as THREE from 'three/webgpu';

export function createDebugCamera(camera, element, world) {
  let yaw = 0;
  let pitch = -0.25;
  const pos = new THREE.Vector3(0, 0, 0);
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const dir = new THREE.Vector3();

  function apply() {
    const cp = Math.cos(pitch);
    // 向きは方位と同じ決まり：0 が北（−Z）、+90° が東（+X）
    dir.set(Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
    camera.position.copy(pos);
    camera.lookAt(pos.x + dir.x, pos.y + dir.y, pos.z + dir.z);
  }
  const onDown = (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; element.setPointerCapture?.(e.pointerId); };
  const onMove = (e) => {
    if (!dragging) return;
    yaw += (e.clientX - lastX) * 0.004;
    pitch = Math.max(-1.45, Math.min(1.45, pitch - (e.clientY - lastY) * 0.004));
    lastX = e.clientX; lastY = e.clientY;
  };
  const onUp = () => { dragging = false; };
  const onWheel = (e) => {
    e.preventDefault();
    const step = -Math.sign(e.deltaY) * Math.max(4, (pos.y - world.heightAt(pos.x, pos.z)) * 0.25);
    pos.addScaledVector(dir, step);
    const ground = world.heightAt(pos.x, pos.z) + 1.2;
    if (pos.y < ground) pos.y = ground;
  };
  element.addEventListener('pointerdown', onDown);
  element.addEventListener('pointermove', onMove);
  element.addEventListener('pointerup', onUp);
  element.addEventListener('pointercancel', onUp);
  element.addEventListener('wheel', onWheel, { passive: false });

  return {
    /** 位置（地面からの高さつき）と向きを決める */
    set({ x, z, above = 2, y = null, yaw: newYaw = yaw, pitch: newPitch = pitch }) {
      pos.set(x, y ?? world.heightAt(x, z) + above, z);
      yaw = newYaw;
      pitch = newPitch;
      apply();
    },
    get() { return { x: pos.x, y: pos.y, z: pos.z, yaw, pitch }; },
    update() { apply(); },
    dispose() {
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onUp);
      element.removeEventListener('wheel', onWheel);
    },
  };
}
