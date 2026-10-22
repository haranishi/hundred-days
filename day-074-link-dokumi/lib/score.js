export function visitorLevel(points, floors = []) {
  const levels = ['ok', 'note', 'warn', 'danger'];
  const base = points >= 10 ? 3 : points >= 6 ? 2 : points >= 3 ? 1 : 0;
  return levels[Math.max(base, ...floors.map(f => Math.max(0, levels.indexOf(f))))];
}
export function ownerScore(findings) {
  return Math.max(0, 100 - findings.filter(f => f.axis === 'owner' && f.status === 'bad').reduce((n, f) => n + f.points, 0));
}
export function gradeOf(score) {
  return score === null ? null : score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
}
