/* Jean Meeus, Astronomical Algorithms 2nd ed. の式を使う天文計算。
   時刻の入出力は Unix milliseconds (UTC)。DOM・端末タイムゾーンには触れない。 */

export const DELTA_T_SECONDS = 69;
export const DAY_MS = 86_400_000;
const J2000 = 2451545.0;
const AU_KM = 149_597_870.7;
const DEG = Math.PI / 180;

const sin = (degrees) => Math.sin(degrees * DEG);
const cos = (degrees) => Math.cos(degrees * DEG);
const asin = (value) => Math.asin(Math.max(-1, Math.min(1, value))) / DEG;
const atan2 = (y, x) => Math.atan2(y, x) / DEG;
const norm = (degrees) => ((degrees % 360) + 360) % 360;
const signed = (degrees) => ((degrees + 540) % 360) - 180;

export function julianDate(utcMs) {
  return utcMs / DAY_MS + 2440587.5;
}

export function utcFromJulian(jd) {
  return (jd - 2440587.5) * DAY_MS;
}

function jdeFromUtc(utcMs) {
  return julianDate(utcMs) + DELTA_T_SECONDS / 86_400;
}

function utcFromJde(jde) {
  return utcFromJulian(jde - DELTA_T_SECONDS / 86_400);
}

function obliquity(T) {
  const seconds = 21.448 - 46.815 * T - 0.00059 * T * T + 0.001813 * T ** 3;
  return 23 + 26 / 60 + seconds / 3600;
}

/** 第25章。太陽の見かけの黄経と地球太陽間距離。 */
export function sunPosition(utcMs) {
  const jde = jdeFromUtc(utcMs);
  const T = (jde - J2000) / 36525;
  const L0 = norm(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const M = norm(357.52911 + 35999.05029 * T - 0.0001537 * T * T + T ** 3 / 24_490_000);
  const eccentricity = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M)
    + (0.019993 - 0.000101 * T) * sin(2 * M)
    + 0.000289 * sin(3 * M);
  const trueLongitude = L0 + C;
  const trueAnomaly = M + C;
  const omega = 125.04 - 1934.136 * T;
  const longitude = norm(trueLongitude - 0.00569 - 0.00478 * sin(omega));
  const distanceAu = 1.000001018 * (1 - eccentricity * eccentricity)
    / (1 + eccentricity * cos(trueAnomaly));
  return { longitude, latitude: 0, distanceKm: distanceAu * AU_KM, distanceAu, T };
}

/* 第47章 Table 47.A。D, M, M′, F, 黄経係数, 距離係数。 */
const MOON_LR = [
  [0,0,1,0,6288774,-20905355],[2,0,-1,0,1274027,-3699111],[2,0,0,0,658314,-2955968],
  [0,0,2,0,213618,-569925],[0,1,0,0,-185116,48888],[0,0,0,2,-114332,-3149],
  [2,0,-2,0,58793,246158],[2,-1,-1,0,57066,-152138],[2,0,1,0,53322,-170733],
  [2,-1,0,0,45758,-204586],[0,1,-1,0,-40923,-129620],[1,0,0,0,-34720,108743],
  [0,1,1,0,-30383,104755],[2,0,0,-2,15327,10321],[0,0,1,2,-12528,0],
  [0,0,1,-2,10980,79661],[4,0,-1,0,10675,-34782],[0,0,3,0,10034,-23210],
  [4,0,-2,0,8548,-21636],[2,1,-1,0,-7888,24208],[2,1,0,0,-6766,30824],
  [1,0,-1,0,-5163,-8379],[1,1,0,0,4987,-16675],[2,-1,1,0,4036,-12831],
  [2,0,2,0,3994,-10445],[4,0,0,0,3861,-11650],[2,0,-3,0,3665,14403],
  [0,1,-2,0,-2689,-7003],[2,0,-1,2,-2602,0],[2,-1,-2,0,2390,10056],
  [1,0,1,0,-2348,6322],[2,-2,0,0,2236,-9884],[0,1,2,0,-2120,5751],
  [0,2,0,0,-2069,0],[2,-2,-1,0,2048,-4950],[2,0,1,-2,-1773,4130],
  [2,0,0,2,-1595,0],[4,-1,-1,0,1215,-3958],[0,0,2,2,-1110,0],
  [3,0,-1,0,-892,3258],[2,1,1,0,-810,2616],[4,-1,-2,0,759,-1897],
  [0,2,-1,0,-713,-2117],[2,2,-1,0,-700,2354],[2,1,-2,0,691,0],
  [2,-1,0,-2,596,0],[4,0,1,0,549,-1423],[0,0,4,0,537,-1117],
  [4,-1,0,0,520,-1571],[1,0,-2,0,-487,-1739],[2,1,0,-2,-399,0],
  [0,0,2,-2,-381,-4421],[1,1,1,0,351,0],[3,0,-2,0,-340,0],
  [4,0,-3,0,330,0],[2,-1,2,0,327,0],[0,2,1,0,-323,1165],
  [1,1,-1,0,299,0],[2,0,3,0,294,0],[2,0,-1,-2,0,8752]
];

