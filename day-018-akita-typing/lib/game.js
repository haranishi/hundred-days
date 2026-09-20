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
  /* プレイヤーが「これを取る」と選んだ皿のid。0は選んでいない。
     語の1打目でだけ動き（→ press）、その皿が消えれば自然に効かなくなる（idは使い回さない）。 */
  let chosenId = 0;

  const totals = { eaten: 0, hits: 0, misses: 0, dishesEaten: 0, dishesMissed: 0 };
  const missMap = Object.create(null);
  /* 食べた料理を出た順に覚えておく（結果画面の豆知識に使う）。
     同じ料理は何度も出るので、重複は読む側で畳む */
  const eatenDishes = [];
  /* 打ち切れずに終わった料理を1つだけ出したい。
     「1打も入れずに流れた最後の皿」を覚えておき、打ちかけの皿があればそちらを優先する */
  let lastMissedDish = null;

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
    chosenId = 0;
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
      // 逃した時刻。画面側が「そこから左へ抜ける」動きに使う
      plate.missedAt = now;
      lastMissedDish = plate.dish;
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

  /** いま打つべき皿。選んだ皿が最優先、次につかんでいる皿、無ければレーンの先頭（いちばん左） */
  function active() {
    let chosen = null;
    let holding = null;
    let first = null;
    for (const plate of plates) {
      if (plate.state !== 'riding') continue;
      if (plate.id === chosenId) chosen = plate;
      if (!holding && plate.held) holding = plate;
      if (!first || plate.born < first.born) first = plate;
    }
    return chosen || holding || first;
  }

  /** その皿を取りに行くときに押すキー。まだ1打も入っていない走行中の皿だけが持つ（画面の札と同じ1文字） */
  function headKey(plate) {
    if (plate.state !== 'riding') return null;
    if (plate.matcher.typed.length > 0) return null;
    return plate.matcher.expected();
  }

  /* 取りかかる先。押されたキーで始まる皿を探す。同着は born が古いほう＝レーンの左にあるほう。
     「どの皿の先頭キーでもないキー」はここで見つからないので、今までどおりミスになる。 */
  function takeable(key, except) {
    let found = null;
    for (const plate of plates) {
      if (plate === except) continue;
      if (headKey(plate) !== key) continue;
      if (!found || plate.born < found.born) found = plate;
    }
    return found;
  }

  /**
   * キーを1つ受ける。戻り値の kind は画面の演出用。
   * 'idle' = 打つ皿が無い（ミスに数えない）／'hit'／'ate'／'miss'
   */
  function press(key, now) {
    let plate = active();
    if (!plate) return { kind: 'idle' };

    /* 直前に正しく打てたキー。ミスの集計をこの2連接で取ると、単独の `k` が
       きりたんぽ・もろこし・ばっけみそ…のどれで転んだのか分からない問題が消える
       （`ts` なら しょっつる鍋 の tsu と結びつく）。語頭は直前が無いので単独キーのまま */
    const prev = plate.matcher.typed.slice(-1);

    let res = plate.matcher.input(key);
    let switched = false;

    if (!res.ok) {
      /* どの皿から打ち始めるかは「語の1打目」で決まる。押したキーで始まる皿がレーンにあるなら、
         それは打ち間違いではなく「そっちを取る」という選択なので、ミスにも missMap にも入れない。
         打ちかけの皿は捨てないので、代償も無い（皿の札は「押せばこの皿から始まる」の一択）。

         語の途中では選び直せない。ここを開けておくと、隣のキーへの指ズレが「乗り換え」として
         発火し、打ちかけの語が無言で全部消える。隣接キー誤打を10%混ぜた実測で、
         誤打19回のうち3回（16%）がそれで、ハタハタずしを hata まで打って ぎばさ へ飛ばされた。
         捨てた皿は次の tick() で逃した扱いにもなるので、逃した数まで増えていた。 */
      const other = plate.matcher.typed.length === 0 ? takeable(key, plate) : null;
      if (!other) {
        totals.misses += 1;
        const want = res.expected;
        if (want) {
          const at = prev + want;
          missMap[at] = (missMap[at] || 0) + 1;
        }
        return { kind: 'miss', plate, expected: want };
      }
      /* 離れる皿は1打も入っていない＝判定器は手つかずなので、作り直す必要がない
         （createMatcher は input が通ったときだけ進む） */
      chosenId = other.id;
      plate = other;
      // 先頭キーとして受け取ったキーなので、この1打はそのまま新しい皿の1打目になる
      res = plate.matcher.input(key);
      switched = true;
    }

    totals.hits += 1;
    if (res.done) {
      plate.state = 'eaten';
      plate.eatenAt = now;
      eatenDishes.push(plate.dish);
      totals.eaten += plate.price;
      totals.dishesEaten += 1;
      return { kind: 'ate', plate, switched };
    }
    return { kind: 'hit', plate, switched };
  }

  return {
    start,
    tick,
    press,
    active,
    headKey,
    progress,
    isExpiring,
    get plates() { return plates; },
    get totals() { return { ...totals }; },
    get missMap() { return { ...missMap }; },
    get eatenDishes() { return eatenDishes.slice(); },
    /* 「打ち切れずに流れた料理」。打ちかけのまま終わった皿が最優先で、
       無ければ1打も入れずに逃した最後の皿を返す。どちらも無ければ null */
    unfinished() {
      const held = plates.find((p) => p.state === 'riding' && p.matcher.typed.length > 0);
      if (held) return { dish: held.dish, rest: held.matcher.remaining() };
      if (lastMissedDish) return { dish: lastMissedDish, rest: '' };
      return null;
    },
    get travelMs() { return travelMs; },
    elapsed: (now) => (running ? now - startedAt : 0),
    remaining: (now) => (running ? Math.max(0, duration - (now - startedAt)) : duration),
    isOver: (now) => running && now - startedAt >= duration
  };
}
