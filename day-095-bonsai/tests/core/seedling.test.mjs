import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SPECIES_IDS, STYLE_IDS, validateSkeleton } from '../../lib/contract.js';
import { branchList, branchSegment } from '../../lib/pick.js';
import { createTree, restoreTree } from '../../lib/tree.js';
import { padAppearance } from '../../lib/tree-state.js';

const DEFAULT_SEEDS = [0, 1, 2, 3, 7, 11, 29, 42, 137, 0xffffffff];
const SEEDS = process.env.BONSAI_STRESS
  ? [...DEFAULT_SEEDS, ...Array.from({ length: 128 }, (_, i) => Math.imul(i + 1, 0x9e3779b1) >>> 0)]
  : DEFAULT_SEEDS;
const COUNTS = { maple: [380, 700], pine: [260, 520], plum: [300, 600] };
const PAD_RADII = { maple: [0.30, 0.45], pine: [0.50, 0.75], plum: [0.28, 0.40] };
const RATIOS = { maple: [0.55, 1.1], pine: [0.70, 1.3] };
const between = (v, min, max) => v >= min && v <= max;
const radialDifference = (a, b) => Math.abs((a - b + 540) % 360 - 180);

function departureAngle(skel, i) {
  const delta = (k) => [0, 1, 2].map((axis) => skel.end[k * 3 + axis] - skel.start[k * 3 + axis]);
  const branch = delta(i);
  const trunk = delta(skel.parent[i]);
  const dot = branch.reduce((sum, value, j) => sum + value * trunk[j], 0);
  const cosine = dot / (Math.hypot(...branch) * Math.hypot(...trunk));
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
}

function lateralSide(skel, branch, parent) {
  const dx = (i) => skel.end[3 * i] - skel.start[3 * i];
  const dz = (i) => skel.end[3 * i + 2] - skel.start[3 * i + 2];
  return Math.sign(dz(parent) * dx(branch) - dx(parent) * dz(branch));
}

const segmentLength = (skel, i) => Math.hypot(
  skel.end[3 * i] - skel.start[3 * i], skel.end[3 * i + 1] - skel.start[3 * i + 1], skel.end[3 * i + 2] - skel.start[3 * i + 2],
);

