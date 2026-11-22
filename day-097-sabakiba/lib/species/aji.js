import { SPECIES_META } from './meta.js';

// 調査R2の近似寸法。長さは %SL、吻長と眼径・口裂長は %HL、椎体径は最大体高に対する百分率です。
export default {
  ...SPECIES_META.aji,
  shape: { TL_over_SL: 1.16, maxDepth: 25.1, maxDepthPos: 40, maxWidth: 12, peduncleDepth: 4,
    headLength: 27.5, opercleEdge: 27.5, snout: 31, eyeDia: 22.6, eyePos: 11.7, belly: 0.94,
    mouth: 'superior', mouthLength: 38 },
  fins: {
    pectoral: { base: 28, length: 27 }, pelvic: { origin: 31, length: 11 },
    dorsal: [{ origin: 34, end: 48, height: 13, spines: 8, softRays: 0 },
      { origin: 50, end: 90, height: 10, spines: 1, softRays: 32 }],
    anal: { origin: 53, end: 90, height: 9, spines: 3, softRays: 28 },
    caudal: { length: 16, forkDepth: 0.78 }, finlets: { dorsal: 0, anal: 0 },
  },
  vent: 50, cavityEnd: 49, vertebrae: { pre: 10, caudal: 14 }, vertebraDia: 6, swimBladder: true,
  pinbones: { count: 20, from: 30, to: 65 }, scutes: { count: 71, from: 28 },
  look: { colors: { dorsal: '#2F4858', flank: '#B8C7CC', belly: '#EEF2F5', fin: '#A5A882', iris: '#D8D6C8' },
    patterns: ['opercleSpot'], scale: { size: 0.075, gloss: 0.7 }, flesh: 'pink' },
};
