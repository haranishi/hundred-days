/**
 * 互換性の判定（docs/02a の表＋03c の追加）。
 * 寸法の判定は layout.ts の caseLimits を使い、3Dの箱（fitsInCase）と同じ上限で比べる。
 *
 * 重さ: error＝不可（物理的に入らない／挿さらない）／warn＝注意（入るが余り 10mm 未満、目安の判定など）／ok＝問題なし
 */
import { listParts, resolveBuild, withPart } from './catalog'
import { formatMm, formatW } from './format'
import { caseLimits, layoutBuild, overlapsBetween, radiatorMount } from './layout'
import { estimateText, missingNames, powerOfBuild } from './power'
import type {
  Build,
  Catalog,
  Category,
  DataConflict,
  Fit,
  Fix,
  Issue,
  PcCase,
  ResolvedBuild,
  RuleId,
  Severity,
} from './types'
import { CATEGORY_LABELS, FORM_FACTOR_LABELS, FORM_FACTOR_ORDER, RADIATOR_POSITION_LABELS } from './types'

/** 余りがこれ未満なら注意 */
export const WARN_MARGIN_MM = 10

/** 0.001mm で丸めてから比べる（浮動小数の誤差で境界がずれないように） */
const roundMm = (mm: number) => Math.round(mm * 1000) / 1000

export function fitSeverity(marginMm: number): Severity {
  const m = roundMm(marginMm)
  if (m < 0) return 'error'
  if (m < WARN_MARGIN_MM) return 'warn'
  return 'ok'
}

/** 「入る・余り 32mm」／「入らない・あと 12mm」 */
export function fitLabel(marginMm: number): string {
  const m = roundMm(marginMm)
  return m >= 0 ? `入る・余り ${formatMm(m)}mm` : `入らない・あと ${formatMm(-m)}mm`
}

const title = (a: Category, b: Category | string) =>
  `${CATEGORY_LABELS[a]} × ${typeof b === 'string' && b in CATEGORY_LABELS ? CATEGORY_LABELS[b as Category] : b}`

function conflictNote(c: PcCase, field: string): (DataConflict & { note: string }) | undefined {
  const d = c.conflicts.find((x) => x.field === field)
  if (!d) return undefined
  const values = d.values.map((v) => `${formatMm(v)}mm`).join(' と ')
  return { ...d, note: `資料により値が異なるため小さい方で判定（${values}）` }
}

/**
 * 近道「○○だけ表示」の言葉（round3 体験 バグ5）。候補の切り替えは札が ✕ の候補を隠す（注意の ！ は残す。docs/02a）ので、
 * 「問題のない」とは言わない。その判定で何が解決するかを言う（入る・当たらない・合う・足りる）
 */
const SHOW_LABELS: Partial<Record<RuleId, Partial<Record<Category, string>>>> = {
  'cpu-motherboard-socket': { cpu: 'ソケットが合うCPUだけ表示' },
  'memory-motherboard': { memory: '挿せるメモリだけ表示' },
  'motherboard-case': { motherboard: '入るマザーボードだけ表示' },
  'gpu-case-length': { gpu: '入るグラフィックボードだけ表示' },
  'cooler-case-height': { cooler: '入るCPUクーラーだけ表示' },
  'cooler-memory-clearance': { memory: 'クーラーに当たらないメモリだけ表示', cooler: 'メモリに当たらないCPUクーラーだけ表示' },
  'aio-case-size': { cooler: '付けられるCPUクーラーだけ表示' },
  'aio-case-thickness': { cooler: '入るCPUクーラーだけ表示' },
  'psu-case-length': { psu: '入る電源だけ表示' },
  'cooler-socket': { cooler: 'ソケットに付くCPUクーラーだけ表示' },
  'psu-power': { psu: '足りる電源だけ表示' },
}

export function showCompatibleLabel(rule: RuleId, category: Category): string {
  return SHOW_LABELS[rule]?.[category] ?? `使える${CATEGORY_LABELS[category]}だけ表示`
}

