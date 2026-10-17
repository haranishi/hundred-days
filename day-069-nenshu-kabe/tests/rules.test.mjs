import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as rules from '../lib/rules-2026.js';

const {
  META, SALARY_DEDUCTION, AGE_BANDS, SOURCES, TAX_WALLS, PARENT_DEDUCTION, HEALTH,
  NOTES, REFERENCES, GLOSSARY, EXAMPLE, LIMITS,
} = rules;

const wall = (id) => TAX_WALLS.find((w) => w.id === id);
const bandIds = AGE_BANDS.map((b) => b.id);

// 照合記録（research.md）の表と同じ値。ここを変えるときは research.md の照合から直す
const EXPECTED = {
  'resident-flat': 1_190_000,
  'resident-minor': 2_090_000,
  'resident-income-student': 1_430_000,
  'parent-dependent': 1_360_000,
  'parent-income-tax-full': 1_590_000,
  'work-student-limit': 1_630_000,
  'parent-resident-full': 1_690_000,
  'self-income-tax': 1_780_000,
  'parent-zero': 1_970_000,
};

// 2025年の値は、照合記録で確かめたものだけを持つ
const VERIFIED_2025 = {
  'resident-flat': 1_100_000,
  'parent-dependent': 1_230_000,
  'parent-income-tax-full': 1_500_000,
  'work-student-limit': 1_500_000,
  'self-income-tax': 1_600_000,
  'parent-zero': 1_880_000,
};

function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