/* 第47章 Table 47.B。D, M, M′, F, 黄緯係数。 */
const MOON_B = [
  [0,0,0,1,5128122],[0,0,1,1,280602],[0,0,1,-1,277693],[2,0,0,-1,173237],
  [2,0,-1,1,55413],[2,0,-1,-1,46271],[2,0,0,1,32573],[0,0,2,1,17198],
  [2,0,1,-1,9266],[0,0,2,-1,8822],[2,-1,0,-1,8216],[2,0,-2,-1,4324],
  [2,0,1,1,4200],[2,1,0,-1,-3359],[2,-1,-1,1,2463],[2,-1,0,1,2211],
  [2,-1,-1,-1,2065],[0,1,-1,-1,-1870],[4,0,-1,-1,1828],[0,1,0,1,-1794],
  [0,0,0,3,-1749],[0,1,-1,1,-1565],[1,0,0,1,-1491],[0,1,1,1,-1475],
  [0,1,1,-1,-1410],[0,1,0,-1,-1344],[1,0,0,-1,-1335],[0,0,3,1,1107],
  [4,0,0,-1,1021],[4,0,-1,1,833],[0,0,1,-3,777],[4,0,-2,1,671],
  [2,0,0,-3,607],[2,0,2,-1,596],[2,-1,1,-1,491],[2,0,-2,1,-451],
  [0,0,3,-1,439],[2,0,2,1,422],[2,0,-3,-1,421],[2,1,-1,1,-366],
  [2,1,0,1,-351],[4,0,0,1,331],[2,-1,1,1,315],[2,-2,0,-1,302],
  [0,0,1,3,-283],[2,1,1,-1,-229],[1,1,0,-1,223],[1,1,0,1,223],
  [0,1,-2,-1,-220],[2,1,-1,-1,-220],[1,0,1,1,-185],[2,-1,-2,-1,181],
  [0,1,2,1,-177],[4,0,-2,-1,176],[4,-1,-1,-1,166],[1,0,1,-1,-164],
  [4,0,1,-1,132],[1,0,-1,-1,-119],[4,-1,0,-1,115],[2,-2,0,1,107]
];

/** 第47章。月の地心黄経・黄緯・距離と地平視差。 */
export function moonPosition(utcMs) {
  const jde = jdeFromUtc(utcMs);
  const T = (jde - J2000) / 36525;
  const Lp = norm(218.3164477 + 481267.88123421 * T - 0.0015786 * T ** 2 + T ** 3 / 538841 - T ** 4 / 65194000);
  const D = norm(297.8501921 + 445267.1114034 * T - 0.0018819 * T ** 2 + T ** 3 / 545868 - T ** 4 / 113065000);
  const M = norm(357.5291092 + 35999.0502909 * T - 0.0001536 * T ** 2 + T ** 3 / 24490000);
  const Mp = norm(134.9633964 + 477198.8675055 * T + 0.0087414 * T ** 2 + T ** 3 / 69699 - T ** 4 / 14712000);
  const F = norm(93.2720950 + 483202.0175233 * T - 0.0036539 * T ** 2 - T ** 3 / 3526000 + T ** 4 / 863310000);
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const A1 = norm(119.75 + 131.849 * T);
  const A2 = norm(53.09 + 479264.290 * T);
  const A3 = norm(313.45 + 481266.484 * T);

  let sigmaL = 0;
  let sigmaR = 0;
  for (const [d, m, mp, f, l, r] of MOON_LR) {
    const e = Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E * E : 1;
    const argument = d * D + m * M + mp * Mp + f * F;
    sigmaL += l * e * sin(argument);
    sigmaR += r * e * cos(argument);
  }
  sigmaL += 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2);

  let sigmaB = 0;
  for (const [d, m, mp, f, b] of MOON_B) {
    const e = Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E * E : 1;
    sigmaB += b * e * sin(d * D + m * M + mp * Mp + f * F);
  }
  sigmaB += -2235 * sin(Lp) + 382 * sin(A3) + 175 * sin(A1 - F)
    + 175 * sin(A1 + F) + 127 * sin(Lp - Mp) - 115 * sin(Lp + Mp);

  const longitude = norm(Lp + sigmaL / 1_000_000);
  const latitude = sigmaB / 1_000_000;
  const distanceKm = 385000.56 + sigmaR / 1000;
  const parallax = asin(6378.14 / distanceKm);
  return { longitude, latitude, distanceKm, parallax, T, D, M, Mp, F };
}

