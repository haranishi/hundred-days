// OWNER: core
// 隠密の規則の数値。出どころは docs/RULES.md。値を直したら「// rNN-担当: 理由 旧値→新値」の札を残す。
// 単位：距離 m・時間 秒・速さ m/s・加速度 m/s²・角度 度（使う側でラジアンへ直す）。
// 「r01-core 追加」と書いた値は RULES.md に無く、中核の担当が足したもの（同じく札で直す）。

/** 固定刻み（秒）。sim はこの刻みでだけ進む。 */
export const TICK = 1 / 60;

/** r06-physics: 移動途中の衝突を求めて滑らせる。微小な隙間で丸め誤差による振動を防ぐ。 */
export const PHYSICS = {
  skin: 0.0001,
  epsilon: 1e-9,
  slideIterations: 6,
} as const;

/** r07: 正面制圧は背後の当て身より遅く、音で周囲を呼ぶ。 */
export const MELEE = { range: 1.65, reach: 0.78, stepIn: 0.18, halfAngle: 75, duration: 0.6, hitAt: 0.18, stagger: 0.85, noise: 7, hits: 2, windup: 0.55 } as const;
export const INTERACTION = { range: 2.1, stopSpeed: 0.2, supply: 5, noise: 3 } as const;

/** 明るさ：L ＝ 空の明るさ ＋ Σ（灯りの強さ × max(0, 1−u²)²）を 0〜1 に切り詰めたもの。 */
export const LIGHT = {
  /** 手提灯の位置：番兵の前（m） */
  lanternForward: 0.35,
  /** 手提灯の位置：番兵の右（m） */
  lanternRight: 0.2,
  /** 手提灯の高さ（m） */
  lanternHeight: 0.9,
  /** 手提灯の半径（m） */
  lanternRadius: 5,
  /** 手提灯の強さ（0..1） */
  lanternIntensity: 0.75,
  /** これ未満が「闇」 */
  tierDim: 0.25,
  /** これ以上が「灯り」（その間が「薄明」） */
  tierLit: 0.55,
} as const;

/** 見える距離 D ＝ (base + perLight×L) × 構え × sightMul × 寺の構え（× 植え込みでしゃがむと bushCrouch）。 */
export const SIGHT = {
  /** 真っ暗でも見える距離（m） */
  base: 4.5,
  /** 明るさ 1 あたりに伸びる距離（m） */
  perLight: 12.5,
  /** 構えの係数：しゃがむ */
  stanceCrouch: 0.75,
  /** 構えの係数：歩く（止まっているときも） */
  stanceWalk: 1.0,
  /** 構えの係数：走る */
  stanceRun: 1.2,
  /** 植え込みの中でしゃがむと掛ける */
  bushCrouch: 0.35,
  /** 寺の構えの係数 */
  phaseNormal: 1.0,
  phaseCaution: 1.15,
  phaseEvasion: 1.15,
  phaseAlert: 1.3,
  /** 視界の半角（度）。頭の向きの左右 */
  halfAngle: 55,
  /** 発見中の半角（度） */
  halfAngleAlert: 70,
  /** 目の高さ（m）。壁・建物はどれもこれより高いので、判定は平面で行う */
  eyeHeight: 1.6,
  /** 扇の線の本数 */
  coneRays: 40,
  /** 扇の線を進める刻み（m） */
  coneStep: 0.5,
  /** 扇を作り直す回数（回/秒） */
  coneHz: 20,
  /** 暗い隙間の向こうの「灯りの島」を、扇1つあたり何本の帯まで持つか。r01-integrate 追加 */
  coneBands: 160,
} as const;

