// 一致の判定。影の全体の重なり（IoU）と、部品ごとの被覆、邪魔な道具の追い出しを合わせて「再現できた」を決める。
//
// 全体のIoUだけだと、面積の小さい部品（帽子など）を外しても合格してしまう。そこで部品ごとに
// 「その道具の影が、ねらいのその部分をどれだけ覆っているか」を見る。邪魔な道具（decoy）は、壁の上に影を残さないことを求める。
import { GRID, WALL, castShadows, iou, maskArea, rasterize } from './geometry.js';

export const DEFAULT_THRESHOLD = Object.freeze({ union: 0.8, part: 0.6, decoyArea: 0.05, near: 0.7, warm: 0.5 });

function placementsOf(stage, arrangement) {
  return Object.fromEntries(stage.props.map((prop) => [prop.id, { x: arrangement.xs[prop.id] ?? prop.x.solution, y: prop.y }]));
}

// 場面（道具・奥行き）と配置（灯りの高さ・各道具の横位置）から、道具ごとの影のマスクを返す。
export function pieceMasks(stage, arrangement, grid = GRID) {
  const lamp = { x: stage.lamp.x, y: arrangement.ly };
  const placements = placementsOf(stage, arrangement);
  const pieces = {};
  for (const prop of stage.props) {
    pieces[prop.id] = rasterize(castShadows([prop], placements, lamp, stage.distance), grid);
  }
  return pieces;
}

export function unionOf(pieces, ids, grid = GRID) {
  const mask = new Uint8Array(grid.cols * grid.rows);
  for (const id of ids) for (let i = 0; i < mask.length; i += 1) mask[i] |= pieces[id][i];
  return mask;
}

export function solutionArrangement(stage) {
  return { ly: stage.lamp.solution, xs: Object.fromEntries(stage.props.map((prop) => [prop.id, prop.x.solution])) };
}

// ねらい（目撃者のスケッチ）：正解の配置で落ちる影。場面ごとに一度だけ作る。
export function buildTarget(stage, grid = GRID) {
  const pieces = pieceMasks(stage, solutionArrangement(stage), grid);
  const ids = stage.props.map((prop) => prop.id);
  return { pieces, union: unionOf(pieces, ids, grid) };
}

export function evaluate(stage, target, arrangement, threshold = stage.threshold ?? DEFAULT_THRESHOLD, grid = GRID) {
  const pieces = pieceMasks(stage, arrangement, grid);
  const ids = stage.props.map((prop) => prop.id);
  const union = unionOf(pieces, ids, grid);
  const overall = iou(union, target.union);
  const targetArea = maskArea(target.union);
  const parts = {};
  let partsOk = true;
  let decoysOk = true;
  for (const prop of stage.props) {
    if (prop.decoy) {
      const area = maskArea(pieces[prop.id]);
      parts[prop.id] = { decoy: true, area };
      if (area > threshold.decoyArea * targetArea) decoysOk = false;
      continue;
    }
    const need = maskArea(target.pieces[prop.id]);
    let both = 0;
    for (let i = 0; i < pieces[prop.id].length; i += 1) both += pieces[prop.id][i] & target.pieces[prop.id][i];
    const coverage = need === 0 ? 1 : both / need;
    parts[prop.id] = { decoy: false, coverage };
    if (coverage < threshold.part) partsOk = false;
  }
  const success = overall >= threshold.union && partsOk && decoysOk;
  const band = success ? 'match' : overall >= threshold.near ? 'near' : overall >= threshold.warm ? 'warm' : 'far';
  return { iou: overall, parts, partsOk, decoysOk, success, band };
}

export const wallArea = WALL.width * WALL.height;
