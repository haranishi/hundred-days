// OWNER: dragon
// クリップを時刻で引き、重みと部位の割合で重ねて、骨の回転（と胴の位置）に書く。
// three の AnimationMixer は部位ごとの上書き（技の上半身だけ、など）を持たないので、ここで自分で重ねる。
// 回転は符号をそろえた重み付きの和を正規化する（nlerp）。順番に依らず、重みが 0 のクリップは引かない。
// r03-roster：クリップの名前は怪獣ごとに違う（焔角の jump・stomp）。GLB に無いクリップは引かない。
// 雷翼は翼の手首で地面を突いて歩くので、技の上書きの割合を引くときに翼の腕の骨を前脚として扱う（wingLegs）。
import type { AnimationClip, Bone, Interpolant } from 'three';
import type { ClipName } from '../config/creatures';
import { DRAGON_MOTION, boneGroup, type BoneGroup } from '../config/dragon';
import { ACTIONS, LOCOMOTION, ONE_SHOTS, type AnimState } from './animState';

/** 骨の名前 → 部位。wingLegs の怪獣（雷翼）は、翼の腕・前腕・手首の肉球・爪を前脚に数える。 */
export function creatureBoneGroup(name: string, wingLegs: boolean): BoneGroup {
  if (wingLegs && /^wing_(arm|fore|pad|claw)_/.test(name)) return name.endsWith('_R') ? 'frontR' : 'frontL';
  return boneGroup(name);
}

interface Channel {
  bone: number;
  position: boolean;
  interp: Interpolant;
}

class ClipSampler {
  private readonly channels: Channel[] = [];

  constructor(clip: AnimationClip, index: Map<string, number>, rootBone: number) {
    for (const track of clip.tracks) {
      const dot = track.name.lastIndexOf('.');
      const bone = index.get(track.name.slice(0, dot));
      const prop = track.name.slice(dot + 1);
      if (bone === undefined) continue;
      // 位置は胴（根の骨）だけが動く。ほかの骨の位置と大きさは休みの姿勢のまま
      // createInterpolant はトラックの補間の種類（glTF の LINEAR なら回転は slerp）に合った補間器を返す。型の宣言に無いので広げて呼ぶ
      const make = (): Interpolant => (track as unknown as { createInterpolant(): Interpolant }).createInterpolant();
      if (prop === 'quaternion') this.channels.push({ bone, position: false, interp: make() });
      else if (prop === 'position' && bone === rootBone) this.channels.push({ bone, position: true, interp: make() });
    }
  }

  /** 時刻 t の回転を q（骨ごとに4つ）へ、根の位置を p へ書く。クリップに無い骨は触らない。 */
  sample(t: number, q: Float32Array, p: Float32Array): void {
    for (const c of this.channels) {
      const v = c.interp.evaluate(t);
      if (c.position) {
        p[0] = v[0];
        p[1] = v[1];
        p[2] = v[2];
      } else {
        const o = c.bone * 4;
        q[o] = v[0];
        q[o + 1] = v[1];
        q[o + 2] = v[2];
        q[o + 3] = v[3];
      }
    }
  }
}

/** dst = normalize(dst·(1-w) + src·w)（src の符号は dst にそろえる）。w は骨ごと（null なら全部 wAll）。 */
function nlerpInto(dst: Float32Array, src: Float32Array, n: number, wAll: number, perBone: Float32Array | null): void {
  for (let b = 0; b < n; b++) {
    const w = perBone ? perBone[b] * wAll : wAll;
    if (w <= 0) continue;
    const o = b * 4;
    const sign = dst[o] * src[o] + dst[o + 1] * src[o + 1] + dst[o + 2] * src[o + 2] + dst[o + 3] * src[o + 3] < 0 ? -1 : 1;
    let x = dst[o] * (1 - w) + src[o] * w * sign;
    let y = dst[o + 1] * (1 - w) + src[o + 1] * w * sign;
    let z = dst[o + 2] * (1 - w) + src[o + 2] * w * sign;
    let s = dst[o + 3] * (1 - w) + src[o + 3] * w * sign;
    const len = Math.hypot(x, y, z, s) || 1;
    x /= len;
    y /= len;
    z /= len;
    s /= len;
    dst[o] = x;
    dst[o + 1] = y;
    dst[o + 2] = z;
    dst[o + 3] = s;
  }
}

