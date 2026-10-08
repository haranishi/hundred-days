/** 入力電力と補助機器の概算から電源容量の目安を計算する。 */
import { formatW } from './format'
import type { ResolvedBuild, Severity } from './types'

/** 「その他」の見積もり（W） */
export const POWER_OTHERS = {
  motherboardW: 50,
  memoryPerModuleW: 5,
  ssdPerDriveW: 8,
  fanPerUnitW: 3,
} as const

/** 推奨容量の係数（推定の最大 × 1.25 ＝ 負荷率 80% 以下） */
export const POWER_HEADROOM_FACTOR = 1.25
/** 負荷率の目安（80% 以下）。表示用で、POWER_HEADROOM_FACTOR の逆数 */
export const POWER_TARGET_LOAD = 0.8
/** 推奨容量の刻み（W） */
export const POWER_STEP_W = 50
/** 効率を重視する考え方の幅（推定の最大の 1.5〜2 倍） */
export const POWER_EFFICIENCY_RANGE = { min: 1.5, max: 2 } as const

export const POWER_FORMULA_TEXT =
  '推定の最大消費電力 ＝ CPU の最大電力（AMD は PPT、Intel は PL2）＋ GPU のボード電力 ＋ その他（マザーボード 50W・メモリ 1枚 5W・SSD 1枚 8W・ファン 1基 3W）'
export const POWER_RECOMMEND_TEXT =
  '推奨の電源容量 ＝ 推定の最大 × 1.25（負荷率 80% 以下）を 50W 単位で切り上げた値と、GPU メーカーの推奨値（データにあれば）の大きい方'
export const POWER_DIFFERENCE_NOTE = 'ほかのサイトと数字が違うのは、余裕の取り方と「その他」の見積もりが違うためです。'

/** 「効率を重視するなら、推定の最大の1.5〜2倍（◯◯〜◯◯W）を選ぶ考え方もあります。」 */
export function efficiencyNote(range: { minW: number; maxW: number }): string {
  return `効率を重視するなら、推定の最大の1.5〜2倍（${range.minW}〜${range.maxW}W）を選ぶ考え方もあります。`
}

/** GPU の消費電力の出どころ。card＝カード固有のボード電力／chip＝チップの定格（カード固有が未確認のとき）／unverified＝どちらも無い */
export type GpuPowerBasis = 'card' | 'chip' | 'unverified'

export interface PowerInput {
  /** CPU の最大電力。未確認なら null */
  cpuW: number | null
  /** GPU の消費電力（カード固有のボード電力、無ければチップの定格）。どちらも無ければ null */
  gpuW: number | null
  /** gpuW の出どころ（省略時は gpuW があれば card） */
  gpuBasis?: 'card' | 'chip'
  /** チップの定格を使ったときの、公式の呼び方とメーカー（内訳の文に出す） */
  gpuChipReference?: { term: string; maker: string; source: string; asOf: string } | null
  memoryModules: number
  ssds: number
  fans: number
  gpuRecommendedPsuW: number | null
}

export type PowerItemKey = 'cpu' | 'gpu' | 'motherboard' | 'memory' | 'storage' | 'fans'

export interface PowerItem {
  key: PowerItemKey
  label: string
  /** null＝未確認（合計に入っていない） */
  watts: number | null
  detail: string
  /** GPU の行だけ：値の出どころ。chip なら出典（チップメーカーの公式仕様）も持つ */
  basis?: GpuPowerBasis
  reference?: { term: string; maker: string; source: string; asOf: string }
}