/**
 * 解決の近道。primary の候補を絞る近道と、other を替える近道。
 * 空冷クーラー×メモリは、クーラーの側も絞った一覧へ飛ぶ（round3 体験 TOP5：絞り込みの無い一覧だと、当たる3件も混ざっていた）
 */
function fixesFor(severity: Severity, primary: Category, other: Category, rule: RuleId): Fix[] {
  if (severity === 'ok') return []
  const show = (category: Category): Fix => ({ kind: 'show-compatible', category, label: showCompatibleLabel(rule, category) })
  if (rule === 'cooler-memory-clearance') return [show(primary), show(other)]
  return [show(primary), { kind: 'change', category: other, label: `${CATEGORY_LABELS[other]}を替える` }]
}

interface FitArgs {
  rule: RuleId
  title: string
  categories: Category[]
  valueMm: number
  limitMm: number
  estimate?: boolean
  conflict?: DataConflict & { note: string }
  /** 不可のときの文（無ければ「入らない・あと ◯mm」） */
  errorText?: (overMm: number) => string
  /** 入るときの文（無ければ「入る・余り ◯mm」） */
  fitText?: (marginMm: number) => string
  suffix?: string
  primary: Category
  other: Category
}

function fitIssue(a: FitArgs): Issue {
  const marginMm = a.limitMm - a.valueMm
  const estimate = a.estimate ?? false
  let severity = fitSeverity(marginMm)
  // 目安の判定は「問題なし」にしない
  if (estimate && severity === 'ok') severity = 'warn'
  const m = roundMm(marginMm)
  let text = m < 0 ? (a.errorText?.(-m) ?? fitLabel(m)) : (a.fitText?.(m) ?? fitLabel(m))
  if (estimate) text = `目安：${text}`
  if (a.suffix) text += a.suffix
  const fit: Fit = { valueMm: a.valueMm, limitMm: a.limitMm, marginMm }
  const issue: Issue = {
    rule: a.rule,
    title: a.title,
    categories: a.categories,
    severity,
    message: text,
    estimate,
    fit,
    fixes: fixesFor(severity, a.primary, a.other, a.rule),
  }
  if (a.conflict) issue.dataConflict = a.conflict
  return issue
}

function simple(
  rule: RuleId,
  t: string,
  categories: Category[],
  ok: boolean,
  okText: string,
  ngText: string,
  primary: Category,
  other: Category,
): Issue {
  const severity: Severity = ok ? 'ok' : 'error'
  return {
    rule,
    title: t,
    categories,
    severity,
    message: ok ? okText : ngText,
    estimate: false,
    fixes: fixesFor(severity, primary, other, rule),
  }
}

