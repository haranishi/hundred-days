// 流れる雪の粒：風に舞う細かな雪を、カメラのまわりの箱の中に散らす。粒は世界に対してほぼ止まっているので、
// 速く滑るほど、画面を細い筋になって流れる。速さの手がかりが「雪面の流れ」だけだったのを補う（採点 1 周目：時速 109 km でも画面が落ち着いて見えた）。
// 粒の位置は箱の端で折り返す（カメラがどこまで進んでも、同じ数の粒がまわりにある）。計算はすべて GPU で、毎コマ送るのは数個の値だけ。
import * as THREE from 'three/webgpu';
import {
  Fn, attribute, uniform, vec2, vec3, vec4, float, fract, abs, max, mix, normalize, smoothstep, positionGeometry,
  cameraViewMatrix, cameraProjectionMatrix, varying, mrt,
} from 'three/tsl';

/**
 * @param {{context:object, world:object, count?:number}} deps
 */
export function createFlecks({ context, world, count = 420 }) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', quad.attributes.position);
  geometry.setIndex(quad.index);
  // 粒ごとの決まった乱数（xyz＝箱の中の位置、w＝太さと濃さのばらつき）。毎回同じ並びにして、撮影を再現できるようにする
  const base = new Float32Array(count * 4);
  let seed = 0x9e3779b9;
  const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  for (let i = 0; i < base.length; i++) base[i] = rand();
  geometry.setAttribute('fBase', new THREE.InstancedBufferAttribute(base, 4));
  geometry.instanceCount = count;

  const BOX = new THREE.Vector3(28, 10, 28); // 粒を散らす箱の大きさ（m）
  const uBox = uniform(BOX);
  const uCam = uniform(new THREE.Vector3());
  const uDrift = uniform(new THREE.Vector3()); // 風と落下で、粒が世界の中を動いた量
  const uStreak = uniform(new THREE.Vector3()); // 1 粒の筋（カメラの動きの向き × 長さ）
  const uAmount = uniform(0); // 速さから決めた濃さ（遅いときは 0）
  const uColor = uniform(new THREE.Color(1, 1, 1));
  const uColorDown = uniform(new THREE.Color(0.4, 0.5, 0.66)); // 雪面を背景にしたときの色
  const fBase = attribute('fBase', 'vec4');

  // 箱の中の位置：世界に固定した格子点を、カメラの位置で折り返す
  const local = fract(fBase.xyz.add(uDrift.sub(uCam).div(uBox))).sub(0.5);
  const center = uCam.add(local.mul(uBox));

  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
  const vAcross = varying(positionGeometry.x);
  const vAlong = varying(positionGeometry.y);
  const vAlpha = varying(Fn(() => {
    const view = cameraViewMatrix.mul(vec4(center, 1));
    const near = smoothstep(0.7, 2.6, view.z.negate()); // 目の前を横切る粒は消す
    const edge = float(1).sub(smoothstep(0.36, 0.5, max(max(abs(local.x), abs(local.y)), abs(local.z)))); // 箱の端で、ふっと現れないように
    return near.mul(edge).mul(fBase.w.mul(0.6).add(0.4)).mul(uAmount);
  })());
  material.vertexNode = Fn(() => {
    const a = cameraViewMatrix.mul(vec4(center, 1)).xyz;
    const b = cameraViewMatrix.mul(vec4(center.add(uStreak), 1)).xyz;
    const dir = normalize(b.xy.sub(a.xy).add(vec2(1e-5, 0)));
    const width = fBase.w.mul(0.014).add(0.01);
    const p = mix(a, b, positionGeometry.y.add(0.5)).add(vec3(dir.y.negate(), dir.x, 0).mul(positionGeometry.x.mul(width)));
    return cameraProjectionMatrix.mul(vec4(p, 1));
  })();
  // 背景で色を変える：白い粒は、白い雪面の上では見えない。雪面を見下ろす向きでは、青みのある暗い筋（風の影）にする。
  // 空を見上げる向きでは白（青みのある色のまま空に重ねると、黒い雨に見えた）
  const vDown = varying(smoothstep(0.02, -0.12, normalize(center.sub(uCam)).y));
  material.colorNode = mix(uColor, uColorDown, vDown);
  material.opacityNode = Fn(() => {
    const across = float(1).sub(abs(vAcross).mul(2));
    const along = float(1).sub(abs(vAlong).mul(2));
    return smoothstep(0, 0.6, across).mul(smoothstep(0, 0.35, along)).mul(vAlpha);
  })();
  if (context.tier.antialias === 'traa') material.mrtNode = mrt({ velocity: vec4(0, 0, 0, 0) }); // 理由は spray.js と同じ

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'snow-flecks';
  mesh.frustumCulled = false;
  mesh.renderOrder = 21;
  context.scene.add(mesh);

  const drift = new THREE.Vector3();
  const last = new THREE.Vector3();
  const vel = new THREE.Vector3();
  let has = false;

  /**
   * カメラを置いた後に、毎コマ呼ぶ。
   * @param {THREE.Camera} camera
   * @param {number} dt 秒
   * @param {boolean} jumped 場所が飛んだコマ（筋を出さない）
   */
  function update(camera, dt, jumped) {
    const p = camera.position;
    if (!has || jumped || !(dt > 0)) { vel.set(0, 0, 0); has = true; }
    else {
      // カメラの速さ。カメラの追従の揺れで筋が暴れないよう、少しならす
      const k = 1 - Math.exp(-dt / 0.08);
      vel.x += ((p.x - last.x) / dt - vel.x) * k; vel.y += ((p.y - last.y) / dt - vel.y) * k; vel.z += ((p.z - last.z) / dt - vel.z) * k;
      // 風（北西から）と、ゆっくりした落下
      drift.x += 1.4 * dt; drift.y -= 0.5 * dt; drift.z += 0.9 * dt;
    }
    last.copy(p);
    const speed = vel.length();
    // 筋の長さ：1 コマの間に粒が画面を流れる長さの数倍（速いほど長い）。上限を置く
    const len = Math.min(0.9, speed * 0.02);
    uCam.value.copy(p);
    uDrift.value.copy(drift);
    if (speed > 0.01) uStreak.value.copy(vel).multiplyScalar(len / speed); else uStreak.value.set(0, 0.001, 0);
    // 時速 25 km あたりから見え始め、時速 90 km で一番濃くなる
    const t = Math.min(1, Math.max(0, (speed - 7) / 18));
    uAmount.value = t * t * (3 - 2 * t) * 0.62;
    // 色：光を受けた雪の白。空・山かげ・木を背景にしたときに光って見える。日なたの雪面の上では見えない（実物もそう）。
    // 青みのある灰色も試したが、空を背景にすると黒い雨のように見えた
    const vis = world.sunVisibilityAt(p.x, p.z);
    uColor.value.setRGB(0.55 + 0.95 * vis, 0.66 + 0.8 * vis, 0.85 + 0.6 * vis);
    uColorDown.value.setRGB(0.16 + 0.42 * vis, 0.24 + 0.44 * vis, 0.4 + 0.42 * vis);
  }

  return {
    mesh, update,
    dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); },
  };
}
