// 滑走者と板の、簡単な形（筒と球）。作り込んだ人物のデータ（public/models/rider-v1.*）を読めなかったときの代わりに使う。
// 姿勢の計算（pose.js）が出す関節の位置へ、体の各部を毎コマ置く。
// 骨つきのモデルを使わず、関節と関節を結ぶ部品で作る：形と姿勢を分けておけば、作り込んだ人物へ後で差し替えられる。
// 服はゆったりした上着とズボン・ヘルメット・ゴーグル・小さな背負い袋。実在の製品の意匠は写さない（色と柄は独自）。
import * as THREE from 'three/webgpu';

const Y = new THREE.Vector3(0, 1, 0);
const a3 = new THREE.Vector3();
const b3 = new THREE.Vector3();
const d3 = new THREE.Vector3();
const x3 = new THREE.Vector3();
const y3 = new THREE.Vector3();
const z3 = new THREE.Vector3();
const s3 = new THREE.Vector3();
const m4 = new THREE.Matrix4();

const JACKET = 0xe2702a; // 橙：画面の強調色と同じ系統。雪の上で見失わない
const JACKET_DARK = 0xa9501c;
const PANTS = 0x2b323b;
const DARK = 0x15181c;
const GLOVE = 0x1a1d21;
const HELMET = 0x222b34;
const PACK = 0x39424c;
const BOARD_TOP = 0x1d2b3a;
const BOARD_BASE = 0xd9dee4;

function mat(color, roughness = 0.82, metalness = 0) {
  return new THREE.MeshStandardNodeMaterial({ color, roughness, metalness });
}

/** 板：先端と後端を丸め、反り上げる。長さ 1.56 m・幅 0.26 m */
function makeBoard() {
  const L = 1.56, W = 0.262, T = 0.012;
  const g = new THREE.BoxGeometry(W, T, L, 6, 1, 40);
  const p = g.attributes.position;
  const tip = 0.24; // 端からこの長さを丸める
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    const z = p.getZ(i);
    const fromEnd = L / 2 - Math.abs(z);
    if (fromEnd < tip) {
      const t = 1 - fromEnd / tip; // 0（まっすぐの部分）→1（端）
      x *= Math.sqrt(Math.max(0, 1 - t * t * 0.93));
      y += t * t * 0.055; // 反り
    }
    // 横の絞り（サイドカット）
    x *= 1 - 0.06 * Math.cos((z / (L / 2)) * Math.PI * 0.5);
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  // 上面と滑走面で色を分ける。上面には、斜めの帯を2本（独自の柄）
  const col = new Float32Array(p.count * 3);
  const top = new THREE.Color(BOARD_TOP);
  const base = new THREE.Color(BOARD_BASE);
  const stripe = new THREE.Color(JACKET);
  const c = new THREE.Color();
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    if (n.getY(i) > 0.5) {
      const s = p.getZ(i) * 2.2 + p.getX(i) * 5.5;
      const band = (s > 0.55 && s < 0.78) || (s > -0.95 && s < -0.84);
      c.copy(band ? stripe : top);
    } else if (n.getY(i) < -0.5) c.copy(base);
    else c.copy(top).multiplyScalar(0.6);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.42, metalness: 0 });
  return new THREE.Mesh(g, m);
}

/**
 * 2点を結ぶ筒。断面は楕円（幅 rx・奥行き rz）で、根元（0）から先（1）へ太さを変えられる。
 * 長さ 1・Y 方向に作り、置くときに伸ばして向ける。
 */
function makeTube(rx0, rz0, rx1, rz1, material, seg = 14) {
  const g = new THREE.CylinderGeometry(1, 1, 1, seg, 1, false);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i);
    const rx = rx0 + (rx1 - rx0) * t;
    const rz = rz0 + (rz1 - rz0) * t;
    const ux = p.getX(i), uz = p.getZ(i);
    p.setX(i, ux * rx); p.setZ(i, uz * rz);
    if (Math.abs(n.getY(i)) < 0.5) {
      // 側面の法線：楕円の外向き（円の法線を、半径の逆数で伸ばす）
      const nx = n.getX(i) / rx, nz = n.getZ(i) / rz;
      const len = Math.hypot(nx, nz) || 1;
      n.setXYZ(i, nx / len, 0, nz / len);
    }
  }
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = true;
  return mesh;
}

