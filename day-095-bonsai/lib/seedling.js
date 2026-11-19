import { RAD, UP, add, bearing, clamp, cross, direction, scale, sub, unit } from './tree-math.js';
import { appendNode, lateralHeading, padAppearance, refreshRadii } from './tree-state.js';

const PROFILES = {
  maple: { height: 3.03, reach: 0.62, tierTaper: 0.55, primaryStep: 0.138, branches: 6, nodes: [422, 494], baseRadius: [0.218, 0.240] },
  pine: { height: 2.97, reach: 0.62, tierTaper: 0.21, primaryStep: 0.130, branches: 5, nodes: [305, 375], baseRadius: [0.244, 0.260] },
  plum: { height: 3.02, reach: 0.61, tierTaper: 0.43, primaryStep: 0.143, branches: 5, nodes: [356, 430], baseRadius: [0.207, 0.236] },
};

function makeTrunk(state, pose, height, rng) {
  const count = rng.int(16, 20);
  const weights = Array.from({ length: count }, (_, i) => (1.17 - 0.36 * i / (count - 1)) * rng.range(0.92, 1.08));
  const side = rng.chance(0.5) ? 1 : -1;
  const heading = side * rng.range(63, 107) * RAD;
  const phase = rng.range(-0.35, 0.35);
  const amplitude = state.style === 'moyogi' ? rng.range(0.71, 0.94) : rng.range(0.06, 0.105);
  const lean = state.style === 'shakan' ? Math.tan(rng.range(22, 28) * RAD) : 0;
  const chain = state.nextChain++;

  // 幹の節の間隔が揺れても、一の枝と頂き側の枝を置く高さを確保する。
  const low = Math.round(count * 0.30);
  const high = Math.round(count * 0.83);
  const stations = [[low, rng.range(0.304, 0.331)], [high, rng.range(0.834, 0.861)], [count, 1]];
  const rises = [];
  let previous = 0;
  let previousFraction = 0;
  for (const [end, fraction] of stations) {
    const total = weights.slice(previous, end).reduce((sum, value) => sum + value, 0);
    for (let i = previous; i < end; i += 1) rises.push(height * (fraction - previousFraction) * weights[i] / total);
    previous = end;
    previousFraction = fraction;
  }

  let y = 0;
  for (let i = 0; i < count; i += 1) {
    const rise = rises[i];
    const t = (y + rise * 0.5) / height;
    // 低い所の大きな蛇行を先に向かって弱め、曲がる面も少しずつ回す。
    const sway = amplitude * (1 - 0.48 * t) * Math.sin(2 * Math.PI * 1.22 * t + phase);
    const az = heading + (t - 0.5) * (lean ? 0.20 : 0.78) * side;
    const dx = sway * Math.sin(az) + lean * Math.sin(heading) + rng.range(-0.035, 0.035);
    const dz = sway * Math.cos(az) + lean * Math.cos(heading) + rng.range(-0.035, 0.035);
    appendNode(state, pose, i - 1, 0, chain, [dx * rise, rise, dz * rise]);
    y += rise;
  }
  return { count, low: low - 1, high: high - 1 };
}

function trunkAt(pose, count, targetY) {
  let nearest = 0;
  for (let i = 1; i < count - 1; i += 1) {
    if (Math.abs(pose[i].end[1] - targetY) < Math.abs(pose[nearest].end[1] - targetY)) nearest = i;
  }
  return nearest;
}

function pushAwayFromFront(azimuth) {
  const az = Math.atan2(Math.sin(azimuth), Math.cos(azimuth));
  return Math.abs(az) <= 22 * RAD ? azimuth + (az >= 0 ? 40 : -40) * RAD : azimuth;
}

function roomy(center, radius, tips) {
  return tips.every((tip) => {
    const gap = 0.45 * (radius + tip.radius) + 0.002;
    const [dx, dy, dz] = sub(center, tip.center);
    return dx * dx + dy * dy + dz * dz >= gap * gap;
  });
}

function keepInCrown(origin, offset, envelope, radius) {
  let compression = 1;
  for (const axis of [0, 2]) {
    const sign = Math.sign(offset[axis]);
    if (sign) {
      const limit = envelope.center[axis] + sign * (envelope.halfWidth - radius);
      compression = Math.min(compression, (limit - origin[axis]) / offset[axis]);
    }
  }
  return clamp(compression, 0.30, 1);
}

const crownY = (y, radius, { height }) => clamp(y, 0.68 * radius + 0.06, height - 0.68 * radius - 0.025);

