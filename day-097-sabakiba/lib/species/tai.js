import { SPECIES_META } from './meta.js';

// 寸法と色は調査R2の近似値です。小骨の本数は手順で個別に見せる本数です。
export default {
  ...SPECIES_META.tai,
  shape: { TL_over_SL: 1.22, maxDepth: 42, maxDepthPos: 38, maxWidth: 15, peduncleDepth: 10.5,
    headLength: 31.5, opercleEdge: 31.5, snout: 35, eyeDia: 24, eyePos: 14.8, eyeHeight: 0.48,
    skinThicknessMm: 0.8, belly: 0.82, mouth: 'terminal', mouthLength: 36, foreheadFullness: 0.98 },
  fins: {
    pectoral: { base: 31.5, length: 31 }, pelvic: { origin: 37, length: 15 },
    dorsal: [{ origin: 38, end: 86, height: 16, spines: 12, softRays: 10 }],
    anal: { origin: 63, end: 84, height: 14, spines: 3, softRays: 8 },
    caudal: { length: 22, forkDepth: 0.55 }, finlets: { dorsal: 0, anal: 0 },
  },
  vent: 61, cavityEnd: 60, vertebrae: { pre: 10, caudal: 14 }, vertebraDia: 5,
  swimBladder: true, pinbones: { count: 10, from: 34, to: 60 },
  look: { colors: { dorsal: '#C85A5A', flank: '#E38B8E', belly: '#F4ECEE', fin: '#D86E70', iris: '#D6A648' },
    patterns: ['blueSpots'], scale: { size: 0.28, gloss: 0.57 }, flesh: 'white' },
};