/** 筒を a から b へ置く。side を与えると、断面の幅の向きをそれに合わせる */
function place(mesh, a, b, side) {
  a3.set(a.x, a.y, a.z);
  d3.set(b.x - a.x, b.y - a.y, b.z - a.z);
  const len = Math.max(1e-4, d3.length());
  d3.multiplyScalar(1 / len);
  mesh.position.copy(a3);
  if (side) {
    x3.set(side.x, side.y, side.z);
    x3.addScaledVector(d3, -x3.dot(d3));
    if (x3.lengthSq() < 1e-8) x3.set(1, 0, 0);
    x3.normalize();
    z3.crossVectors(x3, d3);
    m4.makeBasis(x3, d3, z3);
    mesh.quaternion.setFromRotationMatrix(m4);
  } else mesh.quaternion.setFromUnitVectors(Y, d3);
  mesh.scale.set(1, len, 1);
}

function makeBall(radius, material, sx = 1, sy = 1, sz = 1) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), material);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  return mesh;
}

/** 右・上・前（−Z が前）の向きで置く */
function setBasis(obj, right, up, fwd) {
  m4.makeBasis(x3.set(right.x, right.y, right.z), y3.set(up.x, up.y, up.z), z3.set(-fwd.x, -fwd.y, -fwd.z));
  obj.quaternion.setFromRotationMatrix(m4);
}

/** 靴とビンディング。原点は足首、−Z がつま先、+Y が上 */
function makeFoot(bootMat, bindMat, strapMat) {
  const g = new THREE.Group();
  // 靴の本体：つま先を丸めた箱
  const shell = new THREE.BoxGeometry(0.118, 0.105, 0.3, 4, 3, 8);
  const p = shell.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i);
    const z = p.getZ(i);
    const toe = Math.max(0, (-z - 0.05) / 0.1); // つま先側ほど 1
    const heel = Math.max(0, (z - 0.09) / 0.06);
    const round = Math.min(1, toe * toe * 0.55 + heel * heel * 0.35);
    x *= 1 - round * 0.45;
    if (y > 0) y *= 1 - Math.min(1, toe) * 0.35;
    p.setXYZ(i, x, y, z);
  }
  shell.computeVertexNormals();
  const boot = new THREE.Mesh(shell, bootMat);
  boot.position.set(0, -0.045, -0.02);
  // 台座・かかとの背板・甲とつま先の帯
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.27), bindMat);
  plate.position.set(0, -0.1, -0.015);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.2, 0.016, 3, 4, 1), bindMat);
  back.position.set(0, 0.0, 0.135);
  back.rotation.x = -0.2;
  const strapGeo = new THREE.TorusGeometry(0.068, 0.011, 6, 12, Math.PI);
  const ankleStrap = new THREE.Mesh(strapGeo, strapMat);
  ankleStrap.position.set(0, -0.055, 0.045);
  ankleStrap.rotation.x = -0.35;
  ankleStrap.scale.set(1, 1.05, 2.2);
  const toeStrap = new THREE.Mesh(strapGeo, strapMat);
  toeStrap.position.set(0, -0.075, -0.1);
  toeStrap.scale.set(0.95, 0.8, 2.0);
  for (const m of [boot, plate, back, ankleStrap, toeStrap]) { m.castShadow = true; g.add(m); }
  return g;
}

