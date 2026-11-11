import {skiContact} from './track-builder.js';
// 雪煙：板が削った雪・新雪の巻き上げ・着地や転倒の雪けむりを、粒の集まりで描く。
// 粒の動き（空気の抵抗・落下・風）は式で決まるので、生まれたときの値だけを GPU へ送り、毎コマの位置は GPU が計算する。
// 粒は輪になった入れ物を使い回す（古い粒から上書き）。寿命が尽きた粒は大きさ 0 になって描かれない。
import * as THREE from 'three/webgpu';
import {
  Fn, attribute, uniform, vec2, vec3, vec4, float, exp, sin, cos, dot, max, mix, pow, saturate, smoothstep, select, normalize,
  cameraViewMatrix, cameraProjectionMatrix, cameraPosition, positionGeometry, uv, texture, varying, mrt,
} from 'three/tsl';

const G = 9.81;

function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {{context:object, world:object, capacity?:number}} deps
 */
export function createSpray({ context, world, capacity = 1536 }) {
  const rand = makeRandom(20261110);
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', quad.attributes.position);
  geometry.setAttribute('uv', quad.attributes.uv);
  geometry.setIndex(quad.index);
  const dataA = new Float32Array(capacity * 4); // 生まれた位置 xyz・生まれた時刻
  const dataB = new Float32Array(capacity * 4); // 初めの速度 xyz・寿命
  const dataC = new Float32Array(capacity * 4); // 大きさ・乱数・空気抵抗の強さ・濃さ
  for (let i = 0; i < capacity; i++) { dataA[i * 4 + 3] = -1000; dataB[i * 4 + 3] = 0.001; dataC[i * 4 + 2] = 1; }
  const attrA = new THREE.InstancedBufferAttribute(dataA, 4);
  const attrB = new THREE.InstancedBufferAttribute(dataB, 4);
  const attrC = new THREE.InstancedBufferAttribute(dataC, 4);
  for (const a of [attrA, attrB, attrC]) a.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('pA', attrA);
  geometry.setAttribute('pB', attrB);
  geometry.setAttribute('pC', attrC);
  geometry.instanceCount = capacity;

  const uTime = uniform(0);
  const uWind = uniform(new THREE.Vector3(1.4, 0, 0.9)); // 北西からの弱い風（m/s）
  const uSunDir = uniform(context.sun.dir.clone().normalize());
  const uSun = context.sun.color; // 太陽の色（強さ込み）
  // 日かげの雪面と同じ色（空の光＋雪原の跳ね返り）。これより明るいと、山かげで雪煙が光る霧に見える
  const uAmbient = uniform(new THREE.Color(0.25, 0.4, 0.6));
  const uRider = uniform(new THREE.Vector3()); // 滑走者の腰の位置（視線の上の粒を薄くするため）
  const half = world.half;
  const size = world.size;

  const pA = attribute('pA', 'vec4');
  const pB = attribute('pB', 'vec4');
  const pC = attribute('pC', 'vec4');
  const age = uTime.sub(pA.w);
  const life = pB.w;
  const t01 = age.div(life);

  // 空気の抵抗（速度に比例）と重力と風のもとでの位置。落ちる速さの上限は g/k、風には k の速さでなじむ
  const center = Fn(() => {
    const k = pC.z;
    const terminal = vec3(uWind.x, float(-G).div(k), uWind.z);
    const e = float(1).sub(exp(age.mul(k).negate())).div(k);
    return pA.xyz.add(pB.xyz.sub(terminal).mul(e)).add(terminal.mul(age));
  })();

  // 粒ごとの向き（同じ絵が並んで見えないように回す）。陰影の向きを画面に合わせ直すために、画素の側でも使う
  const spinAngle = pC.y.mul(6.2831).add(age.mul(pC.y.sub(0.5)).mul(1.6));

  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
  material.vertexNode = Fn(() => {
    const alive = age.greaterThanEqual(0).and(age.lessThan(life));
    // 細かい粒（空気抵抗が強い）は、広がりながら薄くなる。雪の塊（抵抗が弱い）は、大きさを保って飛ぶ
    const grow = float(1).add(age.mul(1.15).mul(saturate(pC.z.sub(1))));
    const s = select(alive, pC.x.mul(grow), float(0));
    const c = cos(spinAngle), sn = sin(spinAngle);
    const q = positionGeometry.xy;
    const corner = vec2(q.x.mul(c).sub(q.y.mul(sn)), q.x.mul(sn).add(q.y.mul(c))).mul(s);
    const view = cameraViewMatrix.mul(vec4(center, 1));
    return cameraProjectionMatrix.mul(vec4(view.xy.add(corner), view.z, 1));
  })();

  // 明るさ：日なたでは太陽の色、山かげでは空の色。太陽の方を向いて見ると、粒が光を通して強く光る（逆光の雪煙）
  const vColor = varying(Fn(() => {
    const vis = texture(context.textures.sunVis, center.xz.add(half).div(size)).level(0).r;
    const toP = normalize(center.sub(cameraPosition));
    const c = max(dot(toP, uSunDir), 0);
    // 雪けむりは、粒の間で光が回るので、日なたの雪面と同じかそれより明るい（0.5 では、太陽を向いた斜面の上で灰色の煙に見えた）
    const phase = float(0.9).add(c.mul(c).mul(0.3)).add(pow(c, 8).mul(0.9));
    // 雪の粒の中で光が何度も散るので、太陽の色味は半分ほど抜けて白に寄る
    const lum = dot(uSun, vec3(0.2126, 0.7152, 0.0722));
    const sunWhite = mix(uSun, vec3(lum, lum, lum), 0.55);
    return uAmbient.add(sunWhite.mul(0.9 / Math.PI).mul(phase).mul(vis));
  })());
  // 追うカメラは、自分の雪煙ごしに滑走者を見ることになる。カメラと滑走者を結ぶ線の近くにある粒は薄くして、体が霞んで消えないようにする
  const sightFade = Fn(() => {
    const toP = center.sub(cameraPosition);
    const toR = uRider.sub(cameraPosition);
    const t = dot(toP, toR).div(dot(toR, toR).max(0.01));
    const off = toP.sub(toR.mul(t)).length();
    const between = smoothstep(0.0, 0.15, t).mul(float(1).sub(smoothstep(1.02, 1.18, t)));
    // カメラのすぐ前（1.5〜4 m）の粒は消していく：画面いっぱいの霧にしない
    const nearCamera = smoothstep(1.5, 4.0, toP.length());
    return mix(float(1), mix(float(0.22), float(1), smoothstep(0.3, 0.9, off)), between).mul(nearCamera);
  })();
  const vFade = varying(smoothstep(0, 0.07, t01).mul(float(1).sub(smoothstep(0.3, 1.0, t01))).mul(pC.w).mul(sightFade));
  const vSeed = varying(pC.y);

  // 粒の中の陰影：白い雪の上の白い粒は、そのままでは見えない（採点 1 周目）。
  // 太陽の側の縁は明るく、反対側と厚い中心は青い陰にして、雪面の上で雪煙の形が読めるようにする
  const vRot = varying(vec2(cos(spinAngle), sin(spinAngle)));
  const vSunScreen = varying(normalize(cameraViewMatrix.mul(vec4(uSunDir, 0)).xy.add(vec2(1e-4, 0))));
  // 陰の側は、明るさを保ったまま青くする。空の色だけ（暗い）にすると黒い煙に見え、明るさを 6〜8 割にしただけでは白い雪に溶けて見えなかった。
  // 赤と緑を大きく引いて青を残すと、白い雪の上でも「雪けむりの陰」として読める
  const vShade = varying(vColor.mul(vec3(0.42, 0.56, 0.86)));
  material.colorNode = Fn(() => {
    const p = uv().sub(0.5).mul(2);
    const onScreen = vec2(p.x.mul(vRot.x).sub(p.y.mul(vRot.y)), p.x.mul(vRot.y).add(p.y.mul(vRot.x)));
    // 太陽の側と上は明るく、反対側と下（雪面に近い側）は陰。下を陰にすると、雪けむりが雪面から立ち上がって見える
    const lit = saturate(dot(onScreen, vSunScreen).mul(0.36).add(onScreen.y.mul(0.32)).add(0.5));
    return mix(vShade, vColor, lit);
  })();
  material.opacityNode = Fn(() => {
    const p = uv().sub(0.5).mul(2);
    const r2 = dot(p, p);
    const soft = pow(saturate(float(1).sub(r2)), 1.6);
    // 輪郭をわずかに崩して、同じ丸が並んで見えないようにする
    const lump = sin(p.x.mul(4.7).add(vSeed.mul(40))).mul(sin(p.y.mul(5.3).add(vSeed.mul(17)))).mul(0.22).add(0.88);
    return soft.mul(lump).mul(vFade);
  })();
  // 残像を消す処理（TRAA）が使う速度の絵には、何も書き込まない。
  // 注意：速度の絵を持たない段（FXAA）でこれを付けると、出力が空になって組み立てで落ちる
  if (context.tier.antialias === 'traa') material.mrtNode = mrt({ velocity: vec4(0, 0, 0, 0) });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'spray';
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  context.scene.add(mesh);

  let head = 0;
  let clock = 0;
  let dirty = false;
  let carry = 0;
  let carryPowder = 0;
  let carryCarve = 0;
  let carryCrash = 0;
  const stats = { emitted: 0 };

  function put(x, y, z, vx, vy, vz, lifeSec, sizeM, drag, alpha, delay = 0) {
    const i = head * 4;
    dataA[i] = x; dataA[i + 1] = y; dataA[i + 2] = z; dataA[i + 3] = clock + delay;
    dataB[i] = vx; dataB[i + 1] = vy; dataB[i + 2] = vz; dataB[i + 3] = lifeSec;
    dataC[i] = sizeM; dataC[i + 1] = rand(); dataC[i + 2] = drag; dataC[i + 3] = alpha;
    head = (head + 1) % capacity;
    dirty = true;
    stats.emitted++;
  }

  /** 着地・転倒・踏み切りの、まとまった雪けむり */
  function burst(s, b, count, power, spread) {
    for (let n = 0; n < count; n++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * spread;
      const out = 0.8 + rand() * 2.6 * power;
      const cx = Math.cos(a), cz = Math.sin(a);
      put(
        s.pos.x + cx * r, s.pos.y + 0.05 + rand() * 0.15, s.pos.z + cz * r,
        s.vel.x * 0.32 + cx * out, 0.6 + rand() * 2.4 * power, s.vel.z * 0.32 + cz * out,
        0.7 + rand() * 0.7, 0.35 + rand() * 0.5, 1.6 + rand() * 1.4, 0.34 + rand() * 0.2,
      );
    }
    void b;
  }

  /**
   * 1コマぶんの粒を生む。
   * @param {object} s 描く時刻の滑走の状態
   * @param {object} pose 姿勢（板の向き）
   * @param {Array} events このコマの出来事
   * @param {number} dt 秒
   */
  const contact={x:0,y:0,z:0};
  function emit(s, pose, events, dt) {
    clock += dt;
    const b = pose.board;
    uRider.value.set(pose.joints.pelvis.x, pose.joints.pelvis.y, pose.joints.pelvis.z);
    const soft = Math.min(1, s.snow.powder + s.snow.packed * 0.55 + s.snow.ice * 0.12);
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.type === 'land') burst(s, b, Math.round(Math.min(70, 10 + e.efh * 26) * (0.4 + soft * 0.8)), Math.min(1.6, 0.5 + e.efh * 0.45), 0.6);
      else if (e.type === 'crash') burst(s, b, 46, Math.min(1.8, 0.6 + s.speed * 0.05), 0.8);
      else if (e.type === 'takeoff' && e.pop) burst(s, b, 8, 0.45, 0.35);
    }
    if (dt <= 0) return;
    if (s.mode === 'air') { carry = carryPowder = carryCarve = 0; return; }
    const speed = s.speed;
    if (s.mode === 'crash') {
      // 転がっている間は、体が雪を巻き上げる
      carryCrash += Math.min(90, speed * 9) * dt;
      while (carryCrash >= 1) {
        carryCrash -= 1;
        const a = rand() * Math.PI * 2;
        put(s.pos.x + Math.cos(a) * 0.5, s.pos.y + 0.1 + rand() * 0.4, s.pos.z + Math.sin(a) * 0.5,
          s.vel.x * 0.4 + Math.cos(a) * 1.2, 0.8 + rand() * 1.8, s.vel.z * 0.4 + Math.sin(a) * 1.2,
          0.7 + rand() * 0.6, 0.4 + rand() * 0.5, 1.8, 0.3 + rand() * 0.18);
      }
      return;
    }
    const vf = s.vel.x * b.fwd.x + s.vel.y * b.fwd.y + s.vel.z * b.fwd.z;
    const vl = s.vel.x * b.right.x + s.vel.y * b.right.y + s.vel.z * b.right.z;

    // 1) 横滑り：板の腹が雪を押し、進む側へ扇のように飛ばす
    const q = s.tele.spray * (0.3 + soft * 0.9);
    if (q > 0.01) {
      carry += q * 700 * dt;
      const side = vl >= 0 ? 1 : -1;
      const push = Math.abs(vl);
      while (carry >= 1) {
        carry -= 1;
        const source=s.gear==='ski'?skiContact(pose,stats.emitted%2?'L':'R',contact):s.pos;
        const along = (rand() - 0.5) * 1.35;
        const clod = rand() < 0.22; // 5 つに 1 つは、霧にならずに弧を描いて飛ぶ雪の塊
        const up = (0.35 + rand() * 1.3) * (0.4 + 0.6 * q) * (clod ? 1.3 : 1);
        // 雪は、板が押す速さの一部で飛ぶ。上限を置かないと、速い横滑りで空高く打ち上がる
        const out = Math.min(push, 10) * (0.35 + rand() * 0.5) + 0.8;
        const jitter = (rand() - 0.5) * 1.2;
        // 押す向きは、板の横向きを水平へ寄せたもの（板を立てていても、雪は雪面に沿って飛ぶ）
        const sx = b.right.x * side, sz = b.right.z * side;
        const sn = Math.hypot(sx, sz) || 1;
        put(
          source.x + b.fwd.x * along + b.right.x * side * (s.gear==='ski'?.049:.14), source.y + b.fwd.y * along + 0.04, source.z + b.fwd.z * along + b.right.z * side * (s.gear==='ski'?.049:.14),
          (sx / sn) * out + b.fwd.x * (vf * (0.4 + rand() * 0.3) + jitter),
          up + s.vel.y * 0.35,
          (sz / sn) * out + b.fwd.z * (vf * (0.4 + rand() * 0.3) + jitter),
          clod ? 0.5 + rand() * 0.4 : 0.4 + rand() * 0.4,
          clod ? 0.045 + rand() * 0.05 : 0.15 + rand() * 0.22 + q * 0.1,
          clod ? 0.7 + rand() * 0.25 : 2.4 + rand() * 1.4,
          clod ? 0.85 : 0.34 + rand() * 0.16, rand() * dt,
        );
      }
    } else carry = 0;

    // 2) カービング：エッジが切った雪が、弧の外側へ薄く飛ぶ
    const turn = s.edge >= 0 ? 1 : -1;
    // エッジの力は、体重（約 800 N）を目安に 0〜1 へ直す。前は 2600 N で割っていて、切るターンの雪煙がほぼ 0 だった（採点 1 周目）
    const qc = Math.min(1, Math.abs(s.tele.edgeForce) / 800) * Math.min(1, speed / 8) * (0.25 + soft * 0.75) * (s.mode === 'carve' ? 1 : 0.3);
    if (qc > 0.08) {
      carryCarve += qc * 300 * dt;
      while (carryCarve >= 1) {
        carryCarve -= 1;
        const source=s.gear==='ski'?skiContact(pose,stats.emitted%2?'L':'R',contact):s.pos;
        const along = -0.78 + rand() * 0.5; // 板の後ろ 3 分の 1 から
        const out = 1.5 + rand() * 3.0 * qc;
        put(
          source.x + b.fwd.x * along + b.right.x * turn * (s.gear==='ski'?.049:.12), source.y + b.fwd.y * along + 0.03, source.z + b.fwd.z * along + b.right.z * turn * (s.gear==='ski'?.049:.12),
          -b.right.x * turn * out + s.vel.x * (0.12 + rand() * 0.16),
          0.3 + rand() * 1.1 * qc,
          -b.right.z * turn * out + s.vel.z * (0.12 + rand() * 0.16),
          0.28 + rand() * 0.27, 0.07 + rand() * 0.1, 3.5 + rand() * 2.0, 0.34 + rand() * 0.18, rand() * dt,
        );
      }
    } else carryCarve = 0;

    // 3) 新雪：板が雪をかき分けて、大きくやわらかい雪けむりを残す
    // まっすぐ滑る間は、後ろへ低い筋が残るだけ（追うカメラから滑走者が隠れない高さ）。板を立てて曲がると、外側へ大きく上がる
    const turning = Math.min(1, Math.abs(s.edge) / 0.55);
    const qp = s.snow.powder * Math.min(1, Math.max(0, (speed - 3) / 9)) * Math.min(1.4, s.load) * (0.16 + 0.84 * turning);
    if (qp > 0.03) {
      carryPowder += qp * 150 * dt;
      while (carryPowder >= 1) {
        carryPowder -= 1;
        const source=s.gear==='ski'?skiContact(pose,stats.emitted%2?'L':'R',contact):s.pos;
        const along = -0.85 + rand() * 1.15; // 板の中ほどから後ろ
        const sideways = (rand() - 0.5) * 2 - turn * turning * 0.8;
        put(
          source.x + b.fwd.x * along + b.right.x * sideways * (s.gear==='ski'?.049:.2), source.y + b.fwd.y * along + 0.05, source.z + b.fwd.z * along + b.right.z * sideways * (s.gear==='ski'?.049:.2),
          s.vel.x * (0.2 + rand() * 0.25) + b.right.x * sideways * (1.2 + turning * 2.2),
          0.25 + rand() * (0.6 + turning * 1.8),
          s.vel.z * (0.2 + rand() * 0.25) + b.right.z * sideways * (1.2 + turning * 2.2),
          0.7 + rand() * 0.7, 0.2 + rand() * 0.26 + turning * 0.18, 1.9 + rand() * 1.2, 0.2 + rand() * 0.14, rand() * dt,
        );
      }
    } else carryPowder = 0;
  }

  function flush() {
    uTime.value = clock;
    if (dirty) { attrA.needsUpdate = true; attrB.needsUpdate = true; attrC.needsUpdate = true; dirty = false; }
  }

  /** 出発地点へ戻ったときなど、残っている粒を消す */
  function clear() {
    for (let i = 0; i < capacity; i++) dataA[i * 4 + 3] = -1000;
    carry = carryPowder = carryCarve = carryCrash = 0;
    dirty = true;
  }

  return {
    mesh, stats, emit, flush, clear,
    dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); },
  };
}
