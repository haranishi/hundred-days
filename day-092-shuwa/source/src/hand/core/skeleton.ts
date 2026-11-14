/**
 * 手の骨格（寸法と順運動学）。手の座標（右手）: 原点=手首の中心, +Y=指先, +Z=手のひらの面の外向き, +X=親指の側。
 * 長さの単位は手のひらの長さ（手首→中指の付け根）= 1。
 *
 * 寸法は成人の手の平均的な比（手のひら約10cm）から決めた。寸法を変えると全部の形の見た目と21点が変わるので、
 * 変えるときは開発用の一覧ページで全部の形を撮り直して確かめる。
 */
import type { ContactPoint, FingerName, Vec3 } from '../types';
import { DEG, colY, colZ, madd, mulMM, rotX, rotY, rotZ, type M3 } from './math';

export const FINGERS: readonly FingerName[] = ['index', 'middle', 'ring', 'pinky'];

/** 指の関節角度（度）。曲げは手のひら側へ＋。spread は親指の側（+X）へ倒すのが＋ */
export interface FingerAngles {
  mcp: number;
  pip: number;
  dip: number;
  spread: number;
}

/**
 * 親指の関節角度（度）。
 * cmcFlex=付け根を手のひらの面の中で小指側へ寄せる（＋）/ cmcAbd=手のひらの前へ起こす（＋）/
 * cmcRot=付け根のひねり（＋で腹が手のひら側へ向く）/ mcp・ip=腹の側へ曲げる（＋）
 */
export interface ThumbAngles {
  cmcFlex: number;
  cmcAbd: number;
  cmcRot: number;
  mcp: number;
  ip: number;
}

export interface HandPose {
  thumb: ThumbAngles;
  index: FingerAngles;
  middle: FingerAngles;
  ring: FingerAngles;
  pinky: FingerAngles;
}

/** 骨1本。start/end は関節の中心（指先の骨だけ end が指先の表面の点）。rot の列は x=横, y=骨の向き, z=腹の側 */
export interface Bone {
  start: Vec3;
  end: Vec3;
  rot: M3;
  radius: number;
}

/** 指1本（親指は cmc・mcp・ip・tip、ほかの指は mcp・pip・dip・tip） */
export interface Chain {
  joints: [Vec3, Vec3, Vec3, Vec3];
  bones: [Bone, Bone, Bone];
}

export interface HandSkeleton {
  thumb: Chain;
  index: Chain;
  middle: Chain;
  ring: Chain;
  pinky: Chain;
}

const MID_Y = Math.sqrt(1 - 0.03 * 0.03);

export const DIM = {
  /** 指の付け根（MCP）の位置。中指の付け根までの距離がちょうど 1 */
  mcp: {
    index: [0.24, 0.966, 0] as Vec3,
    middle: [0.03, MID_Y, 0] as Vec3,
    ring: [-0.168, 0.955, 0] as Vec3,
    pinky: [-0.345, 0.875, 0] as Vec3,
  } satisfies Record<FingerName, Vec3>,
  /** 指の骨の長さ（基節・中節・末節。末節は指先の表面まで） */
  len: {
    index: [0.4, 0.235, 0.195],
    middle: [0.45, 0.28, 0.205],
    ring: [0.42, 0.265, 0.2],
    pinky: [0.33, 0.2, 0.18],
  } satisfies Record<FingerName, [number, number, number]>,
  /** 指の太さ（半径。基節・中節・末節）。握った時に指どうしがほぼ触れる太さ（細いと「短い指を立てた形」に見える） */
  rad: {
    index: [0.098, 0.09, 0.082],
    middle: [0.1, 0.093, 0.085],
    ring: [0.095, 0.088, 0.08],
    pinky: [0.085, 0.078, 0.071],
  } satisfies Record<FingerName, [number, number, number]>,
  /** 親指の付け根（手根中手関節）の位置 */
  thumbCmc: [0.21, 0.22, 0.07] as Vec3,
  /** 親指の骨の長さ（中手骨・基節・末節） */
  thumbLen: [0.45, 0.31, 0.26] as [number, number, number],
  thumbRad: [0.122, 0.106, 0.096] as [number, number, number],
  /**
   * 親指の中手骨の基準の向き（度）。yaw=手のひらの面の中で親指側へ開く角, pitch=手のひらの前へ起こす角,
   * roll=骨の軸まわりのひねり（−70°で腹が人差し指の側を向く）
   */
  thumbYaw0: 40,
  thumbPitch0: 12,
  thumbRoll0: -70,
  /** 手のひらの厚みの半分（手のひら側の面が z=+palmHalf、甲が z=−palmHalf） */
  palmHalf: 0.135,
};

/** 手のひらの中心（体の位置に手を置くときの基準点） */
export const PALM_CENTER: Vec3 = [0, 0.52, 0];

function bone(start: Vec3, end: Vec3, rot: M3, radius: number): Bone {
  return { start, end, rot, radius };
}

