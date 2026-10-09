import { STATIONS_DATABASE, searchStations } from './stations-data.js';

export { STATIONS_DATABASE, searchStations };

/**
 * 駅名またはIDから駅オブジェクトを特定
 * @param {string} query
 * @returns {Object|null}
 */
export function findStationByName(query) {
  if (!query || typeof query !== 'string') return null;
  const q = query.trim().toLowerCase();
  // 完全一致優先
  const exact = STATIONS_DATABASE.find(
    (s) => s.name.toLowerCase() === q || s.id.toLowerCase() === q || s.name.replace('駅', '').toLowerCase() === q
  );
  if (exact) return exact;

  // 部分一致
  return STATIONS_DATABASE.find(
    (s) => s.name.toLowerCase().includes(q) || s.kana.includes(q)
  ) || null;
}

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
 * 出発駅と帰着駅（目的地）から区間詳細（距離・乗車時間・推定終電時刻）を算出
 * @param {Object|string} from - 出発駅（オブジェクトまたは名前）
 * @param {Object|string} to - 帰着駅（オブジェクトまたは名前）
 * @returns {{
 *   fromStation: Object,
 *   toStation: Object,
 *   distanceKm: number,
 *   rideMinutes: number,
 *   estimatedTrainTime: string,
 *   summary: string
 * }}
 */
export function estimateRouteDetails(from, to) {
  const fromStation = typeof from === 'string'
    ? (findStationByName(from) || { name: from, lat: null, lng: null, defaultTrain: '23:55' })
    : (from || { name: '出発駅', defaultTrain: '23:55' });

  const toStation = typeof to === 'string'
    ? (findStationByName(to) || { name: to, lat: null, lng: null, defaultTrain: '23:55' })
    : (to || { name: '帰着駅', defaultTrain: '23:55' });

  let distanceKm = 0;
  let rideMinutes = 0;
  let estimatedTrainTime = fromStation.defaultTrain || '23:55';

  if (fromStation && toStation) {
    if (fromStation.name === toStation.name) {
      distanceKm = 0;
      rideMinutes = 0;
      estimatedTrainTime = fromStation.defaultTrain || '23:55';
    } else if (fromStation.lat && fromStation.lng && toStation.lat && toStation.lng) {
      distanceKm = Number(calculateDistanceKm(fromStation.lat, fromStation.lng, toStation.lat, toStation.lng).toFixed(1));

      // 乗車時間推定
      if (distanceKm <= 5) {
        rideMinutes = Math.max(3, Math.round(distanceKm * 2.2));
      } else if (distanceKm <= 30) {
        rideMinutes = Math.round(5 + distanceKm * 1.2);
      } else if (distanceKm <= 100) {
        rideMinutes = Math.round(15 + distanceKm * 0.9);
      } else {
        rideMinutes = Math.round(distanceKm * 0.45);
      }

      // 距離に応じた終電時刻推定
      if (distanceKm < 3) {
        estimatedTrainTime = '00:05';
      } else if (distanceKm < 25) {
        estimatedTrainTime = fromStation.defaultTrain || '23:55';
      } else if (distanceKm < 45) {
        estimatedTrainTime = '23:42';
      } else if (distanceKm < 80) {
        estimatedTrainTime = '23:25';
      } else if (distanceKm < 150) {
        estimatedTrainTime = '22:50';
      } else if (distanceKm < 300) {
        estimatedTrainTime = '22:00';
      } else {
        estimatedTrainTime = '21:30';
      }

      // 地方路線補正（主要大都市圏以外は終電が早まる）
      const isMajorMetropolis = (pref) => ['東京都', '神奈川県', '大阪府', '愛知県'].includes(pref);
      if ((!isMajorMetropolis(fromStation.pref) || !isMajorMetropolis(toStation.pref)) && distanceKm > 10) {
        const [h, m] = estimatedTrainTime.split(':').map(Number);
        let totalM = h * 60 + m - 15;
        if (totalM < 0) totalM += 1440;
        const newH = String(Math.floor(totalM / 60)).padStart(2, '0');
        const newM = String(totalM % 60).padStart(2, '0');
        estimatedTrainTime = `${newH}:${newM}`;
      }
    }
  }

  return {
    fromStation,
    toStation,
    distanceKm,
    rideMinutes,
    estimatedTrainTime,
    summary: `${fromStation.name} ➔ ${toStation.name}`
  };
}

/**
 * 全国主要駅プリセットリスト (主要都市・東西南北)
 */
export const PRESET_STATIONS = [
  { id: 'shinjuku', name: '新宿駅', area: '東京', line: '中央線・山手線', defaultTrain: '23:55', walkMinutes: 7 },
  { id: 'shibuya', name: '渋谷駅', area: '東京', line: '山手線・東急東横線', defaultTrain: '23:52', walkMinutes: 8 },
  { id: 'tokyo', name: '東京駅', area: '東京', line: 'JR各線・東海道線', defaultTrain: '23:58', walkMinutes: 9 },
  { id: 'yokohama', name: '横浜駅', area: '神奈川', line: 'JR線・東急東横線', defaultTrain: '23:45', walkMinutes: 6 },
  { id: 'omiya', name: '大宮駅', area: '埼玉', line: '京浜東北線・埼京線', defaultTrain: '23:55', walkMinutes: 7 },
  { id: 'chiba', name: '千葉駅', area: '千葉', line: 'JR総武線・内房線', defaultTrain: '23:50', walkMinutes: 7 },
  { id: 'osaka_umeda', name: '大阪・梅田駅', area: '大阪', line: 'JR環状線・御堂筋線', defaultTrain: '23:50', walkMinutes: 8 },
  { id: 'sannomiya', name: '三ノ宮駅', area: '兵庫', line: 'JR神戸線・阪急線', defaultTrain: '23:45', walkMinutes: 6 },
  { id: 'kyoto', name: '京都駅', area: '京都', line: 'JR各線・地下鉄烏丸線', defaultTrain: '23:45', walkMinutes: 7 },
  { id: 'nagoya', name: '名古屋駅', area: '愛知', line: '東山線・東海道本線', defaultTrain: '23:52', walkMinutes: 7 },
  { id: 'hakata', name: '博多駅', area: '福岡', line: '空港線・鹿児島本線', defaultTrain: '23:50', walkMinutes: 6 },
  { id: 'sapporo', name: '札幌駅', area: '北海道', line: '南北線・函館本線', defaultTrain: '23:50', walkMinutes: 7 },
  { id: 'sendai', name: '仙台駅', area: '宮城', line: '南北線・東北本線', defaultTrain: '23:45', walkMinutes: 6 },
  { id: 'hiroshima', name: '広島駅', area: '広島', line: '山陽本線・広電', defaultTrain: '23:45', walkMinutes: 6 }
];

/**
 * 帰着駅（目的地）のクイック候補
 */
export const QUICK_DESTINATIONS = [
  { name: '吉祥寺駅', desc: '中央線・井の頭線' },
  { name: '中野駅', desc: '中央線・東西線' },
  { name: '立川駅', desc: '中央線・南武線' },
  { name: '横浜駅', desc: '神奈川ターミナル' },
  { name: '大宮駅', desc: '埼玉ターミナル' },
  { name: '船橋駅', desc: '千葉・総武線' },
  { name: '高槻駅', desc: 'JR京都線・阪急' },
  { name: '西宮駅', desc: '阪神・阪急神戸線' }
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
