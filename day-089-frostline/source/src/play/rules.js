/**
 * 仕様の境界値。
 * stationSpeed：ふもとの駅（集落）は、この速さより遅く円へ入ると「着いた」とする。45 m/s（時速 162 km）＝どの速さでも着く。
 *   6 m/s だったときは、谷を下ってきた勢い（時速 80 km）のまま駅を通り過ぎ、その先の山荘に当たった（2026-11-11）。
 *   ゴールの門をくぐる扱いにする。中腹の駅（リフトの山頂側・谷の中ほど）は、通り過ぎる人のために、止まってから着く（middleStop）。
 * bigAir・dropHeight：山に置いた仕掛けの実測から決めた値（I17b）。
 */
export const RULES = Object.freeze({ stationSpeed: 45, stopSpeed: 1, middleStop: 1.5, manualStop: 3,
  discoverRadius: 40, retrySeconds: 30, trickSeconds: 2, noticeSeconds: 4,
  unlocks: [3000, 6000, 10000], spinPoints: [0,100,300,500,800,1100,1500],
  flipPoints: [0,600,1500,2700], practiceScore:1000, parkScore:2000, otherScore:1500,
  bigAir:1.357585856119788, bigScore:2000, fastSpeed:25, ridgeAir:.6, gullyAir:4, dropHeight:4.8,
  // 回った量の数え方：物理が着地の向きへそろえる窓（スピン 45°・宙返り 50°）のぶんは、回りきったとみなす
  spinWindow: Math.PI/4, flipWindow: 50*Math.PI/180 });
