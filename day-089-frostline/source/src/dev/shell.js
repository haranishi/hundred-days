import { createGame } from '../game.js';
import { createFakeRide, FAKE_SPAWNS } from './fake-ride.js';
import { createDebugView } from './debug-view.js';
const game = createGame({ root: document.querySelector('#game'),
  world: { spawns: FAKE_SPAWNS }, ride: createFakeRide(), view: createDebugView(),
  debug: { enabled: true, spawns: FAKE_SPAWNS } });
window.addEventListener('pagehide', () => game.dispose(), { once: true });
