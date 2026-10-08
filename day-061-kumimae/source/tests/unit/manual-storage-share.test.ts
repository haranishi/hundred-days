import { describe, expect, it } from 'vitest'
import { EXAMPLES, emptyInput, type ManualInput } from '../../src/domain/manual'
import { decodeShare, encodeShare, memoOf } from '../../src/manual/sharing'
import { readPlan, writePlan, STORAGE_KEY, type StorageLike } from '../../src/manual/storage'

const values = (): ManualInput => ({ ...EXAMPLES[0]!.values, name_gpu: '自分のカード <script>', price_gpu: '48000' })
function store(text: string | null = null): StorageLike {
  return { getItem: () => text, setItem: (_, value) => { text = value }, removeItem: () => { text = null } }
}
describe('仕様の持ち帰りと端末保存', () => {
  it('共有URLは日本語と仕様を復元し、価格を含めない', () => {
    const original = values()
    const url = new URL(encodeShare(original))
    expect(url.pathname).toBe('/day-061-kumimae/')
    const restored = decodeShare(url.hash)!
    expect(restored.name_gpu).toBe(original.name_gpu)
    expect(restored.gpu_length).toBe(original.gpu_length)
    expect(restored.price_gpu).toBe('')
    expect(original.price_gpu).toBe('48000')
  })
  it.each(['#spec=%%%','###','#spec=ab','#spec='+ 'a'.repeat(17000)])('壊れた共有URLを受け入れない：%s', hash => {
    expect(decodeShare(hash)).toBeNull()
  })
  it('未知の共有版・未知のキー・型が不正な値は拒否する', () => {
    for (const data of [{v:2,values:values()},{v:1,values:{...values(),secret:'bad'}},{v:1,values:{...values(),gpu_length:300}}]) {
      const hash = '#spec=' + Buffer.from(JSON.stringify(data), 'utf8').toString('base64url')
      expect(decodeShare(hash)).toBeNull()
    }
  })
  it('改変URLに埋め込まれた価格も除去する', () => {
    const data = JSON.stringify({v:1,values:{...emptyInput(),price_gpu:'48000'}})
    expect(decodeShare('#spec='+btoa(data).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''))?.price_gpu).toBe('')
  })
  it('メモは価格・未確認・入力仕様を保持する', () => {
    const text = memoOf(values())
    expect(text).toContain('48,000')
    expect(text).toContain('300 mm')
    expect(text).toContain('7件未入力')
    expect(text).toContain('未確認')
    expect(text).not.toContain('公式データ')
  })
  it('端末保存には価格を残し、共有リンクの読込時は金額を混ぜない', () => {
    const storage = store()
    const plan = {version:1 as const,values:values(),color:'black' as const}
    expect(writePlan(storage, plan)).toBe(true)
    expect(readPlan(storage).plan).toEqual(plan)
    const imported = readPlan(storage, new URL(encodeShare(values())).hash)
    expect(imported.plan.values.price_gpu).toBe('')
    expect(imported.imported).toBe(true)
  })
  it('壊れた共有リンクでも、保存済みの構成を失わない', () => {
    const storage = store(JSON.stringify({version:1,values:values(),color:'white'}))
    const result = readPlan(storage,'#spec=broken')
    expect(result.plan.values.price_gpu).toBe('48000')
    expect(result.notice).toContain('共有リンクを読み込めません')
  })
  it('保存が拒否された端末では失敗を返し、操作用の初期値は使える', () => {
    const denied = {getItem:()=>{throw new Error('denied')},setItem:()=>{throw new Error('denied')},removeItem:()=>{}}
    expect(writePlan(denied, {version:1,values:values(),color:'white'})).toBe(false)
    expect(readPlan(denied).notice).not.toBe('')
    expect(readPlan(denied).plan.values).toEqual(EXAMPLES[0]!.values)
  })
  it.each(['{broken','x'.repeat(25000),JSON.stringify({version:99,values:{},color:'white'})])('壊れた保存を安全に初期化する', text => {
    expect(readPlan(store(text)).notice).not.toBe('')
    expect(readPlan(store(text)).plan.values).toEqual(EXAMPLES[0]!.values)
  })
  it('ページ内リンクを仕様リンクと誤認しない', () => {
    expect(readPlan(store(),'#results').notice).toBe('')
    expect(STORAGE_KEY).toContain('day061')
  })
})
