/**
 * 簡単な上半身（単語の手話で、手の位置関係を見せるため）: 頭（目・眉・口）・首・胴・肩から手首までの腕。
 * 腕は肩と手首を結ぶ2つの骨の逆運動学で決め、ひじは下・外・少し後ろへ逃がす。
 * 片手だけの形では、反対の腕は体の横に下ろす（手は画面の外）。
 */
import {
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import type { Vec3 } from '../types';
import { ARM_POLE_L, BODY, armPoleFor, elbowPosition } from '../core/body';
import type { FaceState } from '../core/face';
import { add, cross, normalize, scale, sub } from '../core/math';
import type { Frame } from '../core/timeline';
import { materials } from './materials';

/** うなずきで頭を前へ傾ける一番深い角度（ラジアン・約13°） */
const NOD_TILT = 0.22;

const sphere = new SphereGeometry(1, 28, 18);
const cylinder = new CylinderGeometry(1, 1, 1, 24, 1, true);

function part(geo: BufferGeometry, mat: Material, outline: Material | null): Group {
  const g = new Group();
  g.add(new Mesh(geo, mat));
  if (outline) g.add(new Mesh(geo, outline));
  return g;
}

/** a→b の線分に沿って、半径 r の円柱を置く */
function placeSegment(g: Group, a: Vec3, b: Vec3, rx: number, rz: number) {
  const d = sub(b, a);
  const len = Math.max(1e-4, Math.hypot(d[0], d[1], d[2]));
  const y = normalize(d);
  let z = sub([0, 0, 1], scale(y, y[2]));
  if (Math.hypot(...z) < 1e-4) z = [1, 0, 0];
  z = normalize(z);
  const x = cross(y, z);
  const m = new Matrix4().set(x[0], y[0], z[0], (a[0] + b[0]) / 2, x[1], y[1], z[1], (a[1] + b[1]) / 2, x[2], y[2], z[2], (a[2] + b[2]) / 2, 0, 0, 0, 1);
  m.multiply(new Matrix4().makeScale(rx, len, rz));
  g.matrixAutoUpdate = false;
  g.matrix.copy(m);
  g.matrixWorldNeedsUpdate = true;
}

function placeBall(g: Group, p: Vec3, r: number) {
  g.matrixAutoUpdate = false;
  g.matrix.makeScale(r, r, r).setPosition(p[0], p[1], p[2]);
  g.matrixWorldNeedsUpdate = true;
}

class Arm {
  readonly group = new Group();
  private readonly upper: Group;
  private readonly fore: Group;
  private readonly shoulder: Group;
  private readonly elbow: Group;
  private readonly cuff: Group;
  constructor() {
    const M = materials();
    this.upper = part(cylinder, M.sleeve, M.sleeveOutline);
    this.fore = part(cylinder, M.sleeve, M.sleeveOutline);
    this.shoulder = part(sphere, M.sleeve, M.sleeveOutline);
    this.elbow = part(sphere, M.sleeve, M.sleeveOutline);
    this.cuff = part(cylinder, M.sleeveRim, M.sleeveOutline);
    this.group.add(this.upper, this.fore, this.shoulder, this.elbow, this.cuff);
  }
  update(shoulder: Vec3, wrist: Vec3, pole: Vec3) {
    const e = elbowPosition(shoulder, wrist, pole, BODY.upperArm, BODY.forearm);
    // 手首の少し手前で袖を終える（手首から先は手の部品が描く）
    const end = add(wrist, scale(normalize(sub(e, wrist)), 0.42));
    placeSegment(this.upper, shoulder, e, 0.36, 0.34);
    placeSegment(this.fore, e, end, 0.32, 0.28);
    placeBall(this.shoulder, shoulder, 0.42);
    placeBall(this.elbow, e, 0.33);
    placeSegment(this.cuff, add(end, scale(normalize(sub(e, end)), 0.14)), end, 0.35, 0.3);
  }
}

export class BodyRig {
  readonly group = new Group();
  private readonly head = new Group();
  private readonly neck: Group;
  private readonly armR = new Arm();
  private readonly armL = new Arm();
  /** 自分から見る時に薄く透かす部品（胴・首・頭・耳・髪）: 塗りの面と輪郭線と、ふだんの材質・透かす材質 */
  private readonly seeThrough: Array<{ fill: Mesh; outline: Mesh | null; normal: Material; through: Material }> = [];
  private readonly face: Group;
  private readonly brows: Array<{ g: Group; sx: number }> = [];
  private readonly mouthNeutral: Group;
  private readonly mouthSmile: Group;
  private readonly mouthFrown: Group;

  constructor() {
    const M = materials();
    const torso = part(new CapsuleGeometry(0.9, 2.6, 8, 28, 1), M.shirt, M.sleeveOutline);
    torso.scale.set(1.9, 1, 1.05);
    torso.position.set(0, -0.45, 0);
    this.neck = part(new CapsuleGeometry(0.36, 0.7, 6, 18, 1), M.skin, M.outline);
    this.neck.position.set(0, 1.85, 0.02);

    // 頭（首の付け根を中心に回す: うなずき）
    const pivot: Vec3 = [0, 2.15, 0];
    this.head.position.set(...pivot);
    const skull = part(sphere, M.skin, M.outline);
    skull.scale.set(...BODY.headRadius);
    skull.position.set(BODY.headCenter[0] - pivot[0], BODY.headCenter[1] - pivot[1], BODY.headCenter[2] - pivot[2]);
    // 髪は、頭と同じ中心・同じ向きの殻を、どこでも頭より5%外に置く。生え際の傾きは、殻の形（切り口）の側で付ける。
    // 以前は殻ごと後ろへずらして傾けていたので、額のあたりで髪の面が頭の中へ潜り、生え際が肌色のまだら（面の取り合い）に見えた。
    // 切り口は頭のてっぺんから95度、後ろへ42度傾ける：前は眉の上に額を残し（てっぺんから53度）、横は耳の上、後ろは首の上（137度）で切れる
    const hairGeometry = new SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, (95 / 180) * Math.PI);
    hairGeometry.rotateX((-42 / 180) * Math.PI);
    const hair = part(hairGeometry, M.hair, M.outline);
    hair.scale.set(BODY.headRadius[0] * 1.05, BODY.headRadius[1] * 1.05, BODY.headRadius[2] * 1.05);
    hair.position.copy(skull.position);
    const ear = (sx: number) => {
      const e = part(sphere, M.skin, M.outline);
      e.scale.set(0.12, 0.24, 0.14);
      e.position.set(sx * (BODY.headRadius[0] - 0.02), BODY.headCenter[1] - pivot[1] - 0.02, BODY.headCenter[2] - pivot[2] - 0.05);
      return e;
    };
    const face = (this.face = new Group());
    face.position.set(BODY.headCenter[0] - pivot[0], BODY.headCenter[1] - pivot[1], BODY.headCenter[2] - pivot[2]);
    for (const sx of [-1, 1]) {
      const eye = part(sphere, M.face, null);
      eye.scale.set(0.075, 0.105, 0.05);
      eye.position.set(sx * 0.3, 0.12, 0.84);
      const brow = part(new CapsuleGeometry(0.03, 0.2, 4, 8, 1), M.hair, null);
      this.brows.push({ g: brow, sx });
      face.add(eye, brow);
    }
    this.setBrows(false);
    this.mouthNeutral = part(new CapsuleGeometry(0.028, 0.22, 4, 8, 1), M.face, null);
    this.mouthNeutral.rotation.z = Math.PI / 2;
    this.mouthNeutral.position.set(0, -0.42, 0.83);
    this.mouthSmile = part(new TorusGeometry(0.17, 0.03, 8, 20, Math.PI * 0.8), M.face, null);
    this.mouthSmile.rotation.z = Math.PI + Math.PI * 0.1;
    this.mouthSmile.position.set(0, -0.3, 0.82);
    // への字: 笑顔の弧を上下に返し、浅くして口の高さに置く
    this.mouthFrown = part(new TorusGeometry(0.15, 0.03, 8, 20, Math.PI * 0.7), M.face, null);
    this.mouthFrown.rotation.z = Math.PI * 0.15;
    this.mouthFrown.scale.set(1, 0.7, 1);
    this.mouthFrown.position.set(0, -0.505, 0.83);
    face.add(this.mouthNeutral, this.mouthSmile, this.mouthFrown);
    const earL = ear(-1), earR = ear(1);
    this.head.add(skull, hair, earL, earR, face);

    this.group.add(torso, this.neck, this.head, this.armR.group, this.armL.group);
    const through = (g: Group, normal: Material, seeThrough: Material) =>
      this.seeThrough.push({ fill: g.children[0] as Mesh, outline: (g.children[1] as Mesh | undefined) ?? null, normal, through: seeThrough });
    through(torso, M.shirt, M.shirtSeeThrough);
    through(this.neck, M.skin, M.skinSeeThrough);
    through(skull, M.skin, M.skinSeeThrough);
    through(earL, M.skin, M.skinSeeThrough);
    through(earR, M.skin, M.skinSeeThrough);
    through(hair, M.hair, M.hairSeeThrough);
  }

  /**
   * 自分から見る時（肩の後ろ上から）は、胴・首・頭を薄く透かす。胸に触れる手（わかる・大丈夫）や顔の前の手（こんにちは・よろしく）を隠さない。
   * 頭は消さない（以前は消していて、首のない胴に見えた）。輪郭線は描かない（裏の面の輪郭線が、透けた体の向こうの手を塗りつぶすため）。
   * 目・眉・口は後ろから透けて見えると不自然なので描かない
   */
  setSelfView(on: boolean) {
    for (const s of this.seeThrough) {
      s.fill.material = on ? s.through : s.normal;
      if (s.outline) s.outline.visible = !on;
    }
    this.face.visible = !on;
  }

  /** 眉: ふつうは少し離して水平に近く、嫌な顔では眉間へ寄せて内側を下げる */
  private setBrows(frown: boolean) {
    for (const { g, sx } of this.brows) {
      g.rotation.z = Math.PI / 2 + sx * (frown ? 0.42 : 0.12);
      g.position.set(sx * (frown ? 0.23 : 0.3), frown ? 0.31 : 0.36, 0.8);
    }
  }

  update(f: Frame, face: FaceState) {
    this.mouthSmile.visible = face.shape === 'smile';
    this.mouthFrown.visible = face.shape === 'frown';
    this.mouthNeutral.visible = face.shape === 'neutral';
    this.setBrows(face.shape === 'frown');
    // うなずき（一礼）: 首の付け根から前へ傾ける。いつ・どれだけ傾けるかは core/face.ts の faceAt
    this.head.rotation.set(NOD_TILT * face.nod, 0, 0);
    // ひじの逃がし方は手首の位置に合わせる（armPoleFor。手を顔の高さへ上げた形・胸に当てる形で、ひじが頭の後ろへ回ったり前腕が胴を突き抜けたりしないように。
    // 理由は core/body.ts の armPoleFor の注記。胸の前の基準の位置では ARM_POLE_R/L と同じ）
    this.armR.update(BODY.shoulderR, f.dominant.wrist, armPoleFor('dominant', f.dominant.wrist));
    const restL: Vec3 = [BODY.shoulderL[0] + 0.35, BODY.shoulderL[1] - 5.2, 0.25];
    this.armL.update(BODY.shoulderL, f.nonDominant?.wrist ?? restL, f.nonDominant ? armPoleFor('nonDominant', f.nonDominant.wrist) : ARM_POLE_L);
  }
}
