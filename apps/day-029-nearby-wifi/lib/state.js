import { sortByDistance } from './normalize.js';

export const RADII = [800, 3200];
export const MAX_VISIBLE = 100;
export const MAX_MARKERS = 60;

export function createState(saved = {}) {
  return {
    center: null,
    label: '',
    radius: RADII[0],
    datasets: null,
    onlyFree: Boolean(saved.onlyFree),
    layers: { municipal: true, osm: true, chain: true, ...saved.layers },
    selectedId: null,
    lastAction: null,
  };
}

export function matchedSpots(state) {
  if (!state.datasets || !state.center) return [];
  const { center, radius, datasets, layers } = state;
  const sourceById = new Map(datasets.municipal.sources.map((source) => [source.id, source]));
  const chainById = new Map(datasets.chain.chains.map((chain) => [chain.id, chain]));
  const municipal = layers.municipal ? datasets.municipal.spots.map((spot, index) => ({
    ...spot, id: `municipal/${spot.src}/${index}`, layer: 'municipal', fee: 'free', source: sourceById.get(spot.src),
  })) : [];
  const osm = layers.osm ? datasets.osm.spots
    .filter((spot) => !state.onlyFree || spot.fee === 'free' || spot.fee === 'customers')
    .map((spot) => ({
      ...spot,
      id: `osm/${spot.id}`,
      name: spot.name || (spot.cat && spot.cat !== 'その他' ? spot.cat : '名前なし'),
      category: spot.cat,
      layer: 'osm',
    }))
    .filter((spot) => !(spot.name === '名前なし' && spot.fee === 'unknown')) : [];
  const chain = layers.chain ? datasets.chain.spots.map((spot) => ({
    ...spot, id: `chain/${spot.brand}/${spot.id}`, layer: 'chain', fee: 'estimated', chain: chainById.get(spot.brand),
    name: spot.name || chainById.get(spot.brand)?.label || '名前なし',
  })) : [];
  return sortByDistance([...municipal, ...osm, ...chain], center).filter((spot) => spot.distance <= radius);
}

export function visibleSpots(state) {
  return matchedSpots(state).slice(0, MAX_VISIBLE);
}

export function markerSpots(state) {
  return matchedSpots(state).slice(0, MAX_MARKERS);
}

export function freeEligibleCount(state) {
  if (!state.datasets || !state.center) return null;
  return matchedSpots({ ...state, onlyFree: true }).length;
}

export function emptyReason(state) {
  if (!Object.values(state.layers).some(Boolean)) return 'layers-off';
  if (state.onlyFree && matchedSpots({ ...state, onlyFree: false }).length > 0) return 'free-filter';
  return state.radius === 3200 ? 'range' : 'radius';
}
