/**
 * くみまえの型。カタログ（src/data/catalog.json）は scripts/build-catalog.mjs が作る形に合わせる。
 * 数値の null は「未確認（出典が無い）」の意味。画面では「未確認」と出す。
 */

export const CATEGORIES = ['case', 'motherboard', 'cpu', 'cooler', 'memory', 'gpu', 'storage', 'psu'] as const
export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_LABELS: Record<Category, string> = {
  case: 'ケース',
  motherboard: 'マザーボード',
  cpu: 'CPU',
  cooler: 'CPUクーラー',
  memory: 'メモリ',
  gpu: 'グラフィックボード',
  storage: 'SSD',
  psu: '電源',
}

export type FormFactor = 'ATX' | 'mATX' | 'ITX'
export const FORM_FACTOR_LABELS: Record<FormFactor, string> = { ATX: 'ATX', mATX: 'Micro-ATX', ITX: 'Mini-ITX' }
/** 小さい順 */
export const FORM_FACTOR_ORDER: readonly FormFactor[] = ['ITX', 'mATX', 'ATX']

/** docs/03c のテンプレート。unsupported はカタログに入らない */
export type CaseLayoutKind = 'standard' | 'dual-chamber'
export type RadiatorPosition = 'top' | 'front' | 'side' | 'bottom'

/** 付属ファンの取り付け位置（公式の仕様の言い方。front-right＝ピラーレスの前の右の角の斜めの面の裏） */
export type FanMountPosition = 'front' | 'front-right' | 'top' | 'bottom' | 'rear'
export const FAN_MOUNT_POSITIONS: readonly FanMountPosition[] = ['front', 'front-right', 'top', 'bottom', 'rear']

/** 付属ファンの位置ごとの数と大きさ（公式の仕様から） */
export interface IncludedFanMount {
  position: FanMountPosition
  count: number
  sizeMm: number
}
export const RADIATOR_POSITION_LABELS: Record<RadiatorPosition, string> = {
  top: '天面',
  front: '前面',
  side: '側面',
  bottom: '底面',
}

/**
 * 色の表示名（ケースの色と、部品の色の欄）。表示名はここ1か所で持つ（画面・共有・保存画像が同じ名前を使う）。
 * 「black/silver」のような組み合わせは format.ts の colorName が1色ずつ訳す。
 */
export const COLOR_LABELS: Record<string, string> = {
  black: 'ブラック',
  white: 'ホワイト',
  brown: 'ブラウン',
  silver: 'シルバー',
  gray: 'グレー',
  grey: 'グレー',
}

/** 利用者が入力した金額。null は未入力、0 は入力済みの0円。 */
export interface Price { value: number | null }
export type ManualPrices = Readonly<Record<string, number>>

/** 資料で値が食い違う項目。小さい方（安全側）を adopted にして判定する（docs/03c） */
export interface DataConflict {
  field: string
  values: number[]
  sources: string[]
  adopted: number
}

interface PartBase {
  id: string
  /** 共有 URL 用の短い ID（カテゴリ内で一意） */
  short: string
  brand: string
  name: string
  officialUrl: string
  /** 未確認の項目名（正規化後の名前。例 boardPowerW） */
  unverified: string[]
}

export interface ColorVariant {
  color: string
  /** 色ごとの型番（データに無ければ null） */
  model: string | null
}

export interface PcCase extends PartBase {
  category: 'case'
  style: string
  layout: CaseLayoutKind
  dimensionsMm: { width: number; height: number; depth: number }
  motherboardSupport: FormFactor[]
  maxGpuLengthMm: number
  maxCoolerHeightMm: number
  maxPsuLengthMm: number
  radiatorSupport: Record<RadiatorPosition, number[]>
  /** ラジエーター＋ファンの厚みの上限。公表が無い位置は null */
  maxRadiatorThicknessMm: Record<RadiatorPosition, number | null>
  includedFans: number
  /**
   * 付属ファンの取り付け位置（公式の仕様で確かめた製品だけ。research/parts-data/case.json の included_fan_mounts）。
   * 無い製品は layout のテンプレートの決まり（standard は前面、dual-chamber は底面、残りは背面）で置く
   */
  includedFanMounts?: IncludedFanMount[]
  sidePanel: string
  colors: ColorVariant[]
  conflicts: DataConflict[]
}

