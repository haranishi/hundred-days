import { SPECIES_META } from './meta.js';

// 寸法と色は調査R2の近似値です。小骨の本数は手順で個別に見せる本数です。
export default {
  ...SPECIES_META.sanma,
  shape: { TL_over_SL: 1.12, maxDepth: 10.5, maxDepthPos: 45, maxWidth: 6.5, peduncleDepth: 2.5,
    headLength: 21.5, opercleEdge: 21.5, snout: 40, eyeDia: 17, eyePos: 10.4, eyeHeight: 0.43,
    skinThicknessMm: 0.25, belly: 0.94, mouth: 'superior', mouthLength: 22, jawProjection: 2.4, lateralLineHeight: -0.78 },
  fins: {
    pectoral: { base: 22.5, length: 7.5 }, pelvic: { origin: 56, length: 5 },
    dorsal: [{ origin: 73, end: 82, height: 5.5, spines: 0, softRays: 11 }],
    anal: { origin: 72, end: 83, height: 5.5, spines: 0, softRays: 13 },
    caudal: { length: 12, forkDepth: 0.7 }, finlets: { dorsal: 5, anal: 5 },
  },
  vent: 70, cavityEnd: 69, vertebrae: { pre: 41, caudal: 24 }, vertebraDia: 9,
  swimBladder: false, stomach: false, pinbones: { count: 26, from: 25, to: 90 },
  look: { colors: { dorsal: '#183854', flank: '#D8E2E8', belly: '#F2F6F9', fin: '#7D8A94', iris: '#DCE2E6' },
    patterns: ['lateralBand'], scale: { size: 0.06, gloss: 0.8 }, flesh: 'pink' },
};
