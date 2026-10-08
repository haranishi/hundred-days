/** 自分で入力した仕様だけを使う。架空例は操作説明用で、実在製品の仕様ではない。 */
import { checkCompat } from './compat'
import { powerOfBuild, type PowerEstimate } from './power'
import { CATEGORIES, CATEGORY_LABELS, type Category, type FormFactor, type Issue, type ResolvedBuild } from './types'

export type ManualInput = Record<string, string>
export interface ManualField {
  key: string
  category: Category
  label: string
  kind: 'number' | 'select' | 'text'
  unit?: string
  min?: number
  max?: number
  options?: { value: string; label: string }[]
  help?: string
  advanced?: boolean
}
const options = (values: string[]) => values.map(value => ({ value, label: value }))
const sockets = options(['AM4', 'AM5', 'LGA1700', 'LGA1851'])
const memories = options(['DDR4', 'DDR5'])
const mm = (key: string, category: Category, label: string, max = 1000, advanced = false): ManualField => ({ key, category, label, kind: 'number', unit: 'mm', min: 1, max, advanced })
const count = (key: string, category: Category, label: string, min: number, max: number): ManualField => ({ key, category, label, kind: 'number', min, max, help: '整数で入力してください。' })

export const FIELDS: ManualField[] = [
  ...CATEGORIES.map(category => ({ key: `name_${category}`, category, label: `${CATEGORY_LABELS[category]}の名前`, kind: 'text' as const, help: '任意。自分が分かる名前で構いません（80文字まで）。' })),
  mm('case_width', 'case', 'ケースの幅'), mm('case_height', 'case', 'ケースの高さ'), mm('case_depth', 'case', 'ケースの奥行き'),
  mm('max_gpu_length', 'case', '対応GPUの最大長'), mm('max_cooler_height', 'case', '対応空冷クーラーの最大高'), mm('max_psu_length', 'case', '対応電源の最大長'),
  { key: 'case_board_support', category: 'case', label: 'ケースの対応マザーボード', kind: 'select', options: [
    { value: 'ATX,mATX,ITX', label: 'ATX / Micro-ATX / Mini-ITX' }, { value: 'mATX,ITX', label: 'Micro-ATX / Mini-ITX' },
    { value: 'ATX', label: 'ATXのみ' }, { value: 'mATX', label: 'Micro-ATXのみ' }, { value: 'ITX', label: 'Mini-ITXのみ' },
    { value: 'ATX,mATX', label: 'ATX / Micro-ATX' }, { value: 'ATX,ITX', label: 'ATX / Mini-ITX' },
  ], help: '対応表に書かれた組合せを選びます。大きい規格に対応していても、小さい規格への対応は推測しません。' },
  count('case_fans', 'case', 'ケースファンの数', 0, 12),
  { key: 'board_form_factor', category: 'motherboard', label: '基板の規格', kind: 'select', options: [{ value: 'ATX', label: 'ATX' }, { value: 'mATX', label: 'Micro-ATX' }, { value: 'ITX', label: 'Mini-ITX' }], help: '配置図の基板寸法・取付位置は規格別の模式図です。実製品の外観は再現しません。' },
  { key: 'board_socket', category: 'motherboard', label: '基板のCPUソケット', kind: 'select', options: sockets },
  { key: 'board_memory_type', category: 'motherboard', label: '基板のメモリ規格', kind: 'select', options: memories },
  count('board_memory_slots', 'motherboard', 'メモリスロットの数', 1, 8),
  { key: 'cpu_socket', category: 'cpu', label: 'CPUのソケット', kind: 'select', options: sockets },
  { key: 'cpu_max_power', category: 'cpu', label: 'CPUの最大電力', kind: 'number', unit: 'W', min: 1, max: 1000, help: '任意。TDPではなく最大電力。分からなければ空欄のままにします。' },
  mm('cooler_width', 'cooler', '空冷クーラーの幅', 500, true), mm('cooler_depth', 'cooler', '空冷クーラーの奥行き', 500, true), mm('cooler_height', 'cooler', '空冷クーラーの高さ', 500),
  count('cooler_fans', 'cooler', 'クーラーファンの数', 0, 4),
  { key: 'memory_type', category: 'memory', label: 'メモリの規格', kind: 'select', options: memories },
  count('memory_modules', 'memory', 'メモリの枚数', 1, 8), mm('memory_height', 'memory', 'メモリの高さ', 200),
  mm('gpu_length', 'gpu', 'GPUの長さ'), mm('gpu_height', 'gpu', 'GPUの高さ', 500, true), mm('gpu_thickness', 'gpu', 'GPUの厚み', 200, true),
  { key: 'gpu_power', category: 'gpu', label: 'GPUのボード電力', kind: 'number', unit: 'W', min: 1, max: 1500, help: '任意。カード全体の電力。分からなければ空欄のままにします。' },
  mm('psu_length', 'psu', '電源の長さ', 500), mm('psu_width', 'psu', '電源の幅', 500, true), mm('psu_height', 'psu', '電源の高さ', 500, true),
  { key: 'psu_wattage', category: 'psu', label: '電源の容量', kind: 'number', unit: 'W', min: 1, max: 3000 },
  ...CATEGORIES.map(category => ({ key: `price_${category}`, category, label: `${CATEGORY_LABELS[category]}の入力価格`, kind: 'number' as const, unit: '円', min: 0, max: 9_999_999, help: '任意。税込の整数を入力。空欄は未入力、0は0円です。' })),
]

