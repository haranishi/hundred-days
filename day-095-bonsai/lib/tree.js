import { dateOf } from './calendar.js';
import { DEFAULTS, MAX_NODES, NODE_FLAG, SPECIES_IDS, STYLE_IDS } from './contract.js';
import { branchSegment, indexOfId, subtreeIndices } from './pick.js';
import { growSeedling } from './seedling.js';
import { advanceState } from './tree-growth.js';
import {
  IDENTITY, ORIGIN, RAD, axisAngle, clamp, conjugate, multiplyQuat, normalizeQuat, rotationArc, sub, unit,
} from './tree-math.js';
import { readTreeState, saveTreeState } from './tree-save.js';
import { makeSnapshot, sameSkeleton } from './tree-snapshot.js';
import { MAX_DAY, copyState, isTip, modelNumber, newState, poseNodes, topology } from './tree-state.js';

const MIN_BEND_DEG = 3;
const validDay = (day) => Number.isSafeInteger(day) && day >= 0 && day <= MAX_DAY;
const fail = (reason, message) => ({ ok: false, reason, message });
const missing = () => fail('missing-node', '枝が見つかりません。もう一度選びましょう');
const vec3 = (v) => v?.length === 3 && Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);

class Tree {
  #state;
  #cache = null;
  #snapshotPending = true;
  #bend = null;

