// 長さ20cmの楕円柱。弧長と頂点番号を取り違えた実装を検出するため、頂点の間隔を変える。
import { CURVE_INFO } from '../../lib/contract.js';

const SL = 20, depth = 2.5, half = 1.25;
const points = {
  snout: [0, 0, 0], eye: [2, 1, 1], mouth: [0, -0.4, 0],
  opercleTop: [4.8, 2, 0.5], opercleBottom: [4.3, -2, 0.5], headCutTop: [5.4, depth, 0],
  headCutBottom: [4.2, -depth, 0], pectoralBase: [4.6, -0.2, half], pelvicBase: [4.3, -2, 0.5],
  cavityStart: [5, -0.7, 0], vent: [10.4, -depth, 0], dorsalFinStart: [6, depth, 0],
  dorsalFinEnd: [15.8, depth, 0], analFinStart: [11, -depth, 0], analFinEnd: [16.5, -depth, 0],
  peduncle: [19.5, 0, 0], tailTip: [23, 0, 0], spineHeadEnd: [5, 0, 0], bodyCenter: [10, 0, 0],
};
const fractions = [0, 0.035, 0.11, 0.23, 0.39, 0.55, 0.68, 0.83, 0.93, 1];
const mix = (a, b, t) => (1 - t) * a + t * b;

function surface(s, phi) {
  const sin = Math.sin(phi), cos = Math.cos(phi);
  const magnitude = Math.hypot(sin / depth, cos / half);
  return { p: [s * SL, depth * sin, half * cos], n: [0, sin / depth / magnitude, cos / half / magnitude] };
}

function curve(name, side = null) {
  const sign = side === 'R' ? -1 : 1;
  const flank = (x, phi) => surface(x / SL, sign > 0 ? phi : Math.PI - phi).p;
  const lane = (from, to, phi) => fractions.map(t => flank(mix(from, to, t), phi));
  const inside = (from, to, y0, y1) => fractions.map(t => [mix(from, to, t), mix(y0, y1, t), sign * 0.16]);
  let path;
  switch (name) {
    case 'headCut': path = fractions.map(t => {
      const phi = (0.5 - t) * Math.PI;
      return flank(4.8 + 0.6 * Math.sin(phi), phi);
    }); break;
    case 'dorsalMidline': case 'dorsalOpen': path = lane(4.8, 19.6, Math.PI / 2); break;
    case 'ventralMidline': path = lane(4.2, 19.6, -Math.PI / 2); break;
    case 'bellySlit': path = lane(10.4, 4.2, -Math.PI / 2); break;
    case 'scaleSweep': case 'skinPeel': path = lane(19.6, 4.8, 0.12); break;
    case 'scuteRow': path = lane(19.6, 10.0, 0); break;
    case 'dorsalCut': case 'engawaCut': path = lane(5.4, 19.6, 1.21); break;
    case 'ventralCut': path = lane(10.4, 19.6, -1.17); break;
    case 'sliceLine': path = lane(6, 10.4, 0.3); break;
    case 'lateralLine': case 'lateralSplit': case 'chiaiTrim': path = lane(4.8, 19.6, 0); break;
    case 'boneCut': case 'boneLift': path = inside(5, 19.6, 0.10, 0.05); break;
    case 'kidneyLine': path = inside(5, 10.4, -0.45, -0.20); break;
    case 'pinBoneLine': path = inside(5.3, 13, 0.21, 0.32); break;
    case 'ribStrip': case 'handOpen': path = inside(5, 10.4, -0.45, -1.74); break;
    case 'tailCut': path = inside(19.3, 19.6, 1.1, -1.1); break;
    default: throw new RangeError('試験用の線がありません。');
  }
  return { points: path, onSurface: !CURVE_INFO[name].inner };
}

export const fakeAnatomy = {
  SL, point: name => [...points[name]], curve, surface,
  profile: () => ({ axisY: 0, top: depth, bottom: depth, half, nTop: 2, nBottom: 2 }),
};
export default fakeAnatomy;
