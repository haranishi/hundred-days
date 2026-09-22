import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { LEVELS, getLevel, levelId } from '../lib/levels.js';
import { createAutopilot } from '../lib/autopilot.js';
import { createState, step, DT } from '../lib/physics.js';
import { readStore, writeStore, recordClear } from '../lib/store.js';
export function fixture(tiles = [], options = {}) {
  const rows = Array.from({ length: 12 }, (_, y) =>
    Array(24).fill(y === 11 ? '#' : '.'),
  );
  rows[10][1] = 'P';
  rows[10][22] = 'G';
  for (const [x, y, t] of tiles) rows[y][x] = t;
  return createState('1-1', {
    ...options,
    level: {
      name: '試験',
      world: 1,
      sky: 1,
      wind: 0,
      rows: rows.map(r => r.join('')),
    },
  });
}
export function run(s, count, input = {}) {
  for (let i = 0; i < count; i++) s = step(s, input);
  return s;
}
// 敵とつららだけを除き、地形・床・収集物は元の配置で試す。
export function walkToDoor(id) {
  const original = getLevel(id);
  const level = {
    ...original,
    rows: original.rows.map(row => row.replace(/[CD^]/g, '.')),
  };
  let s = createState(id, { level });
  const decide = createAutopilot(level);
  for (let t = 0; t < 7200 && s.status === 'playing'; t++) s = step(s, decide(s));
  return s;
}

// ブラウザを起動せず、操作窓口を実際の物理・保存処理につなぐ。
// frame(now) を呼ぶたびに1コマ進む。now はミリ秒で、記録窓口の時計もこれを見ている。
export function loadApp() {
  const nodes = new Map();
  const node = () => ({
    dataset: {},
    style: {},
    clientWidth: 640,
    addEventListener() {},
    append() {},
    replaceChildren() {},
    focus() {},
    scrollIntoView() {},
    setAttribute() {},
    getContext: () => ({}),
  });
  const document = {
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, node());
      return nodes.get(id);
    },
    createElement: node,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    hidden: false,
  };
  const handlers = new Map();
  const stored = new Map();
  const window = {
    localStorage: {
      getItem: key => stored.get(key),
      setItem: (key, value) => stored.set(key, value),
    },
    addEventListener: (type, listener) => handlers.set(type, listener),
  };
  let frame;
  const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  runInNewContext(source.replace(/^import .*;\n/gm, ''), {
    window,
    document,
    innerHeight: 800,
    requestAnimationFrame: callback => {
      frame = callback;
    },
    LEVELS,
    levelId,
    createState,
    step,
    DT,
    createAutopilot,
    readStore,
    writeStore,
    recordClear,
    render() {},
    createAudio: () => ({
      unlock() {},
      effect() {},
      setPlaying() {},
      setMuted() {},
    }),
  });
  return { api: window.__day047, handlers, stored, frame: now => frame(now) };
}
