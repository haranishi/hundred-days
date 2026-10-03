// OWNER: config
// 操作できる怪獣の設定の型（r03-roster）。1体ごとの数値は同じフォルダの kurenai.ts・raiyoku.ts・homuratsuno.ts にある。
// キーの役割は3体で同じ（docs/CHARACTERS.md のキーの表）。怪獣ごとの違いは「役割 → その怪獣の技」の表（MoveTable）で持つ。
import type { DamageCause, Foot } from '../../core/events';
import { DRAGON_CLIPS, type DRAGON_LOOK, type SecondaryMotion } from '../dragon';
import type { BREATH, MeleeSpec, ROAR, RingSpec, TimeScaleHit } from '../attacks';
import type { CameraProfile } from '../camera';
import type { LOCOMOTION } from '../locomotion';

export const CREATURE_IDS = ['kurenai', 'raiyoku', 'homuratsuno'] as const;
export type CreatureId = (typeof CREATURE_IDS)[number];

/** GLB のクリップの名前（3体の和）。焔角には飛ぶクリップが無く、跳ぶ（jump）と地面を叩く（stomp）がある。 */
export const CREATURE_CLIPS = [...DRAGON_CLIPS, 'jump', 'stomp'] as const;
export type ClipName = (typeof CREATURE_CLIPS)[number];

/** 鱗・腹の板・膜の透け・喉の光の数値（紅竜は config/dragon.ts の DRAGON_LOOK）。材質は src/dragon/dragonMaterial.ts が作る */
export type DragonLook = typeof DRAGON_LOOK;

/**
 * 頂点の属性 _EMIT（aEmit）で光らせる発光。
 * stripes：_LINE（aLine、筋の中心からの距離 m）で細い筋を描く（雷翼の翼の骨と背骨）。colorA が芯、colorB がにじみ
 * lava：鱗の溝（割れ目）ほど強く光る溶岩（焔角の岩の板の隙間）。colorA（橙）と colorB（赤）の間を脈打つ
 * pulseHz は脈の速さ、flow は体に沿った脈の波の細かさ（1m あたりのラジアン）
 */
export interface EmitLook {
  kind: 'stripes' | 'lava';
  colorA: [number, number, number];
  colorB: [number, number, number];
  strength: number;
  width: number;
  pulseHz: number;
  flow: number;
}

export interface DragonMaterialOptions {
  /** シェーダーのプログラムを分ける名前（紅竜は 'dragon'） */
  key: string;
  look: DragonLook;
  emit?: EmitLook;
}

export type GroundMotion = typeof LOCOMOTION.ground;
export type AirMotion = typeof LOCOMOTION.air;
export type DiveMotion = typeof LOCOMOTION.dive;
export type LandingMotion = typeof LOCOMOTION.landing;

/** 跳ぶ（焔角の Space）：屈む → 放物線で跳ぶ → のしかかる。クリップ jump の区切り（屈む・跳ぶ・落ちる）へ遊びの側の段階を当てる。 */
export interface JumpMotion {
  /** 屈む秒数（この間は地面にいて、動きを落とす） */
  crouch: number;
  /** 跳び上がる速さ（m/s）と重力（m/s²）。頂点の高さ = 速さ² ÷ (2 × 重力) */
  launchSpeed: number;
  gravity: number;
  /** 前への速さ（m/s）：今の速さをこの範囲に収める */
  forwardMin: number;
  forwardMax: number;
  /** 跳んでいる間に向きを変えられる速さ（度/秒） */
  steerDeg: number;
}

/** 突進（焔角の Shift＋W）：地上の走りのうち minSpeed 以上を突進とし、当たった建物を傾きの段階まで壊して keep の速さで進む。 */
export interface ChargeSpec {
  minSpeed: number;
  /** 壁への深さ（向きと壁の法線の内積）がこれ以上なら押し倒す（ふつうの体当たりは 0.707） */
  minInto: number;
  keep: number;
}

