import { describe, expect, it } from 'vitest'
import { emptyInput, evaluateInput, EXAMPLES, FIELDS, normalizeInput, type ManualInput } from '../../src/domain/manual'
import { CATEGORIES } from '../../src/domain/types'

const example = (): ManualInput => ({ ...EXAMPLES[0]!.values })

describe('手入力仕様の入口', () => {
  it('全カテゴリの名前と価格を入力でき、キーは重複しない', () => {
    expect(new Set(FIELDS.map(field => field.key)).size).toBe(FIELDS.length)
    for (const category of CATEGORIES) {
      expect(FIELDS.some(field => field.key === `name_${category}` && field.kind === 'text')).toBe(true)
      expect(FIELDS.some(field => field.key === `price_${category}` && field.min === 0)).toBe(true)
    }
    expect(Object.values(emptyInput()).every(value => value === '')).toBe(true)
  })
  it('既知のキーだけを補完し、前後の空白を除く', () => {
    expect(normalizeInput({ name_cpu: '  自分のCPU  ', price_cpu: '' })).toEqual({ ...emptyInput(), name_cpu: '自分のCPU' })
    expect(normalizeInput(example())).toEqual(example())
  })
  it.each([null, [], 'text', 12, { unknown: '' }, { cpu_max_power: 120 }, { name_cpu: null }, { name_cpu: 'x'.repeat(81) }, { gpu_length: '1'.repeat(33) }, { name_cpu: 'one\ntwo' }, { name_cpu: '\u0000' }, { name_cpu: 'x\u2028y' }])('型・未知キー・長さ・改行を拒否する: %j', input => {
    expect(normalizeInput(input)).toBeNull()
  })
  it('プロトタイプや予約キーを入力として受け取らない', () => {
    expect(normalizeInput(Object.create({ gpu_length: '300' }))).toBeNull()
    expect(normalizeInput(JSON.parse('{"__proto__":{"polluted":true}}'))).toBeNull()
    expect(normalizeInput(JSON.parse('{"constructor":"text"}'))).toBeNull()
  })
})