export interface Motherboard extends PartBase {
  category: 'motherboard'
  socket: string
  chipset: string
  formFactor: FormFactor
  /** width＝長辺（縦に置く）、depth＝短辺 */
  dimensionsMm: { width: number; depth: number }
  memoryType: string
  memorySlots: number
  maxMemoryGb: number
  m2Slots: number
  pcieX16Gen: string
  color: string
  wifi: boolean
}

export interface Cpu extends PartBase {
  category: 'cpu'
  released: string
  socket: string
  cores: number
  threads: number
  baseGhz: number
  boostGhz: number
  tdpW: number
  /** AMD は PPT、Intel は PL2 */
  maxPowerW: number | null
  /** max_power_w だけ別の出典があるとき */
  maxPowerSource: string | null
  memory: string
  igpu: boolean
  coolerIncluded: boolean
}

/** メモリの上の隙間。limit＝公表値と比べる／none＝張り出さない（制限なし）／unknown＝不明（3Dの箱で目安） */
export type RamClearance = { kind: 'limit'; mm: number } | { kind: 'none'; note: string | null } | { kind: 'unknown' }

interface CoolerBase extends PartBase {
  category: 'cooler'
  fans: { count: number; sizeMm: number }
  sockets: string[]
  rgb: boolean
  color: string
}

export interface AirCooler extends CoolerBase {
  type: 'air'
  /** マザーボード面からの高さ */
  heightMm: number
  /** width＝ファン面の幅、depth＝風の流れる向きの奥行き、height＝高さ（ファン込み） */
  dimensionsMm: { width: number; depth: number; height: number }
  ramClearance: RamClearance
}

export interface AioCooler extends CoolerBase {
  type: 'aio'
  radiatorMm: number
  /** ラジエーターの外形。thickness はファン込み */
  radiatorDimensionsMm: { length: number; width: number; thickness: number }
  pumpHeightMm: number
}

export type Cooler = AirCooler | AioCooler

export interface Memory extends PartBase {
  category: 'memory'
  type: string
  speedMts: number
  casLatency: number
  modules: number
  moduleGb: number
  heightMm: number
  rgb: boolean
  color: string
}

/**
 * チップメーカー公式仕様の定格の消費電力（NVIDIA の Total Graphics Power、AMD の Typical Board Power、Intel の TBP）。
 * カード固有のボード電力が未確認のときだけ電源の計算に使い、画面に「チップの定格で計算」と書く（round1 A1）。
 */
export interface ChipReferencePower {
  valueW: number
  /** 公式の呼び方（Total Graphics Power など） */
  term: string
  /** 仕様を出しているチップのメーカー */
  maker: string
  note: string | null
  source: string
  /** 取得日（YYYY-MM-DD） */
  asOf: string
}

export interface Gpu extends PartBase {
  category: 'gpu'
  chipBrand: string
  chip: string
  cardMaker: string
  released: string
  vramGb: number
  vramType: string
  /** カード固有のボード電力。未確認なら null */
  boardPowerW: number | null
  /** チップの定格（カード固有の値が無いときの代わり）。データに無ければ null */
  chipReferencePower: ChipReferencePower | null
  recommendedPsuW: number | null
  powerConnector: string
  dimensionsMm: { length: number; height: number; thickness: number }
  slots: number | null
  fans: number
  color: string
  /**
   * RGB で光る部位があるか（上辺の光る帯など）。公式ページに記載があり、出典のある製品だけ true（research/parts-data/gpu.json の rgb）。
   * 記載を確かめていない製品は false（光らせない）
   */
  rgb: boolean
}

