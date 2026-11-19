import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dateOf, nextSeasonDay } from '../../lib/calendar.js';
import { SPECIES_IDS, validateLook } from '../../lib/contract.js';
import { seasonLook } from '../../lib/look.js';
import { SPECIES_INFO, STYLE_INFO } from '../../lib/species.js';

test('暦は10月1日から始まり、月末と年境界にうるう日を挟まない', () => {
  assert.deepEqual(dateOf(0), { day: 0, year: 1, month: 10, dom: 1, doy: 273, week: 1, season: 'autumn', seasonLabel: '秋', label: '秋・10月1週' });
  assert.equal(dateOf(6).label, '秋・10月1週');
  assert.equal(dateOf(7).label, '秋・10月2週');
  assert.equal(dateOf(30).label, '秋・10月5週');
  assert.equal(dateOf(31).label, '秋・11月1週');
  assert.deepEqual([dateOf(91).year, dateOf(91).doy], [1, 364]);
  assert.deepEqual([dateOf(92).year, dateOf(92).doy, dateOf(92).month, dateOf(92).dom], [2, 0, 1, 1]);
  for (let year = 0; year < 5; year += 1) {
    const end = 150 + year * 365;
    assert.deepEqual([dateOf(end).month, dateOf(end).dom], [2, 28]);
    assert.deepEqual([dateOf(end + 1).month, dateOf(end + 1).dom], [3, 1]);
  }
});

test('次の季節は現在日より先の3・6・9・12月の1日を返す', () => {
  assert.equal(nextSeasonDay(0), 61);
  assert.equal(nextSeasonDay(60), 61);
  assert.equal(nextSeasonDay(61), 151);
  assert.equal(nextSeasonDay(92), 151);
  assert.equal(nextSeasonDay(151), 243);
  assert.equal(nextSeasonDay(243), 335);
  assert.equal(nextSeasonDay(335), 426);
  for (const [day, season] of [[61, 'winter'], [151, 'spring'], [243, 'summer'], [335, 'autumn'], [426, 'winter']]) {
    assert.equal(dateOf(day).season, season);
    assert.equal(dateOf(day).dom, 1);
  }
});

test('樹種と樹形の表示名をUIへ渡す', () => {
  assert.deepEqual(SPECIES_IDS.map((species) => Object.values(SPECIES_INFO[species])), [
    ['紅葉', 'もみじ', 'Acer palmatum'], ['黒松', 'くろまつ', 'Pinus thunbergii'], ['梅', 'うめ', 'Prunus mume'],
  ]);
  assert.deepEqual(Object.values(STYLE_INFO).map(({ ja }) => ja), ['模様木', '直幹', '斜幹']);
});

test('季節の値とsRGBは全日で範囲内にあり、年境界を含め連続する', () => {
  const components = (look) => [look.coverage, look.flower, look.bud, look.leafAge, look.fall, look.petal, ...look.color, ...look.color2];
  for (const species of SPECIES_IDS) {
    for (let day = 0; day < 365; day += 1) {
      const { doy, season } = dateOf(day);
      const now = seasonLook(species, doy);
      const tomorrow = seasonLook(species, doy + 1);
      assert.deepEqual(validateLook(now), []);
      assert.equal(now.season, season);
      const previous = components(now);
      assert.ok(components(tomorrow).every((value, i) => Math.abs(value - previous[i]) < 0.101), `${species}/${doy}`);
    }
    assert.deepEqual(seasonLook(species, -1), seasonLook(species, 364));
    assert.deepEqual(seasonLook(species, 365), seasonLook(species, 0));
  }
});

test('紅葉は裸木から芽、新緑、赤と黄、落葉へ変わる', () => {
  const maple = (doy) => seasonLook('maple', doy);
  for (const doy of [0, 30, 31, 58, 334, 364]) assert.equal(maple(doy).coverage, 0);
  assert.ok(maple(77).bud > 0.8);
  assert.ok(maple(91).coverage > 0 && maple(91).leafAge < 0.1);
  for (let day = 120; day < 243; day += 1) assert.ok(maple(day).coverage >= 0.95);
  assert.ok(maple(180).color[1] > maple(180).color[0]);
  assert.ok(maple(255).color[0] > maple(180).color[0]);
  assert.ok(maple(290).color[0] > 2 * maple(290).color[1]);
  assert.ok(maple(290).color2[1] > 2 * maple(290).color2[2]);
  assert.ok(maple(328).fall > 0.7 && maple(328).coverage < 0.5);
  assert.notDeepEqual(seasonLook('maple', 180, { moisture: 0 }).color, maple(180).color);
});

test('黒松は濃緑を保って初夏に芽が出て、梅は2月に咲いて4月に散る', () => {
  for (let doy = 0; doy < 365; doy += 1) assert.ok(seasonLook('pine', doy, { moisture: 0 }).coverage >= 0.92);
  assert.ok(seasonLook('pine', 146).bud > 0.7);
  assert.ok(seasonLook('pine', 140).color2[1] > seasonLook('pine', 30).color2[1]);
  const plum = (doy) => seasonLook('plum', doy);
  for (let doy = 0; doy < 90; doy += 1) {
    assert.equal(plum(doy).coverage, 0);
    if (doy >= 31 && doy <= 58) assert.ok(plum(doy).flower > 0.6);
  }
  assert.ok(plum(102).petal > 0.8 && plum(110).flower < plum(90).flower);
  assert.ok(plum(150).coverage > 0.95 && plum(150).color[1] > plum(150).color[0]);
  assert.ok(plum(315).color[0] > plum(315).color[1] && plum(315).color[1] > plum(315).color[2]);
  assert.equal(plum(334).coverage, 0);
});
