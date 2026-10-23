const DIRECTIONS = Object.freeze({
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
});
const samePosition = (a, b) => a.x === b.x && a.y === b.y;
const natural = (value) => Number.isSafeInteger(value) && value >= 0;
const floorAt = (level, point) => level.grid[point.y]?.[point.x] === '.';

function validateLevel(level) {
  if (!level || typeof level.id !== 'string' || !level.id ||
      !Array.isArray(level.grid) || level.grid.length !== 6 ||
      !Array.from(level.grid).every((row) => typeof row === 'string' && /^[.#]{6}$/.test(row))) {
    throw new TypeError('A level needs an id and a 6 × 6 grid of . and #.');
  }
  const validPosition = (point) => point && natural(point.x) && natural(point.y) && floorAt(level, point);
  if (!validPosition(level.player) || !Array.isArray(level.clouds) || !level.clouds.length ||
      !Array.isArray(level.plots) || !level.plots.length) {
    throw new TypeError('A level needs a player, clouds, and plots on floor tiles.');
  }
  const occupied = [level.player];
  for (const cloud of level.clouds) {
    if (!validPosition(cloud) || !natural(cloud.drops) || occupied.some((point) => samePosition(point, cloud))) {
      throw new TypeError('Cloud positions must be distinct and rain must be a nonnegative integer.');
    }
    occupied.push(cloud);
  }
  const plots = [];
  for (const plot of level.plots) {
    if (!validPosition(plot) || !natural(plot.need) || plot.need === 0 ||
        plots.some((point) => samePosition(point, plot))) {
      throw new TypeError('Plots must be distinct floor tiles with a positive integer need.');
    }
    plots.push(plot);
  }
  const ledges = level.ledges === undefined ? [] : level.ledges;
  const portals = level.portals === undefined ? [] : level.portals;
  const dew = level.dew === undefined ? [] : level.dew;
  if (!Array.isArray(ledges) || !Array.isArray(portals) || !Array.isArray(dew) ||
      (portals.length !== 0 && portals.length !== 2)) {
    throw new TypeError('Ledges and dew must be arrays, and portals must be a pair.');
  }
  const edges = new Set();
  for (const edge of ledges) {
    if (!edge || !validPosition(edge.from) || !validPosition(edge.to) ||
        Math.abs(edge.from.x - edge.to.x) + Math.abs(edge.from.y - edge.to.y) !== 1) {
      throw new TypeError('A ledge must join two adjacent floor tiles.');
    }
    const key = [edge.from.y * 6 + edge.from.x, edge.to.y * 6 + edge.to.x].sort((a, b) => a - b).join(':');
    if (edges.has(key)) throw new TypeError('Ledge edges must be distinct, including their reverse.');
    edges.add(key);
  }
  const special = [...plots];
  for (const point of [...portals, ...dew]) {
    if (!validPosition(point) || special.some((other) => samePosition(point, other))) {
      throw new TypeError('Plots, portals, and dew must occupy distinct floor tiles.');
    }
    special.push(point);
  }
  if (dew.some((point) => level.clouds.some((cloud) => samePosition(point, cloud)))) {
    throw new TypeError('A cloud cannot initially cover dew.');
  }
  if (level.clouds.some((cloud) => !natural(cloud.drops + dew.length))) {
    throw new TypeError('Rain must remain a safe integer after collecting dew.');
  }
}

/** Fresh state; level data is never modified. */
export function createState(level) {
  validateLevel(level);
  return {
    levelId: level.id,
    player: { ...level.player },
    clouds: level.clouds.map((cloud) => ({ ...cloud })),
    water: level.plots.map(() => 0),
    collected: (level.dew ?? []).map(() => false),
    moves: 0,
    won: false,
  };
}

/** One successful step costs one move, whether walking or pushing. */
export function move(level, state, direction) {
  if (state.levelId !== level.id) throw new TypeError('State belongs to a different level.');
  const blocked = (reason) => ({ state, moved: false, pushed: false, rained: false, reason });
  if (state.won) return blocked('won');
  if (typeof direction !== 'string' || !Object.hasOwn(DIRECTIONS, direction)) return blocked('invalid-direction');
  const delta = DIRECTIONS[direction];
  const player = { x: state.player.x + delta.x, y: state.player.y + delta.y };
  if (!floorAt(level, player)) return blocked('wall');
  const cloudIndex = state.clouds.findIndex((cloud) => samePosition(cloud, player));
  const clouds = state.clouds.map((cloud) => ({ ...cloud }));
  const water = [...state.water];
  const collected = [...(state.collected ?? [])];
  let rained = false;
  let reason = null;
  if (cloudIndex !== -1) {
    let destination = { x: player.x + delta.x, y: player.y + delta.y };
    if (!floorAt(level, destination)) return blocked('wall');
    if (state.clouds.some((cloud) => samePosition(cloud, destination))) return blocked('cloud');
    if ((level.ledges ?? []).some((edge) => samePosition(edge.to, player) && samePosition(edge.from, destination))) {
      return blocked('ledge');
    }
    const portalIndex = (level.portals ?? []).findIndex((point) => samePosition(point, destination));
    if (portalIndex !== -1) {
      destination = level.portals[1 - portalIndex];
      if (samePosition(destination, player) || state.clouds.some((cloud, index) =>
        index !== cloudIndex && samePosition(cloud, destination))) return blocked('portal-blocked');
    }
    const cloud = clouds[cloudIndex];
    cloud.x = destination.x;
    cloud.y = destination.y;
    const dewIndex = (level.dew ?? []).findIndex((point) => samePosition(point, destination));
    if (dewIndex !== -1 && !collected[dewIndex]) {
      collected[dewIndex] = true;
      cloud.drops += 1;
    }
    const plotIndex = level.plots.findIndex((plot) => samePosition(plot, destination));
    if (plotIndex !== -1 && cloud.drops > 0) {
      cloud.drops -= 1;
      water[plotIndex] += 1;
      rained = true;
      if (water[plotIndex] > level.plots[plotIndex].need) reason = 'overwatered';
    }
  }
  return {
    state: {
      levelId: state.levelId, player, clouds, water, collected,
      moves: state.moves + 1,
      won: level.plots.every((plot, index) => water[index] === plot.need),
    },
    moved: true,
    pushed: cloudIndex !== -1,
    rained,
    reason,
  };
}