export interface Storage extends PartBase {
  category: 'storage'
  capacityGb: number
  interface: string
  formFactor: string
  seqReadMbps: number
  seqWriteMbps: number
  heatsink: boolean
}

export interface Psu extends PartBase {
  category: 'psu'
  wattage: number
  efficiency: string
  atxVersion: string
  native12v2x6: boolean
  modular: string
  dimensionsMm: { width: number; height: number; length: number }
  color: string
}

export interface PartByCategory {
  case: PcCase
  motherboard: Motherboard
  cpu: Cpu
  cooler: Cooler
  memory: Memory
  gpu: Gpu
  storage: Storage
  psu: Psu
}

export type Part = PartByCategory[Category]

export interface Catalog {
  version: number
  source: string
  counts: Record<Category, number>
  excluded: { id: string; reason: string }[]
  parts: { [K in Category]: PartByCategory[K][] }
}

/** 構成＝カテゴリ → 部品ID。8カテゴリすべてが埋まっている */
export type Build = Record<Category, string>
export type ResolvedBuild = { [K in Category]: PartByCategory[K] }

export const RGB_MODES = ['static', 'breathe', 'rainbow', 'off'] as const
export type RgbMode = (typeof RGB_MODES)[number]
export const RGB_MODE_LABELS: Record<RgbMode, string> = {
  static: '点灯',
  breathe: '呼吸',
  rainbow: '虹',
  off: '消灯',
}

/** 見た目。caseColor はケースの実在色だけ。rgbColor は 6桁の16進（# なし・小文字） */
export interface Look {
  caseColor: string
  rgbColor: string
  rgbMode: RgbMode
}

/** ok＝問題なし（青・✓）／warn＝注意（橙・！）／error＝不可（朱・✕） */
export type Severity = 'ok' | 'warn' | 'error'

export type RuleId =
  | 'manual-unchecked'
  | 'cpu-motherboard-socket'
  | 'memory-motherboard'
  | 'motherboard-case'
  | 'gpu-case-length'
  | 'cooler-case-height'
  | 'cooler-memory-clearance'
  | 'aio-case-size'
  | 'aio-case-thickness'
  | 'psu-case-length'
  | 'cooler-socket'
  | 'psu-power'

/** 寸法の判定。margin＝limit − value（正なら余り、負なら足りない） */
export interface Fit {
  valueMm: number
  limitMm: number
  marginMm: number
}

/** 解決の近道。show-compatible＝その部品の候補を「✕ を隠す」で開く（「入るグラフィックボードだけ表示」など。札が ✕ の候補を隠す）、change＝その部品を替える */
export interface Fix {
  kind: 'show-compatible' | 'change'
  category: Category
  label: string
}

export interface Issue {
  rule: RuleId
  /** 行の見出し（例「グラフィックボード × ケース」） */
  title: string
  categories: Category[]
  severity: Severity
  /** 平易な言葉の説明（例「入る・余り 32mm」） */
  message: string
  /** 公表値ではなく目安で判定した */
  estimate: boolean
  fit?: Fit
  /** 資料で値が食い違い、小さい方で判定した */
  dataConflict?: DataConflict & { note: string }
  /** 電源の容量の行だけ：判定に使った数字（札と理由の行を、文ではなく数字から組み立てるため） */
  power?: IssuePower
  fixes: Fix[]
}

export interface IssuePower {
  /** 推定の最大（complete が false なら分かっている分だけの下限） */
  estimatedMaxW: number
  complete: boolean
  wattage: number
  recommendedW: number
  /** GPU の値の出どころ（card＝カード固有／chip＝チップの定格／unverified＝未確認） */
  gpuBasis: 'card' | 'chip' | 'unverified'
  /** 未確認で合計に入れていない部品 */
  missing: ('cpu' | 'gpu')[]
}