describe('架空例と仕様の判定', () => {
  it('例は2つ。余裕ありの例に寸法不足はなく、未対応の確認は残る', () => {
    expect(EXAMPLES).toHaveLength(2)
    const result = evaluateInput(example())
    expect(result.resolved).not.toBeNull()
    expect(result.errors).toEqual({})
    expect(result.missing).toEqual([])
    expect(result.issues.filter(issue => issue.severity === 'error')).toEqual([])
    expect(result.issues.find(issue => issue.rule === 'gpu-case-length')?.fit).toEqual({ valueMm: 300, limitMm: 360, marginMm: 60 })
    expect(result.issues.find(issue => issue.rule === 'cooler-memory-clearance')).toMatchObject({ severity: 'warn', estimate: true })
    expect(result.issues.find(issue => issue.rule === 'cooler-socket')).toMatchObject({ severity: 'warn', estimate: true })
    expect(result.issues.find(issue => issue.rule === 'manual-unchecked')?.message).toMatch(/GPUの幅・厚み.*電源コネクタ.*SSD.*BIOS/)
    expect(JSON.stringify(result.resolved)).not.toMatch(/https?:\/\//)
    expect(CATEGORIES.every(category => result.resolved![category].id === `manual-${category}`)).toBe(true)
  })
  it('長すぎる例はGPUが40mm不足する。同じ基準で3Dへ渡す', () => {
    const result = evaluateInput(EXAMPLES[1]!.values)
    const issue = result.issues.find(issue => issue.rule === 'gpu-case-length')!
    expect(issue.severity).toBe('error')
    expect(issue.fit).toEqual({ valueMm: 400, limitMm: 360, marginMm: -40 })
    expect(result.resolved!.gpu.dimensionsMm.length).toBe(400)
    expect(result.resolved!.case.maxGpuLengthMm).toBe(360)
  })
  it('空欄からは構成も電源計算も成立させず、OK判定を返さない', () => {
    const result = evaluateInput(emptyInput())
    expect(result.resolved).toBeNull()
    expect(result.power).toBeNull()
    expect(result.missing).toContain('gpu_length')
    expect(result.missing).toContain('case_depth')
    expect(result.missing).not.toContain('name_gpu')
    expect(result.missing).not.toContain('price_gpu')
    expect(result.issues).toEqual([])
    expect(result.cost).toEqual({ total: 0, entered: 0, missing: 8 })
  })
  it.each(['gpu_length', 'max_gpu_length', 'case_width', 'board_socket', 'memory_type', 'psu_wattage', 'case_fans'])('必須の%sを欠いたら判定を止める', key => {
    const result = evaluateInput({ ...example(), [key]: '' })
    expect(result.resolved).toBeNull()
    expect(result.missing).toContain(key)
    expect(result.issues).toEqual([])
  })
  it.each(['-1', '0', '1e2', 'NaN', 'Infinity', '12,000', '1001', '20.001'])('寸法の不正値 %s を丸めたり補ったりしない', text => {
    const result = evaluateInput({ ...example(), gpu_length: text })
    expect(result.resolved).toBeNull()
    expect(result.errors.gpu_length).toBeTruthy()
  })
  it('小数2桁の寸法は保持し、個数の小数は拒否する', () => {
    expect(evaluateInput({ ...example(), gpu_length: '300.25' }).resolved?.gpu.dimensionsMm.length).toBe(300.25)
    expect(evaluateInput({ ...example(), memory_modules: '1.5' }).errors.memory_modules).toBeTruthy()
  })
  it('未知の規格を一致したと見せない', () => {
    const result = evaluateInput({ ...example(), board_socket: 'not-a-socket', cpu_socket: 'not-a-socket' })
    expect(result.resolved).toBeNull()
    expect(result.errors.board_socket).toBeTruthy()
    expect(result.errors.cpu_socket).toBeTruthy()
  })
  it('ケース外形を超える収容上限の入力を拒否する', () => {
    const result = evaluateInput({ ...example(), max_gpu_length: '600', max_cooler_height: '300', max_psu_length: '500' })
    expect(result.resolved).toBeNull()
    expect(Object.keys(result.errors).sort()).toEqual(['max_cooler_height', 'max_gpu_length', 'max_psu_length'])
  })
  it('ソケット・メモリ規格・枚数・対応基板の不一致を検出する', () => {
    const result = evaluateInput({ ...example(), cpu_socket: 'LGA1700', memory_type: 'DDR4', case_board_support: 'ITX' })
    for (const rule of ['cpu-motherboard-socket', 'memory-motherboard', 'motherboard-case']) expect(result.issues.find(issue => issue.rule === rule)?.severity).toBe('error')
    expect(evaluateInput({ ...example(), memory_modules: '8' }).issues.find(issue => issue.rule === 'memory-motherboard')?.severity).toBe('error')
    expect(evaluateInput({ ...example(), case_board_support: 'ATX', board_form_factor: 'ITX' }).issues.find(issue => issue.rule === 'motherboard-case')?.severity).toBe('error')
  })
  it('架空の電力100W+200Wと定数だけから計算する', () => {
    const result = evaluateInput(example())
    expect(result.power).toMatchObject({ complete: true, estimatedMaxW: 377, recommendedW: 500, missing: [] })
    expect(result.issues.find(issue => issue.rule === 'psu-power')?.severity).toBe('ok')
    expect(evaluateInput({ ...example(), psu_wattage: '300' }).issues.find(issue => issue.rule === 'psu-power')?.severity).toBe('error')
  })
  it('CPU/GPU電力の未入力は0Wと確定せず、下限と未確認を返す', () => {
    const result = evaluateInput({ ...example(), cpu_max_power: '', gpu_power: '' })
    expect(result.resolved).not.toBeNull()
    expect(result.resolved!.cpu.maxPowerW).toBeNull()
    expect(result.resolved!.gpu.boardPowerW).toBeNull()
    expect(result.power).toMatchObject({ complete: false, estimatedMaxW: 77, missing: ['cpu', 'gpu'] })
    expect(result.issues.find(issue => issue.rule === 'psu-power')).toMatchObject({ severity: 'warn', estimate: true })
  })
})

describe('手入力価格', () => {
  it('未入力と0円を区別して、入力済みだけを集計する', () => {
    const values: ManualInput = { ...example(), price_cpu: '0', price_gpu: '12000' }
    expect(evaluateInput(values).cost).toEqual({ total: 12000, entered: 2, missing: 6 })
    values.price_cpu = ''
    expect(evaluateInput(values).cost).toEqual({ total: 12000, entered: 1, missing: 7 })
    for (const category of CATEGORIES) values[`price_${category}`] = '0'
    expect(evaluateInput(values).cost).toEqual({ total: 0, entered: 8, missing: 0 })
  })
  it.each(['-1', '1.5', '1e3', '10000000', '12,000', 'Infinity'])('不正な価格%sを集計せず、エラーを返す', price => {
    const result = evaluateInput({ ...example(), price_cpu: price, price_gpu: '100' })
    expect(result.errors.price_cpu).toBeTruthy()
    expect(result.cost).toEqual({ total: 100, entered: 1, missing: 7 })
    expect(result.resolved).not.toBeNull()
  })
  it('最大値を全8部品に入力しても有限値で正しく合計する', () => {
    const values = example()
    for (const category of CATEGORIES) values[`price_${category}`] = '9999999'
    expect(evaluateInput(values).cost).toEqual({ total: 79_999_992, entered: 8, missing: 0 })
  })
})
