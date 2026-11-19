import { dateOf } from './calendar.js';

const YEAR = 365;
const OCTOBER = dateOf(0).doy;
const rgb = (value) => [value >> 16, value >> 8 & 255, value & 255].map((channel) => channel / 255);
const colors = (stops) => stops.map(([day, value]) => [day, rgb(value)]);

// 各カーブは1月1日から翌年の1月1日まで。葉が少ない時期も色をつないでおく。
const LOOKS = {
  maple: {
    coverage: [[0, 0], [73, 0], [91, 0.28], [120, 0.98], [242, 1], [318, 0.97], [334, 0], [365, 0]],
    bud: [[0, 0], [59, 0], [77, 0.92], [94, 0.55], [119, 0], [365, 0]],
    fall: [[0, 0], [316, 0], [332, 1], [349, 0], [365, 0]],
    leafAge: [[0, 0], [91, 0], [151, 0.42], [244, 0.82], [320, 1], [351, 0], [365, 0]],
    color: colors([[0, 0x8a2a1f], [72, 0xa8d36a], [105, 0xa8d36a], [138, 0x3f8a3a], [231, 0x3f8a3a], [256, 0x92a940], [273, 0xd8452a], [310, 0xd8452a], [333, 0x8a2a1f], [365, 0x8a2a1f]]),
    color2: colors([[0, 0xf0902a], [72, 0xbfe28b], [104, 0xbfe28b], [138, 0x5aa14a], [231, 0x5aa14a], [267, 0xe0b83c], [304, 0xe0b83c], [331, 0xf0902a], [365, 0xf0902a]]),
  },
  pine: {
    coverage: [[0, 0.96], [109, 0.96], [182, 1], [288, 0.98], [365, 0.96]],
    bud: [[0, 0], [118, 0], [140, 0.8], [163, 0.74], [185, 0], [365, 0]],
    fall: [[0, 0], [261, 0], [290, 0.12], [332, 0], [365, 0]],
    leafAge: [[0, 0.82], [109, 0.87], [152, 0.24], [244, 0.62], [365, 0.82]],
    color: colors([[0, 0x2f5a35], [365, 0x2f5a35]]),
    color2: colors([[0, 0x3f6e3d], [118, 0x3f6e3d], [148, 0x9cc66a], [165, 0x83b05a], [190, 0x3f6e3d], [365, 0x3f6e3d]]),
  },
  plum: {
    coverage: [[0, 0], [89, 0], [109, 0.38], [132, 0.97], [282, 0.99], [314, 0.76], [334, 0], [365, 0]],
    flower: [[0, 0.16], [31, 0.94], [50, 1], [76, 0.77], [90, 0.52], [111, 0], [351, 0], [365, 0.16]],
    bud: [[0, 0], [77, 0], [101, 0.68], [123, 0], [365, 0]],
    petal: [[0, 0], [87, 0], [102, 0.93], [124, 0], [365, 0]],
    fall: [[0, 0], [297, 0], [326, 0.86], [342, 0], [365, 0]],
    leafAge: [[0, 0], [103, 0], [151, 0.35], [250, 0.71], [316, 1], [348, 0], [365, 0]],
    color: colors([[0, 0xf6d7de], [92, 0xf6d7de], [119, 0x6fa14a], [254, 0x6fa14a], [285, 0xd2b44d], [329, 0xd2b44d], [365, 0xf6d7de]]),
    color2: colors([[0, 0xffffff], [96, 0xffffff], [119, 0x92b764], [254, 0x92b764], [285, 0xf2cf66], [329, 0xf2cf66], [365, 0xffffff]]),
  },
};

const mix = (a, b, t) => a + (b - a) * t;

function sample(stops, doy) {
  if (!stops) return 0;
  const end = stops.findIndex(([day]) => day > doy);
  const [startDay, a] = stops[end - 1];
  const [endDay, b] = stops[end];
  const t = (doy - startDay) / (endDay - startDay);
  const weight = t * t * (3 - 2 * t);
  return typeof a === 'number' ? mix(a, b, weight) : a.map((v, i) => mix(v, b[i], weight));
}

export function seasonLook(speciesId, doy, { moisture = 0.6 } = {}) {
  if (!Object.hasOwn(LOOKS, speciesId) || !Number.isFinite(doy)) throw new RangeError('樹種または通算日が範囲外です');
  const day = (doy % YEAR + YEAR) % YEAR;
  const curves = LOOKS[speciesId];
  const dryness = Number.isFinite(moisture) ? 1 - Math.max(0, Math.min(0.6, moisture)) / 0.6 : 0;
  const tint = (name) => sample(curves[name], day).map((v, i) => v * (1 - [0.035, 0.11, 0.06][i] * dryness));

  return {
    coverage: sample(curves.coverage, day),
    flower: sample(curves.flower, day),
    bud: sample(curves.bud, day),
    leafAge: sample(curves.leafAge, day),
    fall: sample(curves.fall, day),
    petal: sample(curves.petal, day),
    color: tint('color'),
    color2: tint('color2'),
    season: dateOf(Math.floor(day) - OCTOBER).season,
  };
}