export function createSimpleFigure() {
  const group = new THREE.Group();
  group.name = 'rider';
  const jacket = mat(JACKET, 0.8);
  const jacketDark = mat(JACKET_DARK, 0.8);
  const pants = mat(PANTS, 0.88);
  const dark = mat(DARK, 0.55);
  const glove = mat(GLOVE, 0.7);
  const bind = mat(0x3a4048, 0.55);
  const strap = mat(0x8d949c, 0.5);
  const packMat = mat(PACK, 0.75);

  const board = makeBoard();
  board.castShadow = true;
  board.receiveShadow = true;
  group.add(board);

  // 筒：根元 → 先。幅（体の左右）と奥行きを分ける
  const parts = {
    thighL: makeTube(0.105, 0.1, 0.09, 0.088, pants), thighR: makeTube(0.105, 0.1, 0.09, 0.088, pants),
    shinL: makeTube(0.09, 0.088, 0.084, 0.084, pants), shinR: makeTube(0.09, 0.088, 0.084, 0.084, pants),
    cuffL: makeTube(0.078, 0.082, 0.083, 0.086, dark, 12), cuffR: makeTube(0.078, 0.082, 0.083, 0.086, dark, 12), // 靴の上の部分（すねに沿う）
    lower: makeTube(0.236, 0.172, 0.228, 0.156, jacket, 18), // 上着のすそ → 胸（すそは腰の丸みを覆う広さ）
    upper: makeTube(0.228, 0.156, 0.16, 0.115, jacket, 18), // 胸 → 首の付け根
    collar: makeTube(0.09, 0.09, 0.082, 0.085, jacketDark, 12),
    armL: makeTube(0.07, 0.068, 0.06, 0.058, jacket, 12), armR: makeTube(0.07, 0.068, 0.06, 0.058, jacket, 12),
    foreL: makeTube(0.06, 0.058, 0.052, 0.05, jacket, 12), foreR: makeTube(0.06, 0.058, 0.052, 0.05, jacket, 12),
  };
  for (const m of Object.values(parts)) group.add(m);

  const balls = {
    hipL: makeBall(0.098, pants), hipR: makeBall(0.098, pants),
    kneeL: makeBall(0.092, pants), kneeR: makeBall(0.092, pants),
    shoulderL: makeBall(0.086, jacket), shoulderR: makeBall(0.086, jacket),
    elbowL: makeBall(0.062, jacket), elbowR: makeBall(0.062, jacket),
    handL: makeBall(0.056, glove, 1, 1.25, 0.9), handR: makeBall(0.056, glove, 1, 1.25, 0.9),
  };
  for (const m of Object.values(balls)) group.add(m);
  const hips = makeBall(0.16, pants); // 腰まわり（幅を広げて置く）
  const yoke = makeBall(0.1, jacket); // 首の付け根の肩の丸み
  group.add(hips, yoke);

  // 背負い袋：背中に沿う丸い箱
  const pack = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.2, 4, 12), packMat);
  pack.castShadow = true;
  group.add(pack);

  // 頭：ヘルメット・ゴーグル・首もとの覆い
  const head = new THREE.Group();
  const helmet = makeBall(0.13, mat(HELMET, 0.5), 1, 0.98, 1.08);
  const gaiter = makeBall(0.098, dark, 1, 1.05, 1);
  gaiter.position.set(0, -0.085, 0.004);
  // ゴーグルのレンズ：球の前側の帯（−Z が前）。空を映す色つきの面
  const lensGeo = new THREE.SphereGeometry(0.139, 20, 6, Math.PI * 1.5 - 1.0, 2.0, 1.17, 0.5);
  const lens = new THREE.Mesh(lensGeo, mat(0xe08a35, 0.22, 0.4));
  lens.scale.set(1, 0.98, 1.085);
  const frameGeo = new THREE.SphereGeometry(0.137, 20, 6, Math.PI * 1.5 - 1.12, 2.24, 1.1, 0.64);
  const frame = new THREE.Mesh(frameGeo, dark);
  frame.scale.copy(lens.scale);
  // ゴーグルの帯：頭の後ろ側だけ（前はレンズ）。輪の切れ目を前（−Z）へ向ける
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.133, 0.014, 6, 24, Math.PI * 1.36), mat(JACKET, 0.7));
  band.rotation.x = Math.PI / 2;
  band.rotation.z = Math.PI * 0.5 - Math.PI * 0.68;
  band.position.y = 0.022;
  band.scale.set(1, 1.08, 1);
  for (const m of [helmet, gaiter, frame, lens, band]) { m.castShadow = true; head.add(m); }
  group.add(head);

  const upperBody = [parts.collar, parts.upper, parts.lower, parts.armL, parts.armR, yoke, pack, balls.shoulderL, balls.shoulderR, balls.elbowL, balls.elbowR];

  const footL = makeFoot(dark, bind, strap);
  const footR = makeFoot(dark, bind, strap);
  group.add(footL, footR);

  const toe = new THREE.Vector3();
  const side = new THREE.Vector3();
  const spine = new THREE.Vector3();
  const hem = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const qYaw = new THREE.Quaternion();

  // 足は板に対して横向き。つま先は体の前（レギュラーは板の右、グーフィーは板の左）。
  // 開きの角度は、板の上向きまわりの回転（＋で、つま先が板の先端側へ向く）
  function placeFoot(foot, ankle, b, toeSign, angle) {
    toe.set(b.right.x * toeSign, b.right.y * toeSign, b.right.z * toeSign);
    y3.set(b.up.x, b.up.y, b.up.z);
    x3.crossVectors(toe, y3).normalize();
    m4.makeBasis(x3, y3, z3.copy(toe).negate());
    foot.quaternion.setFromRotationMatrix(m4);
    qYaw.setFromAxisAngle(y3, angle);
    foot.quaternion.premultiply(qYaw);
    foot.position.set(ankle.x, ankle.y, ankle.z);
  }

  /** 関節から少し先まで（靴の上の部分など）：a から b の向きへ length だけ */
  function placeToward(mesh, a, b, length, sideRef) {
    tmp.set(b.x - a.x, b.y - a.y, b.z - a.z).normalize().multiplyScalar(length);
    tmp.x += a.x; tmp.y += a.y; tmp.z += a.z;
    place(mesh, a, tmp, sideRef);
  }

  /**
   * @param {object} pose pose.js の出力
   * @param {{firstPerson?:boolean, stance?:number}} opts
   */
  function apply(pose, opts = {}) {
    const j = pose.joints;
    const b = pose.board;
    setBasis(board, b.right, b.up, b.fwd);
    board.position.set(b.pos.x + b.up.x * 0.006, b.pos.y + b.up.y * 0.006, b.pos.z + b.up.z * 0.006);

    // 脚
    place(parts.thighL, j.hipL, j.kneeL, b.fwd);
    place(parts.thighR, j.hipR, j.kneeR, b.fwd);
    place(parts.shinL, j.kneeL, j.ankleL, b.fwd);
    place(parts.shinR, j.kneeR, j.ankleR, b.fwd);
    placeToward(parts.cuffL, j.ankleL, j.kneeL, 0.2, b.fwd);
    placeToward(parts.cuffR, j.ankleR, j.kneeR, 0.2, b.fwd);

    // 胴：肩の並びを幅の向きにする。すそは腰より少し下まで
    side.set(j.shoulderR.x - j.shoulderL.x, j.shoulderR.y - j.shoulderL.y, j.shoulderR.z - j.shoulderL.z).normalize();
    spine.set(j.chest.x - j.pelvis.x, j.chest.y - j.pelvis.y, j.chest.z - j.pelvis.z).normalize();
    hem.set(j.pelvis.x, j.pelvis.y, j.pelvis.z).addScaledVector(spine, -0.09);
    place(parts.lower, hem, j.chest, side);
    s3.set(pose.chestUp.x, pose.chestUp.y, pose.chestUp.z);
    b3.set(j.neck.x, j.neck.y, j.neck.z).addScaledVector(s3, 0.015); // 首の付け根
    place(parts.upper, j.chest, b3, side);
    tmp.copy(b3).addScaledVector(s3, 0.085);
    place(parts.collar, b3, tmp, side);
    yoke.position.copy(b3).addScaledVector(s3, -0.03);
    setBasis(yoke, side, s3, pose.chestFwd);
    yoke.scale.set(2.0, 0.85, 1.25);
    // 腰まわり：腰の並びへ広げる
    x3.set(j.hipR.x - j.hipL.x, j.hipR.y - j.hipL.y, j.hipR.z - j.hipL.z).normalize();
    y3.copy(spine).addScaledVector(x3, -spine.dot(x3)).normalize();
    z3.crossVectors(x3, y3);
    m4.makeBasis(x3, y3, z3);
    hips.quaternion.setFromRotationMatrix(m4);
    hips.position.set(j.pelvis.x, j.pelvis.y, j.pelvis.z);
    hips.scale.set(1.22, 0.8, 0.92);
    // 背負い袋：背中（胸の向きの逆）へ
    pack.position.set(
      (j.pelvis.x + j.neck.x) * 0.5 - pose.chestFwd.x * 0.2 + s3.x * 0.04,
      (j.pelvis.y + j.neck.y) * 0.5 - pose.chestFwd.y * 0.2 + s3.y * 0.04,
      (j.pelvis.z + j.neck.z) * 0.5 - pose.chestFwd.z * 0.2 + s3.z * 0.04,
    );
    x3.copy(side);
    y3.copy(s3).addScaledVector(x3, -s3.dot(x3)).normalize();
    z3.crossVectors(x3, y3);
    m4.makeBasis(x3, y3, z3);
    pack.quaternion.setFromRotationMatrix(m4);
    pack.scale.set(1.2, 0.92, 0.56);

    place(parts.armL, j.shoulderL, j.elbowL);
    place(parts.armR, j.shoulderR, j.elbowR);
    place(parts.foreL, j.elbowL, j.handL);
    place(parts.foreR, j.elbowR, j.handR);
    for (const key of ['hipL', 'hipR', 'kneeL', 'kneeR', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'handL', 'handR']) {
      balls[key].position.set(j[key].x, j[key].y, j[key].z);
    }
    // 手袋は、前腕の向きへ伸ばす
    balls.handL.quaternion.copy(parts.foreL.quaternion);
    balls.handR.quaternion.copy(parts.foreR.quaternion);

    // 頭：見ている向き
    b3.set(pose.headFwd.x, pose.headFwd.y, pose.headFwd.z);
    a3.set(pose.chestUp.x, pose.chestUp.y, pose.chestUp.z);
    x3.crossVectors(b3, a3).normalize();
    y3.crossVectors(x3, b3).normalize();
    m4.makeBasis(x3, y3, z3.copy(b3).negate());
    head.quaternion.setFromRotationMatrix(m4);
    head.position.set(j.head.x, j.head.y, j.head.z);
    // 一人称では、カメラのすぐ下にある物を描かない：頭・首もと・肩・胸・背負い袋・上腕。
    // 頭だけ消すと、横を向いた姿勢のときに肩と背負い袋が画面の下 4 分の 1 を塞いだ（採点 1 周目）。
    // 腰から下と前腕は残す：下を向くと、自分の足元と板が見える
    const body = !opts.firstPerson;
    head.visible = body;
    for (const m of upperBody) m.visible = body;

    const stance = opts.stance === -1 ? -1 : 1;
    // 前足（レギュラーは左足）は先端側へ 15°、後ろ足は後端側へ 9° 開く
    const frontAngle = (Math.PI / 12) * stance;
    const rearAngle = -(Math.PI / 20) * stance;
    placeFoot(footL, j.ankleL, b, stance, stance === 1 ? frontAngle : rearAngle);
    placeFoot(footR, j.ankleR, b, stance, stance === 1 ? rearAngle : frontAngle);
  }

  return {
    group, apply,
    dispose() {
      group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });
      group.removeFromParent();
    },
  };
}