/** 名前・価格・CPU/GPU電力以外は、模式図と仕様比較に必要。 */
const optional = (key: string) => key.startsWith('name_') || key.startsWith('price_') || key === 'cpu_max_power' || key === 'gpu_power'
const integers = new Set(['case_fans', 'cooler_fans', 'board_memory_slots', 'memory_modules', ...CATEGORIES.map(c => `price_${c}`)])
const fieldMap = new Map(FIELDS.map(field => [field.key, field]))
const MAX_INPUT_CHARS = 8000

export function emptyInput(): ManualInput { return Object.fromEntries(FIELDS.map(field => [field.key, ''])) }

/** 保存やURLの入口。未知のキー、文字列以外、改行・制御文字、過大な入力を受け入れない。 */
export function normalizeInput(value: unknown): ManualInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return null
  const entries = Object.entries(value)
  if (entries.length > FIELDS.length) return null
  const normalized = emptyInput()
  let size = 0
  for (const [key, text] of entries) {
    const field = fieldMap.get(key)
    if (!field || typeof text !== 'string') return null
    const maxLength = field.kind === 'text' ? 80 : 32
    if (text.length > maxLength || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(text)) return null
    size += key.length + text.length
    if (size > MAX_INPUT_CHARS) return null
    normalized[key] = text.trim()
  }
  return normalized
}

/** この場で設計した架空の丸い値。既存製品データから作っていない。価格は例でも空欄。 */
const roomy: ManualInput = {
  ...emptyInput(),
  name_case: '架空ケースA', name_motherboard: '架空マザーボードA', name_cpu: '架空CPU A', name_cooler: '架空空冷クーラーA',
  name_memory: '架空メモリA', name_gpu: '架空GPU A', name_storage: '架空SSD A', name_psu: '架空電源A',
  case_width: '240', case_height: '500', case_depth: '480', max_gpu_length: '360', max_cooler_height: '170', max_psu_length: '200',
  case_board_support: 'ATX,mATX,ITX', case_fans: '2', board_form_factor: 'ATX', board_socket: 'AM5', board_memory_type: 'DDR5', board_memory_slots: '4',
  cpu_socket: 'AM5', cpu_max_power: '100', cooler_width: '120', cooler_depth: '100', cooler_height: '150', cooler_fans: '1',
  memory_type: 'DDR5', memory_modules: '2', memory_height: '40', gpu_length: '300', gpu_height: '120', gpu_thickness: '40', gpu_power: '200',
  psu_length: '160', psu_width: '150', psu_height: '100', psu_wattage: '750',
}
export const EXAMPLES: { id: string; title: string; description: string; values: ManualInput }[] = [
  { id: 'roomy', title: '寸法に余裕のある架空例', description: '長さ300mmのGPUを、最大360mmまでの架空ケースへ。実在する製品の構成ではありません。', values: roomy },
  { id: 'too-long', title: 'GPUが長すぎる架空例', description: '長さ400mmのGPUは、最大360mmまでの架空ケースに入りません。差を確かめる例です。', values: { ...roomy, name_gpu: '架空GPU B', gpu_length: '400' } },
]

