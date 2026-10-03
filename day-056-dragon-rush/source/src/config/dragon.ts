// OWNER: config
// 竜の数値。形とクリップは tools/blender/build_dragon.py が作る GLB（public/assets/dragon.glb）にあり、ここは実行時の調整だけを持つ。
// 全長およそ60m・翼を広げて80m（GAME-DESIGN.md）。立ったときの胴の中心は足の裏から 9.5m（遊びの側の LOCOMOTION.bodyHeight と同じ）。

/** GLB に入っているクリップの名前（Blender のスクリプトと同じ。変えるときは両方を直す）。 */
export const DRAGON_CLIPS = ['idle', 'walk', 'run', 'takeoff', 'fly', 'glide', 'dive', 'land', 'breath', 'claw', 'tail', 'roar'] as const;
export type DragonClipName = (typeof DRAGON_CLIPS)[number];

/**
 * 撮影の姿勢：クリップの1コマに、手続きの調整（度）を足したもの。調整は 0 でクリップのまま。
 * 首・頭・尾は曲げを骨の並びに配り、口は「クリップより大きく開けるときだけ」効く。
 */
export interface DragonPose {
  clip: DragonClipName;
  /** クリップの時刻（秒） */
  time: number;
  /** 首の持ち上げと左右（度、上・左が正） */
  neckPitch: number;
  neckYaw: number;
  /** 頭の上下（度、上が正） */
  headPitch: number;
  /** 口の開き 0〜1 */
  jawOpen: number;
  /** 尾の上下と左右（度、上・左が正） */
  tailLift: number;
  tailSwing: number;
  /** 翼の付け根の上げ（度、上が正） */
  wingFlap: number;
}

const pose = (clip: DragonClipName, time: number, extra: Partial<DragonPose> = {}): DragonPose => ({
  clip,
  time,
  neckPitch: 0,
  neckYaw: 0,
  headPitch: 0,
  jawOpen: 0,
  tailLift: 0,
  tailSwing: 0,
  wingFlap: 0,
  ...extra,
});

/** 固定ショットの姿勢（config/shots.ts が名前で引く）。 */
export const DRAGON_POSES: Record<string, DragonPose> = {
  glide: pose('glide', 0.75),
  // 真上から見て翼の形が読めるよう、振り上げの頂点の少しあと
  hover: pose('fly', 0.06),
  stand: pose('idle', 1.0),
  breath: pose('breath', 1.0),
  land: pose('land', 0.2),
  roar: pose('roar', 0.8),
  // 寄りの横顔：頭を少し下げ、口を半分開けて歯を見せる
  snarl: pose('idle', 3.0, { jawOpen: 0.42, headPitch: -4, neckYaw: 6 }),
};

/** 読み込みと表示。 */
export const DRAGON_ASSET = {
  /** public/ からの道のり */
  url: 'assets/dragon.glb',
  /** この距離（m）より遠いと簡略版（約2万三角形）に替える */
  lodDistance: 170,
  /** 骨格が曲がっても外れないよう、描画の外れ判定に使う球の半径（m） */
  boundsRadius: 50,
  /** 口の中の点を、上顎の先と下顎の先の間のどこに置くか（0 で上顎、1 で下顎） */
  mouthJawMix: 0.45,
};

/**
 * 動きの重ね方。時間はすべて秒。遊びの時刻（ヒットストップで遅くなる）で進む。
 * crossfade は「目標の重みへ近づく時間」。短すぎると切り替えが跳び、長すぎると遅れて見える。
 */