export interface BodyShape {
  /** 立っているときの体の中心の高さ（足の裏から、m）。GLB の休みの姿勢の足の裏（ground）と同じ */
  bodyHeight: number;
  /** 体の当たりの半径（m、水平） */
  radius: number;
  /** 体当たり：この速さ（m/s）以上で深く当たったら、建物を傾きまで壊して抜ける（紅竜は BODY_CONTACT.smashSpeed の 20） */
  smashSpeed: number;
  /** 口の位置（体の中心からの局所座標：+x 左・+y 上・+z 前、m）。当たり判定と照準の起点。見た目の口は表示が持つ */
  mouthLocal: [number, number, number];
  /** 足が着く位置（局所座標）と、歩きの位相（0・0.25・0.5・0.75 で順に着く） */
  feet: { foot: Foot; phase: number; x: number; z: number }[];
}

export interface CreatureMotion {
  canFly: boolean;
  ground: GroundMotion;
  air: AirMotion;
  dive: DiveMotion;
  landing: LandingMotion;
  jump: JumpMotion | null;
  charge: ChargeSpec | null;
}

/** 左クリック（遠くへの主砲）の共通の数値：溜め・届く距離・吐いている間の移動の倍率・首の振れる範囲。 */
export interface PrimaryCommon {
  windup: number;
  range: number;
  moveScale: number;
  neckYawLimitDeg: number;
}

/** 雷の息（雷翼）：押している間 interval 秒ごとに撃つ。当たった建物から近くの建物へ最大 hops 回跳ね、跳ぶたびに falloff 倍に弱まる。燃やさない。 */
export interface LightningSpec extends PrimaryCommon {
  interval: number;
  /** 雷の芯の太さ（m）。口から照準へ伸ばした芯に最初に当たった建物に落ちる */
  coreRadius: number;
  damage: number;
  falloff: number;
  hops: number;
  /** 次に跳ぶ建物を探す距離（外形どうしの隙間、m）と、跳ぶまでの秒数 */
  hopRadius: number;
  hopDelay: number;
  /** 窓の割れ（最初の建物。跳ぶたびに falloff 倍） */
  glass: number;
  hitStop: TimeScaleHit;
  shake: number;
}

/** 溶岩の礫（焔角）：押している間 interval 秒ごとに、照準の点へ放物線で投げる。着弾で輪の当たりと着火。 */
export interface LavaSpec extends PrimaryCommon {
  interval: number;
  gravity: number;
  /** 飛ぶ秒数 = base + perMeter × 水平の距離（min〜max に収める） */
  flight: { base: number; perMeter: number; min: number; max: number };
  /** 礫の当たりの半径（m）。建物に触れるか地面に着いたら弾ける */
  bombRadius: number;
  ring: RingSpec;
  /** 着火：弾けた点から igniteRadius（m）以内の建物に heat の熱 */
  igniteRadius: number;
  heat: number;
}

/** 落雷の輪（雷翼の E）：中心から ringRadius の輪の上に count 本、delay 秒ずつ遅れて落ちる。1本ごとに strike の輪の当たり。 */
export interface ThunderSpec {
  ringRadius: number;
  count: number;
  delay: number;
  strike: RingSpec;
  /**
   * r06-balance：雷は高い所に落ちる。輪の上の落ちる点から seekRadius m 以内（外形まで）の立っている建物のうち、いちばん高いものの真上に落ちる
   * （無ければ輪の上の点）。落ちる瞬間に選ぶので、前の1本で崩れた建物には落ちない。0 なら輪の上の決まった点（r05 までと同じ）
   */
  seekRadius: number;
}

/**
 * 地割れ（焔角の E）：照準の向きへ spacing 間隔で segments 個の輪の当たりが delay 秒ずつ遅れて続く（最初の輪は体の中心から start 先）。
 * r06-balance：E を押した瞬間の照準のまわりへ走る（溜めの間に体も照準へ向き直る）。走り出す向きは照準の左右 seek.searchDeg 度から
 * 立っている建物をいちばん多く裂く向きを選ぶ。そこでも足りなければ全周から選ぶ（体験の採点 r05：向けた先に建物が無いと空振った）。
 * 道筋はまっすぐで、湾の水の上と街の外に出たら止まる
 */
