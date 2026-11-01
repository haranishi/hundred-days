// OWNER: contract（ステージの骨格。描画・当たり判定・明るさ・番兵の動きが、すべてここだけを読む）
// three を import しない純データ。単位は m と秒。座標は X＝東、Z＝南（地図の下が南）。
// 角度は度で書く：0＝東、90＝南、180＝西、270＝北（src/contract/snapshot.ts の Yaw と同じ向き）。

export interface Vec2 {
  x: number;
  z: number;
}

/** 軸に沿った長方形。x0<x1、z0<z1。 */
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** 地面の種類。足音の大きさが変わる（白砂は鳴る、苔は静か）。 */
export type SurfaceKind = 'gravel' | 'stone' | 'moss' | 'dirt';
export interface SurfaceZone {
  kind: SurfaceKind;
  rect: Rect;
}

/** dobei＝瓦屋根の付いた土塀（寺の外周、筋の入った塀）／itabei＝板塀（内と外を分ける）／town＝町屋の並び（ステージの外周）。 */
export type WallKind = 'dobei' | 'itabei' | 'town';
export interface WallDef {
  id: string;
  kind: WallKind;
  /** 中心線の両端。 */
  a: Vec2;
  b: Vec2;
  thickness: number;
  height: number;
  /** 水抜き穴：しゃがめば通れる。視線は通さない。 */
  crawl?: boolean;
}

/** 門。開口そのものは壁の切れ目で表し、門は柱（当たり判定あり）と屋根の飾り。 */
export interface GateDef {
  id: string;
  name: string;
  kind: 'large' | 'small';
  center: Vec2;
  /** 柱と柱の間の幅。柱は幅の両端に立つ（半径 0.3m の当たり判定）。 */
  width: number;
  /** 門の正面（外側）の向き。 */
  facingDeg: number;
}

export type BuildingKind = 'hondo' | 'shoin' | 'kuri' | 'kura' | 'shoro';
export interface BuildingDef {
  id: string;
  kind: BuildingKind;
  name: string;
  /** 歩けず、視線も通らない範囲（縁側も含む）。open のときは四隅の柱だけが当たる。 */
  footprint: Rect;
  eaveHeight: number;
  ridgeHeight: number;
  /** 棟（屋根の一番上の線）の向き。 */
  ridgeAxis: 'x' | 'z';
  /** 正面（縁側・障子・入口のある側）。 */
  facing: 'n' | 's' | 'e' | 'w';
  /** 鐘楼のように柱だけで、下を歩けて見通せる。 */
  open?: boolean;
}

export type PropKind = 'brazier' | 'stoneLantern' | 'pine' | 'rock' | 'andon';
export interface PropDef {
  id: string;
  kind: PropKind;
  pos: Vec2;
  /** 当たり判定の半径（0 なら当たらない）。視線は遮らない。 */
  radius: number;
  scale?: number;
  rotDeg?: number;
}

/** 置いてある明かり。radius と intensity はゲームの明るさの計算に使う値で、描画もこれに合わせる。 */
export type LightKind = 'brazier' | 'stoneLantern' | 'shoji' | 'window' | 'andon';
export interface LightDef {
  id: string;
  kind: LightKind;
  pos: Vec2;
  /** 地面からの高さ。 */
  height: number;
  radius: number;
  intensity: number;
  /** 線形の RGB（0..1）。 */
  color: [number, number, number];
}

/** 植え込み。しゃがんで中にいると見つかりにくい。歩いて入れる（当たり判定なし）。 */
export interface HideZone {
  id: string;
  kind: 'bush';
  center: Vec2;
  radius: number;
}

/** 空の明るさが場所で違うところ（竹林・軒下・町の通り）。ambient は baseAmbient を置き換える。 */
export interface DarkZone {
  id: string;
  name: string;
  rect: Rect;
  ambient: number;
}

