// OWNER: integrate
// art の表示（src/view/artView.ts）と、遊びの演出の調整値。時間は秒、速さの倍率は sim の進みに掛ける。

export const VIEW = {
  /** 発見の赤み（post.setAlert）の目標：寺の構えの段ごと。上げは速く、下げはゆっくり（1 秒あたりの寄り方） */
  alert: { normal: 0, caution: 0.14, evasion: 0.4, alert: 0.8, rise: 5, fall: 1.1 },
  /** 討ち取りの色抜き（post.setFinale）を 0→1 に上げる演出の進みの範囲。core の申し送り（0.15〜0.35） */
  finale: { from: 0.15, to: 0.35 },
  /** 捕まったときの色抜き（post.setDrain）の上がる速さ */
  drain: { rise: 2.6 },
  /**
   * 足元の暗さ（竹林・軒下・蔵の陰）を人物に掛ける。環境光は地図の倍率そのまま、主光は keyMix の割合だけ効かせる
   * （主光は世界の地面にも影と一緒に効いているので、全部は下げない）。floor は輪郭を読ませるための下限。
   */
  shade: { keyMix: 0.85, floor: 0.22 },
  /** 捕まった瞬間のスロー：sim の速さを slow 倍で slowFor 秒（sim の秒）、その後 rampTo 秒までに元へ戻す */
  caught: { slow: 0.35, slowFor: 0.25, rampTo: 0.6 },
  /** 植え込みに隠れている間、プレイヤーのまわり radius m の植え込みを抜く割合（しゃがむ・立つ）と寄る速さ */
  bush: { radius: 1.6, crouch: 0.62, stand: 0.35, rate: 6 },
  /** 撮影で、先作りの後に絵を落ち着かせるコマ数（AO の積算）。世界の確認ページと同じ */
  shotSettleFrames: 48,
  /**
   * 討ち取りの瞬間（r02-fix-play 追加：体験の採点 5 位「引きの画のままで手応えを字幕と炎上に任せている」）。
   * cam：寄る構図（src/camera/closeup.ts）。E の瞬間に cutDistance（m）の位置へ切り替え（カット。追従の位置から寄せると
   *   途中で屋根や建物の中を通るため）、smooth 秒のばねで distance まで押し込む。注視点の高さ・見下ろし・画角・
   *   二人がこの距離（m）より離れていたら信長だけを見る・カメラのまわりの空き（m）・建物の軒の張り出しとみなす幅（m）・
   *   松の枝ぶりの半径（m。松の scale を掛ける）・蘭丸を画の横の半画角のこの割合の内に入れる
   * slow：sim の速さに掛ける倍率。討ち取ってからの sim の秒 slowFrom〜slowTo（一閃の弧が一番明るい間）、前後 ramp 秒でなめらかに。
   *   遅くなっている（0.9 倍未満の）実時間はおよそ 0.46 秒、増える実時間はおよそ 0.3 秒（tests/finale.test.ts で確かめる）
   */
  assassinate: {
    cam: { height: 0.85, distance: 4.2, cutDistance: 6.2, pitch: 18, fov: 50, smooth: 0.5, pairMax: 3, clearance: 0.5, eaveMargin: 1.6, pineReach: 2.4, watcherInFrame: 0.8 },
    slow: 0.3,
    slowFrom: 0.47,
    slowTo: 0.57,
    ramp: 0.04,
  },
  /**
   * 討ち取りの寄りから全景（構図 fire）へ引くカメラ（r03-fix-play 追加：見た目の採点「全景へ引く最初の約 0.3 秒、カメラが庭の低い所を通る」）。
   * 旧：位置の三つの成分を同じばね（1.4 秒）で寄せる＝寄りの位置から全景の位置への直線。初めは低いまま横へ動き、本堂の屋根の高さも横切った。
   * 新：まず高さだけを riseSmooth 秒のばねで上げ、riseHeight（m。いちばん高い本堂の棟 12.5m の上）を越えてから横へ動く（tests/finale.test.ts）
   */
  finaleCam: { riseHeight: 13.5, riseSmooth: 0.55 },
} as const;

