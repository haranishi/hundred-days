import { daysBetween } from './days.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const WATERED_MILESTONES = new Map([
  [1, '芽が出ました。また明日'],
  [7, '7日目。最初の1週間です。また明日'],
  [14, '14日目。枝が増えてきました。また明日'],
  [30, '30日目。ひと月ぶんの木です。また明日'],
  [50, '50日目。半分まで来ました。また明日'],
  [100, '100日目。ここまで一緒に育ちました']
]);
const WATERED_MESSAGES = [
  '今日の一滴をあげました。また明日',
  '今日のぶん、伸びました。また明日',
  '新しい葉が出ました。また明日',
  'ひとしずく、届きました。また明日'
];

export function wateredMessage(steps) {
  return WATERED_MILESTONES.get(steps) ?? WATERED_MESSAGES[steps % 4];
}

export function decide(record, today) {
  const steps = record.wateredDays.length;
  const lastWateredOn = steps ? record.wateredDays.at(-1) : null;
  const wateredToday = lastWateredOn === today;
  const canWater = steps === 0 || lastWateredOn < today;
  const daysSinceWater = lastWateredOn ? daysBetween(lastWateredOn, today) : null;
  const wilt = steps === 0 ? 0 : clamp((daysSinceWater - 1) / 6, 0, 1);
  const ageDays = record.plantedOn ? daysBetween(record.plantedOn, today) + 1 : 0;

  const status = steps
    ? `水をあげた日 ${steps}日`
    : 'まだ種です。水をあげると芽が出ます';
  let note = '';
  let kind = 'seed';
  if (steps && daysSinceWater < 0) {
    note = '時計が戻っているようです。また明日';
    kind = 'clock';
  } else if (wateredToday) {
    note = '今日の一滴はあげました。また明日';
    kind = 'done';
  } else if (steps && daysSinceWater === 1) {
    note = '今日の一滴を待っています';
    kind = 'waiting';
  } else if (steps && daysSinceWater >= 2) {
    note = daysSinceWater <= 3
      ? `${daysSinceWater}日ぶりですね。おかえりなさい`
      : `${daysSinceWater}日ぶりですね。水をあげると元気になります`;
    kind = 'missed';
  }

  return { steps, lastWateredOn, wateredToday, canWater, daysSinceWater, wilt, ageDays, status, note, kind };
}
