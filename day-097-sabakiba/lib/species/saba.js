import { SPECIES_META } from './meta.js';

// 寸法と色は調査R2の近似値です。小骨の本数は手順で個別に見せる本数です。
export default {
  ...SPECIES_META.saba,
  shape: { TL_over_SL: 1.13, maxDepth: 24.5, maxDepthPos: 42, maxWidth: 15, peduncleDepth: 3.5,
    headLength: 27.3, opercleEdge: 27.3, snout: 29.2, eyeDia: 22.2, eyePos: 11, eyeHeight: 0.23,
    skinThicknessMm: 0.6, belly: 0.98, mouth: 'terminal', mouthLength: 40 },
  fins: {
    pectoral: { base: 29.2, length: 13 }, pelvic: { origin: 34.8, length: 11 },
    dorsal: [{ origin: 37.2, end: 50, height: 12, spines: 10, softRays: 0 },
      { origin: 67, end: 77, height: 8, spines: 0, softRays: 12 }],
    anal: { origin: 70.3, end: 79, height: 7.5, spines: 1, softRays: 13 },
    caudal: { length: 13, forkDepth: 0.72 }, finlets: { dorsal: 5, anal: 5 },
  },
  vent: 68, cavityEnd: 67, vertebrae: { pre: 14, caudal: 17 }, vertebraDia: 6.5,
  swimBladder: true, pinbones: { count: 16, from: 30, to: 70 },
  look: { colors: { dorsal: '#1E4D5C', flank: '#BCCAD0', belly: '#EEF2F5', fin: '#8A8D68', iris: '#D6D8C8' },
    patterns: ['wavyStripes'], scale: { size: 0.08, gloss: 0.76 }, flesh: 'red' },
};
