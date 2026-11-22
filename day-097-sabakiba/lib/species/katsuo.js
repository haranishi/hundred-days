import { SPECIES_META } from './meta.js';

// 寸法と色は調査R2の近似値です。小骨の本数は手順で個別に見せる本数です。
export default {
  ...SPECIES_META.katsuo,
  shape: { TL_over_SL: 1.13, maxDepth: 26.5, maxDepthPos: 46, maxWidth: 17.5, peduncleDepth: 2.1,
    headLength: 30.5, opercleEdge: 30.5, snout: 28.5, eyeDia: 16, eyePos: 11.1, eyeHeight: 0.22,
    skinThicknessMm: 1.2, belly: 0.99, mouth: 'terminal', mouthLength: 37 },
  fins: {
    pectoral: { base: 30.5, length: 16 }, pelvic: { origin: 31.9, length: 10 },
    dorsal: [{ origin: 35.5, end: 61, height: 14, spines: 15, softRays: 0 },
      { origin: 65, end: 73, height: 10, spines: 0, softRays: 15 }],
    anal: { origin: 70.5, end: 77, height: 9.5, spines: 0, softRays: 15 },
    caudal: { length: 13, forkDepth: 0.62 }, finlets: { dorsal: 8, anal: 7 },
  },
  vent: 68, cavityEnd: 67, vertebrae: { pre: 20, caudal: 21 }, vertebraDia: 7.5,
  swimBladder: false, pinbones: { count: 18, from: 32, to: 75 },
  look: { colors: { dorsal: '#1A2B52', flank: '#B4C2CE', belly: '#E8EEF2', fin: '#3E4858', iris: '#C8D0D8' },
    patterns: ['bellyStripes'], scale: { size: 0.08, gloss: 0.79 }, flesh: 'red' },
};