export interface ManualEvaluation {
  resolved: ResolvedBuild | null
  errors: Record<string, string>
  /** 必須の未入力項目のkey。UIはFIELDSからラベルを引ける。 */
  missing: string[]
  issues: Issue[]
  power: PowerEstimate | null
  cost: { total: number; entered: number; missing: number }
}

/** 名前以外の文字列を、有限の10進数へ変換する。指数・符号・区切り文字は許さない。 */
function numeric(text: string, field: ManualField): number | null {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) return null
  const value = Number(text)
  if (!Number.isFinite(value) || value < (field.min ?? 0) || value > (field.max ?? Number.MAX_SAFE_INTEGER)) return null
  if (integers.has(field.key) && !Number.isInteger(value)) return null
  return value
}

function resolvedOf(values: ManualInput, numbers: Record<string, number>): ResolvedBuild {
  const n = (key: string) => numbers[key]!
  const base = (category: Category, unverified: string[] = []) => ({
    id: `manual-${category}`, short: category, brand: '', name: values[`name_${category}`] || `${CATEGORY_LABELS[category]}（入力）`, officialUrl: '', unverified,
  })
  const formFactor = values.board_form_factor as FormFactor
  // 配置図のための規格別の代表寸法。製品の実寸として互換性を判断する材料にはしない。
  const boards: Record<FormFactor, { width: number; depth: number }> = { ATX: { width: 300, depth: 240 }, mATX: { width: 240, depth: 240 }, ITX: { width: 170, depth: 170 } }
  return {
    case: {
      ...base('case'), category: 'case', style: 'schematic', layout: 'standard',
      dimensionsMm: { width: n('case_width'), height: n('case_height'), depth: n('case_depth') },
      motherboardSupport: values.case_board_support!.split(',') as FormFactor[], maxGpuLengthMm: n('max_gpu_length'), maxCoolerHeightMm: n('max_cooler_height'), maxPsuLengthMm: n('max_psu_length'),
      radiatorSupport: { top: [], front: [], side: [], bottom: [] }, maxRadiatorThicknessMm: { top: null, front: null, side: null, bottom: null },
      includedFans: n('case_fans'), sidePanel: '模式表示', colors: [{ color: 'white', model: null }, { color: 'black', model: null }], conflicts: [],
    },
    motherboard: {
      ...base('motherboard', ['dimensionsMm', 'chipset', 'maxMemoryGb', 'm2Slots', 'pcieX16Gen', 'wifi']), category: 'motherboard',
      socket: values.board_socket!, chipset: '未確認', formFactor, dimensionsMm: boards[formFactor], memoryType: values.board_memory_type!, memorySlots: n('board_memory_slots'),
      maxMemoryGb: 0, m2Slots: 0, pcieX16Gen: '未確認', color: 'gray', wifi: false,
    },
    cpu: {
      ...base('cpu', ['cores', 'threads', 'baseGhz', 'boostGhz', 'tdpW', 'memory', 'igpu', 'coolerIncluded', ...(values.cpu_max_power === '' ? ['maxPowerW'] : [])]), category: 'cpu',
      released: '', socket: values.cpu_socket!, cores: 0, threads: 0, baseGhz: 0, boostGhz: 0, tdpW: 0,
      maxPowerW: numbers.cpu_max_power ?? null, maxPowerSource: null, memory: '未確認', igpu: false, coolerIncluded: false,
    },
    cooler: {
      ...base('cooler', ['sockets', 'ramClearance', 'fans.sizeMm', 'rgb']), category: 'cooler', type: 'air', heightMm: n('cooler_height'),
      dimensionsMm: { width: n('cooler_width'), depth: n('cooler_depth'), height: n('cooler_height') }, ramClearance: { kind: 'unknown' },
      fans: { count: n('cooler_fans'), sizeMm: 100 }, sockets: [], rgb: false, color: 'gray',
    },
    memory: {
      ...base('memory', ['speedMts', 'casLatency', 'moduleGb', 'rgb']), category: 'memory', type: values.memory_type!,
      speedMts: 0, casLatency: 0, modules: n('memory_modules'), moduleGb: 0, heightMm: n('memory_height'), rgb: false, color: 'gray',
    },
    gpu: {
      ...base('gpu', ['vramGb', 'vramType', 'recommendedPsuW', 'powerConnector', 'slots', 'fans', 'rgb', ...(values.gpu_power === '' ? ['boardPowerW'] : [])]), category: 'gpu',
      chipBrand: '', chip: values.name_gpu || 'GPU（入力）', cardMaker: '', released: '', vramGb: 0, vramType: '未確認', boardPowerW: numbers.gpu_power ?? null,
      chipReferencePower: null, recommendedPsuW: null, powerConnector: '未確認', dimensionsMm: { length: n('gpu_length'), height: n('gpu_height'), thickness: n('gpu_thickness') },
      slots: null, fans: 0, color: 'gray', rgb: false,
    },
    storage: {
      ...base('storage', ['capacityGb', 'interface', 'formFactor', 'seqReadMbps', 'seqWriteMbps', 'heatsink']), category: 'storage',
      capacityGb: 0, interface: '未確認', formFactor: '未確認', seqReadMbps: 0, seqWriteMbps: 0, heatsink: false,
    },
    psu: {
      ...base('psu', ['efficiency', 'atxVersion', 'native12v2x6', 'modular']), category: 'psu', wattage: n('psu_wattage'), efficiency: '未確認', atxVersion: '未確認', native12v2x6: false, modular: '未確認',
      dimensionsMm: { width: n('psu_width'), height: n('psu_height'), length: n('psu_length') }, color: 'gray',
    },
  }
}