export const DRAGON_MOTION = {
  crossfade: { locomotion: 0.28, air: 0.35, oneShotIn: 0.07, oneShotOut: 0.3, actionIn: 0.06, actionOut: 0.22, breathOut: 0.3 },
  /** 地上の速さ（m/s）で歩きと走りを混ぜる（遊びの側の LOCOMOTION.ground の walkSpeed・runSpeed の間） */
  walkFrom: 0.4,
  walkFull: 3.0,
  runFrom: 11,
  runFull: 20,
  /** 羽ばたきの強さで滑空と羽ばたきを混ぜる */
  flapFrom: 0.3,
  flapFull: 0.72,
  /** 見た目の歩きの位相を遊びの側の位相へ寄せる強さ（1/秒）。0 で「速さ÷歩幅」だけで進む */
  gaitLock: 2.0,
  /** 首と頭で狙いを向ける配分（首の骨 neck_03〜07・頭の順）と、振れる範囲（度） */
  aim: { share: [0.08, 0.12, 0.16, 0.2, 0.2, 0.24], yawLimit: 55, pitchMin: -35, pitchMax: 25, smooth: 0.14, idleWeight: 0.3, breathWeight: 0.95 },
  /** 口を開ける目標（度）と、近づく時間 */
  jaw: { breath: 36, charge: 14, roar: 48, roarWindup: 22, claw: 16, smooth: 0.07, shotMax: 50 },
  // r06-motion: 指摘「雷翼の畳んだ翼は1枚の板のまま体と動き、焔角の尾はわずかに上下するだけ」（M2 は3周続けて4点）
  // 旧 springs（尾・首・翼の先を1次の遅れで少し振る。旋回の尾は体より先へ回っていた）→ 下の DRAGON_SECONDARY（骨の列ごとのばね）
  /** 足の接地：クリップの中で地面からこの高さ（m）未満の足を、地面へ合わせる */
  footContact: 0.45,
  /**
   * 技のクリップが上書きする部位の割合（0 で移動のクリップのまま、1 で技のクリップ）。空中では脚と翼を上書きしない。
   * 例：歩きながら炎を吐くと、脚は歩き、首と頭と口は炎のクリップになる。
   */
  masks: {
    breath: {
      ground: { body: 0.4, neck: 1, head: 1, jaw: 1, tail: 0.6, wings: 0.8, frontL: 0, frontR: 0, hindL: 0, hindR: 0 },
      air: { body: 0.2, neck: 1, head: 1, jaw: 1, tail: 0.3, wings: 0, frontL: 0, frontR: 0, hindL: 0, hindR: 0 },
    },
    claw: {
      ground: { body: 0.8, neck: 0.9, head: 0.9, jaw: 1, tail: 0.4, wings: 0.6, frontL: 1, frontR: 1, hindL: 0.5, hindR: 0.5 },
      air: { body: 0.3, neck: 0.8, head: 0.8, jaw: 1, tail: 0.2, wings: 0, frontL: 0, frontR: 1, hindL: 0, hindR: 0 },
    },
    tail: {
      ground: { body: 0.9, neck: 0.6, head: 0.6, jaw: 0, tail: 1, wings: 0.5, frontL: 0.4, frontR: 0.4, hindL: 0.4, hindR: 0.4 },
      air: { body: 0.5, neck: 0.4, head: 0.4, jaw: 0, tail: 1, wings: 0, frontL: 0, frontR: 0, hindL: 0, hindR: 0 },
    },
    roar: {
      ground: { body: 1, neck: 1, head: 1, jaw: 1, tail: 1, wings: 1, frontL: 1, frontR: 1, hindL: 1, hindR: 1 },
      air: { body: 0.6, neck: 1, head: 1, jaw: 1, tail: 0.6, wings: 0, frontL: 0, frontR: 0, hindL: 0, hindR: 0 },
    },
  },
};

/**
 * 二次運動の1列（首・尾・翼の指1本）の値（r06-motion）。時間は秒、角度は度。
 * 列の骨はどれも「クリップと親が決める向き」を、ワールドの向きでばねで追いかける。遅れた親を追うので、遅れは付け根から先へ積み上がる
 * （体が回ると先の骨ほど取り残され、止まると先の骨ほど遅れて追いつく）。その上に列全体のしなりを重ねる。
 * しなりは体の加速度（着地・飛び立ち・止まる）、旋回の始まりと終わり、一歩ごとの踏み込みで起き、大きさはその出来事の大きさに比例する。
 */
