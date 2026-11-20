import { dateOf } from './calendar.js';
import { MAX_NODES, NODE_FLAG } from './contract.js';
import { createRng } from './rng.js';
import { RAD, clamp, scale } from './tree-math.js';
import { padExtent, verticalRange } from './tree-snapshot.js';
import {
  GROWTH_HEIGHT_FACTOR, GROWTH_NODE_FACTOR, GROWTH_WEEKS, MAX_AGE,
  appendNode, copyState, isTip, lateralHeading, modelNumber, padAppearance, poseNodes, previousWire, refreshRadii, topology,
} from './tree-state.js';

const SEASONAL_GROWTH = {
  maple: [0, 0, 0.27, 0.64, 0.96, 0.83, 0.63, 0.40, 0.25, 0.13, 0.035, 0],
  pine: [0, 0, 0.18, 0.53, 0.86, 0.95, 0.66, 0.38, 0.24, 0.14, 0.04, 0],
  plum: [0, 0, 0.33, 0.74, 0.96, 0.74, 0.50, 0.31, 0.19, 0.10, 0.03, 0],
};

function ageMarks(nodes, weeks) {
  let changed = false;
  let wireAt;
  let wireCount = 0;
  let saturated;
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node.flags & NODE_FLAG.FRESH) {
      node.flags &= ~NODE_FLAG.FRESH;
      changed = true;
    }
    if (node.flags & NODE_FLAG.CUT && node.scarAge < MAX_AGE) {
      node.scarAge = Math.min(MAX_AGE, node.scarAge + weeks);
      changed = true;
    }
    if (node.flags & NODE_FLAG.WIRED) {
      wireAt ??= new Uint16Array(nodes.length);
      const previous = previousWire(nodes, wireAt, i);
      if (!previous) wireCount += 1;
      const head = previous || i + 1;
      wireAt[i] = head;
      if (node.wireAge === MAX_AGE) (saturated ??= new Set()).add(head);
      else node.wireAge = Math.min(MAX_AGE, node.wireAge + weeks);
    }
  }
  // 経路の表示には最も古い区間の週数を使う。
  return changed || wireCount > (saturated?.size ?? 0);
}

function addShoots(state, pose, plan) {
  const { nodes } = state;
  const before = nodes.length;
  const links = topology(nodes);
  const { week, coefficient, min, max } = plan;
  let { space } = plan;
  const extension = week.fork('extension');
  const pinch = week.fork('pinch');
  const scar = week.fork('scar');
  const density = Math.min(1, Math.sqrt(space / 220));
  let lowestPrimary = Infinity;
  for (const node of nodes) {
    if (node.order === 1 && nodes[node.parent].order === 0) lowestPrimary = Math.min(lowestPrimary, node.parent);
  }
  const trunkFloor = pose[lowestPrimary]?.end[1] ?? -Infinity;

  function fitShoot(parent, order, chain, step) {
    const { radius } = padAppearance(state.species, state.seed, chain, order);
    const extent = padExtent(radius, 1);
    const y = pose[parent].end[1];
    const floor = order >= 2 && y >= trunkFloor ? Math.max(min + extent, trunkFloor) : min + extent;
    const ceiling = max - extent;
    const end = y + step[1];
    if (end >= floor && end <= ceiling) return step;
    if (step[1] === 0) return null;
    const bound = step[1] > 0 ? ceiling : floor;
    const fraction = clamp((bound - y) / step[1], 0, 1);
    const shortened = scale(step, fraction);
    const nextY = y + shortened[1];
    if (nextY < floor - 1e-9 || nextY > ceiling + 1e-9 || Math.hypot(...shortened) < 0.002) return null;
    return shortened;
  }

  function shoot(parent, order, chain, step) {
    const born = appendNode(state, pose, parent, order, chain, step);
    nodes[born].flags |= NODE_FLAG.FRESH;
    space -= 1;
  }

  // 摘んだ芽は、新芽を伸ばす抽選より先に空きのある週で分岐させる。
  for (let i = 0; i < before && space >= 2; i += 1) {
    const node = nodes[i];
    if (!(node.flags & NODE_FLAG.PINCHED) || !isTip(nodes, links, i)) continue;
    const forward = pose[i].forward;
    const lift = pinch.range(0.2, 0.8);
    const shoots = [];
    let chain = state.nextChain;
    for (const side of [-1, 1]) {
      const leader = node.order === 0 && side === -1;
      const angle = leader ? pinch.range(6, 16) : pinch.range(26, 46);
      const heading = lateralHeading(forward, angle * RAD, side < 0 ? Math.PI - lift : lift);
      const step = scale(heading, pinch.range(0.046, 0.080));
      const order = leader ? 0 : Math.min(6, node.order + 1);
      const id = leader ? node.chain : chain++;
      const fitted = fitShoot(i, order, id, step);
      if (fitted) shoots.push({ order, id, step: fitted });
    }
    if (shoots.length !== 2) continue;
    for (const { order, id, step } of shoots) shoot(i, order, id, step);
    state.nextChain = chain;
    node.flags &= ~NODE_FLAG.PINCHED;
    links.children[i] += 2;
    if (node.order === 0) links.continuation[i] = nodes.length - 2;
  }

  for (let i = 0; i < before && space > 0; i += 1) {
    const node = nodes[i];
    if (node.flags & NODE_FLAG.PINCHED || !isTip(nodes, links, i)) continue;
    if (!extension.chance((node.order === 0 ? 0.66 : 0.55) * coefficient * density)) continue;
    // 伸び継ぐ節の開きを抑え、小枝の先が少しずつ上へそるようにする。
    const heading = lateralHeading(pose[i].forward, extension.range(2, 13) * RAD, extension.range(-0.36, 3.5));
    const length = node.order >= 2 ? extension.range(0.034, 0.063) : extension.range(0.043, 0.074);
    const step = fitShoot(i, node.order, node.chain, scale(heading, length));
    if (step) shoot(i, node.order, node.chain, step);
  }

  for (let i = 0; i < before && space > 0; i += 1) {
    const node = nodes[i];
    if (!(node.flags & NODE_FLAG.CUT) || node.scarAge > 16 || !scar.chance(0.11 * coefficient * density)) continue;
    let parent = i;
    const distance = scar.int(0, 2);
    for (let j = 0; j < distance && nodes[parent].parent >= 0; j += 1) parent = nodes[parent].parent;
    // 剪定跡から根元側へ戻る抽選でも、一の枝より下の幹は芽を出さない。
    if (nodes[parent].order === 0 && parent < lowestPrimary) continue;
    // 空きが足りずに待っている芽摘みは、胴吹きの芽で上書きしない。
    if (nodes[parent].flags & NODE_FLAG.PINCHED) continue;
    const lift = scar.range(0.34, 0.98);
    const roll = scar.chance(0.5) ? lift : Math.PI - lift;
    const heading = lateralHeading(pose[parent].forward, scar.range(25, 50) * RAD, roll);
    const order = Math.min(6, nodes[parent].order + 1);
    const step = fitShoot(parent, order, state.nextChain, scale(heading, scar.range(0.046, 0.086)));
    if (step) shoot(parent, order, state.nextChain++, step);
  }
  return nodes.length - before;
}

