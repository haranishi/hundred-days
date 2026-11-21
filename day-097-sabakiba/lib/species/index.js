import aji from './aji.js';
import iwashi from './iwashi.js';
import saba from './saba.js';
import sanma from './sanma.js';
import tai from './tai.js';
import hirame from './hirame.js';
import kisu from './kisu.js';
import katsuo from './katsuo.js';

export const SPECIES = { aji, iwashi, saba, sanma, tai, hirame, kisu, katsuo };
export const getSpecies = id => Object.hasOwn(SPECIES, id) ? SPECIES[id] : null;