export interface PowerEstimate {
  items: PowerItem[]
  /** 分かっている分の合計（W）。complete が false なら下限 */
  estimatedMaxW: number
  complete: boolean
  /** 未確認で合計に入れていないもの */
  missing: ('cpu' | 'gpu')[]
  /** GPU の値の出どころ（chip なら画面に「チップの定格で計算」と書く） */
  gpuBasis: GpuPowerBasis
  /** 式から出した推奨（W） */
  formulaRecommendedW: number
  /** GPU メーカーの推奨（W）。データに無ければ null */
  gpuRecommendedW: number | null
  /** 推奨の電源容量（大きい方） */
  recommendedW: number
  recommendedBy: 'formula' | 'gpu'
  /** 効率を重視する考え方の幅（推定の最大の 1.5〜2 倍、W に丸めた値） */
  efficiencyRangeW: { minW: number; maxW: number }
}

/**
 * 推定の最大 → 式の推奨容量。掛け算の浮動小数の誤差（440.00000000000006 × 1.25 = 550.0000000000001 など）を
 * 丸めてから切り上げる（ちょうど 50W の倍数になる値を、次の刻みへ押し上げない）。
 */
export function recommendFromEstimate(estimatedMaxW: number): number {
  const raw = estimatedMaxW * POWER_HEADROOM_FACTOR
  const cleaned = Math.round(raw * 1e6) / 1e6
  return Math.ceil(cleaned / POWER_STEP_W) * POWER_STEP_W
}

/** 効率を重視する考え方の幅（W） */
export function efficiencyRangeFromEstimate(estimatedMaxW: number): { minW: number; maxW: number } {
  return {
    minW: Math.round(estimatedMaxW * POWER_EFFICIENCY_RANGE.min),
    maxW: Math.round(estimatedMaxW * POWER_EFFICIENCY_RANGE.max),
  }
}

export function estimatePower(input: PowerInput): PowerEstimate {
  const O = POWER_OTHERS
  const gpuBasis: GpuPowerBasis = input.gpuW === null ? 'unverified' : (input.gpuBasis ?? 'card')
  const chip = gpuBasis === 'chip' ? (input.gpuChipReference ?? null) : null
  const gpuItem: PowerItem = {
    key: 'gpu',
    label: 'グラフィックボード',
    watts: input.gpuW,
    detail:
      gpuBasis === 'chip'
        ? `チップの定格で計算（${chip ? `${chip.maker} 公式の ${chip.term}` : 'チップメーカーの公式仕様'}。カード固有のボード電力は未確認）`
        : gpuBasis === 'unverified'
          ? 'ボード電力（未確認）'
          : 'ボード電力',
    basis: gpuBasis,
  }
  if (chip) gpuItem.reference = { ...chip }
  const items: PowerItem[] = [
    { key: 'cpu', label: 'CPU', watts: input.cpuW, detail: '最大電力（AMD は PPT、Intel は PL2）' },
    gpuItem,
    { key: 'motherboard', label: 'マザーボード', watts: O.motherboardW, detail: `${O.motherboardW}W（定数）` },
    {
      key: 'memory',
      label: 'メモリ',
      watts: O.memoryPerModuleW * input.memoryModules,
      detail: `${O.memoryPerModuleW}W × ${input.memoryModules}枚`,
    },
    { key: 'storage', label: 'SSD', watts: O.ssdPerDriveW * input.ssds, detail: `${O.ssdPerDriveW}W × ${input.ssds}枚` },
    { key: 'fans', label: 'ファン', watts: O.fanPerUnitW * input.fans, detail: `${O.fanPerUnitW}W × ${input.fans}基` },
  ]
  const missing: ('cpu' | 'gpu')[] = []
  if (input.cpuW === null) missing.push('cpu')
  if (input.gpuW === null) missing.push('gpu')
  const estimatedMaxW = items.reduce((sum, i) => sum + (i.watts ?? 0), 0)
  const formulaRecommendedW = recommendFromEstimate(estimatedMaxW)
  const gpuRecommendedW = input.gpuRecommendedPsuW
  const byGpu = gpuRecommendedW !== null && gpuRecommendedW > formulaRecommendedW
  return {
    items,
    estimatedMaxW,
    complete: missing.length === 0,
    missing,
    gpuBasis,
    formulaRecommendedW,
    gpuRecommendedW,
    recommendedW: byGpu ? gpuRecommendedW : formulaRecommendedW,
    recommendedBy: byGpu ? 'gpu' : 'formula',
    efficiencyRangeW: efficiencyRangeFromEstimate(estimatedMaxW),
  }
}