export interface FissureSpec {
  windup: number;
  recovery: number;
  start: number;
  spacing: number;
  segments: number;
  delay: number;
  /** 裂け目の横のぶれ（m）。1つおきに左右へずらし、まっすぐな線に見せない */
  wobble: number;
  ring: RingSpec;
  /**
   * 走り出す向きの選び方。searchDeg・stepDeg：候補の向き（照準の左右 searchDeg 度を stepDeg 度ずつ。stepDeg 0 なら照準の向きのまま）。
   * 候補ごとに道筋を引き、崩れると見込める体積（立っている建物ごとに 体積 × min(1, 輪から受ける損傷 ÷ 残りの耐久) の和）に
   * (1 - aimBias × 照準からのずれ ÷ searchDeg) を掛けた点が最も高い向きを選ぶ（照準に近い向きを少し贔屓する）。
   * fallbackVolume（m³）：選んだ向きで崩れると見込める体積がこれに届かなければ、全周から選び直す
   */
  seek: { searchDeg: number; stepDeg: number; aimBias: number; fallbackVolume: number };
}

/**
 * 怒りのたまり方（r06-balance）：段階が進むたびにたまる量（config/gameplay.ts の RAGE.gainByStage × 大きさ × 燃え広がりの倍率）に掛ける倍率。
 * 1 で RAGE のまま。1回の攻撃で何棟の段階を進めるかが怪獣ごとに大きく違う（雷は跳ねて5棟、炎の芯と爪は1〜2棟）ので、怪獣ごとに持つ
 */
export interface RageProfile {
  gainScale: number;
}

/**
 * ドミノ（焔角、r04-roster2）：起点の原因（causes）で傾き・崩落の段階に入ったビルが、倒れる向き（damage.dirX/dirZ）の先の
 * いちばん手前のビルへ、delay 秒後に損傷を渡す。渡されたビルが傾き・崩落に入ると、同じ向きでさらに隣へ渡す。
 * 1回の起点から maxChain 棟まで。k 棟目に渡す損傷は、受けるビルの耐久 × strength × falloff^(k-1) × min(1, 倒れるビルの高さ ÷ 受けるビルの高さ)。
 */
export interface DominoSpec {
  /** 起点になる原因（ほかの原因で倒れたビルは、隣を巻き込まない） */
  causes: readonly DamageCause[];
  maxChain: number;
  strength: number;
  falloff: number;
  /** 届く隙間（m）＝倒れるビルの高さ × reachPerHeight（maxReach まで）。倒れる向きに測った、前の面から隣の手前の面まで */
  reachPerHeight: number;
  maxReach: number;
  /** 倒れるビルの幅の帯（倒れる向きに直交する幅）と、隣が重なる幅の最低（m） */
  minOverlap: number;
  /** 段階に入ってから隣へ渡すまで（秒）。倒れかかって触れるまでの間 */
  delay: number;
  /** 渡された損傷でこの秒数のうちに傾き・崩落に入れば、連なりの続きとして数え、さらに隣へ渡す */
  memberSeconds: number;
}

export type PrimaryMove = { kind: 'flame'; spec: typeof BREATH } | { kind: 'lightning'; spec: LightningSpec } | { kind: 'lava'; spec: LavaSpec };
export type SpecialGround = { kind: 'roar'; spec: typeof ROAR } | { kind: 'thunderRoar'; windup: number; recovery: number; thunder: ThunderSpec } | { kind: 'fissure'; spec: FissureSpec };
export type SpecialAir = { kind: 'rageDive' } | { kind: 'thunderDive'; thunder: ThunderSpec } | null;

/** 役割 → その怪獣の技（左クリック・右クリック・Q・E）。Space と Shift の違いは motion（canFly・jump・charge）にある。 */
export interface MoveTable {
  primary: PrimaryMove;
  near: MeleeSpec;
  sweep: MeleeSpec;
  special: { ground: SpecialGround; air: SpecialAir };
  /** のしかかり（跳んで着地した点の輪の当たり）。跳ばない怪獣は null */
  slam: RingSpec | null;
  /** 押し倒したビルが隣を巻き込むドミノ（焔角だけ。ほかの怪獣は null で、起こさない） */
  domino: DominoSpec | null;
}

