/* 木の形を決める純関数。DOMには触れない。
   ステップ k の追加は hash(seed, k) の乱数列だけを使い、既にある要素は書き換えない。
   だから generatePlant(seed, n) は generatePlant(seed, n+1) の先頭部分になる（widthを除く）。 */

const MIN_X = 0.06;
const MAX_X = 0.94;
const MIN_Y = 0.06;
const MAX_Y = 0.80;
const SOIL_Y = 0.80;
const BASE_X = 0.5;
/* 樹冠のシルエット。どの枝もこの楕円の内側に収める。 */
const CROWN = { x: 0.5, y: 0.45, rx: 0.36, ry: 0.38 };
/* 幹（リーダー）の節の数と、枝・花の打ち止め。 */
const MAX_LEADER = 17;
const MAX_SEGMENTS = 86;
const MAX_FLOWERS = 30;
const TOP_Y = 0.24;
/* 横枝を出す一番下の節。ここより下は幹だけにして、樹冠を持ち上げる。 */
const FIRST_LATERAL = 3;

function hash(seed, step) {
  let value = (seed ^ Math.imul(step, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0 || 0x6d2b79f5;
}

function randomFor(seed, step) {
  let state = hash(seed, step);
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const angleOf = (segment) => Math.atan2(segment.y2 - segment.y1, segment.x2 - segment.x1);
const leadersOf = (segments) => segments.filter((segment) => segment.kind === 'leader');

function childCounts(segments) {
  const counts = new Array(segments.length).fill(0);
  for (const segment of segments) if (segment.parent !== null) counts[segment.parent] += 1;
  return counts;
}

/* (x, y) から angle 方向へ、楕円の内側に留まれる最大の長さ。起点が外なら制限しない。 */
function reach(x, y, angle, crown) {
  const u = (x - crown.x) / crown.rx;
  const v = (y - crown.y) / crown.ry;
  const from = u * u + v * v;
  if (from >= 1) return Infinity;
  const a = Math.cos(angle) / crown.rx;
  const b = Math.sin(angle) / crown.ry;
  const qa = a * a + b * b;
  if (qa < 1e-9) return Infinity;
  const qb = 2 * (u * a + v * b);
  const disc = Math.max(0, qb * qb - 4 * qa * (from - 1));
  return Math.max(0, (-qb + Math.sqrt(disc)) / (2 * qa));
}

/* 樹冠から外へ出る候補は、角度を内側（上）へ倒し、それでも足りなければ長さを詰める。 */
function aim(x, y, angle, length, crown) {
  let best = { angle, length: Math.min(length, reach(x, y, angle, crown)) };
  for (let attempt = 1; attempt <= 3 && best.length < length * 0.6; attempt += 1) {
    const pull = attempt * 0.22;
    const candidate = angle * (1 - pull) + (-Math.PI / 2) * pull;
    const got = Math.min(length, reach(x, y, candidate, crown));
    if (got > best.length) best = { angle: candidate, length: got };
  }
  return { angle: best.angle, length: Math.min(best.length, reach(x, y, best.angle, CROWN)) };
}

/* その時点の樹冠を包む縦長の楕円。下端は一番下の横枝、上端は幹の先の少し上。 */
function shapingCrown(segments, step) {
  const leaders = leadersOf(segments);
  const top = leaders[leaders.length - 1].y2 - 0.045;
  const foot = leaders[Math.min(FIRST_LATERAL, leaders.length - 1)].y2 + 0.05;
  const bottom = Math.max(foot, top + 0.16);
  const ry = (bottom - top) / 2;
  const spread = clamp(0.62 + (step - 13) * 0.014, 0.62, 0.95);
  return { x: BASE_X, y: bottom - ry, rx: ry * spread, ry };
}

function addLeaves(leaves, segment, step, random, count, size = 0.030, span = 0.015) {
  for (let index = 0; index < count; index += 1) {
    const side = (step + index) % 2 ? 1 : -1;
    leaves.push({
      id: leaves.length,
      segment: segment.id,
      t: clamp(0.40 + index * 0.22 + (random() - 0.5) * 0.5, 0.18, 0.97),
      side,
      size: size + random() * span,
      angle: side * (0.52 + random() * 0.78),
      tone: random(),
      born: step
    });
  }
}

function place(segments, leaves, spec) {
  const { parent, kind, order, step, random, angle, length, leafCount, leafSize, leafSpan } = spec;
  if (!(length > 0.012)) return false;
  const segment = {
    id: segments.length,
    parent: parent.id,
    kind,
    order,
    depth: parent.depth + 1,
    born: step,
    width: 0,
    x1: parent.x2,
    y1: parent.y2,
    x2: clamp(parent.x2 + Math.cos(angle) * length, MIN_X, MAX_X),
    y2: clamp(parent.y2 + Math.sin(angle) * length, MIN_Y, MAX_Y)
  };
  segments.push(segment);
  addLeaves(leaves, segment, step, random, leafCount, leafSize, leafSpan);
  return true;
}

/* step 1：土から出た双葉の芽。葉は1枚が鉢の幅の1/4ほど。 */
function addSprout(segments, leaves, random) {
  const angle = -Math.PI / 2 + (random() - 0.5) * 0.10;
  const length = 0.066;
  segments.push({
    id: 0,
    parent: null,
    kind: 'leader',
    order: 0,
    depth: 0,
    born: 1,
    width: 0,
    x1: BASE_X,
    y1: SOIL_Y,
    x2: BASE_X + Math.cos(angle) * length,
    y2: SOIL_Y + Math.sin(angle) * length
  });
  for (const side of [-1, 1]) {
    leaves.push({
      id: leaves.length,
      segment: 0,
      t: 0.92,
      side,
      size: 0.055 + random() * 0.008,
      angle: side * (0.98 + random() * 0.14),
      tone: random(),
      born: 1
    });
  }
}

/* 幹（リーダー）：小さな振れでほぼ真上へ、節ごとに短くなる。 */
function addLeader(segments, leaves, step, random) {
  const leaders = leadersOf(segments);
  const tip = leaders[leaders.length - 1];
  const index = leaders.length;
  const wanted = Math.max(0.017, 0.066 * 0.90 ** index);
  const drift = (BASE_X - tip.x2) * 0.85;
  let angle = angleOf(tip) * 0.3 + (-Math.PI / 2) * 0.7 + (random() - 0.5) * 0.34 + drift;
  angle = clamp(angle, -Math.PI / 2 - 0.40, -Math.PI / 2 + 0.40);
  const fitted = aim(tip.x2, tip.y2, angle, wanted, CROWN);
  return place(segments, leaves, {
    parent: tip, kind: 'leader', order: 0, step, random,
    angle: fitted.angle, length: fitted.length,
    leafCount: 1,
    /* 苗のうちは葉を大きく見せる。 */
    leafSize: index < 8 ? 0.040 : 0.030,
    leafSpan: index < 8 ? 0.014 : 0.015
  });
}

/* 横枝（ラテラル）：幹から左右交互に 35〜60° で外へ。下の枝ほど寝て、長い。 */
function addLateral(segments, leaves, step, random, crown, leaders, index) {
  /* 骨格になる横枝は幹の下〜中ほどに集める。上は幹と小枝で埋める。 */
  const slots = clamp(leaders.length - FIRST_LATERAL - 1, 1, 6);
  const at = Math.min(FIRST_LATERAL + (index % slots), leaders.length - 1);
  const parent = leaders[at];
  const side = index % 2 ? 1 : -1;
  const height = at / Math.max(1, leaders.length - 1);
  const tilt = (58 - 20 * height + (random() - 0.5) * 12) * Math.PI / 180;
  const wanted = Math.max(0.055, crown.rx * (0.62 - 0.18 * height)) * (0.85 + random() * 0.3);
  const fitted = aim(parent.x2, parent.y2, -Math.PI / 2 + side * tilt, wanted, crown);
  return place(segments, leaves, {
    parent, kind: 'lateral', order: 1, step, random,
    angle: fitted.angle, length: fitted.length, leafCount: 2
  });
}

/* 小枝：枝の少ない先から順に出して樹冠を埋める。垂れすぎないよう水平より少し下で止める。 */
function addTwig(segments, leaves, step, random, crown) {
  const counts = childCounts(segments);
  /* 幹のてっぺん3節も候補に入れる。ここが空くと樹冠の頭がへこむ。 */
  const apex = new Set(leadersOf(segments).slice(-3).map((segment) => segment.id));
  const branchable = (segment) => segment.kind !== 'leader' || apex.has(segment.id);
  const open = segments.filter((segment) => branchable(segment) && counts[segment.id] < 3);
  const candidates = open.length ? open : segments.filter(branchable);
  if (!candidates.length) return false;
  const fewest = Math.min(...candidates.map((segment) => counts[segment.id]));
  /* 一番少ない枝だけを選ぶと形が整いすぎるので、1本多いものまで候補に入れる。 */
  let pool = candidates.filter((segment) => counts[segment.id] <= fewest + 1);
  /* 片側だけ茂って傾かないよう、枝数の少ない側から選ぶ。 */
  const left = candidates.filter((segment) => segment.x2 < BASE_X).length;
  const right = candidates.length - left;
  if (Math.abs(left - right) >= 3) {
    const lighter = left < right;
    const balanced = pool.filter((segment) => (segment.x2 < BASE_X) === lighter);
    if (balanced.length) pool = balanced;
  }
  const parent = pool[Math.floor(random() * pool.length)];
  const order = Math.max(2, parent.order + 1);
  const outward = parent.x2 >= BASE_X ? 1 : -1;
  const side = random() < 0.55 ? outward : -outward;
  let angle = angleOf(parent) + side * (26 + random() * 28) * Math.PI / 180;
  angle = angle * 0.66 + (-Math.PI / 2) * 0.34;
  if (Math.sin(angle) > 0.28) angle = Math.cos(angle) >= 0 ? Math.asin(0.28) : Math.PI - Math.asin(0.28);
  const wanted = Math.max(0.030, crown.rx * 0.44 * 0.76 ** (order - 2));
  const fitted = aim(parent.x2, parent.y2, angle, wanted, crown);
  return place(segments, leaves, {
    parent, kind: 'twig', order, step, random,
    angle: fitted.angle, length: fitted.length, leafCount: 1 + Math.floor(random() * 2)
  });
}

function addBranch(segments, leaves, step, random, crown) {
  const leaders = leadersOf(segments);
  const laterals = segments.filter((segment) => segment.kind === 'lateral').length;
  const twigs = segments.filter((segment) => segment.kind === 'twig').length;
  const maxLateral = Math.min(10, Math.max(1, leaders.length - 2));
  if (laterals < maxLateral && twigs >= laterals * 3) {
    return addLateral(segments, leaves, step, random, crown, leaders, laterals);
  }
  return addTwig(segments, leaves, step, random, crown);
}

/* 枝が打ち止めになった後は、葉の少ない枝から順に1枚ずつ足して樹冠を密にする。 */
function addFillLeaf(leaves, segments, step, random) {
  const counts = new Array(segments.length).fill(0);
  for (const leaf of leaves) counts[leaf.segment] += 1;
  const inCrown = segments.filter((segment) => segment.kind !== 'leader' || segment.depth >= 2);
  const pool = inCrown.length ? inCrown : segments;
  const fewest = Math.min(...pool.map((segment) => counts[segment.id]));
  const best = pool.filter((segment) => counts[segment.id] === fewest);
  addLeaves(leaves, best[Math.floor(random() * best.length)], step, random, 1, 0.027, 0.013);
}

function addFlower(flowers, segments, step, random) {
  const counts = childCounts(segments);
  const taken = new Set(flowers.map((flower) => flower.segment));
  const tips = segments.filter((segment) => segment.kind !== 'leader' && counts[segment.id] === 0 && !taken.has(segment.id));
  const spare = segments.filter((segment) => segment.order >= 2 && !taken.has(segment.id));
  const pool = tips.length ? tips : (spare.length ? spare : segments);
  const segment = pool[Math.floor(random() * pool.length)];
  flowers.push({ id: flowers.length, segment: segment.id, size: 0.012 + random() * 0.004, born: step });
}

function grow(segments, leaves, step, random) {
  if (step === 1) {
    addSprout(segments, leaves, random);
    return;
  }
  const leaders = leadersOf(segments);
  const canLeader = leaders.length < MAX_LEADER && leaders[leaders.length - 1].y2 > TOP_Y;
  const leaderTurn = step <= 7 || (step <= 13 ? step % 2 === 0 : step % 4 === 0);
  if (leaderTurn && canLeader && addLeader(segments, leaves, step, random)) return;
  if (step >= 14 && segments.length < MAX_SEGMENTS) {
    if (addBranch(segments, leaves, step, random, shapingCrown(segments, step))) return;
  }
  addFillLeaf(leaves, segments, step, random);
}

/* 幹ほど太い。子孫の枝数の平方根に比例させると、根元から先へ自然に細くなる。 */
function withWidths(segments) {
  const descendants = new Array(segments.length).fill(0);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const parent = segments[index].parent;
    if (parent !== null) descendants[parent] += descendants[index] + 1;
  }
  return segments.map((segment) => ({ ...segment, width: 0.0055 + 0.0037 * Math.sqrt(descendants[segment.id]) }));
}

export function generatePlant(seed, steps) {
  const total = Math.max(0, Math.floor(steps));
  const segments = [];
  const leaves = [];
  const flowers = [];
  for (let step = 1; step <= total; step += 1) {
    const random = randomFor(seed, step);
    grow(segments, leaves, step, random);
    if (step >= 20 && step % 4 === 0 && flowers.length < MAX_FLOWERS) addFlower(flowers, segments, step, random);
  }
  const sized = withWidths(segments);
  return {
    steps: total,
    segments: sized,
    leaves,
    flowers,
    stats: { branches: sized.length, leaves: leaves.length, flowers: flowers.length }
  };
}