function makePrimary(state, pose, base, az, tier, defect, profile, envelope, tips, rng) {
  const { end: origin, forward } = pose[base];
  const chain = state.nextChain++;
  const { radius } = padAppearance(state.species, state.seed, chain, 1);
  const length = envelope.height * profile.reach * (1 - profile.tierTaper * tier) * (defect === 'long' ? rng.range(1.15, 1.24) : rng.range(0.96, 1.04));
  // 枝を短くした分だけ節を詰め、副枝の数と剪定できる間隔を保つ。
  const count = Math.max(5, Math.round(length / profile.primaryStep));
  const pitch = (rng.range(5, 11) + 30 * tier + (defect === 'upright' ? 7 : 0)) * RAD;
  const horizontal = forward[0] * Math.sin(az) + forward[2] * Math.cos(az);
  // 幹が傾いても、枝が幹から出る角度と正面を避ける方位を両方保つ。
  const departure = Math.asin(clamp(Math.sin(pitch) / Math.hypot(horizontal, forward[1]), -1, 1)) - Math.atan2(horizontal, forward[1]);
  const sweep = rng.range(-0.38, 0.38);
  const offsets = [];
  let offset = [0, 0, 0];
  for (let j = 0; j < count; j += 1) {
    const t = j / (count - 1);
    const turn = az + sweep * Math.sin(Math.PI * 0.83 * t) + (j ? rng.range(-0.046, 0.046) : 0);
    let rise;
    if (state.species === 'pine') {
      rise = departure * (1 - t) ** 3 - 0.25 * Math.sin(Math.PI * t) + 0.30 * t ** 5;
    } else if (state.species === 'plum') {
      const kink = j === 0 ? 0 : rng.range(-0.17, 0.17) + (j % 2 ? -0.07 : 0.07);
      rise = departure * (1 - t) ** 3 + 0.10 * t + kink;
    } else {
      rise = departure * (1 - t) ** 3 + 0.095 * Math.sin(Math.PI * t) - 0.044 * t;
    }
    const segment = length * (1.12 - 0.24 * t) / count;
    offset = add(offset, scale(direction(turn, rise), segment));
    offsets.push(offset);
  }

  const first = offsets[0];
  const squash = keepInCrown(add(origin, first), sub(offset, first), envelope, radius);
  const tipOffset = [first[0] + (offset[0] - first[0]) * squash, offset[1], first[2] + (offset[2] - first[2]) * squash];
  const naturalTip = add(origin, tipOffset);
  const levelTip = [naturalTip[0], crownY(naturalTip[1], radius, envelope), naturalTip[2]];
  const center = roomy(levelTip, radius, tips) ? levelTip : findCrownTip(
    origin, bearing(tipOffset), Math.hypot(tipOffset[0], tipOffset[2]), tipOffset[1], radius, envelope, tips,
  ) ?? levelTip;
  const adjustment = sub(center, naturalTip);
  const members = [];
  let parent = base;
  for (let j = 0; j < count; j += 1) {
    const [x, y, z] = offsets[j];
    const t = j / (count - 1);
    const path = [first[0] + (x - first[0]) * squash, y, first[2] + (z - first[2]) * squash];
    const point = add(origin, add(path, scale(adjustment, t ** 2)));
    // 一の枝は出だしの角度を保ったまま持ち上げ、下幹の高さに副枝が垂れないようにする。
    if (tier === 0) point[1] += Math.max(0, envelope.floor + 0.055 - point[1]) * Math.min(1, j / 3);
    parent = appendNode(state, pose, parent, 1, chain, sub(point, pose[parent].end));
    members.push(parent);
  }
  return { members, radius };
}

function findCrownTip(origin, az, length, lift, radius, envelope, tips) {
  // まず枝なりに置く。葉先が重なるときだけ横に広げ、それでも狭ければ高さをずらす。
  for (const dy of [0, 0.13, -0.13, 0.26, -0.27, -0.44, 0.41, -0.59]) {
    for (const size of [1, 1.16, 1.34, 0.86, 1.57, 1.84, 2.13]) {
      for (const yaw of [0, 12, -12, 25, -25, 44, -44, 68, -68]) {
        const angle = az + yaw * RAD;
        const dx = Math.sin(angle) * length * size;
        const dz = Math.cos(angle) * length * size;
        const squash = keepInCrown(origin, [dx, 0, dz], envelope, radius);
        const center = [origin[0] + dx * squash, crownY(origin[1] + lift + dy, radius, envelope), origin[2] + dz * squash];
        if (roomy(center, radius, tips)) return center;
      }
    }
  }
  return null;
}

function shootSteps(heading, length, count, bend) {
  const across = cross(UP, heading);
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const sweep = bend.sweep * Math.sin(Math.PI * t * 0.72) + bend.kink * Math.sin(3 * Math.PI * t);
    const rise = bend.curl * t ** 2;
    const forward = unit(add(heading, add(scale(across, sweep), [0, rise, 0])));
    return scale(forward, length * (1.14 - 0.28 * t) / count);
  });
}