export function fingerChain(f: FingerName, a: FingerAngles): Chain {
  const base = DIM.mcp[f];
  const [P, M, D] = DIM.len[f];
  const [r0, r1, r2] = DIM.rad[f];
  const R0 = mulMM(rotZ(-a.spread * DEG), rotX(a.mcp * DEG));
  const pip = madd(base, colY(R0), P);
  const R1 = mulMM(R0, rotX(a.pip * DEG));
  const dip = madd(pip, colY(R1), M);
  const R2 = mulMM(R1, rotX(a.dip * DEG));
  const tip = madd(dip, colY(R2), D);
  return {
    joints: [base, pip, dip, tip],
    bones: [bone(base, pip, R0, r0), bone(pip, dip, R1, r1), bone(dip, tip, R2, r2)],
  };
}

/** 親指の中手骨の回転 */
export function thumbBaseRot(a: ThumbAngles): M3 {
  return mulMM(
    mulMM(rotZ(-(DIM.thumbYaw0 - a.cmcFlex) * DEG), rotX((DIM.thumbPitch0 + a.cmcAbd) * DEG)),
    rotY((DIM.thumbRoll0 + a.cmcRot) * DEG),
  );
}

export function thumbChain(a: ThumbAngles): Chain {
  const cmc = DIM.thumbCmc;
  const [L0, L1, L2] = DIM.thumbLen;
  const [r0, r1, r2] = DIM.thumbRad;
  const R0 = thumbBaseRot(a);
  const mcp = madd(cmc, colY(R0), L0);
  const R1 = mulMM(R0, rotX(a.mcp * DEG));
  const ip = madd(mcp, colY(R1), L1);
  const R2 = mulMM(R1, rotX(a.ip * DEG));
  const tip = madd(ip, colY(R2), L2);
  return {
    joints: [cmc, mcp, ip, tip],
    bones: [bone(cmc, mcp, R0, r0), bone(mcp, ip, R1, r1), bone(ip, tip, R2, r2)],
  };
}

export function skeleton(p: HandPose): HandSkeleton {
  return {
    thumb: thumbChain(p.thumb),
    index: fingerChain('index', p.index),
    middle: fingerChain('middle', p.middle),
    ring: fingerChain('ring', p.ring),
    pinky: fingerChain('pinky', p.pinky),
  };
}

/** 21点（手の座標）。並びは MediaPipe と同じ: 0=手首, 1〜4=親指(CMC,MCP,IP,先), 5〜8=人差し指(MCP,PIP,DIP,先), … 17〜20=小指 */
export function skeletonLandmarks(s: HandSkeleton): Vec3[] {
  const out: Vec3[] = [[0, 0, 0]];
  for (const c of [s.thumb, s.index, s.middle, s.ring, s.pinky]) out.push(...c.joints);
  return out;
}

/**
 * 接触に使う球。指先は指先の丸み（末節の太さの球。中心は表面の点から骨に沿って半径ぶん内側）、
 * 関節は関節の中心とその太さ。親指は関節が1つ少ないので thumb.pip と thumb.dip はどちらも IP 関節とする。
 */
export interface ContactSphere {
  center: Vec3;
  radius: number;
  /** 腹の向き（指先の球だけ。接触を腹どうしにするための目安） */
  pad?: Vec3;
}

export function contactSphere(s: HandSkeleton, p: ContactPoint): ContactSphere {
  const [who, joint] = p.split('.') as [FingerName | 'thumb', 'tip' | 'dip' | 'pip' | 'mcp'];
  const c = s[who];
  if (joint === 'tip') {
    const b = c.bones[2];
    return { center: madd(b.end, colY(b.rot), -b.radius), radius: b.radius, pad: colZ(b.rot) };
  }
  if (who === 'thumb') {
    if (joint === 'mcp') return { center: c.joints[1], radius: c.bones[1].radius };
    return { center: c.joints[2], radius: c.bones[2].radius };
  }
  const i = joint === 'mcp' ? 0 : joint === 'pip' ? 1 : 2;
  return { center: c.joints[i], radius: c.bones[i].radius };
}

/** 2つの点の接触の隙間（球の表面どうしの距離。負はめり込み） */
export function contactGap(s: HandSkeleton, a: ContactPoint, b: ContactPoint): number {
  const A = contactSphere(s, a), B = contactSphere(s, b);
  const d = Math.hypot(A.center[0] - B.center[0], A.center[1] - B.center[1], A.center[2] - B.center[2]);
  return d - A.radius - B.radius;
}

/** 指の点の位置（手の座標） */
export function pointOf(s: HandSkeleton, p: ContactPoint): Vec3 {
  const [who, joint] = p.split('.') as [FingerName | 'thumb', 'tip' | 'dip' | 'pip' | 'mcp'];
  const c = s[who];
  if (joint === 'tip') return c.joints[3];
  if (who === 'thumb') return joint === 'mcp' ? c.joints[1] : c.joints[2];
  return c.joints[joint === 'mcp' ? 0 : joint === 'pip' ? 1 : 2];
}
