import { SPECIES_META } from './meta.js';

// 寸法と色は調査R2の近似値です。小骨の本数は手順で個別に見せる本数です。
export default {
  ...SPECIES_META.kisu,
  shape: { TL_over_SL: 1.17, maxDepth: 16, maxDepthPos: 38, maxWidth: 11.5, peduncleDepth: 7,
    headLength: 27.5, opercleEdge: 27.5, snout: 40, eyeDia: 20, eyePos: 13.8, eyeHeight: 0.35,
    skinThicknessMm: 0.25, belly: 0.84, mouth: 'inferior', mouthLength: 26 },
  fins: {
    pectoral: { base: 28.5, length: 15 }, pelvic: { origin: 31, length: 9 },
    dorsal: [{ origin: 33.5, end: 51, height: 14, spines: 11, softRays: 0 },
      { origin: 53, end: 89, height: 9.5, spines: 1, softRays: 22 }],
    anal: { origin: 57, end: 89, height: 8.5, spines: 2, softRays: 23 },
    caudal: { length: 17, forkDepth: 0.25 }, finlets: { dorsal: 0, anal: 0 },
  },
  vent: 55, cavityEnd: 54, vertebrae: { pre: 14, caudal: 21 }, vertebraDia: 8.5,
  swimBladder: true, pinbones: { count: 6, from: 30, to: 54 },
  look: { colors: { dorsal: '#B6A68C', flank: '#DDD8CE', belly: '#F4F5F6', fin: '#CFCAB8', iris: '#E4DFC8' },
    patterns: ['sandyMottle'], scale: { size: 0.1, gloss: 0.68 }, flesh: 'white' },
};