function discardOldGrowth(state, week) {
  while (state.growth.length && state.growth[0][0] <= week - GROWTH_WEEKS) state.growth.shift();
}

const heightOf = ({ min, max }) => max - min;

function planWeek(state, week, range, coefficient, capacity) {
  discardOldGrowth(state, week);
  // 編集の前後で幹の高さや節数が変わっても、成長そのものが使った倍率を直近52週に足し戻せない。
  let heightUsed = 1;
  let nodesUsed = 1;
  for (const [, height, nodes] of state.growth) {
    heightUsed *= height;
    nodesUsed *= nodes;
  }
  const count = state.nodes.length;
  const space = Math.max(0, Math.min(capacity, Math.floor(count * GROWTH_NODE_FACTOR / nodesUsed + 1e-9) - count));
  const height = heightOf(range);
  const limit = height * Math.max(1, (GROWTH_HEIGHT_FACTOR - 1e-10) / heightUsed);
  const extra = limit - height;
  // 太さの更新にも余白を残す。成長の大半は上向きなので上側に多く配る。
  const shootRoom = extra - Math.min(extra * 0.20, 0.002);
  const plan = { space, coefficient, min: range.min - 0.10 * shootRoom, max: range.max + 0.90 * shootRoom, limit };
  if (space) {
    plan.week = createRng(state.rng.state());
    state.rng.next();
  }
  return plan;
}

function proposeGrowth(state, pose, range, plan, thickness) {
  const next = copyState(state);
  const nextPose = plan.space ? pose.slice() : pose;
  const added = plan.space ? addShoots(next, nextPose, plan) : 0;
  const radii = refreshRadii(next, thickness);
  const nextRange = added || radii.visible ? verticalRange(next, nextPose) : range;
  if (heightOf(nextRange) > plan.limit) return null;
  return { next, pose: nextPose, range: nextRange, added, radii };
}

export function advanceState(state, day) {
  const first = Math.floor(state.day / 7);
  const last = Math.floor(day / 7);
  let changed = false;
  let born = 0;
  let pose;
  let range;

  for (let week = first + 1; week <= last; week += 1) {
    changed = ageMarks(state.nodes, 1) || changed;
    const { month } = dateOf(week * 7);
    const season = SEASONAL_GROWTH[state.species][month - 1];
    const coefficient = season * (0.65 + 0.35 * Math.min(1, state.moisture / 0.6));
    state.moisture = modelNumber(Math.max(0, state.moisture - (season ? 0.018 : 0.010)));
    if (!coefficient) continue;

    const count = state.nodes.length;
    const capacity = Math.min(MAX_NODES - count, 0x80000000 - state.nextId, 0x80000000 - state.nextChain);
    pose ??= poseNodes(state.nodes);
    range ??= verticalRange(state, pose);
    const plan = planWeek(state, week, range, coefficient, capacity);
    let growth = proposeGrowth(state, pose, range, plan, coefficient);
    if (!growth && plan.space) {
      // 新芽と肥大を合わせると高さが足りない週は、片方ずつなら収まるか確かめる。
      growth = proposeGrowth(state, pose, range, plan, 0)
        ?? proposeGrowth(state, pose, range, { ...plan, space: 0 }, coefficient);
    }
    if (!growth) continue;
    const { next, added, radii } = growth;
    const heightGain = heightOf(growth.range) / heightOf(range);
    if (heightGain > 1 || added) state.growth.push([week, Math.max(1, heightGain), next.nodes.length / count]);
    state.nodes = next.nodes;
    state.nextId = next.nextId;
    state.nextChain = next.nextChain;
    pose = growth.pose;
    range = growth.range;
    born += added;
    changed ||= added > 0 || radii.visible;
    if (capacity === 0 && coefficient > 0.5 && !radii.changed && state.moisture === 0) {
      // 伸びる場所も太る余地もなくなった後は、残りの週を傷と針金にまとめて足せる。
      if (week < last) changed = ageMarks(state.nodes, last - week) || changed;
      break;
    }
  }
  discardOldGrowth(state, last);
  state.day = day;
  return { changed, ticks: last - first, born };
}