/** 不審の値 s：見えている間 0→1 へ溜まり、1 で発見。 */
export const SUSPICION = {
  /** 満ちるまでの時間 T ＝ fillBase + fillSpan × clamp((d−fillNear)/(D−fillNear), 0, 1)（秒） */
  fillBase: 0.45,
  fillSpan: 1.55,
  /** これより近いと最短の時間で満ちる（m） */
  fillNear: 1.5,
  /** T に掛ける：止まっている */
  mulStill: 1.5,
  /** T に掛ける：しゃがむ */
  mulCrouch: 1.3,
  /** T に掛ける：走る */
  mulRun: 0.7,
  /** T に掛ける：警戒中 */
  mulCaution: 0.85,
  /** T に掛ける：捜索中 */
  mulEvasion: 0.6,
  /** T に掛ける：居眠り */
  mulDoze: 2.5,
  /** 見えなくなってから下がり始めるまで（秒） */
  decayDelay: 0.8,
  /** 下がる速さ（毎秒） */
  decayPerSec: 0.35,
  /** これを越えたら「調べる」へ移る */
  investigateAt: 0.4,
  /** 「人が遊べる約束」1：「？」から「！」までの最短（秒） */
  minGap: 0.4,
  /** 同じく、距離が farDistance より遠いときの最短（秒） */
  minGapFar: 0.7,
  /** 「遠い」の境（m） */
  farDistance: 3,
  /** これより遅いと「止まっている」（m/s）。r01-core 追加 */
  stillSpeed: 0.3,
} as const;

/** 調べる：最後に見た位置か音の位置へ歩き、見回してから持ち場へ戻る。 */
export const INVESTIGATE = {
  /** 歩く速さ（m/s） */
  speed: 1.5,
  /** 着いてから見回す時間（秒） */
  lookTime: 4,
  /** 見回しで頭を振る幅（度）。r01-core 追加 */
  sweepDeg: 50,
  /** 見回しの一往復（秒）。r01-core 追加 */
  sweepPeriod: 2,
} as const;

/** 物音。聞こえた番兵は「調べる」へ移り、s を heardSuspicion まで上げる（発見中は無視）。 */
export const NOISE = {
  /** 一歩の間隔（秒） */
  stepWalk: 0.5,
  stepRun: 0.32,
  /** しゃがみ歩きの一歩の間隔（秒）。r01-core 追加 */
  stepCrouch: 0.6,
  /** 足音の半径（m） */
  radiusWalk: 2.5,
  radiusRun: 7,
  radiusCrouch: 0.6,
  /** 地面の係数（足音にだけ掛ける） */
  surfaceGravel: 1.5,
  surfaceDirt: 1.0,
  surfaceStone: 0.9,
  surfaceMoss: 0.6,
  /** 小石の着地の半径（m）。地面の係数は掛けない */
  stone: 9,
  /** 当て身の音の半径（m） */
  takedown: 3,
  /** 間に壁・建物があると半径に掛ける */
  throughWall: 0.6,
  /** 聞こえた番兵の s をここまで上げる（小石は上げない） */
  heardSuspicion: 0.4,
  /** 輪を画面に出す時間（秒）。契約 NoiseSnap に合わせる */
  ringLife: 1,
} as const;

