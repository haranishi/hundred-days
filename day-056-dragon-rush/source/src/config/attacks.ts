// OWNER: config
// 攻撃の表。新しい攻撃を足すときは、ここに1行足し、gameplay/combat.ts の出し方（入力との対応）を1か所足す。
// 形：cone は口から狙いへの円錐、fan は体の中心からの扇（前 facing=1／後ろ -1）、ring は着地点や体の中心からの円。
// 損傷は「爪の1回＝110」を基準にした点数（耐久は config/gameplay.ts の HP で決まる）。

/**
 * 技の最中に押した爪・尾・大技を覚えておく秒数（先行入力）。技が終わった瞬間（か、戻りを切り上げられる所）で出す。
 * 爪を振っている最中に押した爪は、この秒数に関係なく必ず次の爪にする（r02-controls：指摘「連打の2発目が消える」）
 */
export const INPUT_BUFFER_SECONDS = 0.35;

/**
 * 技を出す前の向き直り（r02-controls で追加）。指摘「視点を90度振って炎を吐くと体は50度しか向かない」。
 * 炎・爪・尾は、押した瞬間の照準の向きへ seconds 秒で向き直ってから当てる（大きくずれているほど速く回る。最低 minRateDeg 度/秒）
 */
export const AIM_TURN = { seconds: 0.15, minRateDeg: 240 };

/**
 * 近い的（r05-play で追加）。指摘「照準の先が約20m より近いと、炎と雷が溜めのまま出ない。照準は明るいまま」（体験の採点 r04 の B1）。
 * 主砲は口（体の中心の前 25m、雷翼 18m・焔角 21m）から照準の点への水平の向きが首の振れる範囲に入ってから出す。照準の点が口より体の側
 * （口の真下・後ろ。ビルの前に立つと口はビルの中に入る）にあると、体が照準へ向き直っても向きが後ろのままで、出なかった。
 * 照準の点が、体の前後の線に沿って口より lead m 先に無いときは、主砲の出どころを点の lead m 手前まで体の側へ引き戻す（体の中心より後ろへは引かない）。
 * 首を曲げて足もとへ吹く形で、炎と雷は口の前から照準の点へ当たる。それより遠い的では口のまま（出方は前と1刻みも変わらない）
 */
export const CLOSE_AIM = { lead: 6 };

export interface TimeScaleHit {
  /** 当たった瞬間に時間をこの倍率まで落とす（完全には止めない） */
  scale: number;
  /** 落とす長さ（実時間の秒） */
  seconds: number;
}

export interface MeleeSpec {
  /** 振りかぶり・当たり・戻りの秒数。当たりの判定は「当たり」の始まりに1回 */
  windup: number;
  active: number;
  recovery: number;
  /** 扇の半径（m、体の中心から）と半角（度）。facing=-1 は後ろ向きの扇 */
  range: number;
  halfAngleDeg: number;
  facing: 1 | -1;
  /** 当たる高さの範囲（体の中心の高さからの下・上、m） */
  below: number;
  above: number;
  damage: number;
  /** 当たった建物の窓が割れる割合 */
  glass: number;
  /** 振っている間の移動の速さの倍率 */
  moveScale: number;
  /** 戻りに入ってこの秒数たったら、次の技（爪・尾・炎）で戻りを切り上げられる（r02-controls で追加） */
  cancelAfter: number;
  hitStop: TimeScaleHit;
  /** 画面の揺れ（トラウマ値、0〜1） */
  shake: number;
}

export interface RingSpec {
  radius: number;
  /** 中心での損傷。距離 d では (1 - (d/radius)^2) 倍 */
  damage: number;
  /** 窓の割れ（中心で）。glassRadius まで同じ割合で割れる */
  glass: number;
  glassRadius: number;
  hitStop: TimeScaleHit;
  shake: number;
}

export const CLAW: MeleeSpec = {
  windup: 0.2,
  active: 0.12,
  recovery: 0.42,
  range: 36,
  halfAngleDeg: 58,
  facing: 1,
  below: 12,
  above: 20,
  damage: 110,
  glass: 0.45,
  moveScale: 0.35,
  cancelAfter: 0.16,
  hitStop: { scale: 0.18, seconds: 0.075 },
  shake: 0.3,
};

