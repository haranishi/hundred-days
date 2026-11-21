import * as THREE from '../vendor/three.js';

function visiblePiece(object) {
  let owner = null;
  for (let node = object; node; node = node.parent) {
    if (!node.visible) return null;
    // 同じ ID が複数のメッシュにも付く場合、部品の根が FLF を持つ。
    if (node.userData.pieceId && (!owner || node.userData.pieceId === owner.userData.pieceId)) owner = node;
  }
  return owner;
}

/** meshes は FLF で作った部品またはその親。CSS 座標から、移動・反転前の当たり点（cm）を返す。 */
export function createPicker({ camera, domElement, meshes }) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(clientX, clientY) {
    const { left, top, width, height } = domElement.getBoundingClientRect();
    if (!(width > 0 && height > 0 && Number.isFinite(clientX) && Number.isFinite(clientY))) return null;
    const u = (clientX - left) / width, v = (clientY - top) / height;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    const source = typeof meshes === 'function' ? meshes() : meshes;
    const roots = Array.isArray(source) ? source : source ? [source] : [];
    for (const root of roots) root.updateWorldMatrix(true, true);
    camera.updateWorldMatrix(true, false);
    ray.layers.mask = camera.layers.mask;
    ray.setFromCamera(ndc.set(2 * u - 1, 1 - 2 * v), camera);
    for (const hit of ray.intersectObjects(roots, true)) {
      const object = hit.object;
      const material = Array.isArray(object.material) ? object.material[hit.face?.materialIndex] : object.material;
      if (!material?.visible || (material.transparent && material.opacity <= 0)) continue;
      const owner = visiblePiece(object);
      if (!owner) continue;
      const depth = -hit.point.clone().applyMatrix4(camera.matrixWorldInverse).z;
      if (depth < camera.near || depth > camera.far) continue;
      return { pieceId: owner.userData.pieceId, point: owner.worldToLocal(hit.point).toArray(), object };
    }
    return null;
  }
  // 関数としても、練習側が {pick} を保持する形でも使える。
  return Object.assign(pick, { pick });
}