/** 寺の構え（全体の段階）。 */
export const PHASE = {
  /** 発見したとき、最後に見た位置からこの距離以内の番兵が走ってくる（m） */
  alertRadius: 35,
  /**
   * 発見中の番兵の走る速さ（m/s）。プレイヤーの走り（5.2）より遅いこと。
   * r03-fix-play: 体験の採点 1 位「走って逃げても視線がなかなか切れない（約 60m）」。差を 0.9→1.6 m/s に広げた。
   * 4m 先から見つかって振り切るまでに走る距離：まっすぐな通り 31.6→17.4m、表門 69.6→24.9m（tests/escape.test.ts） 4.3→3.6
   */
  chaseSpeed: 3.6,
  /** 発見を抜ける：誰にも見られずにこの秒数 */
  alertCalmAfter: 10,
  /** 捜索の長さ（秒） */
  evasionTime: 20,
  /**
   * 捜索に移るとき、全員の不審の値 s をこれ以下に下げる。RULES の r02 の変更。
   * r02-fix-play 追加：捜索の始まりに s が 0.94 残り、見えてから約 0.5 秒で再び発見になっていた（体験の採点 4 位）
   */
  evasionSuspicionCap: 0.5,
  /** 捜索で見て回る範囲（最後に見た位置からの半径 m） */
  searchRadius: 8,
  /** 警戒の長さ（秒） */
  cautionTime: 45,
  /** 倒れた仲間で起こす警戒の長さ（秒） */
  cautionFromBody: 60,
  /** 捕まる距離（m）。発見中の番兵が、視線の通るこの距離に入ると「討たれた」 */
  catchDistance: 1.3,
  /** 捜索で見て回る点の数。r01-core 追加 */
  searchPoints: 4,
  /** 捜索の点ごとに見回す時間（秒）。r01-core 追加 */
  searchLook: 2.5,
  /** 捜索で歩く速さ（m/s）。r01-core 追加 */
  searchSpeed: 2.2,
  /** 警戒中の見回りの速さに掛ける。r01-core 追加（RULES は「速さが上がる」とだけ書く） */
  cautionSpeedMul: 1.25,
  /** 追う道を引き直す間隔（秒）。r01-core 追加 */
  repathInterval: 0.35,
} as const;

/** 倒れた仲間：見える距離 (base + perLight×L)（L はその仲間の足元の明るさ）で気づき、行って警戒を起こす。 */
export const BODY = {
  base: 4,
  perLight: 10,
  /** そこへ向かう速さ（m/s）。r01-core 追加 */
  walkSpeed: 2.0,
  /** 着いたとみなす距離（m）。r01-core 追加 */
  reach: 1.2,
} as const;

/** 当て身と討ち取り。 */
export const TAKEDOWN = {
  /** 番兵からこの距離以内（m） */
  range: 1.6,
  /** 番兵の向きからプレイヤーへの角がこれ以上（度）＝真後ろの左右 60° */
  minAngle: 120,
  /**
   * 居眠り中に限り、この角（度）以上なら当て身できる＝横からでも。RULES の r02 の変更。
   * r02-fix-play 追加：居眠り番の背後 1.3m・角 107° で当て身の案内が出なかった（体験の採点 3 位）
   */
  minAngleDoze: 90,
  /** 動作の長さ（秒）。終わると気絶（このステージの間は起きない） */
  duration: 1.0,
  /** 動作の初めに、番兵との間合いをこの距離（m）まで詰める。人物の動作が「番兵が前およそ 0.7m」で手を伸ばすため。r01-integrate 追加 */
  reach: 0.7,
  /** 詰め終わるまでの秒。r01-integrate 追加 */
  stepIn: 0.2,
} as const;

export const ASSASSINATE = {
  /** 信長からこの距離以内（m） */
  range: 1.7,
  /** 信長の視界の半角（度）。この外にいること。発見中でもできる */
  halfAngle: 55,
  /** 討つ動作の長さ（秒）。r01-core 追加 */
  duration: 1.6,
  /** 信長が崩れ落ちる長さ（秒）。r01-core 追加 */
  victimDuration: 2.4,
  /** 動作の初めに、信長との間合いをこの距離（m）まで詰める（人物の動作が「信長の背が前およそ 0.6m」の前提）。r01-integrate 追加 */
  reach: 0.62,
  /** 詰め終わるまでの秒。r01-integrate 追加 */
  stepIn: 0.24,
} as const;

