// OWNER: contract（メインループが決める。sim が書き、描画が読む。形を変えるときは両側を同時に直す）
// 1コマ分のゲームの状態のうち、描画に要るものだけを持つ。three も DOM も import しない。

/**
 * 向き（ラジアン）。地図の上で 0＝東（+X）、π/2＝南（+Z）、π＝西（-X）、3π/2＝北（-Z）。
 * 前方の向きは (cos yaw, sin yaw)（x, z の順）。ステージのデータは同じ向きを度で書く（facingDeg）。
 */
export type Yaw = number;

/** 正面が +Z を向いて作られたモデルを、yaw の向きへ回すときの Object3D.rotation.y。 */
export function rotYFromYaw(yaw: Yaw): number {
  return Math.PI / 2 - yaw;
}

export function degToYaw(deg: number): Yaw {
  return (deg * Math.PI) / 180;
}

export type CharacterKind = 'player' | 'ashigaru' | 'samurai' | 'ranmaru' | 'nobunaga';

/** stand 立つ／crouch しゃがむ／sit 座る（信長）／doze 居眠り／down 気絶して倒れている */
export type Stance = 'stand' | 'crouch' | 'sit' | 'doze' | 'down';

/** calm 平常／suspicious 不審（？）／alert 発見（！）。番兵の構えと表情の切り替えに使う。 */
export type Awareness = 'calm' | 'suspicious' | 'alert';

export type ActionKind =
  | 'melee' // r07: 非致死の短い正面攻撃
  | 'stagger' // r07: 近接攻撃を受けた番兵のよろめき
  | 'takedown' // プレイヤーが番兵の背後から当て身をする
  | 'takedownVictim' // 当て身を受ける番兵。t=1 の後は stance='down'
  | 'assassinate' // プレイヤーが信長を討つ
  | 'assassinateVictim' // 討たれる信長（血は描かない。崩れ落ちるだけ）
  | 'throw' // 小石を投げる
  | 'strike' // 番兵が槍で突く（プレイヤーが捕まったとき）
  | 'struck'; // 突かれて倒れるプレイヤー

export interface CharacterPose {
  /** 水平の速さ（m/s）。歩き・走りの足運びは、描画の側がこの速さと経過時間から決める。 */
  speed: number;
  stance: Stance;
  awareness: Awareness;
  /** 体の向きに対する頭の向き（ラジアン）。頭の向き＝yaw＋headYaw。見回しに使う。 */
  headYaw: number;
  /** 動作の最中なら、その種類と進み t（0→1）。 */
  action: { kind: ActionKind; t: number } | null;
  /** 手提灯を持っている。明かりそのものの位置は SimSnapshot.lights に出る。 */
  lantern: boolean;
  weapon: 'spear' | 'katana' | 'none';
}

export interface CharacterSnap {
  id: string;
  kind: CharacterKind;
  /** 足元の位置（m）。 */
  x: number;
  z: number;
  yaw: Yaw;
  pose: CharacterPose;
}

/** 動く明かり（手提灯）。y は地面からの高さ。radius と intensity はゲームの明るさの計算と同じ値。 */
export interface MovingLight {
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  intensity: number;
}

export interface StoneSnap {
  x: number;
  y: number;
  z: number;
}

/** r07: 操作できる仕掛け。used は開放・消灯・回収済みを表す。 */
export interface InteractionSnap {
  id: string;
  kind: 'lamp' | 'barrier' | 'supply' | 'intel';
  x: number;
  z: number;
  used: boolean;
  progress: number;
}

/** 足音・小石の音の輪。age は出てからの秒。輪の表示は 1 秒で消す。 */
export interface NoiseSnap {
  x: number;
  z: number;
  radius: number;
  age: number;
}

/**
 * 番兵に見えている範囲。poly は x,z の組を順に並べた多角形で、先頭が目の位置（扇の要）。
 * 遠くまで届くのは灯りの中だけで、闇では短くなる（いまのプレイヤーの構えで計算した形）。
 */
export interface ConeSnap {
  id: string;
  poly: Float32Array;
  /**
   * 暗い隙間の向こうの灯りの島。帯1本につき x,z を4組（手前の左・手前の右・奥の右・奥の左）。左右の幅は扇の線1本ぶんの角。
   * 目から続く扇（poly）の外でも、ここに入れば見つかる（判定と同じ関数で作る）。r01-integrate 追加
   */
  bands: Float32Array;
  awareness: Awareness;
  /** 不審の溜まり具合 0→1（1 で発見）。 */
  fill: number;
}

/** 頭上の印。？＝不審（fill で溜まり具合）、！＝発見、zzz＝居眠り、!?＝倒れた仲間を見つけた。y は地面からの高さ。 */
export interface MarkSnap {
  id: string;
  kind: '?' | '!' | 'zzz' | '!?';
  fill: number;
  x: number;
  y: number;
  z: number;
}

/** 寺全体の構え。normal 平常／caution 警戒／evasion 捜索／alert 発見。 */
export type Phase = 'normal' | 'caution' | 'evasion' | 'alert';

export interface SimSnapshot {
  interactions?: InteractionSnap[];
  disabledLights?: string[];
  /** ゲーム内時刻（秒）。 */
  t: number;
  phase: Phase;
  /** いまの段階の残り秒（normal では 0）。 */
  phaseLeft: number;
  characters: CharacterSnap[];
  lights: MovingLight[];
  stones: StoneSnap[];
  noises: NoiseSnap[];
  cones: ConeSnap[];
  marks: MarkSnap[];
  /** 小石の狙い（Q を押している間だけ）。valid=false は届かない位置。 */
  aim: { x: number; z: number; valid: boolean } | null;
  /** 討ち取った後の演出の進み 0→1。null なら通常の遊び。 */
  finale: number | null;
}