export interface SecondaryChain {
  /** 先の骨が体の向きの変化に遅れる時間（秒）。段ごとに先ほど大きく配り、付け根から先へ積み上がる */
  lag: number;
  /** 追いかけるばねの減衰比（0.7 前後で行き過ぎがほぼ無い） */
  followZeta: number;
  /** しなりの周波数（Hz）と減衰比。重い列ほど周波数を低く、減衰を弱く（戻りがゆっくりで、何度か揺れる） */
  swingHz: number;
  swingZeta: number;
  /** 慣性：体の加速度 1 m/s² あたりのしなりの角加速度（度/s²）。向きは「列の向き × 加速度の逆」（取り残される向き） */
  inertia: number;
  /** 前後の加速 1 m/s² あたり、列を上下に振る角加速度（度/s²）。正で、減速のとき尾の先が上がり、首の先は下がる（加速は 40 m/s² で頭打ち。着地で前の速さが1コマで落ちても尾を跳ね上げない） */
  brake: number;
  /** 旋回の速さの変わり 1 rad/s あたりのしなりの角速度（度/s）。回り始めは遅れ、止まると先へ振れ抜ける */
  turn: number;
  /** 一歩ごとの踏み込み：速さ 1 m/s あたりのしなりの角速度（度/s）。pitch は先が下がる向き、yaw は左右（足ごとに逆） */
  step: { pitch: number; yaw: number };
  /** 振れの上限（度）。追いかけの遅れ・しなりのそれぞれが、超えると柔らかく頭打ちになる */
  maxDeg: number;
  /** 技（爪・尾・咆哮・地面を叩く。吐く技は 6 割）の最中に絞る割合（0〜1）。遅れを短くし、しなりを弱める */
  attackDamp: number;
  /** 空中で遅れに掛ける倍率（羽ばたきを遅らせすぎない）。1 で地上と同じ */
  airLag: number;
}

/** 二次運動の3種の列。翼の指は前縁の指から後ろの指の順で、指の数より短ければ最後の値を使う（翼の無い怪獣は使わない）。 */
export interface SecondaryMotion {
  neck: SecondaryChain;
  tail: SecondaryChain;
  wing: readonly SecondaryChain[];
}

/**
 * 紅竜の二次運動（r06-motion）。雷翼・焔角は config/creatures/ の各ファイル。
 * 値の決め方：遅れは指示書の「先の骨で0.1〜0.3秒」の中で、尾 0.2・首 0.12・翼の指 0.1〜0.16 秒（後ろの指ほど遅い）。
 * 測った大きさ（tests/dragon/motion.measure.test.ts、付け根から先への向きのずれ）：歩きながら180度振り向く（約211度/秒）と尾の先が約25°
 * 遅れ、急降下の着地（58 m/s）で首が約15°・尾が約40°振れて1〜2回揺れて戻る。尾の上限 32→55°（32°では振り向きで頭打ちになった）
 */
export const DRAGON_SECONDARY: SecondaryMotion = {
  neck: { lag: 0.12, followZeta: 0.7, swingHz: 1.2, swingZeta: 0.35, inertia: 5, brake: 24, turn: 20, step: { pitch: 2, yaw: 1 }, maxDeg: 24, attackDamp: 0.8, airLag: 1 },
  tail: { lag: 0.2, followZeta: 0.7, swingHz: 0.9, swingZeta: 0.3, inertia: 5, brake: 18, turn: 25, step: { pitch: 5, yaw: 7 }, maxDeg: 55, attackDamp: 0.8, airLag: 1 },
  wing: [
    { lag: 0.1, followZeta: 0.7, swingHz: 1.4, swingZeta: 0.35, inertia: 3, brake: 0, turn: 10, step: { pitch: 3, yaw: 1 }, maxDeg: 28, attackDamp: 0.6, airLag: 0.5 },
    { lag: 0.12, followZeta: 0.7, swingHz: 1.25, swingZeta: 0.35, inertia: 3, brake: 0, turn: 10, step: { pitch: 3, yaw: 1 }, maxDeg: 28, attackDamp: 0.6, airLag: 0.5 },
    { lag: 0.14, followZeta: 0.7, swingHz: 1.1, swingZeta: 0.35, inertia: 3, brake: 0, turn: 10, step: { pitch: 3, yaw: 1 }, maxDeg: 28, attackDamp: 0.6, airLag: 0.5 },
    { lag: 0.16, followZeta: 0.7, swingHz: 1.0, swingZeta: 0.35, inertia: 3, brake: 0, turn: 10, step: { pitch: 3, yaw: 1 }, maxDeg: 28, attackDamp: 0.6, airLag: 0.5 },
  ],
};