export function equatorial(position) {
  const epsilon = obliquity(position.T);
  const lambda = position.longitude;
  const beta = position.latitude ?? 0;
  const rightAscension = norm(atan2(
    sin(lambda) * cos(epsilon) - Math.tan(beta * DEG) * sin(epsilon),
    cos(lambda)
  ));
  const declination = asin(sin(beta) * cos(epsilon) + cos(beta) * sin(epsilon) * sin(lambda));
  return { rightAscension, declination };
}

export function siderealTime(utcMs) {
  const jd = julianDate(utcMs);
  const T = (jd - J2000) / 36525;
  return norm(280.46061837 + 360.98564736629 * (jd - J2000)
    + 0.000387933 * T * T - T ** 3 / 38710000);
}

export function horizontal(position, utcMs, lat, lon) {
  const { rightAscension, declination } = equatorial(position);
  const hourAngle = signed(siderealTime(utcMs) + lon - rightAscension);
  const altitude = asin(sin(lat) * sin(declination) + cos(lat) * cos(declination) * cos(hourAngle));
  const azimuth = norm(atan2(
    sin(hourAngle),
    cos(hourAngle) * sin(lat) - Math.tan(declination * DEG) * cos(lat)
  ) + 180);
  return { altitude, azimuth, hourAngle, declination, rightAscension };
}

/** 第48章の位相角と輝面比。 */
export function illumination(utcMs) {
  const moon = moonPosition(utcMs);
  const sun = sunPosition(utcMs);
  const elongation = Math.acos(
    Math.max(-1, Math.min(1,
      sin(moon.latitude) * sin(sun.latitude)
      + cos(moon.latitude) * cos(sun.latitude) * cos(moon.longitude - sun.longitude)
    ))
  );
  const phaseAngle = Math.atan2(
    sun.distanceKm * Math.sin(elongation),
    moon.distanceKm - sun.distanceKm * Math.cos(elongation)
  );
  return {
    fraction: (1 + Math.cos(phaseAngle)) / 2,
    phaseAngle: phaseAngle / DEG,
    elongation: elongation / DEG
  };
}