function shootBend(species, rng) {
  return {
    sweep: rng.range(-0.23, 0.23),
    curl: rng.range(0.16, 0.31),
    kink: species === 'plum' ? rng.range(-0.14, 0.14) : 0,
  };
}

function shootTip(origin, steps, radius, envelope, tips) {
  if (origin[1] < envelope.floor || origin[1] > envelope.height) return null;
  let center = origin;
  for (const step of steps) {
    center = add(center, step);
    if (center[1] < envelope.floor || center[1] > envelope.height) return null;
  }
  if (keepInCrown(origin, sub(center, origin), envelope, radius) < 1 || !roomy(center, radius, tips)) return null;
  return { center, radius };
}

function planLateral(state, pose, base, remaining, progress, side, angle, envelope, tips, rng) {
  const { end: origin, forward } = pose[base];
  const chain = state.nextChain;
  const { radius } = padAppearance(state.species, state.seed, chain, 2);
  const ratio = rng.range(0.35, 0.45) - 0.09 * progress;
  const lift = rng.range(-0.40, 0.61);
  const roll = side > 0 ? lift : Math.PI - lift;
  const bend = shootBend(state.species, rng);
  // 葉の塊を置く空きを探すときも、親に対する開きと枝の長さの範囲は守る。
  for (const fraction of [ratio, 0.25, 0.45]) {
    for (const turn of [0, 28, -28, 56, -56, 90, -90, 145, -145, 180]) {
      const heading = lateralHeading(forward, angle, roll + turn * RAD);
      const steps = shootSteps(heading, remaining * fraction, 8, bend);
      const tip = shootTip(origin, steps, radius, envelope, tips);
      if (tip) {
        state.nextChain += 1;
        tips.push(tip);
        return { base, origin, chain, remaining, steps, tip, forks: [] };
      }
    }
  }
  return null;
}

function planFork(state, lateral, envelope, tips, rng) {
  const neighbors = tips.filter((tip) => tip !== lateral.tip);
  const chain = state.nextChain;
  const radii = [chain, chain + 1].map((id) => padAppearance(state.species, state.seed, id, 3).radius);
  const roll = rng.range(-0.35, 0.35);
  const bend = shootBend(state.species, rng);
  // 先端の近くで二手に分ける。枝の途中で葉の塊が重なる苗には、二又を押し込まない。
  for (const split of [5, 4, 3]) {
    const stem = lateral.steps.slice(0, split);
    const origin = stem.reduce(add, lateral.origin);
    const forward = unit(stem.at(-1));
    const stemLength = routeLength(stem);
    const tail = routeLength(lateral.steps.slice(split));
    const maxArm = Math.min(lateral.remaining * 0.45 - stemLength, stemLength * 1.48);
    const minArm = lateral.remaining * 0.25 - stemLength;
    for (const length of [tail, maxArm]) {
      if (length * 1.6 < 0.45 * (radii[0] + radii[1])) continue;
      for (const turn of [0, 30, -30, 60, -60, 90, -90]) {
        for (const lift of [0, 0.33]) {
          const arms = radii.map((radius, i) => {
            const phase = roll + turn * RAD + (i === 0 ? lift : Math.PI - lift);
            const heading = lateralHeading(forward, (46 + i * 3) * RAD, phase);
            const steps = shootSteps(heading, i === 0 ? length : Math.max(minArm, length * 0.94), 5, bend);
            return { chain: chain + i, steps, tip: shootTip(origin, steps, radius, envelope, neighbors) };
          });
          if (arms[0].tip && arms[1].tip && roomy(arms[0].tip.center, radii[0], [arms[1].tip])) {
            lateral.steps = stem;
            lateral.forks = arms;
            state.nextChain += 2;
            const index = tips.indexOf(lateral.tip);
            tips.splice(index, 1, arms[0].tip, arms[1].tip);
            return true;
          }
        }
      }
    }
  }
  return false;
}

const routeLength = (steps) => steps.reduce((sum, step) => sum + Math.hypot(...step), 0);

function appendLaterals(state, pose, laterals, target) {
  const routes = laterals.flatMap((lateral) => [lateral, ...lateral.forks]);
  const length = routes.reduce((sum, { steps }) => sum + routeLength(steps), 0);
  const stepSize = length / (target - state.nodes.length);
  function appendRoute(parent, order, { chain, steps }) {
    for (const step of steps) {
      const parts = Math.max(1, Math.round(Math.hypot(...step) / stepSize));
      const segment = scale(step, 1 / parts);
      for (let i = 0; i < parts; i += 1) parent = appendNode(state, pose, parent, order, chain, segment);
    }
    return parent;
  }
  // 短い枝を増やすと裸木が過密になる。長い枝に多めの節を割り振り、剪定できる位置を残す。
  for (const lateral of laterals) {
    const tip = appendRoute(lateral.base, 2, lateral);
    for (const fork of lateral.forks) appendRoute(tip, 3, fork);
  }
}