export class PosePlayer {
  readonly bones: Bone[];
  readonly index = new Map<string, number>();
  readonly root: number;
  private readonly samplers = new Map<ClipName, ClipSampler>();
  private readonly restQ: Float32Array;
  private readonly restP: Float32Array;
  private readonly q: Float32Array;
  private readonly p = new Float32Array(3);
  private readonly tmpQ: Float32Array;
  private readonly tmpP = new Float32Array(3);
  private readonly masks = new Map<string, Float32Array>();

  constructor(bones: Bone[], clips: Map<ClipName, AnimationClip>, wingLegs = false) {
    this.bones = bones;
    bones.forEach((b, i) => this.index.set(b.name, i));
    const root = this.index.get('body');
    if (root === undefined) throw new Error('竜の骨組みに body（根の骨）が無い');
    this.root = root;
    const n = bones.length;
    this.restQ = new Float32Array(n * 4);
    this.restP = new Float32Array(3);
    bones.forEach((b, i) => b.quaternion.toArray(this.restQ, i * 4));
    bones[root].position.toArray(this.restP);
    this.q = new Float32Array(n * 4);
    this.tmpQ = new Float32Array(n * 4);
    for (const [name, clip] of clips) this.samplers.set(name, new ClipSampler(clip, this.index, root));
    const M = DRAGON_MOTION.masks;
    // 地面を叩く（焔角の地上の E）は咆哮と同じ全身の上書き
    const tables: Record<string, (typeof M)[keyof typeof M]> = { ...M, stomp: M.roar };
    for (const action of Object.keys(tables)) {
      for (const where of ['ground', 'air'] as const) {
        const table = tables[action][where] as Record<BoneGroup, number>;
        const mask = new Float32Array(n);
        bones.forEach((b, i) => (mask[i] = table[creatureBoneGroup(b.name, wingLegs)]));
        this.masks.set(`${action}/${where}`, mask);
      }
    }
  }

  /** そのクリップを引けるか（GLB にあるか）。 */
  has(name: ClipName): boolean {
    return this.samplers.has(name);
  }

  private sampleInto(name: ClipName, t: number, q: Float32Array, p: Float32Array): void {
    q.set(this.restQ);
    p.set(this.restP);
    this.samplers.get(name)!.sample(t, q, p);
  }

  /** 1つのクリップの1コマを、そのまま骨に書く（撮影の姿勢）。 */
  applySingle(name: ClipName, t: number): void {
    this.sampleInto(name, t, this.q, this.p);
    this.write();
  }

  /** 重ねた姿勢を骨に書く。 */
  apply(state: AnimState): void {
    const n = this.bones.length;
    const q = this.q;
    const p = this.p;
    // 移動：重みの和が1の組を、重い順ではなく決まった順に nlerp で積む（1つ目はそのまま）
    let acc = 0;
    for (const name of LOCOMOTION) {
      const c = state.clip[name];
      if (c.weight <= 1e-4 || !this.samplers.has(name)) continue;
      if (acc === 0) {
        this.sampleInto(name, c.time, q, p);
        acc = c.weight;
        continue;
      }
      acc += c.weight;
      this.sampleInto(name, c.time, this.tmpQ, this.tmpP);
      const w = c.weight / acc;
      nlerpInto(q, this.tmpQ, n, w, null);
      for (let k = 0; k < 3; k++) p[k] += (this.tmpP[k] - p[k]) * w;
    }
    if (acc === 0) {
      q.set(this.restQ);
      p.set(this.restP);
    }
    // 一度きり（離陸・着地）は全身を上書き。技は部位の割合で上書き
    for (const name of [...ONE_SHOTS, ...ACTIONS]) {
      const c = state.clip[name];
      if (c.weight <= 1e-4 || !this.samplers.has(name)) continue;
      this.sampleInto(name, c.time, this.tmpQ, this.tmpP);
      const mask = this.masks.get(`${name}/${state.airborne ? 'air' : 'ground'}`) ?? null;
      nlerpInto(q, this.tmpQ, n, c.weight, mask);
      const wp = c.weight * (mask ? mask[this.root] : 1);
      for (let k = 0; k < 3; k++) p[k] += (this.tmpP[k] - p[k]) * wp;
    }
    this.write();
  }

  private write(): void {
    const q = this.q;
    this.bones.forEach((b, i) => b.quaternion.fromArray(q, i * 4));
    this.bones[this.root].position.fromArray(this.p);
  }
}