  constructor(state) { this.#state = state; }

  get species() { return this.#state.species; }
  get style() { return this.#state.style; }
  get seed() { return this.#state.seed; }
  get day() { return this.#state.day; }
  get moisture() { return this.#state.moisture; }
  get nodeCount() { return this.#state.nodes.length; }

  snapshot() {
    if (this.#snapshotPending) {
      const next = makeSnapshot(this.#state, this.#bend?.preview);
      if (!this.#cache || !sameSkeleton(next, this.#cache)) this.#cache = next;
      this.#snapshotPending = false;
    }
    return this.#cache;
  }

  date() { return dateOf(this.day); }
  clone() { return new Tree(copyState(this.#state)); }
  toJSON() { return saveTreeState(this.#state); }

  advance(days) {
    if (!validDay(days) || !validDay(this.day + days)) throw new RangeError('進める日数は範囲内の整数です');
    const day = this.day + days;
    if (days === 0) return { ticks: 0, born: 0, day, changed: false };
    const previewChanged = Boolean(this.#bend?.preview && this.snapshot() !== this.#bend.base);
    this.#bend?.cancel();
    const { changed, ticks, born } = advanceState(this.#state, day);
    this.#snapshotPending ||= changed;
    return { ticks, born, day, changed: changed || previewChanged };
  }

  water(amount01) {
    if (Number.isFinite(amount01)) {
      this.#state.moisture = modelNumber(Math.min(1, this.moisture + clamp(amount01, 0, 1)));
    }
  }

  #planCut(id) {
    const skel = this.#bend?.base ?? this.snapshot();
    const index = indexOfId(skel, id);
    if (index < 0) return { result: missing() };
    if (skel.order[index] === 0) {
      let trunkHeight = 0;
      for (let i = 0; i < skel.count; i += 1) {
        if (skel.order[i] === 0) trunkHeight = Math.max(trunkHeight, skel.end[i * 3 + 1]);
      }
      if (skel.start[index * 3 + 1] <= trunkHeight * 0.55) {
        return { result: fail('trunk-thick', '幹の下の方は切れません。枝か幹の先を選びましょう') };
      }
    }
    const removed = subtreeIndices(skel, index);
    const parent = skel.parent[index];
    return { removed, parent, result: { ok: true, removedIds: Array.from(removed, (i) => skel.ids[i]), parentId: skel.ids[parent] } };
  }

  canCut(id) { return this.#planCut(id).result; }

  cut(id) {
    const { result, removed, parent } = this.#planCut(id);
    if (!result.ok) return result;
    this.#bend?.cancel();
    const { nodes } = this.#state;
    const skip = new Uint8Array(nodes.length);
    for (const i of removed) skip[i] = 1;
    const indexForOld = new Int32Array(nodes.length);
    const kept = [];
    nodes[parent].flags |= NODE_FLAG.CUT;
    nodes[parent].scarAge = 0;

    // 添字だけを振り直す。残った節のID・局所姿勢・太さはそのまま残す。
    for (let i = 0; i < nodes.length; i += 1) {
      if (skip[i]) continue;
      const node = nodes[i];
      if (node.parent >= 0) node.parent = indexForOld[node.parent];
      indexForOld[i] = kept.length;
      kept.push(node);
    }
    this.#state.nodes = kept;
    this.#snapshotPending = true;
    return result;
  }

  #planPinch(id) {
    const { nodes } = this.#state;
    const index = nodes.findIndex((node) => node.id === id);
    if (index < 0) return { result: missing() };
    if (nodes[index].order === 0 && nodes[index].r0 > 0.065) {
      return { result: fail('trunk-thick', '太い幹では芽を摘めません。細い枝先を選びましょう') };
    }
    const links = topology(nodes);
    let tip = index;
    if (!isTip(nodes, links, index)) {
      // 副枝から小枝に移る箇所でも、唯一の子が先端ならそこを摘める。
      tip = links.children[index] === 1 ? nodes.findIndex((node) => node.parent === index) : links.continuation[index];
    }
    if (tip < 0 || !isTip(nodes, links, tip)) {
      return { result: fail('not-tip', '枝の途中では芽を摘めません。枝先を選びましょう') };
    }
    if (nodes[tip].flags & NODE_FLAG.PINCHED) {
      return { result: fail('already-pinched', 'この芽は摘んであります。時を進めて新しい芽を待ちましょう') };
    }
    return { tip, result: { ok: true } };
  }

  canPinch(id) { return this.#planPinch(id).result; }

  pinch(id) {
    const { tip, result } = this.#planPinch(id);
    if (!result.ok) return result;
    this.#bend?.cancel();
    this.#state.nodes[tip].flags |= NODE_FLAG.PINCHED;
    this.#snapshotPending = true;
    return { ok: true, capped: this.nodeCount >= MAX_NODES - 6 };
  }

  canBend(id) {
    const node = this.#state.nodes.find((item) => item.id === id);
    if (!node) return missing();
    if (node.order === 0 && (node.parent === -1 || node.r0 >= 0.19)) {
      return fail('trunk-thick', '太い幹は曲げられません。細い枝を選びましょう');
    }
    const maxAngleDeg = 110 * Math.exp(-14 * Math.max(0, node.r0 - 0.020));
    if (maxAngleDeg < MIN_BEND_DEG) return fail('trunk-thick', 'この枝は太くて曲げられません。細い枝を選びましょう');
    return { ok: true, maxAngleDeg };
  }

  beginBend(id) {
    const allowed = this.canBend(id);
    if (!allowed.ok) return allowed;
    this.#bend?.cancel();
    const base = this.snapshot();
    const index = indexOfId(base, id);
    const { nodes } = this.#state;
    const node = nodes[index];
    const pose = poseNodes(nodes);
    const pivot = pose[node.parent]?.end ?? ORIGIN;
    const parentInverse = conjugate(pose[node.parent]?.q ?? IDENTITY);
    const baseWorld = pose[index].q;
    const bend = { base, preview: null, cancel: restoreBase };
    let angleDeg = 0;

    const tree = this;
    function restoreBase() {
      if (tree.#bend !== bend) return;
      tree.#bend = null;
      tree.#cache = base;
      tree.#snapshotPending = false;
    }
    this.#bend = bend;

    return {
      update(grabPoint, targetPoint) {
        if (tree.#bend !== bend || !vec3(grabPoint) || !vec3(targetPoint)) return { angleDeg: 0, clamped: false };
        const grab = sub(grabPoint, pivot);
        const target = sub(targetPoint, pivot);
        const arc = Math.hypot(...grab) > 1e-9 && Math.hypot(...target) > 1e-9
          ? rotationArc(unit(grab), unit(target))
          : { angle: 0 };
        angleDeg = Math.min(arc.angle / RAD, allowed.maxAngleDeg);
        const limited = angleDeg * RAD;
        if (limited === 0) {
          bend.preview = null;
          tree.#cache = base;
          tree.#snapshotPending = false;
        } else {
          // 開始時の世界の姿勢に最短弧を掛け、親から見た局所姿勢に戻す。
          const world = multiplyQuat(axisAngle(arc.axis, limited), baseWorld);
          const local = normalizeQuat(multiplyQuat(parentInverse, world)).map(modelNumber);
          if (!bend.preview || local.some((v, i) => v !== bend.preview.local[i])) {
            bend.preview = { index, local };
            tree.#snapshotPending = true;
          }
        }
        return { angleDeg, clamped: arc.angle - limited > 1e-12 };
      },
      commit() {
        if (tree.#bend !== bend) return { ok: false, changed: false };
        if (angleDeg < MIN_BEND_DEG || !bend.preview) {
          restoreBase();
          return { ok: true, changed: false };
        }
        node.local = bend.preview.local;
        for (const i of branchSegment(base, index)) {
          tree.#snapshotPending ||= !(nodes[i].flags & NODE_FLAG.WIRED) || nodes[i].wireAge !== 0;
          nodes[i].flags |= NODE_FLAG.WIRED;
          nodes[i].wireAge = 0;
        }
        tree.#bend = null;
        return { ok: true, changed: true };
      },
      cancel: restoreBase,
    };
  }

  unwire(id) {
    const { nodes } = this.#state;
    let index = nodes.findIndex((node) => node.id === id);
    if (index < 0 || !(nodes[index].flags & NODE_FLAG.WIRED)) return { ok: false };
    this.#bend?.cancel();
    const chain = nodes[index].chain;
    for (let parent = nodes[index].parent; parent >= 0 && nodes[parent].chain === chain && (nodes[parent].flags & NODE_FLAG.WIRED); parent = nodes[index].parent) {
      index = parent;
    }
    for (const i of branchSegment(this.snapshot(), index)) {
      if (!(nodes[i].flags & NODE_FLAG.WIRED)) break;
      nodes[i].flags &= ~NODE_FLAG.WIRED;
      nodes[i].wireAge = 0;
    }
    this.#snapshotPending = true;
    return { ok: true };
  }
}

export function createTree({ species = DEFAULTS.species, style = DEFAULTS.style, seed = 11, day = 0 } = {}) {
  if (!SPECIES_IDS.includes(species) || !STYLE_IDS.includes(style) || !Number.isSafeInteger(seed) || !validDay(day)) {
    throw new RangeError('苗の樹種・樹形・種・日付を確認してください');
  }
  const state = newState(species, style, seed >>> 0, day);
  growSeedling(state);
  return new Tree(state);
}

export function restoreTree(json) {
  return new Tree(readTreeState(json));
}