function phaseCorrection(k, phase) {
  const T = k / 1236.85;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const M = norm(2.5534 + 29.10535670 * k - 0.0000014 * T * T - 0.00000011 * T ** 3);
  const Mp = norm(201.5643 + 385.81693528 * k + 0.0107582 * T * T + 0.00001238 * T ** 3 - 0.000000058 * T ** 4);
  const F = norm(160.7108 + 390.67050284 * k - 0.0016118 * T * T - 0.00000227 * T ** 3 + 0.000000011 * T ** 4);
  const omega = norm(124.7746 - 1.56375588 * k + 0.0020672 * T * T + 0.00000215 * T ** 3);
  const E2 = E * E;
  let c;
  if (phase === 'new' || phase === 'full') {
    const full = phase === 'full';
    c = -(full ? 0.40614 : 0.40720) * sin(Mp)
      + (full ? 0.17302 : 0.17241) * E * sin(M)
      + (full ? 0.01614 : 0.01608) * sin(2 * Mp)
      + (full ? 0.01043 : 0.01039) * sin(2 * F)
      + (full ? 0.00734 : 0.00739) * E * sin(Mp - M)
      - (full ? 0.00515 : 0.00514) * E * sin(Mp + M)
      + (full ? 0.00209 : 0.00208) * E2 * sin(2 * M)
      - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F)
      + 0.00056 * E * sin(2 * Mp + M) - 0.00042 * sin(3 * Mp)
      + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F)
      - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(omega)
      - 0.00007 * sin(Mp + 2 * M) + 0.00004 * sin(2 * Mp - 2 * F)
      + 0.00004 * sin(3 * M) + 0.00003 * sin(Mp + M - 2 * F)
      + 0.00003 * sin(2 * Mp + 2 * F) - 0.00003 * sin(Mp + M + 2 * F)
      + 0.00003 * sin(Mp - M + 2 * F) - 0.00002 * sin(Mp - M - 2 * F)
      - 0.00002 * sin(3 * Mp + M) + 0.00002 * sin(4 * Mp);
  } else {
    c = -0.62801 * sin(Mp) + 0.17172 * E * sin(M) - 0.01183 * E * sin(Mp + M)
      + 0.00862 * sin(2 * Mp) + 0.00804 * sin(2 * F) + 0.00454 * E * sin(Mp - M)
      + 0.00204 * E2 * sin(2 * M) - 0.00180 * sin(Mp - 2 * F) - 0.00070 * sin(Mp + 2 * F)
      - 0.00040 * sin(3 * Mp) - 0.00034 * E * sin(2 * Mp - M)
      + 0.00032 * E * sin(M + 2 * F) + 0.00032 * E * sin(M - 2 * F)
      - 0.00028 * E2 * sin(Mp + 2 * M) + 0.00027 * E * sin(2 * Mp + M)
      - 0.00017 * sin(omega) - 0.00005 * sin(Mp - M - 2 * F)
      + 0.00004 * sin(2 * Mp + 2 * F) - 0.00004 * sin(Mp + M + 2 * F)
      + 0.00004 * sin(Mp - 2 * M) + 0.00003 * sin(Mp + M - 2 * F)
      + 0.00003 * sin(3 * M) + 0.00002 * sin(2 * Mp - 2 * F)
      + 0.00002 * sin(Mp - M + 2 * F) - 0.00002 * sin(3 * Mp + M);
    const W = 0.00306 - 0.00038 * E * cos(M) + 0.00026 * cos(Mp)
      - 0.00002 * cos(Mp - M) + 0.00002 * cos(Mp + M) + 0.00002 * cos(2 * F);
    c += phase === 'first' ? W : -W;
  }

  const A = [
    [299.77 + 0.107408 * k - 0.009173 * T * T, 0.000325],
    [251.88 + 0.016321 * k, 0.000165],[251.83 + 26.651886 * k, 0.000164],
    [349.42 + 36.412478 * k, 0.000126],[84.66 + 18.206239 * k, 0.000110],
    [141.74 + 53.303771 * k, 0.000062],[207.14 + 2.453732 * k, 0.000060],
    [154.84 + 7.306860 * k, 0.000056],[34.52 + 27.261239 * k, 0.000047],
    [207.19 + 0.121824 * k, 0.000042],[291.34 + 1.844379 * k, 0.000040],
    [161.72 + 24.198154 * k, 0.000037],[239.56 + 25.513099 * k, 0.000035],
    [331.55 + 3.592518 * k, 0.000023]
  ];
  return c + A.reduce((sum, [angle, coefficient]) => sum + coefficient * sin(angle), 0);
}

/** 第49章。lunation は朔を整数として 0/.25/.5/.75 を加えた k。 */
export function phaseTime(lunation, phase = 'new') {
  const fractions = { new: 0, first: 0.25, full: 0.5, last: 0.75 };
  const k = Math.floor(lunation) + fractions[phase];
  const T = k / 1236.85;
  const jde = 2451550.09765 + 29.530588853 * k + 0.0001337 * T * T
    - 0.000000150 * T ** 3 + 0.00000000073 * T ** 4
    + phaseCorrection(k, phase);
  return utcFromJde(jde);
}

function approximateLunation(utcMs) {
  return Math.floor((jdeFromUtc(utcMs) - 2451550.09765) / 29.530588853);
}

export function phaseEventsAround(utcMs) {
  const approx = approximateLunation(utcMs);
  const events = [];
  for (let n = approx - 2; n <= approx + 2; n += 1) {
    for (const phase of ['new', 'first', 'full', 'last']) {
      events.push({ phase, time: phaseTime(n, phase), lunation: n });
    }
  }
  return events.sort((a, b) => a.time - b.time);
}