describe('年収の壁時計 (rules-2026)', () => {
  it('2026年分・確認日2026-10-17のデータである', () => {
    assert.equal(META.year, 2026);
    assert.equal(META.checkedOn, '2026-10-17');
    assert.equal(SALARY_DEDUCTION.min, 740_000);
  });

  it('税金の壁は照合記録の9つで、基準額が一致する', () => {
    assert.deepEqual(TAX_WALLS.map((w) => w.id).sort(), Object.keys(EXPECTED).sort());
    for (const [id, threshold] of Object.entries(EXPECTED)) assert.equal(wall(id).threshold, threshold, id);
    assert.equal(wall('resident-flat').rangeLow.threshold, 1_120_000);
  });

  it('給与収入の基準は「所得の基準＋給与所得控除74万円」で、収入−74万円が成り立つ範囲に入る', () => {
    for (const w of TAX_WALLS) {
      assert.equal(w.threshold, w.incomeLimit + SALARY_DEDUCTION.min, w.id);
      assert.ok(w.threshold >= SALARY_DEDUCTION.zeroBelow && w.threshold < SALARY_DEDUCTION.linearBelow, w.id);
      assert.equal(w.boundary, 'lte', w.id);
    }
    const low = wall('resident-flat').rangeLow;
    assert.equal(low.threshold, low.incomeLimit + SALARY_DEDUCTION.min);
  });

  it('所得の基準の内訳が照合記録と合う', () => {
    assert.equal(wall('self-income-tax').incomeLimit, 1_040_000, '基礎控除104万円');
    assert.equal(wall('resident-income-student').incomeLimit, 430_000 + 260_000, '住民税の基礎控除43万円＋勤労学生控除26万円');
    assert.equal(wall('parent-dependent').incomeLimit, 620_000);
    assert.equal(wall('parent-income-tax-full').incomeLimit, 850_000);
    assert.equal(wall('parent-resident-full').incomeLimit, 950_000);
    assert.equal(wall('parent-zero').incomeLimit, 1_230_000);
    assert.equal(wall('work-student-limit').incomeLimit, 890_000);
    assert.equal(wall('resident-minor').incomeLimit, 1_350_000);
  });

  it('2025年の値は照合済みのものだけを持つ', () => {
    for (const w of TAX_WALLS) assert.equal(w.prev2025, VERIFIED_2025[w.id] ?? null, w.id);
    assert.equal(HEALTH.bands.a19_22.prev2025, 1_300_000);
    assert.equal(HEALTH.bands.general.prev2025, null);
  });

  it('対象の年齢区分と上書きの条件が、決まった値だけを使う', () => {
    for (const w of TAX_WALLS) {
      assert.ok(w.applies.ageBands.length > 0, w.id);
      for (const band of w.applies.ageBands) assert.ok(bandIds.includes(band), `${w.id}: ${band}`);
      assert.equal(typeof w.applies.studentOnly, 'boolean', w.id);
      for (const v of w.variants ?? []) {
        for (const key of Object.keys(v.when)) assert.ok(['ageBand', 'student'].includes(key), `${w.id}: ${key}`);
        if (v.when.ageBand) assert.ok(bandIds.includes(v.when.ageBand));
        if (v.kind) assert.ok(['cliff', 'step', 'switch'].includes(v.kind));
      }
      assert.ok(['cliff', 'step', 'switch'].includes(w.kind), w.id);
      assert.ok(['self', 'parent'].includes(w.who), w.id);
    }
    // 16〜17歳は未成年者の特例、それ以外は通常の住民税（どの年齢区分にも住民税の壁がちょうど1つ）
    for (const band of bandIds) {
      const residents = TAX_WALLS.filter((w) => ['resident-flat', 'resident-minor'].includes(w.id) && w.applies.ageBands.includes(band));
      assert.equal(residents.length, 1, band);
    }
    assert.deepEqual(wall('parent-income-tax-full').applies.ageBands, ['a19_22']);
    assert.equal(wall('parent-dependent').variants[0].kind, 'switch');
  });

  it('どの壁にも、越えると変わること・判定の単位・窓口・基準額の出し方・出典がある', () => {
    for (const w of TAX_WALLS) {
      for (const key of ['title', 'effect', 'unit', 'window', 'formula']) assert.ok(w[key]?.length > 10 || key === 'title', `${w.id}.${key}`);
      assert.ok(w.sources.length > 0, w.id);
    }
  });

  it('出典はすべて実在し、発行元・題名・httpsのリンク・確認日を持つ', () => {
    const used = new Set([
      ...TAX_WALLS.flatMap((w) => w.sources),
      ...HEALTH.sources,
      ...REFERENCES.flatMap((r) => r.sources),
      ...PARENT_DEDUCTION.a19_22.sources,
      ...PARENT_DEDUCTION.general.sources,
    ]);
    for (const id of used) assert.ok(SOURCES[id], `出典が無い: ${id}`);
    for (const [id, s] of Object.entries(SOURCES)) {
      assert.ok(s.publisher && s.title, id);
      assert.match(s.url, /^https:\/\//, id);
      assert.equal(s.checkedOn, META.checkedOn, id);
      assert.equal(typeof s.exact, 'boolean', `${id}: 題名を確かめたか`);
    }
    // 未成年者の209万円は、令和9年度の春日井市の公式ページで照合済み
    assert.ok(wall('resident-minor').sources.includes('kasugai'));
    assert.ok(SOURCES.pdl, '公共データ利用規約へのリンク');
  });

  it('親の控除の段階は照合記録どおりで、金額は段ごとに増えない', () => {
    const at = (steps, upTo) => steps.find((s) => s.upTo === upTo)?.amount;
    const { incomeTax, residentTax } = PARENT_DEDUCTION.a19_22;
    assert.equal(at(incomeTax, 1_590_000), 630_000);
    assert.equal(at(incomeTax, 1_640_000), 610_000);
    assert.equal(at(incomeTax, 1_970_000), 30_000);
    assert.equal(at(residentTax, 1_690_000), 450_000);
    assert.equal(at(residentTax, 1_740_000), 410_000);
    assert.equal(at(residentTax, 1_970_000), 30_000);
    assert.equal(PARENT_DEDUCTION.general.incomeTax[0].amount, 380_000);
    assert.equal(PARENT_DEDUCTION.general.residentTax[0].amount, 330_000);
    for (const steps of [incomeTax, residentTax, PARENT_DEDUCTION.general.incomeTax, PARENT_DEDUCTION.general.residentTax]) {
      for (let i = 1; i < steps.length; i += 1) {
        assert.ok(steps[i].upTo > steps[i - 1].upTo);
        assert.ok(steps[i].amount <= steps[i - 1].amount);
      }
    }
    // 段の境目は壁の基準と一致する（136・159・169・197万円）
    assert.equal(incomeTax[0].upTo, wall('parent-dependent').threshold);
    assert.equal(incomeTax[1].upTo, wall('parent-income-tax-full').threshold);
    assert.equal(residentTax[1].upTo, wall('parent-resident-full').threshold);
    assert.equal(incomeTax.at(-1).upTo, wall('parent-zero').threshold);
    assert.equal(residentTax.at(-1).upTo, wall('parent-zero').threshold);
  });

  it('親の控除の全段が照合記録（research.md）の表と一致する', () => {
    const pairs = (steps) => steps.map(({ upTo, amount }) => [upTo, amount]);
    assert.deepEqual(pairs(PARENT_DEDUCTION.a19_22.incomeTax), [
      [1_360_000, 630_000], [1_590_000, 630_000], [1_640_000, 610_000], [1_690_000, 510_000], [1_740_000, 410_000],
      [1_790_000, 310_000], [1_840_000, 210_000], [1_890_000, 110_000], [1_940_000, 60_000], [1_970_000, 30_000],
    ]);
    assert.deepEqual(pairs(PARENT_DEDUCTION.a19_22.residentTax), [
      [1_360_000, 450_000], [1_690_000, 450_000], [1_740_000, 410_000], [1_790_000, 310_000],
      [1_840_000, 210_000], [1_890_000, 110_000], [1_940_000, 60_000], [1_970_000, 30_000],
    ]);
  });

  it('「2025年からの変化」に出す壁には、比べるための名前がある', () => {
    for (const w of TAX_WALLS.filter(({ prev2025 }) => prev2025 !== null)) assert.ok(w.changeLabel?.length > 5, w.id);
    assert.ok(HEALTH.bands.a19_22.changeLabel);
  });

  it('健康保険は「未満」で、月額の目安は年の基準の12分の1を超えない最大の円', () => {
    for (const band of Object.values(HEALTH.bands)) {
      assert.equal(band.boundary, 'lt');
      assert.ok(band.monthlyMax * 12 < band.annualLimit);
      assert.ok((band.monthlyMax + 1) * 12 >= band.annualLimit);
    }
    assert.equal(HEALTH.bands.a19_22.annualLimit, 1_500_000);
    assert.equal(HEALTH.bands.general.annualLimit, 1_300_000);
    assert.equal(HEALTH.bands.general.monthlyMax, 108_333);
  });

  it('入力の上限は要件1.5のとおりで、例の数字はその範囲に入る', () => {
    assert.equal(LIMITS.paidSoFar.max, 10_000_000);
    assert.equal(LIMITS.hourlyWage.max, 10_000);
    assert.equal(LIMITS.hourlyWage.min, 1);
    assert.equal(LIMITS.remainingPaydays.max, 12);
    assert.equal(LIMITS.hoursPerPayday.max, 400);
    for (const [key, { min, max }] of Object.entries(LIMITS)) {
      assert.ok(EXAMPLE[key] >= min && EXAMPLE[key] <= max, key);
    }
    assert.ok(bandIds.includes(EXAMPLE.ageBand));
  });

  it('画面の文言に、勧める・請け負う表現が無い', () => {
    // 要件5.2の例（「収めるべき」「働いて大丈夫」など）も捕まえる。限界の説明「保証するものではありません」だけは許す
    const forbidden = /べき|大丈夫|安心|安全|お得|おすすめ|損(する|です)|一切の責任|保証します|したほうが(いい|良い)/;
    const texts = [
      ...collectStrings(rules),
      readFileSync(new URL('../index.html', import.meta.url), 'utf8'),
      readFileSync(new URL('../app.js', import.meta.url), 'utf8'),
    ];
    for (const text of texts) assert.doesNotMatch(text.replaceAll('保証するものではありません', ''), forbidden, text.slice(0, 60));
  });

  it('照合できなかった数字（源泉徴収税額表の月105,000円）を持たない', () => {
    const all = JSON.stringify(rules, (_, v) => v);
    assert.doesNotMatch(all, /105,?000|10万5千/);
  });

  it('注意書き・参考・用語の説明がそろっている', () => {
    for (const key of ['disclaimer', 'timeNote', 'paydayRule', 'ageRule', 'privacy', 'scope', 'yearBanner2027', 'unofficial', 'attribution', 'contact', 'saveNote']) {
      assert.ok(NOTES[key]?.length > 10, key);
    }
    assert.match(NOTES.disclaimer, /税理士・社会保険労務士ではなく/);
    assert.match(NOTES.disclaimer, /給与（アルバイト・パート）だけの人を対象/);
    assert.ok(HEALTH.checkWith.some((text) => /同居なら親の収入の半分未満/.test(text)), '健康保険の同居・別居の条件');
    assert.match(NOTES.contactUrl, /^https:\/\/github\.com\//);
    assert.ok(REFERENCES.length >= 3);
    assert.ok(GLOSSARY.some((g) => g.term === '特定親族特別控除'));
  });
});