/** 始まる前の札と案内の文に出す言葉。 */
export interface CreatureCard {
  reading: string;
  /** 一行の遊び方 */
  tagline: string;
  /** 速さ・力・飛行（0〜5）。根拠は各ファイルの札の注 */
  bars: { speed: number; power: number; flight: number };
  /** 技の名前（案内と操作の表） */
  labels: { primary: string; near: string; sweep: string; special: string; up: string; fast: string };
}

/** 見た目（src/dragon/dragon.ts と標本の src/creatures/specimen.ts が読む）。 */
export interface CreatureViewConfig {
  /** public/ からの道のり、GLB の中のアーマチュア・近景と遠景の節の名前、目印とクリップの表を持つ extras の名前 */
  url: string;
  rig: string;
  lods: [string, string];
  metaKey: 'dragon' | 'creature';
  material: DragonMaterialOptions;
  /** 骨で曲がっても外れないよう、描画の外れ判定に使う球の半径（m）と、簡略版に替える距離（m） */
  boundsRadius: number;
  lodDistance: number;
  /** 首と頭で狙いを向ける配分（首の骨の3本目から先・頭の順。和が 1 前後） */
  aimShare: readonly number[];
  /** 首・尾・翼の指が体に遅れて付いてくる動き（r06-motion。値の意味は config/dragon.ts の SecondaryChain） */
  secondary: SecondaryMotion;
  /** 地上の速さ（m/s）で歩きと走りを混ぜる区切りと、羽ばたきの強さで滑空と羽ばたきを混ぜる区切り */
  anim: { walkFrom: number; walkFull: number; runFrom: number; runFull: number; flapFrom: number; flapFull: number };
  /** 地上の E（大技）のクリップ */
  specialClip: 'roar' | 'stomp';
  /** 翼の手首で地面を突いて歩く（雷翼）：翼の腕の骨を、技の上書きでは前脚として扱う */
  wingLegs: boolean;
  /** 足もとの接地の影の大きさ（紅竜 = 1） */
  contactScale: number;
  /** 全長の目安（m、Blender の報告の dims.length）。標本の横顔の構図の離し方に使う */
  length: number;
  /** 標本で空中に浮かべるクリップ */
  airClips: readonly string[];
  /** 標本でクリップの時刻を指定しないときに見せる時刻（秒） */
  showcase: Record<string, number>;
  /**
   * 札の影絵の姿勢（標本の ?clip=card。tools/silhouettes.mjs が撮る）：元のクリップ・時刻（秒）と、横顔の向きから頭をカメラの側へ
   * 回す角度（度）。r04-roster2：焔角は横顔だと背の輪郭がこぶの列になり「とげのある甲羅の四足」に読めたので、斜め前から撮る
   */
  card: { clip: string; t: number; turnDeg: number };
}

export interface CreatureConfig {
  id: CreatureId;
  name: string;
  /** 自己ベストの記録の鍵（紅竜は r02-controls の 'kurenairyu' のまま。前の記録を捨てない） */
  recordKey: string;
  /** 音の名前（config/audio.ts の MONSTER_SOUNDS のキー。GLB の名前と同じ） */
  sound: string;
  card: CreatureCard;
  view: CreatureViewConfig;
  body: BodyShape;
  motion: CreatureMotion;
  moves: MoveTable;
  /** 怒りのたまり方（r06-balance）。値の意味は RageProfile */
  rage: RageProfile;
  /**
   * r05-camera：遊ぶカメラの距離・高さ・見下ろし・画角（config/camera.ts の CameraProfile の一部だけでよい）。
   * 無い値は既定（紅竜）。照準の光線と追うカメラが同じ値を使う
   */
  camera?: Partial<CameraProfile>;
}
