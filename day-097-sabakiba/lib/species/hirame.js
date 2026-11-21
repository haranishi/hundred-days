import { SPECIES_META } from './meta.js';

// 寸法と色は調査R2の近似値です。小骨の本数は手順で個別に見せる本数です。
export default {
  ...SPECIES_META.hirame,
  shape: { TL_over_SL: 1.19, maxDepth: 44, maxDepthPos: 43, maxWidth: 8.5, peduncleDepth: 10.5,
    headLength: 28, opercleEdge: 28, snout: 22, eyeDia: 18, eyePos: 8.7, eyeHeight: 0.2,
    skinThicknessMm: 0.7, belly: 0.97, mouth: 'superior', mouthLength: 48, headCutBottom: 19 },
  fins: {
    pectoral: { base: 28, length: 13 }, pelvic: { origin: 22, length: 8 },
    dorsal: [{ origin: 7, end: 94, height: 11, spines: 0, softRays: 79 }],
    anal: { origin: 29, end: 94, height: 11, spines: 0, softRays: 60 },
    caudal: { length: 19, forkDepth: 0 }, finlets: { dorsal: 0, anal: 0 },
  },
  vent: 27, cavityEnd: 28, vertebrae: { pre: 11, caudal: 27 }, vertebraDia: 4.5,
  swimBladder: false, pinbones: { count: 3, from: 30, to: 42 },
  look: { colors: { dorsal: '#5A4C3A', flank: '#75644E', belly: '#F2F0EC', fin: '#5E503E', iris: '#B89A58' },
    patterns: ['flatSpots'], blindSide: '#F2F0EC', scale: { size: 0.07, gloss: 0.35 }, flesh: 'white' },
};
