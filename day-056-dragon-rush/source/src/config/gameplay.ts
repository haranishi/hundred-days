// OWNER: config
// 遊びの規則の数値：1回の長さ・壊れ方の段階・点数・連鎖・怒り・燃え広がり。単位は秒・m・円。
// 値の根拠：建物の値段は日本の建築費の目安（延べ床1m²あたり）を階高で割って体積あたりにした。
// 耐久（hp）は「住宅は爪1回、中層は爪3回前後、ガラスの高層は大技か炎と爪の組み合わせ」で倒れるように合わせた。
import type { BuildingMaterial } from '../core/events';
import type { BuildingKind } from '../world/types';

export const SESSION = {
  /**
   * 1回の遊びの長さ（秒、ゲーム内時刻）。r02-controls：指摘「結果がゲーム内時刻の約177.5秒で出る」（バグ B2）。
   * 旧は残り時間だけを実時間で減らし、ヒットストップで遅れるゲーム内時刻とずれた。残り時間もゲーム内時刻で数える
   */
  durationSeconds: 180,
};

/** 操作している怪獣（r02-controls：自己ベストの記録の鍵。後の周で怪獣ごとの記録に広げる。docs/CHARACTERS.md の紅竜） */
export const MONSTER = { id: 'kurenairyu' };

/**
 * 最初の案内（r02-controls で追加）：今やることを1行ずつ順に出す（動く → 炎 → 爪 → 飛ぶ → 満タンで E）。
 * 旧は9行の操作表を10秒だけ出していた。各段は、その操作をこの秒数（押している・吐いている時間の合計）続けたら次へ進む
 */
export const COACH = {
  moveSeconds: 0.6,
  breathSeconds: 1.0,
  climbSeconds: 0.5,
};

/** 壊れ方の4段階。stage の番号は damage.ts の STAGE と同じ。 */
export const STAGES = {
  /** 各段階に入る損傷の割合（損傷 ÷ 耐久）。ひび・剥がれ・傾き・崩落の順 */
  thresholds: [0.12, 0.38, 0.68, 1.0] as const,
  /** 次の段階へ進むまでに今の段階を最低でも見せる秒数（一撃で倒れても4段階を順に見せる） */
  minDwell: [0.22, 0.3, 0.7] as const,
  /** 段階ごとに「壊れた」とみなす体積の割合。被害額と破壊率はこの差分で加算する */
  destroyedWeight: [0, 0.1, 0.3, 0.6, 1.0] as const,
  /**
   * 傾きの最大（ラジアン）。傾きの段階の終わりでこの角度まで、根元の辺を支点に倒れかかる。
   * r00b：7° では breath の構図でビルの傾きが読めなかったので 10° にした
   */
  leanMax: (10 * Math.PI) / 180,
  /** 傾きが進む速さ（ラジアン/秒）。重いので急には倒れない */
  leanRate: (4 * Math.PI) / 180,
  /** 崩落の間にさらに倒れる角度（ラジアン） */
  collapseLean: (22 * Math.PI) / 180,
  /** 崩落にかかる秒数 = base + perMeter × 高さ（高い建物ほど長く崩れる） */
  collapseSeconds: { base: 1.6, perMeter: 0.018 },
  /** 段階ごとの窓の割れ（0〜1）。段階が進むと勝手に割れる */
  glassByStage: [0, 0.2, 0.55, 0.85, 1.0] as const,
};

/**
 * 耐久 = scale × 種類の硬さ × 体積^exponent。目安（scale 1.3）：住宅 35・雑居 290・中層 410・ガラスの高層 800〜1000。
 * r00b：1.9 では都心の中層に爪6回かかり、最初の崩落まで20秒を超えたので 1.3 に下げた（目標は10秒前後）。
 */
export const HP = { scale: 1.3, exponent: 0.525 };

export interface BuildingRule {
  /** 体積あたりの値段（円/m³） */
  pricePerM3: number;
  /** 耐久の倍率 */
  toughness: number;
  /** 燃えやすさ（着火と燃え広がりの熱の倍率） */
  flammability: number;
  /** 燃え続ける秒数（燃料） */
  fuelSeconds: number;
  /** 炎だけで進められる損傷の上限（1 以上なら焼け落ちる） */
  fireDamageCap: number;
  material: BuildingMaterial;
}

