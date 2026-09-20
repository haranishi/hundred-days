import { primaryRomaji } from './romaji.js';

/* 秋田の郷土料理。すべて一般名称で、特定の製造元の登録商標にあたりうる呼び名
   （「ババヘラ」など）と品種名・ブランド名（「あきたこまち」など）は入れていない。

   値段はこのゲームの中の目安で、実際の販売価格ではない。
   打鍵数（既定のローマ字での長さ）から段階で決めるので、ここには持たせない。

   image は assets/dish/<image>.webp に対応する。よみのローマ字から機械的に導けそうに見えるが、
   語尾の `ん` が nn になる2品（稲庭うどん・とんぶりごはん）でずれるので、明示的に持たせている。 */

export const DISHES = [
  { name: 'ぎばさ', reading: 'ぎばさ', note: '海藻。刻むと糸を引く', image: 'gibasa' },
  { name: 'ぶりこ', reading: 'ぶりこ', note: 'ハタハタの卵', image: 'buriko' },
  { name: 'とんぶり', reading: 'とんぶり', note: 'ホウキギの実。畑のキャビア', image: 'tonburi' },
  { name: 'もろこし', reading: 'もろこし', note: '小豆の粉を固めた干菓子', image: 'morokoshi' },
  { name: 'あさづけ', reading: 'あさづけ', note: '米と果汁の甘い冷菓', image: 'asaduke' },
  { name: 'ハタハタ', reading: 'はたはた', note: '県の魚。冬に大量に獲れる', image: 'hatahata' },
  { name: 'じゅんさい', reading: 'じゅんさい', note: 'ぬめりのある水草。夏が旬', image: 'junsai' },
  { name: 'きりたんぽ', reading: 'きりたんぽ', note: 'ご飯を潰して棒に巻いて焼く', image: 'kiritanpo' },
  { name: 'だまこもち', reading: 'だまこもち', note: 'ご飯を丸めたもの', image: 'damakomochi' },
  { name: 'しとぎもち', reading: 'しとぎもち', note: '生米から作るもち', image: 'shitogimochi' },
  { name: '秋田ふき', reading: 'あきたふき', note: '人の背丈まで伸びるふき', image: 'akitafuki' },
  { name: 'ばっけみそ', reading: 'ばっけみそ', note: 'ばっけ＝ふきのとう', image: 'bakkemiso' },
  { name: 'みずのたたき', reading: 'みずのたたき', note: '山菜のミズを叩く', image: 'mizunotataki' },
  { name: 'いぶりがっこ', reading: 'いぶりがっこ', note: '燻した大根の漬物', image: 'iburigakko' },
  { name: '比内地鶏', reading: 'ひないじどり', note: '三大地鶏のひとつ', image: 'hinaijidori' },
  { name: 'ハタハタずし', reading: 'はたはたずし', note: '飯と漬け込む なれずし', image: 'hatahatazushi' },
  { name: '稲庭うどん', reading: 'いなにわうどん', note: '手延べの平たいうどん', image: 'inaniwaudon' },
  { name: 'しょっつる鍋', reading: 'しょっつるなべ', note: 'しょっつる＝魚醤', image: 'shottsurunabe' },
  { name: 'きりたんぽ鍋', reading: 'きりたんぽなべ', note: '比内地鶏の出汁で煮る', image: 'kiritanponabe' },
  { name: 'とんぶりごはん', reading: 'とんぶりごはん', note: 'ぷちぷちが乗る', image: 'tonburigohan' }
];

/* コース。制限時間は共通で、変えるのは3つだけ。
     maxKeys  … 出題する料理の打鍵数の上限（null は全品）
     interval … 皿の投入間隔（ミリ秒）。走行時間は interval × PLATES_ON_BELT
     target   … 目標額

   速さだけで難易度を作ると、初心者には「長い語が最後まで打てないまま流れていく」形になり、
   遅くしても解決しない。だから お手軽 は語そのものを短いものに絞る。
   打鍵8以下だと6品しか残らず同じ皿が繰り返しすぎるので、9以下（10品）で切っている。 */
export const COURSES = [
  { id: 'light', label: 'お手軽', target: 700, interval: 2800, maxKeys: 9, hint: '10品・ゆっくり', pace: 'どの速さでも', needsKps: 0 },
  { id: 'standard', label: 'おすすめ', target: 3000, interval: 1600, maxKeys: null, hint: '全20品', pace: '約2.5打/秒から', needsKps: 2.5 },
  { id: 'heavy', label: '大食い', target: 4500, interval: 1200, maxKeys: null, hint: '全20品・速い', pace: '約4打/秒から', needsKps: 4 }
];

export const DURATION_MS = 60_000;

export function courseById(id) {
  return COURSES.find((c) => c.id === id) || COURSES[1];
}

/** そのコースで出題する料理。打鍵数の上限で絞る */
export function dishesForCourse(course) {
  if (!course || !course.maxKeys) return DISHES;
  return DISHES.filter((d) => primaryRomaji(d.reading).length <= course.maxKeys);
}

/**
 * 打鍵速度に合うコース。実測（tests/difficulty.test.mjs）で「元が取れる速さ」を測ってあるので、
 * その値をそのまま境目に使う。速い順に見て、届いている中でいちばん重いコースを返す。
 */
export function recommendCourse(kps) {
  for (let i = COURSES.length - 1; i >= 0; i -= 1) {
    if (kps >= COURSES[i].needsKps) return COURSES[i];
  }
  return COURSES[0];
}

/** 名前に漢字を含む料理だけ、よみをふりがなとして名前の上に乗せる（カタカナ語はふりがなが情報を持たない） */
export function hasKanji(name) {
  return /[\u4e00-\u9fff]/.test(name);
}
