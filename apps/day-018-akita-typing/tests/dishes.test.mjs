import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COURSES, DISHES, DURATION_MS, courseById, dishesForCourse, hasKanji, recommendCourse } from '../lib/dishes.js';
import { isSupported, primaryRomaji } from '../lib/romaji.js';
import { priceOfReading } from '../lib/scoring.js';
/* 難易度そのものは difficulty.test.mjs で「実際にゲームを回して」測る。
   ここでは料理データとコース定義の整合だけを見る。

   かつてここに「必要な打鍵速度」を式で見積もるテストがあったが、実測と2倍以上ずれた
   （式では0.8打/秒、実測では1.9打/秒が必要）ので捨てた。式には「的が常に左端の皿に
   固定され、遅い人は打ちかけの皿を取り上げられ続ける」という構造が入っていなかった。 */

test('すべての料理が判定器で打てる形になっている', () => {
  for (const dish of DISHES) {
    assert.ok(isSupported(dish.reading), `${dish.name} のよみが扱えない: ${dish.reading}`);
    assert.ok(primaryRomaji(dish.reading).length > 0, `${dish.name} のローマ字が空`);
  }
});

test('よみは重複しない', () => {
  const seen = new Set();
  for (const dish of DISHES) {
    assert.equal(seen.has(dish.reading), false, `よみが重複: ${dish.reading}`);
    seen.add(dish.reading);
  }
});

test('よみはひらがなと長音符だけ（表示名と取り違えていない）', () => {
  for (const dish of DISHES) {
    assert.match(dish.reading, /^[ぁ-ゖー]+$/u, `${dish.name} のよみにひらがな以外: ${dish.reading}`);
  }
});

test('値段の幅が段階になっている（安い皿だけ・高い皿だけに寄っていない）', () => {
  const prices = new Set(DISHES.map((d) => priceOfReading(d.reading)));
  assert.ok(prices.size >= 4, `値段の段階が少なすぎる: ${[...prices].join(',')}`);
});

test('コースは目標額の順に並び、目標が高いほど皿が速く来る', () => {
  assert.equal(DURATION_MS, 60_000);
  for (let i = 1; i < COURSES.length; i += 1) {
    assert.ok(COURSES[i].target > COURSES[i - 1].target);
    assert.ok(COURSES[i].interval < COURSES[i - 1].interval);
  }
});

test('知らないコースIDでも既定のコースに落ちる', () => {
  assert.equal(courseById('standard').id, 'standard');
  assert.equal(courseById('nonexistent').id, 'standard');
});

test('全部を最速で食べても目標額に届く程度に値付けされている', () => {
  // 「理屈のうえでも届かない」設定になっていないかの下限チェック。
  // 1分間、1皿も逃さず食べ続けたときの上限額をコースの投入間隔から出す。
  for (const course of COURSES) {
    const pool = dishesForCourse(course);
    const average = pool.reduce((sum, d) => sum + priceOfReading(d.reading), 0) / pool.length;
    const servable = Math.floor(DURATION_MS / course.interval);
    assert.ok(servable * average > course.target, `${course.label} は理屈のうえでも届かない`);
  }
});

test('お手軽は短い料理だけが出る', () => {
  const light = courseById('light');
  const pool = dishesForCourse(light);
  for (const dish of pool) {
    assert.ok(
      primaryRomaji(dish.reading).length <= light.maxKeys,
      `${dish.name} は ${light.maxKeys} 打を超える: ${primaryRomaji(dish.reading)}`
    );
  }
  // 品数が少なすぎると同じ皿ばかり出て別の意味で退屈になる
  assert.ok(pool.length >= 8, `お手軽の出題数が少なすぎる: ${pool.length}品`);
});

test('上限を付けないコースは全品が出る', () => {
  assert.equal(dishesForCourse(courseById('standard')).length, DISHES.length);
  assert.equal(dishesForCourse(courseById('heavy')).length, DISHES.length);
});

test('料理はすべて絵を持っていて、その絵が実在する', () => {
  const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
  const seen = new Set();
  for (const dish of DISHES) {
    assert.ok(dish.image, `${dish.name} に絵が無い`);
    assert.match(dish.image, /^[a-z]+$/, `${dish.name} の絵の名前が英小文字だけでない: ${dish.image}`);
    assert.equal(seen.has(dish.image), false, `絵の名前が重複: ${dish.image}`);
    seen.add(dish.image);

    const file = join(appDir, 'assets', 'dish', `${dish.image}.webp`);
    assert.ok(existsSync(file), `${dish.name} の絵が見つからない: assets/dish/${dish.image}.webp`);
  }
});

test('ふりがなを乗せるのは漢字を含む5品だけ（カタカナ語には振らない）', () => {
  /* 打鍵行から「よみ」の行を落とし、代わりに名前の上へ <ruby> で乗せている。
     対象を name !== reading で選ぶと ハタハタ／ハタハタずし まで入るが、
     カタカナにふりがなを振っても情報は増えない。だから判定は「漢字を含むか」。
     ここが崩れると、ふりがなが要る品に振られない・要らない品に振られるのどちらかが起きる。 */
  const kanji = DISHES.filter((d) => hasKanji(d.name));
  assert.equal(kanji.length, 5, `漢字を含む料理は5品のはず: ${kanji.map((d) => d.name).join(',')}`);
  assert.deepEqual(
    kanji.map((d) => d.name),
    ['秋田ふき', '比内地鶏', '稲庭うどん', 'しょっつる鍋', 'きりたんぽ鍋']
  );
  for (const dish of kanji) {
    assert.ok(dish.reading && dish.reading !== dish.name, `${dish.name} のよみが無い`);
  }
  // カタカナだけの品は対象外
  assert.equal(hasKanji('ハタハタ'), false);
  assert.equal(hasKanji('ハタハタずし'), false);
});

test('コースは必要な打鍵速度を選ぶ前に書いてある', () => {
  for (const course of COURSES) {
    assert.ok(course.hint, `${course.label} に hint が無い`);
    assert.ok(course.pace, `${course.label} に必要な速さの目安が無い`);
    assert.equal(typeof course.needsKps, 'number');
  }
  // 目標が高いコースほど速さが要る
  for (let i = 1; i < COURSES.length; i += 1) {
    assert.ok(COURSES[i].needsKps > COURSES[i - 1].needsKps);
  }
});

test('打鍵速度に合うコースを勧める（実測値を境目にする）', () => {
  assert.equal(recommendCourse(0).id, 'light');
  assert.equal(recommendCourse(1.1).id, 'light');
  assert.equal(recommendCourse(2.49).id, 'light');
  assert.equal(recommendCourse(2.5).id, 'standard');
  assert.equal(recommendCourse(3.9).id, 'standard');
  assert.equal(recommendCourse(4).id, 'heavy');
  assert.equal(recommendCourse(9).id, 'heavy');
});
