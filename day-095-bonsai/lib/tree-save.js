import { MAX_NODES, NODE_FLAG, SAVE_VERSION, SPECIES_IDS, STYLE_IDS } from './contract.js';
import {
  GROWTH_HEIGHT_FACTOR, GROWTH_NODE_FACTOR, GROWTH_WEEKS, MAX_AGE, MAX_DAY, MIN_RADIUS, MODEL_SCALE, newState,
} from './tree-state.js';

const INT_MAX = 0x7fffffff;
const UINT_MAX = 0xffffffff;
const FLAGS = Object.values(NODE_FLAG).reduce((mask, flag) => mask | flag, 0);
const inRange = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const vector = (values) => values.every((value) => inRange(value, -1.000001, 1.000001)) && Math.abs(Math.hypot(...values) - 1) <= 1e-7;
const pack = (value) => Math.round(value * MODEL_SCALE);
const unpack = (value) => Number.isSafeInteger(value) ? value / MODEL_SCALE : NaN;

function requireSave(condition, description) {
  if (!condition) throw new Error(`盆栽の保存が壊れています（${description}）`);
}

export function saveTreeState(state) {
  const { species, style, seed, day, moisture, nextId, nextChain } = state;
  // 位置は親の姿勢から復元できる。局所姿勢と太さは固定小数点にして、節の上限でも容量を抑える。
  const nodes = state.nodes.map((n) => [
    n.id, n.parent, n.order, n.chain, pack(n.length), ...n.local.map(pack), ...n.up.map(pack), pack(n.r0), pack(n.r1), n.flags, n.scarAge, n.wireAge,
  ]);
  const saved = { v: SAVE_VERSION, species, style, seed, day, moisture, rngState: state.rng.state(), nextId, nextChain, nodes };
  if (state.growth.length) saved.growth = state.growth.map((record) => record.slice());
  return saved;
}

export function readTreeState(json) {
  requireSave(json && typeof json === 'object' && !Array.isArray(json), '形式');
  const { v, species, style, seed, day, moisture, rngState, nextId, nextChain, nodes, growth } = json;
  requireSave(v === SAVE_VERSION, '版');
  requireSave(SPECIES_IDS.includes(species) && STYLE_IDS.includes(style), '樹種・樹形');
  requireSave(integer(seed, 0, UINT_MAX) && integer(rngState, 0, UINT_MAX), '乱数の状態');
  requireSave(integer(day, 0, MAX_DAY) && inRange(moisture, 0, 1), '日付・水分');
  requireSave(integer(nextId, 1, INT_MAX + 1) && integer(nextChain, 1, INT_MAX + 1), '節・枝の採番');
  requireSave(Array.isArray(nodes) && integer(nodes.length, 1, MAX_NODES), '節数');

  const state = newState(species, style, seed, day);
  state.moisture = moisture;
  state.rng.setState(rngState);
  state.nextId = nextId;
  state.nextChain = nextChain;
  // 以前の保存には成長の履歴がないため、復元時の木から計り始める。
  if (growth !== undefined) {
    requireSave(Array.isArray(growth) && growth.length <= GROWTH_WEEKS, '成長の履歴');
    const week = Math.floor(day / 7);
    let previous = Math.max(0, week - GROWTH_WEEKS);
    for (const record of growth) {
      requireSave(Array.isArray(record) && record.length === 3, '成長の履歴');
      const [at, height, count] = record;
      requireSave(integer(at, previous + 1, week) && inRange(height, 1, GROWTH_HEIGHT_FACTOR) && inRange(count, 1, GROWTH_NODE_FACTOR), '成長の履歴');
      state.growth.push([at, height, count]);
      previous = at;
    }
  }
  const ids = new Set();
  const chains = new Set();
  const continues = new Set();
  const pipeArea = new Float64Array(nodes.length);

  for (let i = 0; i < nodes.length; i += 1) {
    const saved = nodes[i];
    const fail = (condition, field) => requireSave(condition, `節${i}の${field}`);
    fail(Array.isArray(saved) && saved.length === 17, '形式');
    const [id, parent, order, chain] = saved;
    const length = unpack(saved[4]);
    const local = saved.slice(5, 9).map(unpack);
    const up = saved.slice(9, 12).map(unpack);
    const r0 = unpack(saved[12]);
    const r1 = unpack(saved[13]);
    const [flags, scarAge, wireAge] = saved.slice(14);
    fail(integer(id, 0, nextId - 1) && !ids.has(id), 'ID');
    fail(i === 0 ? parent === -1 && order === 0 : integer(parent, 0, i - 1), '親');
    fail(integer(order, 0, 6) && integer(chain, 0, nextChain - 1), '枝');
    fail(inRange(length, 0.001, 2) && vector(local) && vector(up), '姿勢');
    fail(inRange(r0, MIN_RADIUS, 64) && inRange(r1, MIN_RADIUS, r0), '太さ');
    fail(integer(flags, 0, FLAGS) && (flags & ~FLAGS) === 0, '印');
    fail(integer(scarAge, 0, flags & NODE_FLAG.CUT ? MAX_AGE : 0), '切り口の週数');
    fail(integer(wireAge, 0, flags & NODE_FLAG.WIRED ? MAX_AGE : 0), '針金の週数');

    if (i > 0 && state.nodes[parent].chain === chain) {
      fail(state.nodes[parent].order === order && !continues.has(parent), '枝の続き');
      continues.add(parent);
    } else {
      fail(!chains.has(chain) && (i === 0 || order === Math.min(6, state.nodes[parent].order + 1)), '枝分かれ');
    }
    ids.add(id);
    chains.add(chain);
    if (parent >= 0) pipeArea[parent] += r0 * r0;
    state.nodes.push({ id, parent, order, chain, length, local, up, r0, r1, flags, scarAge, wireAge });
  }

  for (let i = 0; i < nodes.length; i += 1) {
    const radius = state.nodes[i].r1 + 1e-7;
    requireSave(radius * radius >= pipeArea[i], `節${i}の親子の太さ`);
  }
  return state;
}
