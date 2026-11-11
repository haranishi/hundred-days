// 滑った跡：板が通った所に、雪面へ沿う帯を残す。帯の形（幅・濃さ・切れ目）は track-builder.js が決める。
// ここでは、その輪になった入れ物を GPU の帯として描く。区間をつなぐ番号（インデックス）は、切れ目の所だけ潰して描かない。
//
// 限界：雪面の網は遠くほど粗いので、遠くの帯は雪面と食い違う。カメラの方へ少し寄せて描き、遠くでは薄くして消す。
// 山の反対側から自分の跡を眺めるには、雪面の絵に跡を焼き込む方式が要る（snow-look で扱う）。
import * as THREE from 'three/webgpu';
import {
  Fn, attribute, vec3, vec4, float, length, mix, smoothstep, saturate, abs, positionGeometry,
  cameraViewMatrix, cameraProjectionMatrix, cameraPosition, varying, mrt,
} from 'three/tsl';
import { createTrackBuilder, skiContact } from './track-builder.js';

/**
 * @param {{context:object, world:object, capacity?:number}} deps
 */
function createTrackLane({ context, world, capacity = 4096 }, lane) {
  const builder = createTrackBuilder({ capacity, minStep: 0.22 });
  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(builder.positions, 3);
  const infoAttr = new THREE.BufferAttribute(builder.attrs, 2); // 帯の横の位置（0=左, 1=右）・濃さ
  posAttr.setUsage(THREE.DynamicDrawUsage);
  infoAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('trackInfo', infoAttr);
  // 区間 q は、節 q と節 q+1 をつなぐ四角形。番号は 6 個ずつ
  const index = new Uint16Array(capacity * 6);
  const indexAttr = new THREE.BufferAttribute(index, 1);
  indexAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setIndex(indexAttr);

  const info = attribute('trackInfo', 'vec2');

  // 合成は「下の色 × この面の色」。跡の色を足すのではなく、雪面を暗く青くする
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.DstColorFactor;
  material.blendDst = THREE.ZeroFactor;
  material.blendSrcAlpha = THREE.ZeroFactor;
  material.blendDstAlpha = THREE.OneFactor;
  material.vertexNode = Fn(() => {
    // 奥行きだけを手前へ寄せる（画面上の位置は変わらない）。雪面の網との食い違いで帯が埋もれるのを防ぐ
    const view = cameraViewMatrix.mul(vec4(positionGeometry, 1)).xyz;
    const dist = length(view);
    const pull = float(1).sub(float(0.05).add(dist.mul(0.006)).div(dist.max(0.2)));
    return cameraProjectionMatrix.mul(vec4(view.mul(pull), 1));
  })();
  const vInfo = varying(info);
  const vDist = varying(length(positionGeometry.sub(cameraPosition)));
  material.colorNode = Fn(() => {
    const across = float(1).sub(abs(vInfo.x.mul(2).sub(1))); // 縁 0 → 中央 1
    const edge = smoothstep(0.0, 0.3, across);
    const far = float(1).sub(smoothstep(110, 190, vDist));
    const strength = saturate(edge.mul(vInfo.y).mul(1.3).add(edge.mul(0.14))).mul(far);
    return mix(vec3(1, 1, 1), vec3(0.76, 0.82, 0.92), strength);
  })();
  // 速度の絵は「下の値 × 1」でそのまま残す（理由は spray.js と同じ。掛け合わせなので 0 ではなく 1 を出す）
  if (context.tier.antialias === 'traa') material.mrtNode = mrt({ velocity: vec4(1, 1, 1, 1) });
  // 影は受けない（基本の色だけ）。雪面より先に、不透明の後で描く
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'tracks';
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  context.scene.add(mesh);

  const sample = { grounded: false, x: 0, z: 0, fx: 0, fz: -1, slip: 0, load: 1, softness: 0.5, width: 0.24, heightAt: (x, z) => world.heightAt(x, z) };
  let cursor = 0; // 次に GPU 側へ反映する節
  let synced = builder.version;

  function setQuad(q, on) {
    const a = q * 2, b = ((q + 1) % capacity) * 2, o = q * 6;
    if (on) {
      index[o] = a; index[o + 1] = a + 1; index[o + 2] = b;
      index[o + 3] = a + 1; index[o + 4] = b + 1; index[o + 5] = b;
    } else {
      index[o] = index[o + 1] = index[o + 2] = index[o + 3] = index[o + 4] = index[o + 5] = 0;
    }
  }

  /**
   * @param {object} s 描く時刻の滑走の状態
   */
  const contact={x:0,y:0,z:0};
  function update(s, pose) {
    sample.grounded = s.mode !== 'air';
    sample.x = s.pos.x; sample.z = s.pos.z;
    sample.fx = s.fwd.x; sample.fz = s.fwd.z;
    // 「切る」と「削る」を、跡でも見分けられるようにする（採点 1 周目）：
    //   切るターン＝エッジが刻む細く濃い 1 本の溝／板を寝かせた直進＝板の幅の薄い帯／横滑り＝幅広く薄い削れ跡
    const skid = Math.abs(Math.sin(s.mode === 'crash' ? 1.2 : s.slip));
    const edged = Math.min(1, Math.abs(s.edge) / 0.5) * (1 - Math.min(1, skid * 4));
    sample.slip = s.mode === 'crash' ? 1.2 : s.slip;
    sample.width = skid > 0.12 ? 0.3 + 1.2 * skid : 0.24 - 0.14 * edged;
    sample.load = s.mode === 'crash' ? 0.5 : s.load * (skid > 0.12 ? 0.42 : 0.55 + 1.05 * edged);
    sample.softness = Math.min(1, s.snow.powder + s.snow.packed * 0.5 + s.snow.ice * 0.1);
    if(s.gear==='ski'&&pose){
      skiContact(pose,lane===0?'L':'R',contact);
      sample.x=contact.x;sample.z=contact.z;sample.width=.055;
    } else if(lane===1)sample.grounded=false;
    builder.push(sample);
    if (builder.version === synced) return;
    synced = builder.version;
    // 新しく書かれた節：手前の区間は切れ目でなければつなぎ、先の区間はまだ無いので潰す
    while (cursor !== builder.head) {
      const prev = (cursor - 1 + capacity) % capacity;
      setQuad(prev, builder.breaks[cursor] === 0 && builder.count > 1);
      setQuad(cursor, false);
      cursor = (cursor + 1) % capacity;
    }
    posAttr.needsUpdate = true;
    infoAttr.needsUpdate = true;
    indexAttr.needsUpdate = true;
    mesh.visible = builder.count > 1;
  }

  function clear() {
    builder.clear();
    mesh.visible = false;
    index.fill(0);
    cursor = 0;
    synced = builder.version;
    posAttr.needsUpdate = true; infoAttr.needsUpdate = true; indexAttr.needsUpdate = true;
  }

  return {
    mesh, builder, update, clear,
    dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); },
  };
}

export function createTracks(deps){
 const lanes=[createTrackLane(deps,0),createTrackLane(deps,1)];let gear='board';
 return {...lanes[0],lanes,
  update(s,pose){const next=s.gear==='ski'?'ski':'board';if(gear!==next){for(const l of lanes)l.clear();gear=next;}for(const l of lanes)l.update(s,pose);},
  clear(){for(const l of lanes)l.clear();},dispose(){for(const l of lanes)l.dispose();}
 };
}
