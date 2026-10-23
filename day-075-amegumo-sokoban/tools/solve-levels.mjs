import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createState, move} from '../lib/game.js';

const DIRECTIONS = ['up', 'down', 'left', 'right'];
const DELTA = {up:[0,-1], down:[0,1], left:[-1,0], right:[1,0]};
const same = (a,b) => a.x === b.x && a.y === b.y;

/** Cloud identity and elapsed moves do not affect future legal actions. */
export function stateKey(state) {
  const clouds = state.clouds.map(c => `${c.x},${c.y},${c.drops}`).sort().join(';');
  return `${state.player.x},${state.player.y}|${clouds}|${state.water.join(',')}|${(state.collected ?? []).map(Number).join('')}`;
}

function features(level, before, after, direction) {
  const [dx,dy] = DELTA[direction];
  const cloud = before.clouds.find(c => c.x === before.player.x + dx && c.y === before.player.y + dy);
  if (!cloud) return [];
  const destination = {x:cloud.x+dx,y:cloud.y+dy};
  const result = [];
  if ((level.ledges ?? []).some(e => same(e.from,cloud) && same(e.to,destination))) result.push('ledge');
  if ((level.portals ?? []).some(p => same(p,destination))) result.push('warp');
  if ((after.collected ?? []).some((collected,i) => collected && !before.collected?.[i])) result.push('dew');
  return result;
}

/** Bounded, dependency-free BFS using the production rules. Never treats a limit as unsolvable. */
export function solveLevel(level, {maxStates=250000, maxDepth=200, forbidFeatures=[]}={}) {
  if (!Number.isSafeInteger(maxStates) || maxStates < 1 || !Number.isSafeInteger(maxDepth) || maxDepth < 0) {
    throw new TypeError('BFS limits must be nonnegative integers, with at least one state.');
  }
  const initial = createState(level);
  const nodes = [{state:initial,parent:-1,direction:null}];
  const seen = new Set([stateKey(initial)]);
  const forbidden = new Set(forbidFeatures);
  let expanded = 0;
  let depthLimited = false;
  const finish = (index,direction) => {
    const solution = direction ? [direction] : [];
    for (let i=index; nodes[i].parent !== -1; i=nodes[i].parent) solution.push(nodes[i].direction);
    solution.reverse();
    return {status:'solved',solution,visited:seen.size,expanded};
  };
  for (let head=0; head<nodes.length; head++) {
    const {state} = nodes[head];
    if (state.won) return finish(head);
    if (state.moves >= maxDepth) {depthLimited=true;continue;}
    expanded++;
    for (const direction of DIRECTIONS) {
      const result = move(level,state,direction);
      if (!result.moved || result.state.water.some((n,i) => n > level.plots[i].need)) continue;
      if (forbidden.size && features(level,state,result.state,direction).some(f => forbidden.has(f))) continue;
      const key = stateKey(result.state);
      if (seen.has(key)) continue;
      if (result.state.won) return finish(head,direction);
      if (seen.size >= maxStates) return {status:'state-limit',solution:null,visited:seen.size,expanded};
      seen.add(key);
      nodes.push({state:result.state,parent:head,direction});
    }
  }
  return {status:depthLimited?'depth-limit':'unsolvable',solution:null,visited:seen.size,expanded};
}

/** Replay also verifies every action, exact water and resource conservation. */
export function replaySolution(level, solution) {
  let state = createState(level);
  const resource = s => s.clouds.reduce((n,c) => n+c.drops,0) + s.water.reduce((n,w) => n+w,0) + (s.collected ?? []).filter(c => !c).length;
  const initialResource = resource(state);
  const stats = {steps:0,pushes:0,rains:0,refills:0,warps:0,ledgeCrossings:0};
  for (const direction of solution) {
    const result = move(level,state,direction);
    if (!result.moved) throw new Error(`${level.id}: invalid solution action ${stats.steps+1}: ${direction} (${result.reason})`);
    if (result.state.water.some((n,i) => n > level.plots[i].need)) throw new Error(`${level.id}: solution overwatered a plot.`);
    if (resource(result.state) !== initialResource) throw new Error(`${level.id}: rain was not conserved.`);
    const used = features(level,state,result.state,direction);
    stats.steps++;
    stats.pushes += Number(result.pushed);
    stats.rains += Number(result.rained);
    stats.refills += Number(used.includes('dew'));
    stats.warps += Number(used.includes('warp'));
    stats.ledgeCrossings += Number(used.includes('ledge'));
    state = result.state;
  }
  if (!state.won) throw new Error(`${level.id}: solution did not finish the garden.`);
  return {state,stats};
}

async function main() {
  const {LEVELS,SOLUTIONS} = await import('../lib/levels.js');
  const report = [];
  for (const level of LEVELS) {
    const result = solveLevel(level);
    const replay = replaySolution(level,SOLUTIONS[level.id] ?? []);
    const shortest = result.solution?.length ?? null;
    report.push({id:level.id,par:level.par,shortest,status:result.status,visited:result.visited,...replay.stats});
    if (result.status !== 'solved' || shortest !== level.par || replay.stats.steps !== level.par) process.exitCode=1;
  }
  console.log(JSON.stringify(report,null,2));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
