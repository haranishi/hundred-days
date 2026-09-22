import { beforeEach, afterEach } from 'node:test';
import { getLevel } from '../lib/levels.js';
import { createAutopilot } from '../lib/autopilot.js';
import { createState, step } from '../lib/physics.js';
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
      parTicks: 2400,
      secretMochi: options.secretMochi ?? null,
      entityOptions: options.entityOptions ?? {},
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
// 実データの敵を残し、通常入力だけで到達を確認する。
export function walkToDoor(id, options = {}) {
  const level = getLevel(id);
  let s = createState(id, { level });
  const decide = createAutopilot(level, options);
  for (let t = 0; t < 10800 && s.status === 'playing'; t++) s = step(s, decide(s));
  return s;
}

// ブラウザを起動せず、操作窓口を実際の物理・保存処理につなぐ。
// frame(now) を呼ぶたびに1コマ進む。now はミリ秒で、記録窓口の時計もこれを見ている。
async function prepareApp() {
  const nodes = new Map();
  const timers = new Set();
  const schedule = globalThis.setTimeout;
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
    getContext: () => ({ fillRect() {}, fillText() {}, clearRect() {}, drawImage() {} }),
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
  Object.assign(globalThis, {
    window,
    document,
    innerHeight: 800,
    setTimeout: (callback, ms) => {
      const timer = schedule(callback, ms);
      timers.add(timer);
      return timer;
    },
    requestAnimationFrame: callback => { frame = callback; },
  });
  await import(`../app.js?test=${appSerial++}`);
  return { api: window.__day046, handlers, stored, frame: now => frame(now),
    dispose: () => { for (const timer of timers) clearTimeout(timer); },
  };
}

// 呼出側の同期APIを保ち、各テストの前に本物のESモジュールを別インスタンスで読み込む。
// テスト終了時にはグローバルを戻し、他の試験へDOMを持ち越さない。
let appSerial = 0;
let app;
let globals;
const globalKeys = ['window', 'document', 'innerHeight', 'requestAnimationFrame', 'setTimeout'];
beforeEach(async () => {
  globals = globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  app = await prepareApp();
});
afterEach(() => {
  app?.dispose();
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});
export function loadApp() {
  return app;
}