/** 討ち取った後の演出（sim の finale 0→1）。r01-core 追加 */
export const FINALE = {
  /** 全体の長さ（秒） */
  duration: 10,
  /** 字幕「……是非に及ばず」を出す範囲（finale の進み） */
  subtitleFrom: 0.06,
  subtitleTo: 0.42,
  /** 上下の黒帯が入りきる進み */
  barsIn: 0.12,
  /** 炎上が始まる進み（統合で setFire((f−fireFrom)/(1−fireFrom)) に使う） */
  fireFrom: 0.2,
  /** カメラが全景へ引き始める進み */
  cameraFrom: 0.22,
  /** 題字「本能寺の変」「天正十年六月二日」を出し始める進み */
  titleFrom: 0.55,
  // 討ち取りの瞬間、蘭丸が振り向いて信長へ駆け寄る（間に合わない）。r02-fix-play 追加（体験の採点 5 位「討った後も蘭丸が立ったまま」）
  /** 振り向くまでの秒（この間は向きだけ変える） */
  rushDelay: 0.3,
  /** 振り向く速さ（度/秒） */
  rushTurnRate: 540,
  /** 駆け寄る速さ（m/s）。r02 の発見中の走りと同じ値。r03 で追っ手を 3.6 に下げたが、一閃の後に着く間合いを変えないため据え置き */
  rushSpeed: 4.3,
  /** 信長からこの距離（m）で止まる（蘭丸の側。信長の体に重ならない） */
  rushStop: 1.5,
  /** プレイヤーにこの距離（m）より近づかない */
  rushPlayerGap: 1.1,
} as const;

/** 捕まったときの動作。r01-core 追加 */
export const CAPTURE = {
  /** 番兵が槍で突く長さ（秒） */
  strike: 0.5,
  /** 突かれて倒れる長さ（秒） */
  struck: 1.2,
  /** 捕まってから「討たれた」画面を出すまで（秒） */
  toScreen: 1.6,
} as const;

/** 操作の数値。 */
export const MOVE = {
  /** 歩く・走る・しゃがみ歩きの速さ（m/s） */
  walk: 2.6,
  run: 5.2,
  crouch: 1.5,
  /** 加速・減速（m/s²） */
  accel: 14,
  decel: 18,
  /** 体の半径（m） */
  radius: 0.35,
  /** 向きを変える速さ（度/秒）。r01-core 追加 */
  turnRate: 720,
} as const;

/** 小石。 */
export const STONE = {
  /** 持っている数 */
  count: 5,
  /** 狙いはプレイヤーからこの範囲に切り詰める（m） */
  minRange: 3,
  maxRange: 14,
  /** 飛んでいる時間（秒） */
  flightTime: 0.6,
  /** 手を離す高さ（m）。r01-core 追加 */
  releaseHeight: 1.3,
  /** 放物線の弦からの高さ（m）。塀を越える見た目のため。r01-core 追加 */
  arcHeight: 2.4,
  /** 投げる動作の長さ（秒）。動けなくはならない。r01-core 追加 */
  throwAction: 0.4,
  /** Q を押していて地面との交点が無いとき、前へこの距離を狙う（m）。r01-core 追加 */
  defaultAim: 8,
} as const;

/** 番兵の動き（RULES に無いので、すべて r01-core 追加）。 */
export const GUARD = {
  /** 体の半径（m） */
  radius: 0.35,
  /** 道を探す格子で、壁から余分に離す（m） */
  navMargin: 0.05,
  /** 体の向きを変える速さ（度/秒） */
  turnRate: 150,
  // r02-fix-play: dozeTurnMul 0.35→削除。居眠り中は向きを変えない（RULES の r02 の変更。眠りながら約 100° 揺れていた）
  /** 見回りの速さの既定（m/s） */
  defaultSpeed: 1.2,
  /** 持ち場へ戻る速さ（立ち番。見回りは自分の速さ） */
  returnSpeed: 1.5,
  /** 居眠り番が、起きてから平常のまま持ち場でこの秒数たつと、また眠る */
  redozeAfter: 40,
  /** 道の点に着いたとみなす距離（m） */
  arrive: 0.2,
  /** 頭の上の印の高さ：立ち・座り（m） */
  markStand: 2.35,
  markSit: 1.7,
} as const;

/** 位の決め方（RULES の「位の決め方」）。 */
export type Rank = '影' | '梟' | '狐' | '猪';
export function rankOf(discoveries: number, takedowns: number): Rank {
  if (discoveries === 0 && takedowns === 0) return '影';
  if (discoveries === 0) return '梟';
  if (discoveries === 1) return '狐';
  return '猪';
}