export function evaluateInput(values: ManualInput): ManualEvaluation {
  const errors: Record<string, string> = {}
  const missing: string[] = []
  const cost = { total: 0, entered: 0, missing: CATEGORIES.length }
  const normalized = normalizeInput(values)
  if (!normalized) return { resolved: null, errors: { _input: '入力の形式を読み取れません。空欄から入力し直してください。' }, missing, issues: [], power: null, cost }
  const numbers: Record<string, number> = {}
  for (const field of FIELDS) {
    const value = normalized[field.key]!
    if (value === '') { if (!optional(field.key)) missing.push(field.key); continue }
    if (field.kind === 'number') {
      const number = numeric(value, field)
      if (number === null) errors[field.key] = `${field.min}〜${field.max?.toLocaleString('ja-JP')}${field.unit ?? ''}の${integers.has(field.key) ? '整数' : '数値（小数2桁まで）'}で入力してください。`
      else numbers[field.key] = number
    } else if (field.kind === 'select' && !field.options?.some(option => option.value === value)) {
      errors[field.key] = '選択肢から選んでください。'
    }
  }
  for (const category of CATEGORIES) {
    const amount = numbers[`price_${category}`]
    if (amount !== undefined) { cost.total += amount; cost.entered++; cost.missing-- }
  }
  // 外形より大きい収容上限は、仕様の取り違えとして訂正を促す。
  for (const [limit, outer] of [['max_gpu_length', 'case_depth'], ['max_cooler_height', 'case_width'], ['max_psu_length', 'case_depth']] as const) {
    if (numbers[limit] !== undefined && numbers[outer] !== undefined && numbers[limit]! > numbers[outer]!) {
      errors[limit] = 'ケースの外形より大きい上限になっています。寸法の向きと単位を確認してください。'
    }
  }
  if (missing.length || Object.keys(errors).some(key => !key.startsWith('price_'))) return { resolved: null, errors, missing, issues: [], power: null, cost }
  const resolved = resolvedOf(normalized, numbers)
  const power = powerOfBuild(resolved).estimate
  // 実製品の公式情報を読んだかのような言葉にせず、入力値から分かる範囲だけを返す。
  const issues = checkCompat(resolved).map(issue => {
    if (issue.rule === 'cooler-memory-clearance') return { ...issue, severity: 'warn' as const, estimate: true, message: '未確認：空冷クーラーとメモリの干渉は、この版では判定していません。実際の取付条件を確認してください。', fixes: [] }
    if (issue.rule === 'cooler-socket') return { ...issue, severity: 'warn' as const, estimate: true, message: '未確認：クーラーの対応ソケットと取付金具は、別途確認してください。', fixes: [] }
    return { ...issue, message: issue.message.replaceAll('公表値', '入力値'), fixes: [] }
  })
  issues.push({ rule: 'manual-unchecked', title: 'このアプリで判定しない項目', categories: ['gpu', 'storage', 'motherboard', 'psu'], severity: 'warn', estimate: true,
    message: '未確認：GPUの幅・厚みとケーブルの空間、電源コネクタ、SSDの接続、BIOS・CPUの世代別対応。水冷ラジエーターと特殊なケース配置にも対応していません。', fixes: [] })
  return { resolved, errors, missing, issues, power, cost }
}