export function lunarCycle(utcMs) {
  const events = phaseEventsAround(utcMs);
  const newMoons = events.filter(({ phase }) => phase === 'new');
  const previousNew = [...newMoons].reverse().find(({ time }) => time <= utcMs);
  const nextNew = newMoons.find(({ time }) => time > utcMs);
  const nextFull = events.find(({ phase, time }) => phase === 'full' && time > utcMs);
  const previousFull = [...events].reverse().find(({ phase, time }) => phase === 'full' && time <= utcMs);
  return {
    previousNew: previousNew.time,
    nextNew: nextNew.time,
    nextFull: nextFull.time,
    previousFull: previousFull.time,
    age: (utcMs - previousNew.time) / DAY_MS,
    waxing: utcMs < (nextFull.time < nextNew.time ? nextFull.time : previousFull.time)
  };
}

export function nearestFullMoon(utcMs) {
  return phaseEventsAround(utcMs)
    .filter(({ phase }) => phase === 'full')
    .sort((a, b) => Math.abs(a.time - utcMs) - Math.abs(b.time - utcMs))[0].time;
}

const POSITIONS = {
  moon: moonPosition,
  sun: sunPosition
};

/* 出没の基準高度。国立天文台の暦と同じ定義に合わせる：
   地平大気差は 35′8″。太陽は上辺（大気差＋視半径 16′）、月は中心（大気差と地平視差だけ）。
   Meeus の 0.7275π − 34′ は月の上辺基準で、東京 2026-09-02 の月の入りが暦より約2分遅れた。
   JPL Horizons の見かけの高度で確かめると、暦の 10:16 / 20:38 は月の中心が地平線に来る時刻と一致する。 */
const HORIZON_REFRACTION = (35 + 8 / 60) / 60;
const SUN_SEMIDIAMETER = 16 / 60;

function threshold(body, position) {
  return body === 'sun' ? -(HORIZON_REFRACTION + SUN_SEMIDIAMETER) : position.parallax - HORIZON_REFRACTION;
}

/** 日本時間の暦日 0:00 を startUtcMs とし、24時間を2分刻みで走査する。 */
export function riseSet(body, startUtcMs, lat, lon) {
  const positionAt = POSITIONS[body];
  if (!positionAt) throw new TypeError(`unknown body: ${body}`);
  const value = (time) => {
    const position = positionAt(time);
    return horizontal(position, time, lat, lon).altitude - threshold(body, position);
  };
  const events = [];
  const step = 120_000;
  let left = startUtcMs;
  let leftValue = value(left);
  for (let right = startUtcMs + step; right <= startUtcMs + DAY_MS; right += step) {
    const rightValue = value(right);
    if ((leftValue <= 0 && rightValue > 0) || (leftValue >= 0 && rightValue < 0)) {
      const rising = leftValue <= 0;
      let lo = left;
      let hi = right;
      for (let iteration = 0; iteration < 18 && hi - lo > 500; iteration += 1) {
        const mid = (lo + hi) / 2;
        const midValue = value(mid);
        if ((midValue <= 0) === (leftValue <= 0)) lo = mid;
        else hi = mid;
      }
      const time = Math.round((lo + hi) / 2000) * 1000;
      const position = positionAt(time);
      const at = horizontal(position, time, lat, lon);
      events.push({ type: rising ? 'rise' : 'set', time, azimuth: at.azimuth });
    }
    left = right;
    leftValue = rightValue;
  }
  return {
    rise: events.find(({ type }) => type === 'rise') ?? null,
    set: events.find(({ type }) => type === 'set') ?? null,
    events
  };
}

export function bodyHorizontal(body, utcMs, lat, lon) {
  const positionAt = POSITIONS[body];
  if (!positionAt) throw new TypeError(`unknown body: ${body}`);
  return horizontal(positionAt(utcMs), utcMs, lat, lon);
}

export const DIRECTIONS_16 = ['北','北北東','北東','東北東','東','東南東','南東','南南東','南','南南西','南西','西南西','西','西北西','北西','北北西'];

export function direction16(azimuth) {
  if (!Number.isFinite(azimuth)) return '';
  return DIRECTIONS_16[Math.round(norm(azimuth) / 22.5) % 16];
}