export const TAIL: MeleeSpec = {
  windup: 0.3,
  active: 0.25,
  recovery: 0.5,
  range: 52,
  halfAngleDeg: 112,
  facing: -1,
  below: 12,
  above: 10,
  damage: 90,
  glass: 0.35,
  moveScale: 0.25,
  cancelAfter: 0.25,
  hitStop: { scale: 0.22, seconds: 0.06 },
  shake: 0.28,
};

export const BREATH = {
  /** 喉が光ってから炎が出るまで。r02-controls：指摘「炎の出が遅い」 0.28→0.1 */
  windup: 0.1,
  /** 届く距離（m、口から）と、燃え移りの熱を配る円錐の半角（度） */
  range: 150,
  halfAngleDeg: 11,
  /**
   * 炎の芯（r02-controls で追加）：損傷を与えるのは、口から照準へ伸ばした細い芯に最初に当たった建物だけ。
   * 指摘「照準と違う（手前の横の）ビルが燃える」：旧は広がった円錐（100m 先で半径21m）に最初に触れた建物をすべて焼いていた。
   * 芯の半径 = coreRadius + coreSpread × 距離
   */
  coreRadius: 2.5,
  coreSpread: 0.035,
  /** 口の位置（体の中心からの局所座標：+x 左・+y 上・+z 前、m）。当たり判定の起点。見た目の口は竜の表示が持つ */
  mouthLocal: [0, 5, 25] as [number, number, number],
  /**
   * 最初に当たった建物への損傷（/秒）と熱（/秒、燃えやすさを掛ける。1 で着火）。
   * r02-controls：指摘「50mの中層に3秒当ててもひびと剥がれまで」 80→115（3秒で耐久400前後の中層が傾く）
   */
  damagePerSecond: 115,
  heatPerSecond: 0.9,
  /** 当たった所のまわりへ飛び火する半径と熱（/秒） */
  splashRadius: 12,
  splashHeat: 0.3,
  /** 吐いている間の移動の速さの倍率。r02-controls：指摘「炎を吐くと歩きの4割で、焼きながら進めない」 0.4→0.65 */
  moveScale: 0.65,
  /** 首が体の向きから振れる範囲（度）。吐いている間、体は照準へ向き続け、ずれがこの範囲に入ってから炎を出す */
  neckYawLimitDeg: 55,
  glass: 0.3,
};

/**
 * 咆哮（紅竜の地上の E）。r06-balance：指摘「咆哮の1回は破壊率 +1.0〜1.2%、崩れるのは1〜3棟」（体験の採点 r05 の TOP1）。
 * 旧は半径150m・中心150 で、耐久の中央値が 205 のタイルの中層すら1回では崩せなかった。中心を怒りの急降下（RAGE_DIVE）と同じ 560 にし、
 * 届く範囲を 140m にした（急降下は115m）。中心から 0.6×半径（84m）の中層まで1回で崩れる。窓が割れる範囲は前と同じ 190m。
 * 人に近い遊び方の3分（tests/gameplay/balance.measure.test.ts）で、1回の3秒の伸びの中央値は約 +2%。
 * 試した値（4通りの遊び方×種20、伸びの中央値／紅竜の3分の中央値）：130・500 で 1.8%／19.5%、120・560 で 1.7%／18%、140・520 で 2.2%
 */
