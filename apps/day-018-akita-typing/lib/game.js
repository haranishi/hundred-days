/* ゲームの中身。DOMには触らないので、そのままユニットテストできる。
   時刻と乱数は外から渡す（tick(now) と random）。画面側が rAF の時刻を流し込む。 */

import { createMatcher } from './romaji.js';
import { priceOfReading } from './scoring.js';

/* レーンに同時に乗っている皿の枚数。走行時間は「投入間隔 × この枚数」で決まるので、
   コースが速くなっても見た目の詰まり方は変わらない（速さだけが変わる）。
   4枚にしてあるのは、狭い画面（幅375px想定）でも皿が重ならない上限だから。 */
export const PLATES_ON_BELT = 4;

/* レーンが空になったときだけ、投入間隔を待たずに次を出す最短の間。
   間隔どおりに出すと、速い人は食べ切ったあと1〜2秒なにも打てない時間が生まれる
   （デモ録画で実際に空のレーンが写って気付いた）。かといって間隔自体を詰めると
   皿が重なって読めなくなるので、「空のときだけ急ぐ」形にしている。 */
export const RUSH_GAP_MS = 450;

/* 残りこれだけになった皿は「もうすぐ消える」として警告する */
export const WARN_MS = 2200;

/** 同じ料理が続けて出ないように、山を作って順に配る */
function dealer(dishes, random) {
  let pile = [];
  return () => {
    if (pile.length === 0) {
      pile = dishes.slice();
      for (let i = pile.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [pile[i], pile[j]] = [pile[j], pile[i]];
      }
    }
    return pile.pop();
  };
}

export function createGame({ course, dishes, duration, random = Math.random }) {
  const draw = dealer(dishes, random);
  const travelMs = course.interval * PLATES_ON_BELT;

  let running = false;
  let startedAt = 0;
  let lastSpawn = 0;
  let nextId = 1;
  let plates = [];

  const totals = { eaten: 0, hits: 0, misses: 0, dishesEaten: 0, dishesMissed: 0 };
  const missMap = Object.create(null);

  function spawn(now) {
    const dish = draw();
    plates.push({
      id: nextId++,
      dish,
      price: priceOfReading(dish.reading),
      born: now,
      state: 'riding',
      matcher: createMatcher(dish.reading)
    });
    lastSpawn = now;
  }

  /* つかんだ皿（1打でも入れた皿）は左端で止まる。0〜1で返し、1が左端 */
  function progress(plate, now) {
    const raw = (now - plate.born) / travelMs;
    return plate.held ? Math.min(1, raw) : raw;
  }

  /** もうすぐ流れ切る皿か。1打でも入れた皿はもう消えないので警告しない */
  function isExpiring(plate, now) {
    if (plate.held || plate.state !== 'riding') return false;
    if (plate.matcher.typed.length > 0) return false;
    return travelMs - (now - plate.born) <= WARN_MS;
  }

  function start(now) {
    running = true;
    startedAt = now;
    lastSpawn = now;
    plates = [];
    spawn(now);
  }

  /** 時刻を進める。皿の投入と取りこぼしの判定だけを行う */
  function tick(now) {
    if (!running) return;
    if (now - startedAt >= duration) return;

    for (const plate of plates) {
      if (plate.state !== 'riding') continue;
      if ((now - plate.born) / travelMs < 1) continue;
      // 1打でも入れた皿は取り上げない。打ちかけの進捗が消えるのが理不尽さの正体だった
      if (plate.matcher.typed.length > 0) {
        plate.held = true;
        continue;
      }
      plate.state = 'missed';
      totals.dishesMissed += 1;
    }
    // 画面から出て時間が経った皿は捨てる（消え際のアニメーションぶんだけ残す）。
    // つかんでいる皿は state が riding のままなので、ここでは落ちない
    plates = plates.filter((p) => p.state === 'riding' || now - p.born < travelMs + 900);

    const hasRiding = plates.some((p) => p.state === 'riding');
    const due = now - lastSpawn >= course.interval;
    const rushed = !hasRiding && now - lastSpawn >= RUSH_GAP_MS;
    if (due || rushed) spawn(now);
  }

  /** いま打つべき皿。つかんでいる皿が最優先、無ければレーンの先頭（いちばん左） */
  function active() {
    let best = null;
    for (const plate of plates) {
      if (plate.state !== 'riding') continue;
      if (plate.held) return plate;
      if (!best || plate.born < best.born) best = plate;
    }
    return best;
  }

  /**
   * キーを1つ受ける。戻り値の kind は画面の演出用。
   * 'idle' = 打つ皿が無い（ミスに数えない）／'hit'／'ate'／'miss'
   */
  function press(key, now) {
    const plate = active();
    if (!plate) return { kind: 'idle' };

    const res = plate.matcher.input(key);
    if (!res.ok) {
      totals.misses += 1;
      const want = res.expected;
      if (want) missMap[want] = (missMap[want] || 0) + 1;
      return { kind: 'miss', plate, expected: want };
    }

    totals.hits += 1;
    if (res.done) {
      plate.state = 'eaten';
      plate.eatenAt = now;
      totals.eaten += plate.price;
      totals.dishesEaten += 1;
      return { kind: 'ate', plate };
    }
    return { kind: 'hit', plate };
  }

  return {
    start,
    tick,
    press,
    active,
    progress,
    isExpiring,
    get plates() { return plates; },
    get totals() { return { ...totals }; },
    get missMap() { return { ...missMap }; },
    get travelMs() { return travelMs; },
    elapsed: (now) => (running ? now - startedAt : 0),
    remaining: (now) => (running ? Math.max(0, duration - (now - startedAt)) : duration),
    isOver: (now) => running && now - startedAt >= duration
  };
}