/** 構成の互換性を、02a の表の順に全部返す（問題なしの行も含む） */
export function checkCompat(b: ResolvedBuild): Issue[] {
  const { case: c, motherboard: mb, cpu, cooler, memory, gpu, psu } = b
  const issues: Issue[] = []
  const limits = caseLimits(c)

  // CPU × マザーボード: ソケット
  issues.push(
    simple(
      'cpu-motherboard-socket',
      title('cpu', 'motherboard'),
      ['cpu', 'motherboard'],
      cpu.socket === mb.socket,
      `ソケットが一致（${mb.socket}）`,
      `ソケットが違います（${cpu.socket} と ${mb.socket}）`,
      'cpu',
      'motherboard',
    ),
  )

  // メモリ × マザーボード: 規格と枚数
  {
    const typeOk = memory.type === mb.memoryType
    const countOk = memory.modules <= mb.memorySlots
    const ng = !typeOk
      ? `規格が違います（${memory.type} と ${mb.memoryType}）`
      : `このマザーボードはメモリを${mb.memorySlots}枚まで`
    issues.push(
      simple(
        'memory-motherboard',
        title('memory', 'motherboard'),
        ['memory', 'motherboard'],
        typeOk && countOk,
        `${memory.type}・${memory.modules}枚（スロット ${mb.memorySlots}本）`,
        ng,
        'memory',
        'motherboard',
      ),
    )
  }

  // マザーボード × ケース: 対応規格
  {
    const ok = c.motherboardSupport.includes(mb.formFactor)
    const supported = FORM_FACTOR_ORDER.filter((f) => c.motherboardSupport.includes(f))
    const largest = supported[supported.length - 1]
    const bigger = largest !== undefined && FORM_FACTOR_ORDER.indexOf(mb.formFactor) > FORM_FACTOR_ORDER.indexOf(largest)
    const ng = bigger
      ? `このケースは ${FORM_FACTOR_LABELS[largest]} まで`
      : `このケースは ${supported.map((f) => FORM_FACTOR_LABELS[f]).join('・')} に対応`
    issues.push(
      simple(
        'motherboard-case',
        title('motherboard', 'case'),
        ['motherboard', 'case'],
        ok,
        `${FORM_FACTOR_LABELS[mb.formFactor]} に対応`,
        ng,
        'motherboard',
        'case',
      ),
    )
  }

  // GPU × ケース: 長さ（前面ラジエーターがあればその厚みを差し引いた目安）
  {
    // ラジエーターの位置は layoutBuild と同じ引数で決める（天面だと水冷ヘッドに当たる構成は前面になる）
    const mount = cooler.type === 'aio' ? radiatorMount(c, cooler, { motherboard: mb, psu }) : null
    let limit = limits.gpuLengthMm
    let estimate = limits.clamped.gpu
    let suffix = limits.clamped.gpu ? `（公表値 ${formatMm(c.maxGpuLengthMm)}mm がケースの奥行きを超えるため、奥行きから求めた値）` : ''
    if (cooler.type === 'aio' && mount === 'front') {
      const tr = cooler.radiatorDimensionsMm.thickness
      limit -= tr
      estimate = true
      suffix += `（前面のラジエーター ${formatMm(tr)}mm を差し引いた値）`
    }
    const conflict = conflictNote(c, 'maxGpuLengthMm')
    issues.push(
      fitIssue({
        rule: 'gpu-case-length',
        title: title('gpu', 'case'),
        categories: ['gpu', 'case'],
        valueMm: gpu.dimensionsMm.length,
        limitMm: limit,
        estimate,
        suffix,
        ...(conflict ? { conflict } : {}),
        primary: 'gpu',
        other: 'case',
      }),
    )
  }

  // 空冷クーラー × ケース: 高さ
  if (cooler.type === 'air') {
    const conflict = conflictNote(c, 'maxCoolerHeightMm')
    issues.push(
      fitIssue({
        rule: 'cooler-case-height',
        title: `${title('cooler', 'case')}（高さ）`,
        categories: ['cooler', 'case'],
        valueMm: cooler.heightMm,
        limitMm: limits.coolerHeightMm,
        estimate: limits.clamped.cooler,
        ...(conflict ? { conflict } : {}),
        primary: 'cooler',
        other: 'case',
      }),
    )
  }

  // 空冷クーラー × メモリ: 隙間（公表値）／張り出さない／不明なら3Dの箱で目安
  if (cooler.type === 'air') {
    const rc = cooler.ramClearance
    const t = title('cooler', 'memory')
    if (rc.kind === 'none') {
      issues.push({
        rule: 'cooler-memory-clearance',
        title: t,
        categories: ['cooler', 'memory'],
        severity: 'ok',
        message: 'メモリの上に張り出さない設計（メーカー公表）',
        estimate: false,
        fixes: [],
      })
    } else if (rc.kind === 'limit') {
      issues.push(
        fitIssue({
          rule: 'cooler-memory-clearance',
          title: t,
          categories: ['cooler', 'memory'],
          valueMm: memory.heightMm,
          limitMm: rc.mm,
          errorText: (over) => `メモリが ${formatMm(over)}mm 高く、クーラーに当たります`,
          fitText: (m) => `当たらない・余り ${formatMm(m)}mm`,
          suffix: `（メモリ ${formatMm(memory.heightMm)}mm／クーラーの隙間 ${formatMm(rc.mm)}mm）`,
          primary: 'memory',
          other: 'cooler',
        }),
      )
    } else {
      const hit = overlapsBetween(layoutBuild(b), 'cooler', 'memory')
      issues.push({
        rule: 'cooler-memory-clearance',
        title: t,
        categories: ['cooler', 'memory'],
        severity: 'warn',
        message: hit
          ? '目安：メモリがクーラーに当たる可能性があります（メーカーの公表値が無いため3Dの箱で判定）'
          : '目安：3Dの箱では当たりません（メーカーの公表値が無いため3Dの箱で判定）',
        estimate: true,
        fixes: fixesFor('warn', 'memory', 'cooler', 'cooler-memory-clearance'),
      })
    }
  }

  // 簡易水冷 × ケース: ラジエーターの大きさ（天面か前面）と厚み（03c）
  if (cooler.type === 'aio') {
    const size = cooler.radiatorMm
    const mount = radiatorMount(c, cooler, { motherboard: mb, psu })
    const t = `${title('cooler', 'case')}（ラジエーター）`
    const okText =
      mount === 'top'
        ? `このケースの天面は ${size}mm に対応`
        : c.radiatorSupport.top.includes(size)
          ? `天面だと水冷ヘッドに当たるおそれがあるため前面に付けます（前面は ${size}mm に対応）`
          : `天面は非対応、前面が ${size}mm に対応`
    issues.push(
      simple(
        'aio-case-size',
        t,
        ['cooler', 'case'],
        mount !== null,
        okText,
        `このケースの天面・前面は ${size}mm のラジエーターに非対応`,
        'cooler',
        'case',
      ),
    )
    if (mount !== null) {
      const pos = RADIATOR_POSITION_LABELS[mount]
      const limit = c.maxRadiatorThicknessMm[mount]
      const thickness = cooler.radiatorDimensionsMm.thickness
      if (limit === null) {
        issues.push({
          rule: 'aio-case-thickness',
          title: `${title('cooler', 'case')}（ラジエーターの厚み）`,
          categories: ['cooler', 'case'],
          severity: 'warn',
          message: `目安：${pos}のラジエーター厚の上限は公表されていません（このクーラーはファン込み ${formatMm(thickness)}mm）`,
          estimate: true,
          fixes: fixesFor('warn', 'cooler', 'case', 'aio-case-thickness'),
        })
      } else {
        issues.push(
          fitIssue({
            rule: 'aio-case-thickness',
            title: `${title('cooler', 'case')}（ラジエーターの厚み）`,
            categories: ['cooler', 'case'],
            valueMm: thickness,
            limitMm: limit,
            suffix: `（${pos}のラジエーター＋ファンの厚み ${formatMm(thickness)}mm／上限 ${formatMm(limit)}mm）`,
            primary: 'cooler',
            other: 'case',
          }),
        )
      }
    }
  }

  // 電源 × ケース: 長さ
  {
    const conflict = conflictNote(c, 'maxPsuLengthMm')
    issues.push(
      fitIssue({
        rule: 'psu-case-length',
        title: title('psu', 'case'),
        categories: ['psu', 'case'],
        valueMm: psu.dimensionsMm.length,
        limitMm: limits.psuLengthMm,
        estimate: limits.clamped.psu,
        ...(conflict ? { conflict } : {}),
        primary: 'psu',
        other: 'case',
      }),
    )
  }

  // クーラー × ソケット（マザーボードのソケットに付くか）
  issues.push(
    simple(
      'cooler-socket',
      'CPUクーラー × ソケット',
      ['cooler', 'motherboard'],
      cooler.sockets.includes(mb.socket),
      `${mb.socket} に対応`,
      `このクーラーは ${mb.socket} に非対応`,
      'cooler',
      'motherboard',
    ),
  )

  // 電源の容量（round1 A1：未確認の部品があれば「＋未確認」を必ず書き、下限から出した負荷率（%）は出さない。
  // チップの定格で計算した GPU は、そう書く）
  {
    const { estimate, psu: check } = powerOfBuild(b)
    const est = estimateText(estimate)
    const rec = formatW(estimate.recommendedW)
    const below = psu.wattage < estimate.recommendedW
    let message: string
    if (!estimate.complete) {
      const why = `${missingNames(estimate)}の消費電力が未確認のため、含めずに計算しています`
      message =
        check.severity === 'error'
          ? `電源が足りません（推定の最大 ${est} に対し ${formatW(psu.wattage)}。${why}）`
          : `目安：推定の最大 ${est}（${why}）。${below ? `推奨 ${rec} を下回ります` : `推奨 ${rec} 以上`}`
    } else {
      const chipNote = estimate.gpuBasis === 'chip' ? '。GPU はチップの定格で計算' : ''
      if (check.severity === 'error') message = `電源が足りません（推定の最大 ${est} に対し ${formatW(psu.wattage)}${chipNote}）`
      else if (below) message = `推奨 ${rec} を下回ります（推定の最大 ${est}・負荷率 ${Math.round(check.loadPct)}%${chipNote}）`
      else message = `推奨 ${rec} 以上（負荷率 ${Math.round(check.loadPct)}%${chipNote}）`
    }
    issues.push({
      rule: 'psu-power',
      title: '電源の容量',
      categories: ['psu', 'cpu', 'gpu'],
      severity: check.severity,
      message,
      estimate: !estimate.complete,
      power: {
        estimatedMaxW: estimate.estimatedMaxW,
        complete: estimate.complete,
        wattage: psu.wattage,
        recommendedW: estimate.recommendedW,
        gpuBasis: estimate.gpuBasis,
        missing: [...estimate.missing],
      },
      fixes: check.severity === 'ok' ? [] : [{ kind: 'show-compatible', category: 'psu', label: showCompatibleLabel('psu-power', 'psu') }],
    })
  }

  return issues
}