/** 重ねの表示（src/view/overlays）。r02-fix-play 追加 */
export const OVERLAY = {
  /**
   * 足音・小石の音の輪（見た目の採点 5 位の後半「足音の輪が路面に引いた白線に見える」）。
   * 旧：幅が半径の 7% の帯・濃さ 0.55×(1−u)²・0.3 秒で広がりきる → 新：画面で widthPx の線。growTime 秒で半径に届き、進み fadeFrom から薄れる
   */
  noiseRing: { color: [0.95, 0.88, 0.72] as const, widthPx: 1.8, opacity: 0.75, startFrac: 0.3, growTime: 0.55, fadeFrom: 0.3 },
  /** 小石の狙い：屋根や塀に遮られた所の濃さ（見えている所に対する割合）。旧：遮られた所は描かない（0） */
  aim: { hidden: 0.38 },
} as const;

/**
 * 右上のレーダー（src/ui/radar.ts）。r03-fix-play 追加：体験の採点 3 位「水抜き穴は 7m 手前でも塀の足元の小さな影で、レーダーにも出ない」。
 * holeRange：水抜き穴（しゃがんで通る塀の穴）にこの距離（m）まで近づいたら、レーダーに印を出す
 */
export const RADAR = { holeRange: 12 } as const;

/** 扇の一つの段（平常・不審・発見）の描き方。tint は地面に掛ける色み（輝度を 1 にそろえて使う）、line は縁の線の色。 */
export interface ConeTone {
  tint: readonly [number, number, number];
  /** 色みの強さ（0..1）：目の近く・fadeDist より遠く・灯りの島の下限 */
  tintEye: number;
  tintFar: number;
  tintIsland: number;
  line: readonly [number, number, number];
  /** 縁の線の濃さ：目の近く・遠く・灯りの島の下限 */
  lineEye: number;
  lineFar: number;
  lineIsland: number;
}

/**
 * 視界の扇（src/view/overlays/cones.ts）。r02-fix-play で描き方ごと変えた（見た目の採点 1 位「扇が灯りに見える」）。
 * 旧：普通の合成で色へ寄せる。濃さ 平常 0.1→0.016・不審 0.32→0.06・発見 0.38→0.08、線 0.22・0.6・0.7
 * 新：地面の色に色みを掛ける（明るさは変えない）。平常は控えめな寒色、不審は琥珀、発見は赤。扇の形は縁の細い線で読ませる。
 */
export const CONE_STYLE: { fadeDist: number; calmFocus: { near: number; far: number; nearMul: number }; calm: ConeTone; suspicious: ConeTone; alert: ConeTone } = {
  /** この距離（m）で色みと線が一番薄くなる */
  fadeDist: 18,
  /**
   * 平常の扇だけ、プレイヤーから扇までの距離（m）で濃さを変える（src/view/overlays/coneFocus.ts）。r03-fix-play 追加：見た目の採点 4 位
   * 「平常の白い細線が何本も交わって網に見え、塀で切れた所は折れた図形になる」。旧：どの距離でも同じ濃さ（×1）。
   * 新：near より近いと nearMul 倍、far で 0（描かない）、その間はまっすぐ下げる（×1 になるのはおよそ 11m）。不審・発見の扇は今のまま
   */
  calmFocus: { near: 5, far: 22, nearMul: 1.6 },
  calm: { tint: [0.8, 0.93, 1.3], tintEye: 0.4, tintFar: 0.12, tintIsland: 0.3, line: [0.66, 0.78, 1.0], lineEye: 0.2, lineFar: 0.12, lineIsland: 0.16 },
  suspicious: { tint: [1.5, 0.95, 0.4], tintEye: 0.8, tintFar: 0.35, tintIsland: 0.6, line: [1.0, 0.68, 0.2], lineEye: 0.7, lineFar: 0.5, lineIsland: 0.55 },
  alert: { tint: [1.9, 0.75, 0.6], tintEye: 0.85, tintFar: 0.4, tintIsland: 0.65, line: [1.0, 0.2, 0.12], lineEye: 0.8, lineFar: 0.6, lineIsland: 0.6 },
};