function arrangeLaterals(state, pose, primaries, envelope, primaryTips, rng) {
  const firstChain = state.nextChain;
  let best;
  // 大きな葉の塊は、先に選んだ枝の向きに配置を左右されるので、空きが足りない時だけ別の種で試す。
  for (let attempt = 0; attempt < 12; attempt += 1) {
    state.nextChain = firstChain;
    const tips = primaryTips.slice();
    const laterals = [];
    for (const [i, { members }] of primaries.entries()) {
      const branchRng = rng.fork(attempt === 0 ? `laterals:${i}` : `laterals:${i}:${attempt}`);
      const remainingLengths = new Float64Array(members.length);
      for (let j = members.length - 2; j >= 0; j -= 1) {
        remainingLengths[j] = remainingLengths[j + 1] + state.nodes[members[j + 1]].length;
      }
      let side = branchRng.chance(0.5) ? -1 : 1;
      let previousAngle = 51;
      for (let j = branchRng.int(i === 0 ? 1 : 0, 2); j < members.length - 1; j += branchRng.int(2, 3)) {
        const progress = j / (members.length - 1);
        const angle = Math.min(previousAngle - 1, branchRng.range(43, 50) - 23 * progress);
        const lateral = planLateral(state, pose, members[j], remainingLengths[j], progress, side, angle * RAD, envelope, tips, branchRng);
        if (!lateral) continue;
        laterals.push(lateral);
        previousAngle = angle;
        if (branchRng.chance(0.6)) side *= -1;
      }
    }

    const forkCount = Math.round(laterals.length * 0.15);
    let forks = 0;
    for (const lateral of laterals) {
      if (forks === forkCount) break;
      if (planFork(state, lateral, envelope, tips, rng.fork(`fork:${attempt}:${lateral.chain}`))) forks += 1;
    }
    const cost = Math.max(0, 15 - tips.length) + Math.max(0, Math.ceil(laterals.length * 0.10) - forks);
    if (cost === 0) return laterals;
    if (!best || cost < best.cost) best = { cost, laterals, nextChain: state.nextChain };
  }
  state.nextChain = best.nextChain;
  return best.laterals;
}

export function growSeedling(state) {
  const profile = PROFILES[state.species];
  const rng = state.rng.fork(`seedling:${state.species}:${state.style}`);
  const height = profile.height * rng.range(0.95, 1.045);
  const pose = [];
  const trunk = makeTrunk(state, pose, height, rng.fork('trunk'));
  const envelope = {
    height, floor: pose[trunk.low].end[1], center: pose[trunkAt(pose, trunk.count, height * 0.51)].end, halfWidth: height * 0.73,
  };
  const primaries = [];
  const apex = trunk.count - 1;
  const { radius } = padAppearance(state.species, state.seed, state.nodes[apex].chain, 0);
  // 最上段の枝や小枝を置く前に、頂きの葉の空きを取っておく。
  const tips = [{ center: pose[apex].end, radius }];
  const longAt = rng.int(1, profile.branches - 2);
  const uprightAt = rng.chance(0.67) ? 1 + (longAt + 1) % (profile.branches - 2) : -1;

  let az = (rng.chance(0.5) ? -1 : 1) * rng.range(62, 105) * RAD;
  for (let i = 0; i < profile.branches; i += 1) {
    const tier = i / (profile.branches - 1);
    const branchRng = rng.fork(`primary:${i}`);
    const target = height * (rng.range(0.302, 0.335) + tier * 0.525);
    const base = i === 0 ? trunk.low : (i === profile.branches - 1 ? trunk.high : trunkAt(pose, trunk.count, target));
    const defect = i === longAt ? 'long' : (i === uprightAt ? 'upright' : '');
    const primary = makePrimary(state, pose, base, pushAwayFromFront(az), tier, defect, profile, envelope, tips, branchRng);
    const tip = primary.members[primary.members.length - 1];
    tips.push({ center: pose[tip].end, radius: primary.radius });
    primaries.push(primary);
    az += (137.5 + rng.range(-15, 15)) * RAD;
  }

  const laterals = arrangeLaterals(state, pose, primaries, envelope, tips, rng);
  appendLaterals(state, pose, laterals, rng.int(...profile.nodes));

  refreshRadii(state, 0, rng.range(...profile.baseRadius));
}
