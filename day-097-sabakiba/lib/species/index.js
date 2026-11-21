import aji from './aji.js';

export const SPECIES = { aji };
export const getSpecies = id => Object.hasOwn(SPECIES, id) ? SPECIES[id] : null;