export type BoneGroup = 'body' | 'neck' | 'head' | 'jaw' | 'tail' | 'wings' | 'frontL' | 'frontR' | 'hindL' | 'hindR';

/** 骨の名前 → 部位（技の上書きの割合を引く）。名前は tools/blender/dragonlib/anatomy.py の骨の一覧と同じ。 */
export function boneGroup(name: string): BoneGroup {
  if (name.startsWith('neck_')) return 'neck';
  if (name.startsWith('tail_')) return 'tail';
  if (name.startsWith('wing_')) return 'wings';
  if (name === 'head' || name === 'jaw') return name;
  const side = name.endsWith('_R') ? 'R' : 'L';
  if (/^(scapula|upperarm|forearm|hand|finger)_/.test(name)) return side === 'L' ? 'frontL' : 'frontR';
  if (/^(thigh|shin|foot|toe)_/.test(name)) return side === 'L' ? 'hindL' : 'hindR';
  return 'body';
}

/**
 * 足もとの接地の影（dragon/contactShadow.ts）。半径は m、濃さは「掛け算で暗くする割合」の最大（0〜1）。
 * r00c-竜：指摘「脚の接地と足元の影が弱く、街から少し浮いて見える」 影なし → 足の甲の下に 3.6×3.8m・0.75（芯つき。目の高さからは横の張り出しだけが見えるので幅を広く）、胴の下に 16×9m・0.3
 */
export const DRAGON_CONTACT = {
  /** 地面からの持ち上げ（歩道の縁石より上に出す。焦げ跡と同じくらい） */
  lift: 0.3,
  /** 足の甲の下の影：足先の向きに長い楕円。forward は足の甲から指の側へずらす量、core は足の真下の狭く濃い芯の割合。前脚は frontScale 倍の大きさ */
  foot: { length: 3.6, width: 3.8, strength: 0.75, forward: 0.9, core: 0.5 },
  frontScale: 0.9,
  /** 足の甲が接地の高さからこの高さ（m）まで上がると消える。上がるほど spread の割合だけ広がる */
  liftFade: 5,
  spread: 0.35,
  /** 胴の下の影：立ったときの胴の高さから fade（m）上がると消える */
  body: { length: 16, width: 9, strength: 0.3, forward: 2, fade: 26 },
  /** カメラからの距離（m）で薄くする（霧に溶ける遠景で黒い板が浮かないように） */
  fadeNear: 320,
  fadeFar: 760,
};

/** 材質（鱗・腹の板・膜の透け・喉の光）。色の下地は GLB の頂点の色にある。 */
export const DRAGON_LOOK = {
  roughness: 0.6,
  scaleBump: 0.11,
  plateLength: 1.25,
  plateBump: 0.06,
  /** 腹の板1枚の中ほどの盛り上がり（m） */
  plateBulge: 0.07,
  /** 角・とげの細い成長線の間隔（m、根元からの距離で数える） */
  hornLine: 0.085,
  /** 膜を夕日が透かすときの色（線形）と強さ */
  membraneTransmission: [1.0, 0.36, 0.13] as [number, number, number],
  membraneStrength: 0.55,
  /** 喉と口の中の光（炎の直前）の色と強さ */
  throatColor: [1.0, 0.42, 0.1] as [number, number, number],
  throatStrength: 7,
  eyeGlow: 0.35,
};
