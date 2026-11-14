import { ReadableText } from './ReadableText';
import type { weekXp } from '../app/recordModel';

export function XpChart({ days }: { days: ReturnType<typeof weekXp> }) {
  const top = Math.max(10, Math.ceil(Math.max(...days.map(day => day.xp)) / 10) * 10);
  return <figure class="xp-chart"><figcaption><ReadableText text="この7日間の経験値" /></figcaption><svg viewBox="0 0 440 240" role="img" aria-label={days.map(day => `${day.label} ${day.xp}経験値`).join('、')}>
    <text x="12" y="18">経験値</text>
    {[0, top / 2, top].map(value => { const y = 192 - value / top * 144; return <g key={value}><line x1="46" x2="430" y1={y} y2={y} stroke="#E3E5F0" /><text x="39" y={y + 4} text-anchor="end">{value}</text></g>; })}
    <path d="M46 42V192H430" fill="none" stroke="#4A5175" />
    {days.map((day, index) => { const x = 58 + index * 53; const height = day.xp / top * 144; return <g key={day.day}><rect x={x} y={192 - height} width="32" height={height} rx="5" fill="#4C5FD5" /><text x={x + 16} y={182 - height} text-anchor="middle">{day.xp}</text><text x={x + 16} y="219" text-anchor="middle">{day.label}</text></g>; })}
    <text x="426" y="239" text-anchor="end">日付</text>
  </svg></figure>;
}
