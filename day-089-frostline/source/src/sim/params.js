/** SI units (m, s, kg, rad). Uncalibrated gameplay values stay here. */
const DEG = Math.PI / 180;
export const SNOW = Object.freeze({
  packed: Object.freeze({ mu: 0.04, lambda: 3.6, kz: 0, q: 0 }), // 2026-11-10 I7: 高速ターンと横切りの支持力を確保（μはR2範囲を保持）
  powder: Object.freeze({ mu: 0.06, lambda: 2.6, kz: 12000, q: 5000 }), // 2026-11-10 I7: 混雪で80km/hの操舵を確保、圧雪より弱くする
  ice: Object.freeze({ mu: 0.025, lambda: 0.6, kz: 0, q: 0 }), // model proposal
  rock: Object.freeze({ mu: 0.50, lambda: 0.8, kz: 0, q: 0 }), // model proposal
});
export const PARAMS = Object.freeze({
  mass: 80, // R2 §3 reference mass
  gravity: 9.81, // R2 §3
  airDensity: 1.10, // R2 §3 proposal, mountain air
  cdA: 0.50, // model proposal, upright
  cdATuck: 0.34, // model proposal, tucked
  tuckGlide: 1, // 2026-11-11: 低い姿勢のとき、雪の滑りの抵抗（μ）に掛ける値。スノーボードは 1（変えない）。スキーは GEAR.ski
  spring: 15000, // R2 §3 #18 proposal
  dampingCompress: 1800, // R2 §3 #18 proposal
  dampingExtend: 1000, // 2026-11-10 I8: 37m/s・半径100mへ立ち姿勢で入ったとき0.1s以内に支持を抜く
  legMin: 0.45, // model proposal
  legMax: 1.00, // model proposal
  legStand: 0.90, // model proposal
  legCrouch: 0.55, // model proposal
  legAir: 0.80, // model proposal
  unloadTime: 0.04, // 2026-11-10 I8: 支持力0が続く凸では脚の上限前に自然離雪する（s）
  sidecut: 8, // R2 §2.5 board proposal
  turnYawMin: 1.6, // 2026-11-10 I8: 低速でも進む向きを十分に変えられる操舵基準（rad/s）
  turnYawMax: 1.8, // 2026-11-10 I8: 低速の回りすぎを防ぐ旋回率の上限（rad/s）
  edgeMax: 60 * DEG, // model proposal
  edgeTuck: 38 * DEG, // model proposal
  edgeBase: 0.06, // model proposal
  edgeGain: 0.94, // model proposal
  edgeExponent: 0.8, // model proposal
  lateralReserve: 0.86, // 2026-11-10 I8: 圧雪でもsteer0.25の横切り保持を2秒±10°以内へ合わせる
  lateralOmega: 8, // 2026-11-10 I8: 短い自然離雪後も操舵を戻しT2bの旋回比を保つ
  lightLoad: 0.5, // model proposal
  lightResponse: 1.3, // model proposal
  carveFriction: 0.045, // model proposal
  breakRatio: 1.15, // model proposal
  edgeSwitchAngle: 0.05, // rad. below this the board counts as flat (no edge side)
  edgeSwitchSpeed: 1.0, // m/s. slower than this, an edge change is not reported as an event
  breakTime: 0.10, // model proposal
  brakeThreshold: 0.05, // model proposal
  skidAngle: 75 * DEG, // model proposal
  skidTurnAngle: 30 * DEG, // 2026-11-10 I7: 制動なしのグリップ破れでも操舵と雪煙を続ける
  skidTurnDrag: 0.60, // 2026-11-10 I10: 高速横滑りで無操作比4m/s以上の減速と雪煙を出す
  skidTurnGrip: 1.15, // 2026-11-10 I7: 雪を押しのける横滑りで旋回力を保つ（実荷重0なら力0）
  skidOmega: 7, // 2026-11-10 I10: 制動の効き始めをなだらかにする
  brakeExponent: 0.5, // 2026-11-10 I10: 半制動の1秒減速を全制動の40〜65%へ
  downhillResponse: 1.1, // 2026-11-10 I10: 解除後0.9〜2秒で谷向き20°以内へ
  skidSpeed: 24, // 2026-11-10 I10: 高速の全舵で削る状態へ移す（m/s）
  skidSteer: 0.9, // 2026-11-10 I10: 高速時にグリップを破る舵の下限
  skidDamping: 0.9, // model proposal
  skidEdgeBase: 20 * DEG, // model proposal
  skidEdgeBrake: 25 * DEG, // model proposal
  skidDynamic: 0.44, // 2026-11-10 I10: 制動1秒後40〜65%・60km/hから18〜26mへ
  skidIceDynamic: 0.6, // 2026-11-10 I10: 氷の制動は旧値を保ちT5の25°減速を維持
  skidSlope: 10, // model proposal
  skidRegularSpeed: 0.5, // model proposal
  skidLowSpeed: 1, // model proposal
  recaptureAngle: 4 * DEG, // model proposal
  recaptureTime: 0.10, // model proposal
  lowEnter: 2.5, // model proposal
  lowExit: 3.0, // model proposal
  lowYaw: 2.2, // 2026-11-10 I8: 停止からのsteer0.5を1秒で35°以上へ応答させる
  lowYawFloor: 0.46, // 2026-11-11: 遅いときの舵の効きの下限（lowYaw に掛ける）。秒速 2〜3 m で、舵 0.5 を 1 秒入れて 25〜30° 回る
  chargeSteer: 0, // 2026-11-11: 地上で構えている間の、舵の効き（掛ける値）。舵は、回りながら飛ぶための予約として読む（0.25 では、1.5 秒で 26° 曲がり、台の脇へ出た：採点 3 周目）
  lipPop: 3.0, // 2026-11-11: 構えている最中に、雪面がこの加速度（m/s²）より速く落ちはじめたら、その場で踏み切る
  skidHopTime: 0.35, // 2026-11-11: 制動の途中の浮きが、これより短ければ、着地の「横向き」に数えない（s）
  skidLineHold: 1, // 2026-11-11: 舵を入れない制動で、エッジの力の「進む向きに直角な成分」を打ち消す割合（0.85 では、離した後に 12° ずれて台を外れた：採点 3 周目）
  skidLineBrake: 0.3, // 2026-11-11: 制動がこの強さ以上で、線を保つ働きが最大になる
  skidEdgeFullSpeed: 4, // 2026-11-11: 横滑りの傾きが、いっぱいになる速さ（m/s）。それより遅いと、浅くする
  safeHopTime: 0.6, // 2026-11-11: 戻り先を覚える間、これより短い浮きでは、数え直さない（s）
  restartDelay: 0.8, // 2026-11-11: 斜面の上で、制動をかけずに止まってから、板の先を谷へ向け直すまでの時間（s）
  restartSlope: 3 * DEG, // 2026-11-11: これよりゆるい所では、向け直さない（平らな所は、蹴って進む）
  restartAngle: 20 * DEG, // 2026-11-11: 板の先が、谷の向きからこの角度より離れているときだけ、向け直す
  noseDownMaxSpeed: 8, // 2026-11-11: 板の先を谷へ向け直している間、遅いときの計算を続ける速さの上限（m/s）
  kickAcceleration: 4, // 2026-11-10 I7: tuck長押しで新雪の沈み込み抵抗を越えて蹴り進む（m/s²）
  kickMaxSpeed: 3.2, // 2026-11-10 I7: 蹴る力による加速は歩行程度の速さまで（m/s）
  downhillAligned: 0.02, // adjustment: complete the uphill-to-downhill pivot before static holding
  downhillYaw: 100 * DEG, // 2026-11-10 I10: 制動解除後の自動回転を100°/s以下にする
  holdSpeed: 0.25, // model proposal
  holdFriction: 0.10, // model proposal
  holdEdge: 25 * DEG, // model proposal
  area: 0.40, // R2 §3 #20 proposal
  snowDensity: 150, // R2 §3 #20 proposal
  snowLift: 0.15, // R2 §3 #20 proposal
  submerge: 0.10, // R2 §3 #20 proposal
  sinkMax: 0.25, // model proposal
  plowRegularSpeed: 0.5, // model proposal
  sprayPower: 8000, // proposal: reference dissipated power for visual spray (W)
  skidPlow: 2, // model proposal
  comSettleTime: 0.10, // adjustment: absorb landing lean without COM position jumps
  crouchTime: 0.10, // model proposal
  jumpHold: 0.12, // model proposal
  popSpeed: 3.8, // 2026-11-10 I10: 15°最大構えの滞空を0.75〜0.95秒へ
  jumpChargeTime: 0.8, // 2026-11-10 I7: 姿勢が飽和しても保持時間で踏み切りの強さを変える（s）
  popMinFraction: 0.70, // 2026-11-10 I10: 最短0.12秒の構えでも滞空0.40〜0.55秒を確保
  spinTakeoff: 2.5, // model proposal
  spinWindup: 6.0, // model proposal
  spinControl: 2.5, // model proposal
  spinAdjustment: 1.6, // model proposal
  tuckInertia: 0.5, // R2 §3 #17 / model proposal
  spinCruise: 300 * DEG, // 2026-11-10 I10: 仕込み継続時のスピン速度
  spinGrab: 430 * DEG, // 2026-11-10 I10: 技の構え時のスピン速度・仕込み上限
  flipSpeed: 400 * DEG, // 2026-11-10 I10: 前後の宙返り速度
  trickResponse: 0.05, // 2026-11-10 I10: 0.15秒以内に目標速度の90%へ（時定数s）
  trickDecay: 0.08, // 2026-11-10 I10: 解除後0.25秒以内に10%以下へ（時定数s）
  trickDelay: 0.12, // 2026-11-10 I10: 短い浮きでの回転を抑える（s）
  trickAssistAngle: 45 * DEG, // 2026-11-10 I10: この角度内だけ着地を補助
  trickAssistSpeed: 240 * DEG, // 2026-11-10 I10: 補助の回転速度上限
  grabConfirm: 0.3, // 2026-11-10 I10: つかみが成立する連続保持（s）
  bodyRadius: 0.45, // 2026-11-10 I10: 体の先行接触を判定する重心半径（m）
  flipClean: 20 * DEG, // 2026-11-10 I10: 宙返りの成功残り角
  flipCrash: 50 * DEG, // 2026-11-10 I10: 超過で逆さ着地の転倒
  airAlign: 3, // model proposal (rad/s)
  airEventTime: 0.08, // design microflight filter
  collisionInterval: 0.25, // model proposal, swept landing subdivision
  collisionBisections: 8, // model proposal
  landingHard: 1.5, // R2 §4 / model proposal, EFH
  landingPrepared: 1.8, // model proposal
  preparedMin: 0.25, // model proposal
  preparedMax: 0.85, // model proposal
  landingSide: 55 * DEG, // model proposal
  landingSideSpeed: 6, // model proposal
  landingSketchAngle: 15 * DEG, // model proposal
  landingSketch: 1.0, // model proposal, EFH
  landingHeavy: 0.85, // 2026-11-10 I10: 自力の最大踏み切りをきれいな着地にする（EFH m）
  landingPowder: 2.4, // 2026-11-10 谷と湖のマップ: 深い新雪は着地の衝撃を吸う。新雪いっぱい・深さ powderDepth 以上で、転倒の境目をこれだけ上げる（m）
  // 同上。「重い」「乱れ」の境目を上げる量（m）。2026-11-11：1.2 → 2.0。山に置いた自然の雪の段は、中央の速さで衝撃 0.7〜2.3 m。
  // 1.2 のときは、いちばん大きな段（2.27 m）が、何もしなくても毎回「着地が乱れました」になり、技の点が 4 割に減った。新雪の斜面へ降りる飛びは、きれいに決まるようにする
  landingPowderSketch: 2.0,
  powderDepth: 0.6, // 新雪の吸い込みが最大になる雪の深さ（m）
  waterDrag: 6, // 水に落ちた体が止まる速さ（1/s）
  waterClear: 18, // 復帰地点は、水が見えている所からこの距離は離す（m）
  sketchTime: 0.6, // model proposal
  sketchControl: 0.5, // model proposal
  sketchSpeed: 0.9, // model proposal
  crashFriction: 0.45, // model proposal
  crashGrip: 1.2, // 2026-11-10 I7: 30°・33m/sから3.5秒以内に停止するよう摩擦の増加を早める
  recoverClear: 1.0, // 調整値：立ち上がるとき、近い障害物から空ける間隔（m）。樹氷の山側で立って動けなくなった（2026-11-10）
  slideAroundSpeed: 1.2, // 調整値：障害物に押しつけられて止まったとき、接線方向へ回り込ませる速さ（m/s）
  collisionEventSpeed: 0.5, // 調整値：これ未満の接触は出来事にしない（押しつけられている間の連発を防ぐ）
  crashFrictionMax: 2.2, // 2026-11-10 I7: 60°でも正味の抵抗を十分に残して停止する（tan60°=1.73）
  recoverSpeed: 0.5, // model proposal
  recoverSettle: 0.3, // model proposal
  recoverDelay: 1.2, // model proposal
  respawnAhead: 12, // 2026-11-10 I8: 復帰後12m先まで障害物を確認する（m）
  respawnHalfWidth: 2, // 2026-11-10 I8: 復帰先の左右2mに木や岩がない通路を選ぶ（m）
  respawnSideMax: 6, // 2026-11-10 I8: 復帰時の横移動を最大6mに制限する（m）
  respawnSlope: 5 * DEG, // 2026-11-10 I8: 5°以上の復帰は谷へ向けて無操作でも滑り出す
  safeInterval: 3, // model: every few seconds, proposal
  safeMinSpeed: 4, // 2026-11-10 I7: 停止地点や抜け出せない低速地点を復帰先にしない（m/s）
  safeSlip: 10 * DEG, // adjustment: stable means small slip
  riderRadius: 0.35, // model proposal
  treeCrashSpeed: 6, // model proposal
  rockCrashSpeed: 5, // model proposal
  restitution: 0.2, // model proposal
  rockSpeed: 14, // model proposal
  rockTime: 0.2, // model proposal
  boundsMargin: 60, // model proposal
  boundsDecel: 30, // adjustment: strong edge resistance (m/s²), hard stop at edge
  maxStep: 1 / 240, // adjustment: substeps stabilize legs / PD at all supported rates
  epsilon: 1e-10, // numerical tolerance, not a force coefficient
  eventCapacity: 128, // preallocated per-step event records
});
/** ski-gear design / R2 §2.5: one shared body, gear-specific coefficients only. */
export const GEAR = {
  board: {},
  ski: {
    sidecut: 18,
    // 空気の抵抗：立つ姿勢は、スノーボードと同じ（0.56 では、低い姿勢を取らないと、スキーのほうが遅かった）。低い姿勢は、はっきり小さい
    cdA: 0.50, cdATuck: 0.22,
    // 低い姿勢では、板を平らに置いて、雪の抵抗も減る（滑走面を雪に平らに当てる）。空気の抵抗だけだと、時速 50 km では、
    // 低い姿勢の 4 秒で時速 2.7 km しか速くならず、「低い姿勢が速い」を感じられなかった（スキーの滑りの採点 1 周目）
    tuckGlide: 0.45,
    lateralOmega: 12, // 1.5× edge response; same critical damping as board
    kickMaxSpeed: 4.5,
    edgeMax: 45 * DEG, // 60° cancels much of the longer sidecut's radius difference
    // 遅いときの回る速さの下限。0.6 rad/s では、時速 30 km の回る半径が、スノーボードの 2.6 倍になり、「軽い」より「曲がらない」と感じた
    // （採点 1 周目）。1.05 で、どの速さでも 1.5〜1.7 倍になる（秒速 15 m では、横の絞りの半径で決まる 1.18 rad/s のまま）
    turnYawMin: 1.05,
    // 2 本の脚で起伏を吸収するので、こぶで荷重が抜けても、エッジが外れにくい（外れるまでの時間と、限界の比を、広く取る）。
    // スノーボードと同じ値だと、荒れた急な面で、舵を入れて 0.1 秒で、ずらす滑りに変わった（採点 1 周目）
    breakTime: 0.22, breakRatio: 1.3,
  },
};
export function createParams(overrides = {}) {
  return { ...PARAMS, ...overrides, snow: {
    packed: { ...SNOW.packed, ...overrides.snow?.packed },
    powder: { ...SNOW.powder, ...overrides.snow?.powder },
    ice: { ...SNOW.ice, ...overrides.snow?.ice },
    rock: { ...SNOW.rock, ...overrides.snow?.rock },
  } };
}
export function edgeGrip(angle, p) {
  return p.edgeBase + p.edgeGain * Math.sin(Math.min(Math.abs(angle), p.edgeMax)) ** p.edgeExponent;
}
