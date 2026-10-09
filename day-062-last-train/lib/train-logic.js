import { STATIONS_DATABASE } from './stations-data.js';

export { STATIONS_DATABASE };

/**
 * 2点間の直線距離 (km) を Haversine 公式で算出
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} 距離 (km)
 */
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // 地球半径 km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 距離から実際の徒歩所要時間（分）を推定
 * 街路の迂回係数 1.25〜1.3倍、一般的な分速80m (時速4.8km) で計算
 * @param {number} distanceKm - 直線距離 km
 * @returns {number} 徒歩分数（整数）
 */
export function estimateWalkingMinutes(distanceKm) {
  const actualWalkMeters = distanceKm * 1.3 * 1000;
  const minutes = Math.ceil(actualWalkMeters / 80);
  return Math.max(1, Math.min(60, minutes));
}

/**
 * 現在地 (lat, lon) から最も近い駅リストを取得
 * @param {number} lat - 緯度
 * @param {number} lon - 経度
 * @param {Array} [stations=STATIONS_DATABASE]
 * @param {number} [limit=3]
 * @returns {Array} 近い順の駅リスト（距離・徒歩分数つき）
 */
export function findNearestStations(lat, lon, stations = STATIONS_DATABASE, limit = 3) {
  const scored = stations.map((st) => {
    const distKm = calculateDistanceKm(lat, lon, st.lat, st.lng);
    const distMeters = Math.round(distKm * 1000);
    const walkMinutes = estimateWalkingMinutes(distKm);
    return {
      ...st,
      distanceKm: Number(distKm.toFixed(2)),
      distanceMeters: distMeters,
      walkMinutes
    };
  });

  scored.sort((a, b) => a.distanceKm - b.distanceKm);
  return scored.slice(0, limit);
}

/**
 * プリセット駅リスト
 */
export const PRESET_STATIONS = [
  { id: 'shinjuku', name: '新宿駅', line: '山手線 / 中央線方面', defaultTrain: '23:55', walkMinutes: 7 },
  { id: 'shibuya', name: '渋谷駅', nameShort: '渋谷', line: '山手線 / 東横線方面', defaultTrain: '23:52', walkMinutes: 8 },
  { id: 'tokyo', name: '東京駅', nameShort: '東京', line: '各線最終目安', defaultTrain: '23:58', walkMinutes: 9 },
  { id: 'ikebukuro', name: '池袋駅', nameShort: '池袋', line: '山手線 / 西武 / 東武', defaultTrain: '23:50', walkMinutes: 7 },
  { id: 'yokohama', name: '横浜駅', nameShort: '横浜', line: '京浜東北 / 東急', defaultTrain: '23:45', walkMinutes: 6 },
  { id: 'osaka_umeda', name: '大阪・梅田駅', nameShort: '梅田', line: '環状線 / 御堂筋線', defaultTrain: '23:50', walkMinutes: 8 },
  { id: 'nagoya', name: '名古屋駅', nameShort: '名古屋', line: '東海道線 / 東山線', defaultTrain: '23:52', walkMinutes: 7 },
  { id: 'hakata', name: '博多駅', nameShort: '博多', line: '空港線 / 鹿児島本線', defaultTrain: '23:50', walkMinutes: 6 },
  { id: 'akita', name: '秋田駅', nameShort: '秋田', line: '奥羽本線 / 羽越本線', defaultTrain: '23:18', walkMinutes: 5 },
  { id: 'custom', name: 'カスタム設定', nameShort: '任意', line: '自分の最寄り駅', defaultTrain: '23:45', walkMinutes: 7 }
];

/**
 * タイムロス因子の既定値
 */
export const DEFAULT_LOSS_ITEMS = {
  bill: { label: 'お会計・割り勘のやり取り', minutes: 5, enabled: true },
  coat: { label: '上着を着る・荷物まとめ・退店', minutes: 3, enabled: true },
  toilet: { label: '店を出る直前のトイレ', minutes: 4, enabled: false },
  walk: { label: '店から駅までの徒歩', minutes: 7, enabled: true },
  wicket: { label: '改札入場〜ホームダッシュ・階段', minutes: 3, enabled: true }
};

/**
 * 時刻文字列 (HH:MM) をDateオブジェクトに変換
 * 深夜0:00〜04:59は翌日未明として扱うスマート補正
 * @param {string} timeStr - "23:45" や "00:15"
 * @param {Date} [baseDate=new Date()] - 基準時刻
 * @returns {Date}
 */
export function parseTrainTime(timeStr, baseDate = new Date()) {
  const parts = timeStr.split(':').map((s) => parseInt(s, 10));
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) {
    throw new Error(`不正な時刻形式です: ${timeStr}`);
  }

  const hours = parts[0];
  const minutes = parts[1];

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`不正な時刻範囲です: ${timeStr}`);
  }

  const target = new Date(baseDate);
  target.setHours(hours, minutes, 0, 0);

  const baseHours = baseDate.getHours();

  // 基準時刻が夕方〜夜（12時以降）で、設定時刻が未明（0〜5時）なら翌日の未明
  if (baseHours >= 12 && hours < 6) {
    target.setDate(target.getDate() + 1);
  }
  // 基準時刻が未明（0〜5時）で、設定時刻が夜（18〜23時）なら前夜（すでに過ぎている）
  else if (baseHours < 6 && hours >= 18) {
    target.setDate(target.getDate() - 1);
  }

  return target;
}

