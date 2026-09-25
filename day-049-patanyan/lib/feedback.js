export const GOALS = Object.freeze([1, 3, 5, 10, 15, 25, 35, 50, 75, 100]);

export function nextGoal(best) {
  return GOALS.find((n) => n > best) ?? null;
}

export function courseBest(profile, mode, dateKey) {
  return mode === 'daily' ? profile.daily[String(dateKey)] || 0 : profile.best;
}

export function goalLabel(goal) {
  return goal === null ? '自己ベスト更新' : `${goal}本`;
}

export function goalReached(score, best) {
  return score >= (nextGoal(best) ?? best + 1);
}

export function resultGoal(score, best) {
  const next = goalLabel(nextGoal(Math.max(score, best)));
  return goalReached(score, best) ? `目標達成！ 次は${next}` : `次の目標 ${next}`;
}

// 接点は側面でもクッションでも同じ座標なので、墜落後の猫の位置に依存せず判定できる。
export function collisionReason(hit, poles) {
  if (!hit) return '';
  if (hit.kind === 'ground') return '地面に落ちた';
  const pole = poles.find((p) => p.n === hit.pole);
  if (!pole) return '';
  return hit.y <= pole.top ? '上のポールに当たった' : '下のポールに当たった';
}
