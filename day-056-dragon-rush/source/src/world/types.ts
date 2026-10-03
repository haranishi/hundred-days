// OWNER: world
// 街の純データの型。three を import しない（描画・当たり判定・壊れ方が同じデータを読む）。
// 座標は m。x が東、z が南、y が上。地面の高さは 0、湾の水面は負。

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** 道の格付け。幅と歩道の有無が決まる。 */
export type RoadClass = 'avenue' | 'street' | 'lane';

/** 道の1本（格子の線）。ns は南北に走る（x 一定）、ew は東西に走る（z 一定）。 */
export interface RoadLine {
  id: number;
  axis: 'ns' | 'ew';
  /** ns なら x、ew なら z */
  pos: number;
  cls: RoadClass;
  /** 車道の幅 */
  carriageWidth: number;
  /** 片側の歩道の幅（車道の外、街区の縁の中に取る） */
  sidewalkWidth: number;
  /** 車線数（片側ではなく合計） */
  lanes: number;
}

/** 車道の一区間（交差点と交差点の間）。 */
export interface RoadSegment {
  id: number;
  lineId: number;
  axis: 'ns' | 'ew';
  cls: RoadClass;
  rect: Rect;
  lanes: number;
}

export interface Intersection {
  id: number;
  rect: Rect;
  nsLineId: number;
  ewLineId: number;
  /** 横断歩道を描く辺（その先に車道が続く辺だけ） */
  crosswalks: { n: boolean; s: boolean; e: boolean; w: boolean };
}

export type Zone = 'downtown' | 'commercial' | 'residential' | 'port';

/** 街区。curb は縁石で囲まれた範囲（歩道を含む）、lotArea は歩道を除いた範囲。 */
export interface Block {
  id: number;
  zone: Zone;
  curb: Rect;
  lotArea: Rect;
  /** 各辺の歩道の幅（0 なら歩道なし） */
  sidewalk: { n: number; s: number; e: number; w: number };
  /** 各辺が面する道の格付け（面していなければ null） */
  faces: { n: RoadClass | null; s: RoadClass | null; e: RoadClass | null; w: RoadClass | null };
  /** 埠頭（湾に突き出した街区） */
  isPier: boolean;
  /** 格子の中の位置（西から i 番目、北から j 番目）。埠頭は null */
  grid: { i: number; j: number } | null;
  lotIds: number[];
}

export type Side = 'n' | 's' | 'e' | 'w';

export interface Lot {
  id: number;
  blockId: number;
  rect: Rect;
  /** 主に面する道の側 */
  front: Side;
  /** 面する道の格付け */
  frontClass: RoadClass;
  /** 建物を建てる区画か（奥まって道に面さない区画は空き地にする） */
  buildable: boolean;
  /** 建てない区画（中庭）の使い方：駐車場・小さな公園・港のコンテナ置き場（r01-city。建てる区画は null） */
  courtyard: 'parking' | 'park' | 'yard' | null;
  /** この区画に使う用途（大通り沿いは住宅地でも商業になる） */
  zone: Zone;
  buildingId: number | null;
}

export type BuildingKind =
  | 'glassTower'
  | 'tileMidrise'
  | 'zakkyo'
  | 'apartment'
  | 'house'
  | 'warehouse';

export const BUILDING_KINDS: readonly BuildingKind[] = [
  'glassTower',
  'tileMidrise',
  'zakkyo',
  'apartment',
  'house',
  'warehouse',
];

/** 外壁の描き方。描画側のシェーダーがこの番号で窓割りと材質を切り替える。 */
export type FacadeStyle =
  | 'punched' // タイル・コンクリートに窓の穴
  | 'curtain' // ガラスのカーテンウォール
  | 'ribbon' // 横に連なる窓
  | 'corrugated' // 波板（倉庫）
  | 'siding' // 住宅の外壁材
  | 'balcony' // 集合住宅のバルコニー
  | 'stone'; // 石張りの基壇

export type RoofKind = 'flat' | 'gable' | 'hip' | 'sawtooth';

/** 建物の塊（直方体）。y0 から y1 まで。 */
export interface Mass {
  rect: Rect;
  y0: number;
  y1: number;
  /** この塊の外壁の描き方（基壇と塔で変える） */
  facade: FacadeStyle;
  /** 外壁の色（sRGB 0..1） */
  wallColor: [number, number, number];
}

/** 屋上の設備（室外機・塔屋・水槽など）。体積には数えない。 */
export interface RoofItem {
  /** cooling は冷却塔（r01-city） */
  kind: 'box' | 'tank' | 'penthouse' | 'frame' | 'cooling';
  x: number;
  z: number;
  y: number;
  w: number;
  d: number;
  h: number;
  color: [number, number, number];
}

export interface RoofSpec {
  kind: RoofKind;
  /** 勾配屋根の高さ（棟までの立ち上がり）。陸屋根は 0 */
  pitchHeight: number;
  /** 棟の向き。x なら棟が東西に走る */
  ridgeAxis: 'x' | 'z';
  /** パラペットの高さ（陸屋根） */
  parapet: number;
  /** 軒の出 */
  overhang: number;
  color: [number, number, number];
  items: RoofItem[];
  /** 屋上の緊急離着陸場の印（高さ100mを超える塔、r01-city） */
  helipad?: boolean;
}

export interface FacadeSpec {
  floorHeight: number;
  /** 窓の割り付けの間隔（柱間） */
  bayWidth: number;
  /** 窓の幅（柱間に対する割合） */
  windowWidth: number;
  /** 窓の高さ（階高に対する割合） */
  windowHeight: number;
  /** 1階の店先の帯の高さ（0 なら無し） */
  groundFloor: number;
  trimColor: [number, number, number];
  glassColor: [number, number, number];
}

export interface Building {
  id: number;
  lotId: number;
  blockId: number;
  kind: BuildingKind;
  /** 敷地に対する建物の外形（全塊を囲む矩形） */
  footprint: Rect;
  /** 地面から最上部（屋根の棟・パラペット上端）までの高さ */
  height: number;
  floors: number;
  masses: Mass[];
  roof: RoofSpec;
  facade: FacadeSpec;
  /** 体積（m³）。塊と勾配屋根の合計。被害額と破壊率の元になる */
  volume: number;
  /** 描画の個体差に使う種 [0,1) */
  seed: number;
  /** 見た目の選択の組（隣と同じにしない判定に使う） */
  variant: { palette: number; facade: number; roof: number };
  /** 見た目の組み合わせの署名 */
  signature: string;
}

/** 湾と岸の形。x < coastX は湾（埠頭を除く）。 */
export interface Coast {
  coastX: number;
  waterLevel: number;
  /** 岸壁の遊歩道の範囲（岸と最初の道の間） */
  promenade: Rect;
}

export interface CityStats {
  buildingCount: number;
  totalVolume: number;
  volumeByKind: Record<BuildingKind, number>;
  countByKind: Record<BuildingKind, number>;
}

export interface CityData {
  seed: number;
  /** 街の範囲（湾の一部を含む約 1.5km 四方） */
  bounds: Rect;
  groundLevel: number;
  curbHeight: number;
  coast: Coast;
  roadLines: RoadLine[];
  segments: RoadSegment[];
  intersections: Intersection[];
  blocks: Block[];
  lots: Lot[];
  buildings: Building[];
  /** 隣り合う建物の組（id の小さい方が先） */
  neighborPairs: [number, number][];
  /** 通りを挟んで向かい合う建物の組（id の小さい方が先、r01-city） */
  facingPairs: [number, number][];
  stats: CityStats;
}
