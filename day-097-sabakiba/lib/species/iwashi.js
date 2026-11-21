import { SPECIES_META } from './meta.js';

// 寸法と色は調査R2の近似値です。小骨の本数は手順で個別に見せる本数です。
export default {
  ...SPECIES_META.iwashi,
  shape: { TL_over_SL: 1.2, maxDepth: 22, maxDepthPos: 45, maxWidth: 11, peduncleDepth: 7,
    headLength: 26.5, opercleEdge: 26.5, snout: 30, eyeDia: 23, eyePos: 11, eyeHeight: 0.08,
    skinThicknessMm: 0.25, belly: 0.98, mouth: 'superior', mouthLength: 42 },
  fins: {
    pectoral: { base: 26.5, length: 15 }, pelvic: { origin: 54, length: 10 },
    dorsal: [{ origin: 47.5, end: 60, height: 13, spines: 0, softRays: 18 }],
    anal: { origin: 79, end: 92, height: 7, spines: 0, softRays: 17 },
    caudal: { length: 20, forkDepth: 0.65 }, finlets: { dorsal: 0, anal: 0 },
  },
  vent: 77, cavityEnd: 76, vertebrae: { pre: 25, caudal: 25 }, vertebraDia: 5.5,
  swimBladder: true, pinbones: { count: 0, from: 27, to: 92 },
  scutes: { count: 32, from: 25, to: 76, position: 'ventral' },
  look: { colors: { dorsal: '#1F4A6E', flank: '#CFD8DF', belly: '#F0F4F8', fin: '#8A969E', iris: '#DCE2E6' },
    patterns: ['flankSpots'], scale: { size: 0.16, gloss: 0.72 }, flesh: 'red' },
};