export const ROAR = {
  windup: 0.45,
  recovery: 0.9,
  ring: {
    radius: 140,
    damage: 560,
    glass: 1,
    glassRadius: 190,
    hitStop: { scale: 0.3, seconds: 0.12 },
    shake: 0.75,
  } satisfies RingSpec,
  /**
   * 咆哮の炎（r06-balance）。咆哮を強くしたら、燃えている街区ごと崩れて燃え広がりが前の半分に減った（紅竜の壊し方の芯は燃え広がり）。
   * fan：中心から radius m 以内で燃えている建物から、燃え移り先（隙間 FIRE.neighborGap 以内の隣）へ heat の熱を一度に送る（燃えやすさを掛ける。1 で着火）。
   * 炎で焼いてから吠えると、炎が隣へ燃え移る（1.3 ならタイルの中層（燃えやすさ0.8）まで燃え移り、ガラスの高層（0.55）には移らない）。
   * rim：中心から外形まで from〜to m の立っている建物（輪の外側で、崩れずに残る所）のうち、近い count 棟に heat の熱（着火する）。
   * 吠えた後も、まわりで炎が燃え広がる。棟数を絞るのは、一度に燃える建物を増やしすぎない（炎の見た目の重さ）ため
   */
  fan: { radius: 140, heat: 1.3 },
  rim: { from: 100, to: 170, count: 3, heat: 3 },
};

/** 着地の地響き。落下速度 v（m/s）に比例して半径と損傷が増える。 */
export const LANDING = {
  /** これより遅い着地は地響きを起こさない */
  minSpeed: 12,
  radiusBase: 16,
  radiusPerSpeed: 0.6,
  damagePerSpeed: 1.6,
  glassPerSpeed: 0.012,
  shakePerSpeed: 0.012,
};

/** 怒りの急降下（空中で E）。着地点のまわりがまとめて崩れる。 */
export const RAGE_DIVE: RingSpec = {
  radius: 115,
  damage: 560,
  glass: 1,
  glassRadius: 170,
  hitStop: { scale: 0.12, seconds: 0.16 },
  shake: 1,
};

/**
 * 歩いてぶつかる・踏みつぶす。低い建物（踏みつぶせる高さ未満）は通り抜けながら壊し、高い建物には押し返される。
 * r02-controls：指摘「空中でビルに当たると 36→1.5 m/s に1コマで止まり、W を押しても6.5秒抜けられない」（バグ B1）。
 * 旧：壁へ向かっている間は速さを 1.5 m/s に抑え続けた。新：速さは抑えず、壁へ向かう入力を壁に沿う向きへ直して滑らせる。
 * 速く（smashSpeed 以上）深い角度（smashMinInto 以上）で当たったら、その建物を傾きの段階まで壊して、速さを smashKeep だけ残す
 */
export const BODY_CONTACT = {
  /** 体の当たりの半径（m、水平） */
  radius: 9,
  trampleHeight: 14,
  trampleDamage: 140,
  /** ぶつかったときの損傷 = 速さ（m/s）× bumpPerSpeed（1回ごとに間を空ける） */
  bumpPerSpeed: 3.5,
  bumpCooldown: 0.6,
  /** 体当たり：この速さ（m/s）以上で、壁への深さ（向きと壁の法線の内積）が smashMinInto（45度）以上なら、傾きまで壊す */
  smashSpeed: 20,
  smashMinInto: 0.707,
  /** 体当たりの後に残す速さの割合、浅い角度で当たったときに残す割合、深い角度でゆっくり当たったときに残す割合 */
  smashKeep: 0.6,
  slideKeep: 0.7,
  pushKeep: 0.5,
  /** 壁に沿って滑る向きを、当たってからこの秒数だけ覚えておく（毎刻み当たっている間は延び続ける） */
  wallMemory: 0.25,
  /**
   * 重なりの押し出し（r05-play で追加）。指摘「空中で塔をかすめると、1コマで約6m 横へ押し出される」（体験の採点 r04 の B3）。
   * 滑空で沈むうちに足が屋上より下がった瞬間、すでに外形に重なっていた分（半径 9m のうち約6m）を1刻みで押し出していた。
   * その刻みに壁へ向かって動いた分は、今どおりその刻みで戻す（壁を抜けない・歩いて当たったときは前と同じ）。
   * 残りの重なりは、毎秒 easeSpeed m と「重なり ÷ easeSeconds」の速い方で、数コマかけて押し出す（6m なら 0.2秒・1コマ 0.5m）
   */
  easeSpeed: 30,
  easeSeconds: 0.25,
};