export const BUILDING_RULES: Record<BuildingKind, BuildingRule> = {
  glassTower: { pricePerM3: 120_000, toughness: 1.25, flammability: 0.55, fuelSeconds: 95, fireDamageCap: 0.65, material: 'glass' },
  tileMidrise: { pricePerM3: 95_000, toughness: 1.1, flammability: 0.8, fuelSeconds: 85, fireDamageCap: 0.7, material: 'tile' },
  zakkyo: { pricePerM3: 90_000, toughness: 1.0, flammability: 1.1, fuelSeconds: 75, fireDamageCap: 0.75, material: 'concrete' },
  apartment: { pricePerM3: 100_000, toughness: 1.05, flammability: 0.9, fuelSeconds: 80, fireDamageCap: 0.7, material: 'concrete' },
  house: { pricePerM3: 70_000, toughness: 0.85, flammability: 1.6, fuelSeconds: 55, fireDamageCap: 1.2, material: 'wood' },
  warehouse: { pricePerM3: 30_000, toughness: 0.9, flammability: 1.2, fuelSeconds: 65, fireDamageCap: 1.1, material: 'metal' },
};

export const COMBO = {
  /** 直前の破壊（段階が進んだ瞬間）からこの秒数以内に次を壊すと連鎖が伸びる */
  windowSeconds: 2.4,
  /** 連鎖1つあたりの倍率の上がり幅と、数える連鎖の上限（倍率の上限 = 1 + step × cap） */
  multiplierStep: 0.1,
  multiplierCap: 30,
  /** 連鎖が切れたあと、倍率が 1 へ戻る速さ（倍/秒）。上がるときは即座、下がるときはゆっくり */
  multiplierDecayPerSecond: 1.5,
};

export const RAGE = {
  max: 100,
  /**
   * 段階に入るたびにたまる量（ひび・剥がれ・傾き・崩落）。大きい建物ほど多い（sizeFactor）。
   * 大技（咆哮・怒りの急降下）で壊した分はたまらない（大技が次の大技を呼ぶ連鎖を止める）。
   * r00b：[1.6,2.4,4,7] では13秒ごとに満タンになり大技が安売りになったので、3分で2〜4回になるよう下げた
   */
  gainByStage: [0, 0.6, 0.9, 1.5, 2.6] as const,
  /** sizeFactor = clamp((体積 / sizeRef)^sizeExponent, min, max) */
  sizeRef: 5000,
  sizeExponent: 0.35,
  sizeFactorRange: [0.5, 2] as const,
  /** 燃え広がりで壊れた分のたまり方（倍率） */
  fireFactor: 0.5,
};

/** 燃え広がりの規則（純データ。乱数を使わない）。 */
export const FIRE = {
  /** 燃えている建物からこの隙間（m）以内の建物へ燃え移る。車道（12m〜）は越えにくく、路地（6.5m）は越える */
  neighborGap: 7.5,
  /**
   * 燃えている建物が隣に与える熱（/秒、燃えの強さ1・隙間0のとき）。隙間 g では 1 / (1 + g / gapScale) 倍。
   * r00b：0.05 では隣へ移るまで20秒を超え、3分の間に燃え広がりがほとんど見えなかったので 0.12 に上げた（接した住宅で約6秒）
   */
  spreadRate: 0.12,
  gapScale: 4,
  /** 燃え移らせる最低の燃えの強さ */
  spreadMinBurn: 0.3,
  /** 着火した直後の燃えの強さと、強まる速さ（/秒） */
  igniteBurn: 0.25,
  growRate: 0.2,
  /** 燃料が尽きてから弱まる速さ（/秒） */
  decayRate: 0.08,
  /** 燃えている間に耐久を削る割合（耐久×/秒、燃えやすさを掛ける） */
  damagePerSecond: 0.022,
  /** 焦げがたまる速さ（/秒） */
  charRate: 0.06,
  /** 炎が壁を上へ広がる速さ（m/秒）と、下へ広がる速さ */
  climbRate: 1.8,
  sinkRate: 0.5,
  /** 着火した高さを中心に最初に燃える幅（m） */
  initialSpan: 6,
};