function branchLength(skel, first) {
  return branchSegment(skel, first).reduce((sum, i) => sum + segmentLength(skel, i), 0);
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const deviation = (values) => {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
};

function lateralLayout(skel) {
  const branches = branchList(skel);
  const arms = Map.groupBy(branches.filter(({ order }) => order === 3), ({ first }) => skel.parent[first]);
  return branches.filter(({ order }) => order === 2).map(({ first, tip }) => {
    const parent = skel.parent[first];
    const remaining = branchLength(skel, parent) - segmentLength(skel, parent);
    const forks = arms.get(tip) ?? [];
    const stemLength = branchLength(skel, first);
    const lengths = forks.length ? forks.map((fork) => stemLength + branchLength(skel, fork.first)) : [stemLength];
    return { first, parent, tip, remaining, forks, length: Math.max(...lengths), lengths, angle: departureAngle(skel, first) };
  });
}

function statistics(skel) {
  const branches = branchList(skel);
  const trunk = branches.find((branch) => branch.order === 0).tip;
  const trunkHeight = skel.end[trunk * 3 + 1];
  const { min, max } = skel.bounds;
  const height = max[1] - min[1];
  const width = Math.max(max[0] - min[0], max[2] - min[2]);
  const angle = (i) => (Math.atan2(skel.end[i * 3] - skel.start[i * 3], skel.end[i * 3 + 2] - skel.start[i * 3 + 2]) * 180 / Math.PI + 360) % 360;
  const main = branches.filter((branch) => branch.order === 1);
  let spacing = Infinity;
  for (let i = 0; i < skel.pads.count; i += 1) {
    for (let j = i + 1; j < skel.pads.count; j += 1) {
      const d = Math.hypot(
        skel.pads.center[i * 3] - skel.pads.center[j * 3],
        skel.pads.center[i * 3 + 1] - skel.pads.center[j * 3 + 1],
        skel.pads.center[i * 3 + 2] - skel.pads.center[j * 3 + 2],
      );
      spacing = Math.min(spacing, d / (skel.pads.radius[i] + skel.pads.radius[j]));
    }
  }
  return { trunk, trunkHeight, height, width, azimuths: main.map((branch) => angle(branch.first)), main, spacing };
}

for (const species of SPECIES_IDS) {
  for (const style of STYLE_IDS) {
    test(`苗 ${species}/${style} の${SEEDS.length} seed が節・幅・頂き・葉の塊の条件を満たす`, () => {
      for (const seed of SEEDS) {
        const tree = createTree({ species, style, seed });
        const skel = tree.snapshot();
        const { trunk, trunkHeight, height, width, azimuths, main, spacing } = statistics(skel);
        const label = `${species}/${style}/${seed}`;
        assert.deepEqual(validateSkeleton(skel), [], label);
        assert.ok(width / height <= 1.5, `${label} 幅/高さ ${width / height}`);
        assert.ok(branchLength(skel, main[0].first) / trunkHeight <= 0.66, `${label} 最下の主枝長 / 幹高`);
        assert.ok(between(skel.count, ...COUNTS[species]), `${label} 節数 ${skel.count}`);
        assert.ok(between(skel.order.filter((order) => order === 0).length, 16, 20), label);
        assert.ok(between(trunkHeight, 2.8, 3.6) && between(height, 2.8, 3.6), `${label} 幹高 ${trunkHeight.toFixed(3)} 高さ ${height.toFixed(3)}`);
        assert.ok(!RATIOS[species] || between(height / width, ...RATIOS[species]), `${label} 高さ/幅 ${height / width}`);
        assert.ok(trunkHeight / height >= 0.75, `${label} 頂きの比率 ${trunkHeight / height}`);
        assert.ok(skel.end.every((value, i) => i % 3 !== 1 || value <= trunkHeight + 1e-6), `${label} 頂きより高い枝`);
        assert.ok(between(skel.r0[0], 0.2 - 1e-7, 0.26 + 1e-7), `${label} 根元半径 ${skel.r0[0]}`);
        assert.ok(skel.r1.every((radius) => radius >= 0.018), `${label} 先端の半径`);
        assert.ok(skel.r0[0] / skel.r1[trunk] >= 5, label);
        assert.ok(skel.flags.every((flag) => flag === 0) && skel.wires.length === 0, label);

        const lean = Math.atan2(Math.hypot(skel.end[trunk * 3], skel.end[trunk * 3 + 2]), trunkHeight) * 180 / Math.PI;
        assert.ok(style === 'shakan' ? between(lean, 20, 30) : lean < (style === 'chokkan' ? 6 : 24), `${label} 幹の傾き ${lean}`);
        assert.equal(main.length, species === 'maple' ? 6 : 5, label);
        assert.ok(between(skel.start[main[0].first * 3 + 1] / trunkHeight, 0.28, 0.35), `${label} 最下の枝 ${skel.start[main[0].first * 3 + 1] / trunkHeight}`);
        assert.ok(between(skel.start[main.at(-1).first * 3 + 1] / trunkHeight, 0.81, 0.90), `${label} 最上の枝`);
        assert.ok(between(departureAngle(skel, main[0].first), 78, 88), `${label} 最下の枝の角度`);
        assert.ok(between(departureAngle(skel, main.at(-1).first), 45, 60), `${label} 最上の枝の角度`);
        for (const [i, azimuth] of azimuths.entries()) {
          assert.ok(radialDifference(azimuth, 0) > 22, `${label} 正面の枝 ${azimuth}`);
          if (i) assert.ok(radialDifference(azimuth, azimuths[i - 1]) >= 50, `${label} 隣り合う枝の方位角 ${azimuths}`);
        }

        assert.ok(between(skel.pads.count, 15, 61), `${label} パッド数 ${skel.pads.count}`);
        assert.ok(spacing >= 0.45, `${label} パッドの間隔 ${spacing}`);
        const apexPad = skel.pads.node.indexOf(trunk);
        assert.ok(apexPad >= 0, `${label} 頂きのパッド`);
        const expected = 0.85 * padAppearance(species, seed, skel.chain[trunk], 1).radius;
        assert.ok(Math.abs(skel.pads.radius[apexPad] - expected) < 1e-7, label);
        assert.ok(skel.pads.radius.every((r, i) => i === apexPad || between(r, PAD_RADII[species][0] - 1e-7, PAD_RADII[species][1] + 1e-7)), label);
        assert.ok(skel.pads.density.every((density) => between(density, 0.6, 1)), label);
        assert.ok(skel.pads.normal.every((component, i) => i % 3 !== 1 || component > 0.85), label);

        const pipe = new Float64Array(skel.count);
        for (let i = 1; i < skel.count; i += 1) pipe[skel.parent[i]] += skel.r0[i] ** 2;
        for (let i = 0; i < skel.count; i += 1) {
          if (pipe[i]) assert.ok(Math.abs(skel.r1[i] ** 2 - pipe[i]) < 1e-7, `${label} 節${i}の断面積`);
        }
        const tips = Array.from(skel.order.keys()).filter((i) => pipe[i] === 0);
        assert.deepEqual(Array.from(skel.pads.node), tips, label);
        assert.strictEqual(tree.snapshot(), skel);
        assert.deepEqual(createTree({ species, style, seed }).toJSON(), tree.toJSON(), label);
        assert.notDeepEqual(createTree({ species, style, seed: seed + 1 }).snapshot().end, skel.end, label);
      }
    });
  }
}

for (const species of SPECIES_IDS) {
  for (const style of STYLE_IDS) {
    test(`副枝 ${species}/${style} の${SEEDS.length} seedで角度・長さ・間隔・二又がそろう`, (t) => {
      const measurements = [];
      const forkRates = [];
      const gaps = new Set();
      let sameSide = 0;
      for (const seed of SEEDS) {
        const tree = createTree({ species, style, seed });
        const skel = tree.snapshot();
        const label = `${species}/${style}/${seed}`;
        assert.deepEqual(restoreTree(JSON.parse(JSON.stringify(tree.toJSON()))).snapshot(), skel, label);
        const laterals = lateralLayout(skel);
        assert.ok(laterals.length > 0, `${label} 副枝がない`);
        const primaries = branchList(skel).filter(({ order }) => order === 1);
        const floor = skel.start[3 * primaries[0].first + 1];
        assert.equal(skel.order.filter((order, i) => order >= 2
          && Math.min(skel.start[3 * i + 1], skel.end[3 * i + 1]) < floor - 1e-6).length, 0, `${label} 下幹に副枝`);
        const rise = (i) => (skel.end[3 * i + 1] - skel.start[3 * i + 1]) / segmentLength(skel, i);
        for (const { first, tip, remaining, angle, lengths, forks } of laterals) {
          assert.ok(between(angle, 15, 55), `${label} 副枝${first}の角度 ${angle}`);
          assert.ok(lengths.every((length) => between(length / remaining, 0.2499, 0.4501)), `${label} 副枝${first}の長さ ${lengths} / ${remaining}`);
          if (forks.length) {
            assert.equal(forks.length, 2, `${label} 副枝${first}の二又`);
            assert.ok(forks.every((fork) => between(departureAngle(skel, fork.first), 15, 55)), `${label} 二又の角度`);
          }
          assert.ok(rise(tip) > rise(first) && forks.every((fork) => rise(fork.tip) > rise(fork.first)), `${label} 副枝${first}の先の反り`);
          const chain = branchSegment(skel, first);
          assert.ok(chain.every((i, j) => j === 0 || skel.r1[i] < skel.r1[chain[j - 1]]), `${label} 副枝${first}の先細り`);
        }
        for (const primary of primaries) {
          const sites = branchSegment(skel, primary.first);
          const shoots = laterals.filter(({ parent }) => skel.chain[parent] === primary.chain).sort((a, b) => a.parent - b.parent);
          for (let i = 1; i < shoots.length; i += 1) {
            const before = shoots[i - 1];
            const after = shoots[i];
            const gap = sites.indexOf(after.parent) - sites.indexOf(before.parent);
            gaps.add(gap);
            assert.ok(gap >= 2, `${label} 副枝の間隔`);
            if (lateralSide(skel, before.first, before.parent) === lateralSide(skel, after.first, after.parent)) sameSide += 1;
            assert.ok(after.angle < before.angle, `${label} 枝先の角度`);
          }
        }
        measurements.push(...laterals);
        forkRates.push([seed, laterals.filter(({ forks }) => forks.length === 2).length, laterals.length]);
      }
      const angles = measurements.map(({ angle }) => angle);
      const rightAngles = angles.filter((angle) => between(angle, 85, 95));
      const lengths = measurements.map(({ length }) => length);
      const forks = forkRates.reduce((sum, [, count]) => sum + count, 0);
      t.diagnostic(`角度 平均${mean(angles).toFixed(2)}° 最小${Math.min(...angles).toFixed(2)}° 最大${Math.max(...angles).toFixed(2)}°、長さの標準偏差${deviation(lengths).toFixed(3)}、二又 ${forks}/${angles.length}`);
      assert.ok(rightAngles.length / angles.length < 0.05, `直角の副枝 ${rightAngles.length}/${angles.length}`);
      assert.ok(deviation(lengths) > 0.07, `副枝長の標準偏差 ${deviation(lengths)}`);
      assert.ok(gaps.has(2) && gaps.has(3) && sameSide > 0, '節の間隔か枝の出る側が一様');
      const outside = forkRates.filter(([, count, total]) => !between(count / total, 0.10, 0.20));
      assert.deepEqual(outside, [], '二又が10〜20%に収まらない（seed、二又数、副枝数）');
    });
  }
}

test('3樹種・3樹形・10 seedの苗は全体の幅/高さの中央値が1.15〜1.35', () => {
  const ratios = [];
  for (const species of SPECIES_IDS) {
    for (const style of STYLE_IDS) {
      for (const seed of DEFAULT_SEEDS) {
        const { width, height } = statistics(createTree({ species, style, seed }).snapshot());
        ratios.push(width / height);
      }
    }
  }
  ratios.sort((a, b) => a - b);
  const mid = Math.floor(ratios.length / 2);
  const median = (ratios[mid - 1] + ratios[mid]) / 2;
  assert.ok(between(median, 1.15, 1.35), `幅/高さの中央値 ${median}`);
});

if (process.env.BONSAI_GEOMETRY) {
  test('固定seedの苗を計測する', (t) => {
    for (const species of SPECIES_IDS) {
      for (const style of STYLE_IDS) {
        for (const seed of DEFAULT_SEEDS) {
          const skel = createTree({ species, style, seed }).snapshot();
        const { height, width, azimuths, main } = statistics(skel);
        const shoots = Map.groupBy(lateralLayout(skel), ({ parent }) => skel.chain[parent]);
          t.diagnostic([
            species, style, seed, height.toFixed(3), (width / height).toFixed(3), skel.count,
            skel.pads.count, azimuths.map((a) => Math.round(a) % 360).join('/'),
          main.map(({ chain }) => shoots.get(chain)?.length ?? 0).join('/'),
          ].join(' | '));
        }
      }
    }
  });
}