/**
 * 構成から式の入力を作る。ファンはケースの付属ファンとクーラーのファンの合計。
 * GPU は「カード固有のボード電力 → 無ければチップの定格 → それも無ければ未確認（合計に入れない）」の順（round1 A1）。
 */
export function powerInputFromBuild(b: ResolvedBuild): PowerInput {
  const card = b.gpu.boardPowerW
  const chip = b.gpu.chipReferencePower ?? null
  const gpuW = card ?? chip?.valueW ?? null
  const input: PowerInput = {
    cpuW: b.cpu.maxPowerW,
    gpuW,
    memoryModules: b.memory.modules,
    ssds: 1,
    fans: b.case.includedFans + b.cooler.fans.count,
    gpuRecommendedPsuW: b.gpu.recommendedPsuW,
  }
  if (card === null && chip) {
    input.gpuBasis = 'chip'
    input.gpuChipReference = { term: chip.term, maker: chip.maker, source: chip.source, asOf: chip.asOf }
  } else if (card !== null) input.gpuBasis = 'card'
  return input
}

export interface PsuCheck {
  wattage: number
  /** 推定の最大 ÷ 電源容量（%） */
  loadPct: number
  /** 100 − 負荷率（%） */
  headroomPct: number
  /** 推定の最大を下回る＝error／推奨を下回る・計算が不完全＝warn */
  severity: Severity
}

export function checkPsu(estimate: PowerEstimate, wattage: number): PsuCheck {
  const loadPct = (estimate.estimatedMaxW / wattage) * 100
  let severity: Severity = 'ok'
  if (wattage < estimate.estimatedMaxW) severity = 'error'
  else if (wattage < estimate.recommendedW || !estimate.complete) severity = 'warn'
  return { wattage, loadPct, headroomPct: 100 - loadPct, severity }
}

export function powerOfBuild(b: ResolvedBuild): { estimate: PowerEstimate; psu: PsuCheck } {
  const estimate = estimatePower(powerInputFromBuild(b))
  return { estimate, psu: checkPsu(estimate, b.psu.wattage) }
}

/** 推定の最大の書き方：「400W」。未確認の部品があれば「200W＋未確認」（分かっている分だけの下限だと分かるように） */
export function estimateText(e: PowerEstimate): string {
  return `${formatW(e.estimatedMaxW)}${e.complete ? '' : '＋未確認'}`
}

/**
 * 選んだ電源の余裕の書き方（要約の帯・保存画像で共通）。
 * - そろっているとき：「余裕 36%」「余裕 16%・推奨未満」「18W 足りません」
 * - 未確認があるとき：余裕の%は出さない（下限から出した%は大きすぎる）。「余裕：未確認」「余裕：未確認・推奨未満」、
 *   分かっている分だけで容量を超えるなら「48W 以上足りません」
 */
export function headroomText(e: PowerEstimate, psu: PsuCheck): string {
  const short = e.estimatedMaxW - psu.wattage
  if (!e.complete) {
    if (psu.severity === 'error') return `${formatW(short)} 以上足りません`
    return `余裕：未確認${psu.wattage < e.recommendedW ? '・推奨未満' : ''}`
  }
  if (psu.severity === 'error') return `${formatW(short)} 足りません`
  const pct = `余裕 ${Math.round(psu.headroomPct)}%`
  return psu.wattage < e.recommendedW ? `${pct}・推奨未満` : pct
}

/** 未確認の部品の呼び名（「グラフィックボードとCPU」） */
export function missingNames(e: Pick<PowerEstimate, 'missing'>): string {
  return e.missing.map((m) => (m === 'gpu' ? 'グラフィックボード' : 'CPU')).join('と')
}