export interface IssueSummary {
  errors: number
  warnings: number
  worst: Severity
}

export function summarizeIssues(issues: Issue[]): IssueSummary {
  const errors = issues.filter((i) => i.severity === 'error').length
  const warnings = issues.filter((i) => i.severity === 'warn').length
  return { errors, warnings, worst: errors > 0 ? 'error' : warnings > 0 ? 'warn' : 'ok' }
}

export function worstSeverity(issues: Issue[]): Severity {
  return summarizeIssues(issues).worst
}

/** その部品に差し替えたとき、不可（error）が1つも出ない候補の ID（「入るものだけ」） */
export function compatibleCandidates(catalog: Catalog, build: Build, category: Category): string[] {
  return listParts(catalog, category)
    .filter((p) => summarizeIssues(checkCompat(resolveBuild(catalog, withPart(build, category, p.id)))).errors === 0)
    .map((p) => p.id)
}

/** 候補のカードに出す「入る・余り 32mm」などの札の元 */
const PRIMARY_RULE: Partial<Record<Category, RuleId[]>> = {
  gpu: ['gpu-case-length'],
  cooler: ['cooler-case-height', 'aio-case-size', 'aio-case-thickness'],
  psu: ['psu-case-length', 'psu-power'],
  memory: ['cooler-memory-clearance', 'memory-motherboard'],
  case: ['gpu-case-length', 'cooler-case-height', 'psu-case-length', 'motherboard-case', 'aio-case-size'],
  motherboard: ['motherboard-case', 'cpu-motherboard-socket'],
  cpu: ['cpu-motherboard-socket'],
}

export interface CandidateVerdict {
  id: string
  worst: Severity
  /** この部品が関わる行 */
  issues: Issue[]
  /** 札に出す寸法の判定（あれば） */
  fit: Fit | null
  label: string
}

/** 候補に触れたとき（試し置き）の判定 */
export function evaluateCandidate(catalog: Catalog, build: Build, category: Category, id: string): CandidateVerdict {
  const issues = checkCompat(resolveBuild(catalog, withPart(build, category, id))).filter((i) => i.categories.includes(category))
  const worst = worstSeverity(issues)
  const rules = PRIMARY_RULE[category] ?? []
  const withFit = issues
    .filter((i) => i.fit && rules.includes(i.rule))
    .sort((a, b) => (a.fit!.marginMm ?? 0) - (b.fit!.marginMm ?? 0))
  const primary = withFit[0] ?? issues.find((i) => i.severity === worst) ?? issues[0]
  return {
    id,
    worst,
    issues,
    fit: primary?.fit ?? null,
    label: primary?.message ?? '',
  }
}
