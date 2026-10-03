// OWNER: config
// 竜の動きの数値（m・秒・度）。全長60mの巨体でも、入力への追従は速くする。重さは足取り・揺れ・音・壊れ方で出す。
// r02-controls：指摘「向きを変える・止まる・降りるが思いどおりにならない」（体験の採点 X3＝4点）。
// 「加速と旋回を遅くして重さを出す」という r00b の方針をやめ、旋回・止まり・上下を速くした（docs/UX-5LAYERS.md の操作性の節）。
// 速さは「3分で街（1.5km）を何度か横切れる」ことから決めた：歩き 1.5km/2.8分、飛行 1.5km/40秒。

export const LOCOMOTION = {
  /** 立っているときの体の中心の高さ（足の裏から、m） */
  bodyHeight: 9.5,
  /**
   * 始まりの位置（都心の西の上空）と向き（度、+z が 0、上から見て反時計回り）。東を向き、夕日を背にする。
   * r02-controls：指摘「始まりが高く、案内どおりに炎を吐いても届かない」 高さ 140m→70m（y 150→79.5）
   */
  spawn: { x: -330, y: 79.5, z: -20, headingDeg: 90 },
  /**
   * 始まりの照準（r02-controls で追加）：既定の向きの近くから、照準が「炎の届く高層ビル」に乗る向きと見下ろしを探す。
   * 街の形が変わっても、この規則で決め直す。minHeight 以上の建物の、口から reach の範囲に当たる向きを選ぶ
   */
  spawnAim: { minHeight: 60, reachMin: 40, reachMax: 125, searchDeg: 150, stepDeg: 2, pitchMinDeg: -26, pitchMaxDeg: -4, pitchStepDeg: 1 },
  /** 遊べる範囲（これより外へは押し戻す）。西の湾の上は岸から seaMargin まで */
  bounds: { xMax: 745, zMin: -745, zMax: 745, seaMargin: 260 },
  /** 水の上に降りたときの足の沈み（m）。湾は浅瀬として歩ける */
  wadeDepth: 3.5,
  ground: {
    walkSpeed: 9,
    runSpeed: 22,
    /** r02-controls：指摘「走りが最高速の9割に届くまで2.2秒」 歩き 9→11、走り（新設）20 m/s²（最高速の9割まで約1.0秒） */
    accel: 11,
    runAccel: 20,
    /** r02-controls：指摘「止まるのに17m滑る」 14→30（走りから0.73秒・8m で止まる） */
    decel: 30,
    /**
     * 旋回の速さ（度/秒）。遅いときは速く、速いときはゆっくり回る。
     * r02-controls：指摘「地上の180度に2.2秒」 遅いとき 95→240、速いとき 42→170（180度を1.0秒以内）
     */
    turnSlowDeg: 240,
    turnFastDeg: 170,
    /** 入力と向きがこの角度（度）以上ずれていたら、まず減速して向きを変える */
    sharpTurnDeg: 110,
    /** 1歩きサイクル（4歩）で進む距離（m）。足の出る間隔の元 */
    strideWalk: 15,
    strideRun: 24,
  },
  air: {
    cruiseSpeed: 36,
    hoverSpeed: 5,
    /** r02-controls：指摘「空中は離しても3秒以上流れる」 加速 9→14、減速 7→14 */
    accel: 14,
    decel: 14,
    /** r02-controls：指摘「空中の180度に3.2秒・直径75mの大回り」 55→125（180度を1.5秒前後） */
    turnDeg: 125,
    /**
     * 大きく向きを変える間の減速（r02-controls で追加）：入力と向きが sharpTurnDeg 以上ずれている間は、
     * 目標の速さを sharpTurnScale 倍にし、sharpTurnBrake（m/s²）で落とす。直径40m以内で回るため
     */
    sharpTurnDeg: 45,
    sharpTurnScale: 0.6,
    sharpTurnBrake: 26,
    /** 地上で Space：離陸の上向きの速さ（m/s） */
    takeoffSpeed: 17,
    /**
     * 上下の操作（r02-controls：指摘「長押しは浮くだけ・連打で急上昇」）。
     * 旧：押した瞬間に +12 m/s を足し（連打で重なる）、押し続けると上下の速さを 0 へ戻した（4.8秒の連打で +302m）。
     * 新：Space を押し続ける間は climbSpeed へ climbAccel で近づける（押した瞬間は flapKick まで持ち上げるだけで、足さない）。
     * C を押し続ける間は -descendSpeed へ。何も押さないときは glideSink へ glideAccel で戻る
     */
    climbSpeed: 18,
    climbAccel: 32,
    flapKick: 8,
    descendSpeed: 15,
    descendAccel: 30,
    /** 何も押さないときの滑空の沈み（m/s）と、そこへ近づく強さ。r02-controls：離したらその高さで滑空へ戻す 6→20 */
    glideSink: -5,
    glideAccel: 20,
    /** 上がれる高さ（地面から、m） */
    ceiling: 320,
    /** 羽ばたきの回数（Hz）：巡航・上昇やホバリング */
    flapHzCruise: 0.5,
    flapHzClimb: 0.95,
    /** 旋回で体を傾ける最大（度） */
    bankMaxDeg: 32,
  },
  dive: {
    /** 急降下できる最低の高さ（地面から、m） */
    minAltitude: 14,
    fallSpeed: 58,
    rageFallSpeed: 82,
    fallAccel: 45,
    forwardSpeed: 40,
    /** r02-controls：旋回を空中に合わせて速く 40→70 */
    turnDeg: 70,
    /**
     * 急降下をやめてから滑空の沈みまで戻す秒数（r02-controls で追加）。
     * 指摘「Shift を離しても毎秒45mで落ち続ける」：旧は滑空の強さ（6 m/s²）でしか戻らなかった
     */
    exitSeconds: 0.45,
  },
  landing: {
    /**
     * 着地のあと動けない秒数（強い着地ほど長い）＝ recoverBase + recoverPerImpact × 衝撃。
     * r02-controls：指摘「急降下の着地の硬直0.78秒」 0.35→0.2、0.5→0.2（急降下で0.37秒、滑空で0.21秒）
     */
    recoverBase: 0.2,
    recoverPerImpact: 0.2,
    /** 着地で残す水平の速さの割合 */
    keepSpeed: 0.35,
    /** impact = 落下速度 / この値（1 で打ち切り） */
    fullImpactSpeed: 70,
  },
};
