import { SALARY_DEDUCTION, TAX_WALLS, PARENT_DEDUCTION, HEALTH } from './rules-2026.js';

// 基準表で使う給与所得の換算（各壁は linearBelow 未満）。税額の計算には使わない。
export function salaryIncome(R) {
  return R < SALARY_DEDUCTION.zeroBelow ? 0 : R - SALARY_DEDUCTION.min;
}

export function wallsFor(profile) {
  return TAX_WALLS
    .filter(({ applies }) => applies.ageBands.includes(profile.ageBand) && (!applies.studentOnly || profile.student))
    .map(({ applies, variants = [], ...base }) => {
      const wall = { ...base };
      for (const { when, ...overrides } of variants) {
        if (Object.entries(when).every(([key, value]) => profile[key] === value)) Object.assign(wall, overrides);
      }
      return wall;
    })
    .sort((a, b) => a.threshold - b.threshold);
}

export function healthRule(ageBand) {
  return { ...HEALTH.bands[ageBand === 'a19_22' ? 'a19_22' : 'general'] };
}

export function parentDeduction(R, ageBand) {
  const steps = PARENT_DEDUCTION[ageBand === 'a19_22' ? 'a19_22' : 'general'];
  return {
    incomeTax: steps.incomeTax.find(({ upTo }) => R <= upTo)?.amount ?? 0,
    residentTax: steps.residentTax.find(({ upTo }) => R <= upTo)?.amount ?? 0,
  };
}

export function evaluate(inputs) {
  const { paidSoFar, hourlyWage, remainingPaydays, hoursPerPayday } = inputs;
  // 小数第1位の時間を整数の10分の1時間として掛け、1回分の1円未満を切り捨てる。
  const perPaydayPlanned = hourlyWage === null || hoursPerPayday === null
    ? null : Math.floor(hourlyWage * Math.round(hoursPerPayday * 10) / 10);
  const projected = paidSoFar + remainingPaydays * (perPaydayPlanned ?? 0);
  const toHours = (amount) => hourlyWage === null ? null : Math.floor(amount / hourlyWage);

  function at(threshold) {
    if (paidSoFar > threshold) {
      return {
        status: 'crossed', remaining: null, remainingHours: null, perPaydayCap: null,
        perPaydayHours: null, crossAtPayday: null, overBy: paidSoFar - threshold,
      };
    }
    const remaining = threshold - paidSoFar;
    const perPaydayCap = remainingPaydays === 0 ? null : Math.floor(remaining / remainingPaydays);
    const willCross = projected > threshold;
    return {
      status: willCross ? 'will-cross' : 'clear', remaining, remainingHours: toHours(remaining),
      perPaydayCap, perPaydayHours: perPaydayCap === null ? null : toHours(perPaydayCap),
      crossAtPayday: willCross ? Math.floor(remaining / perPaydayPlanned) + 1 : null,
      overBy: willCross ? projected - threshold : null,
    };
  }

  const walls = wallsFor(inputs).map((wall) => ({
    wall, ...at(wall.threshold), ...(wall.rangeLow ? { low: at(wall.rangeLow.threshold) } : {}),
  }));
  // 範囲の壁は下端で比べる。下端を越えていても上端がまだなら、上端で比べる（住んでいる市区町村によってはまだ越えていない）
  const comparable = (result) => (result.low && result.low.remaining !== null ? result.low.remaining : result.remaining);
  const nearest = walls
    .filter((result) => result.wall.kind !== 'switch' && comparable(result) !== null)
    .reduce((best, result) => (best === null || comparable(result) < comparable(best) ? result : best), null);
  const rule = healthRule(inputs.ageBand);
  return { walls, nearest, projected, perPaydayPlanned, health: { rule, diff: perPaydayPlanned === null ? null : rule.monthlyMax - perPaydayPlanned } };
}