/**
 * 合計タイムロス分数（分）を算出
 * @param {Object} lossItems - 各タイムロス因子の状態
 * @param {number} [customWalk] - 徒歩分数の上書き
 * @returns {number}
 */
export function calculateTotalLossMinutes(lossItems, customWalk) {
  let total = 0;
  for (const [key, item] of Object.entries(lossItems)) {
    if (!item.enabled) continue;
    if (key === 'walk' && typeof customWalk === 'number' && customWalk >= 0) {
      total += customWalk;
    } else {
      total += item.minutes || 0;
    }
  }
  return total;
}

/**
 * 終電時刻とタイムロスから「店を出る限界時刻（デッドライン）」を計算
 * @param {Date} trainDate - 終電時刻
 * @param {number} totalLossMinutes - 合計タイムロス（分）
 * @returns {Date}
 */
export function calculateDeadline(trainDate, totalLossMinutes) {
  return new Date(trainDate.getTime() - totalLossMinutes * 60 * 1000);
}

/**
 * 残りミリ秒数からステータスレベルを判定
 * @param {number} remainingMs
 * @returns {'safe' | 'caution' | 'critical' | 'suddendeath' | 'gameover'}
 */
export function getStatusLevel(remainingMs) {
  if (remainingMs <= 0) {
    return 'gameover';
  }
  const minutes = remainingMs / (60 * 1000);
  if (minutes < 5) {
    return 'suddendeath';
  }
  if (minutes < 15) {
    return 'critical';
  }
  if (minutes < 30) {
    return 'caution';
  }
  return 'safe';
}

/**
 * ステータスレベルに対応するラベルとメッセージ
 */
export const STATUS_META = {
  safe: {
    level: 'LEVEL 1',
    name: '平穏 (SAFE)',
    badgeColor: '#10b981',
    message: 'まだ余裕があります。グラスを傾ける時間は残されています。',
    soundPitch: 440
  },
  caution: {
    level: 'LEVEL 2',
    name: '警戒 (CAUTION)',
    badgeColor: '#f59e0b',
    message: 'そろそろ伝票をもらう算段をつけましょう。油断は禁物です。',
    soundPitch: 520
  },
  critical: {
    level: 'LEVEL 3',
    name: '臨界 (CRITICAL)',
    badgeColor: '#f97316',
    message: '上着を着てください。靴を履いてください。店員さんを呼んでください。',
    soundPitch: 660
  },
  suddendeath: {
    level: 'LEVEL 4',
    name: 'サドンデス (SUDDEN DEATH)',
    badgeColor: '#ef4444',
    message: '【即時脱出】走れ！今すぐ店を出ないと帰宅権を失います！',
    soundPitch: 880
  },
  gameover: {
    level: 'OVER',
    name: '終電死亡 (DEAD END)',
    badgeColor: '#991b1b',
    message: '間に合いませんでした。始発サバイバルモードへ移行します。',
    soundPitch: 220
  }
};

/**
 * ミリ秒を時間・分・秒・コンマ秒にフォーマット
 * @param {number} ms - 残りミリ秒
 * @returns {{ sign: string, hours: string, minutes: string, seconds: string, tenths: string, totalSeconds: number }}
 */
export function formatTimeDisplay(ms) {
  const isNegative = ms < 0;
  const absMs = Math.abs(ms);

  const totalSeconds = Math.floor(absMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((absMs % 1000) / 100);

  const pad = (n) => String(n).padStart(2, '0');

  return {
    sign: isNegative ? '-' : '',
    hours: pad(hours),
    minutes: pad(minutes),
    seconds: pad(seconds),
    tenths: String(tenths),
    totalSeconds
  };
}

/**
 * 始発（翌朝05:00）までの残り時間を計算
 * @param {Date} now
 * @returns {number} 残りミリ秒
 */
export function getFirstTrainRemainingMs(now = new Date()) {
  const firstTrain = new Date(now);
  if (now.getHours() >= 5) {
    firstTrain.setDate(firstTrain.getDate() + 1);
  }
  firstTrain.setHours(5, 0, 0, 0);
  return firstTrain.getTime() - now.getTime();
}

/**
 * 終電を逃したときのサバイバル候補ルーレット
 */
export const SURVIVAL_OPTIONS = [
  { title: 'サウナ・深夜銭湯', desc: '朝風呂とリクライニングシートで完全回復コース', cost: '約¥3,000' },
  { title: '24時間ネットカフェ / 快活CLUB', desc: '個室フラット席で仮眠＆スマホ充電確保', cost: '約¥2,200' },
  { title: 'カラオケオール', desc: 'フリータイムで歌い明かすかソファで横になる', cost: '約¥1,800' },
  { title: '24時間ファミレス / 磯丸水産', desc: 'ドリンクバーとポテトで始発まで粘る', cost: '約¥1,000' },
  { title: '徒歩帰還チャレンジ', desc: '深夜の街を歩いて帰る冒険（距離と体力を要確認）', cost: '¥0' },
  { title: 'タクシー課金', desc: '諭吉（栄一）を犠牲にして自宅のベッドへ直行', cost: '¥5,000〜' }
];