/** 池（楕円）。歩けないが視線は通る。 */
export interface PondDef {
  id: string;
  center: Vec2;
  rx: number;
  rz: number;
}

/** 竹林（見た目）。暗さは DarkZone 側で持つ。 */
export interface BambooDef {
  id: string;
  rect: Rect;
  /** 1 m² あたりの本数の目安。 */
  density: number;
}

export interface LookDef {
  yawDeg: number;
  /** その向きで止まっている秒数（向きを変える時間は含まない）。 */
  hold: number;
}

export interface WaypointDef {
  pos: Vec2;
  /** ここで止まる秒数。 */
  wait: number;
  /** 止まっている間に、この向き（度）を順に見る。 */
  looks?: number[];
}

export type GuardKind = 'ashigaru' | 'samurai' | 'ranmaru' | 'nobunaga';
export interface GuardDef {
  id: string;
  /** 表示名。見つかった理由の説明に使う（例：表門の番兵）。 */
  name: string;
  kind: GuardKind;
  /** target は討つ相手（信長）。見張りもするが、追いかけない。 */
  role: 'guard' | 'target';
  start: Vec2;
  facingDeg: number;
  /** 見回りの道順。無ければ立ち番。 */
  route?: WaypointDef[];
  routeMode?: 'loop' | 'pingpong';
  /** 見回りの歩く速さ（m/s）。 */
  speed?: number;
  /** 立ち番が順に見る向き。 */
  lookAround?: LookDef[];
  lantern?: boolean;
  dozing?: boolean;
  seated?: boolean;
  weapon: 'spear' | 'katana' | 'none';
  /** 見える距離に掛ける（1 より大きいと遠くまで見える）。 */
  sightMul?: number;
  /** 見つかるまでの時間に掛ける（1 より小さいと早く見つける）。 */
  fillMul?: number;
}

/** 面ごとの役割と、最後の操作までの目的。準備中の面は計画として表示する。 */
export interface StageMission {
  player: string;
  target: string;
  destination: string;
  goal: string;
  steps: readonly (readonly [string, string])[];
  clearCondition: string;
  completion: string;
}

/** r07: 攻略に使う仕掛け。障害物・灯りもこのデータから描画と判定を作る。 */
export interface InteractionDef {
  id: string;
  kind: 'lamp' | 'barrier' | 'supply' | 'intel';
  name: string;
  pos: Vec2;
  duration: number;
  lightId?: string;
  wall?: WallDef;
}

export interface StageMeta {
  id: string;
  title: string;
  /** 例：天正十年（1582） */
  era: string;
  /** 例：天正十年六月二日　未明 */
  dateText: string;
  place: string;
  playable: boolean;
  /** このステージならではの隠れ方（題と一言）。 */
  rule: { name: string; text: string };
  mission: StageMission;
  objective?: string;
  tagline?: string;
  briefing?: string[];
  scoutReport?: string[];
}

export interface StageDef {
  meta: StageMeta;
  /** 歩ける範囲。外周は town の壁で閉じる。 */
  bounds: Rect;
  /** 空の明るさ（0..1）。DarkZone の中ではその値に置き換わる。 */
  baseAmbient: number;
  /** どの面にも当たらない場所の地面。 */
  surfaceDefault: SurfaceKind;
  /** 後に書いたものが優先。 */
  surfaces: SurfaceZone[];
  walls: WallDef[];
  gates: GateDef[];
  buildings: BuildingDef[];
  props: PropDef[];
  interactions?: InteractionDef[];
  lights: LightDef[];
  hides: HideZone[];
  darkZones: DarkZone[];
  ponds: PondDef[];
  bamboo: BambooDef[];
  guards: GuardDef[];
  player: { start: Vec2; facingDeg: number; stones: number };
  /** ステージの外の飾り。明智勢の陣（篝火の列）と旗の位置。当たり判定も明るさの計算も無い。 */
  decor: { armyCamps: Rect[]; banners: Vec2[]; mountainsDeg: [number, number] };
}
