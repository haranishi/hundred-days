import { FIELDS, normalizeInput, evaluateInput, type ManualInput } from '../domain/manual'
import { CATEGORY_LABELS, CATEGORIES } from '../domain/types'
import { SITE } from '../config/site'

const LIMIT = 16000
export function encodeShare(values: ManualInput): string {
  const clean = { ...values }
  for (const key of Object.keys(clean)) if (key.startsWith('price_')) clean[key] = ''
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, values: clean }))
  const data = btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
  if (data.length > LIMIT) throw new Error('共有する文字数が多すぎます。部品名を短くしてください。')
  return `${SITE.url}#spec=${data}`
}
export function decodeShare(hash: string): ManualInput | null {
  try {
    if (!/^#spec=[A-Za-z0-9_-]+$/.test(hash) || hash.length > LIMIT + 6) return null
    const text = hash.slice(6).replaceAll('-', '+').replaceAll('_', '/')
    const binary = atob(text)
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, c => c.charCodeAt(0))))
    if (parsed?.v !== 1) return null
    const values = normalizeInput(parsed.values)
    if (!values) return null
    // 共有URLから金額が入る仕様にはしない。改変されたURLでも除去する。
    for (const key of Object.keys(values)) if (key.startsWith('price_')) values[key] = ''
    return values
  } catch { return null }
}
export const yen = (n: number) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(n)
export function memoOf(values: ManualInput): string {
  const result = evaluateInput(values)
  const sections = CATEGORIES.map(category => {
    const fields = FIELDS.filter(f => f.category === category && !f.key.startsWith('name_'))
    return [`### ${CATEGORY_LABELS[category]}${values[`name_${category}`] ? `：${values[`name_${category}`].replace(/[\r\n]/g, ' ')}` : ''}`,
      ...fields.map(f => `- ${f.label}：${values[f.key] === '' ? '未入力' : (f.options?.find(o => o.value === values[f.key])?.label ?? values[f.key]) + (f.unit ? ` ${f.unit}` : '')}`)].join('\n')
  })
  return ['# くみまえ — PC構成メモ', '初期値は架空の作例です。入力した値に基づく模式図・概算で、動作や取付けの保証ではありません。', ...sections,
    '## 確認結果', ...result.issues.map(i => `- ${i.severity === 'error' ? '要修正' : i.severity === 'warn' ? '要確認' : '入力上OK'}：${i.title} — ${i.message}`),
    ...Object.entries(result.errors).map(([key, value]) => `- 入力エラー：${FIELDS.find(f => f.key === key)?.label ?? key} — ${value}`),
    ...result.missing.map(key => `- 未入力：${FIELDS.find(f => f.key === key)?.label ?? key}`),
    `入力価格の小計：${yen(result.cost.total)}（${result.cost.entered}/8入力・${result.cost.missing}件未入力）`,
    'BIOS対応、冷却性能、ケーブルの取り回し、取り付け金具は別途確認してください。', SITE.url].join('\n\n')
}
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export async function imageOf(values: ManualInput, source: HTMLCanvasElement | null): Promise<Blob> {
  if (!source || !source.width || !source.height) throw new Error('3Dの準備ができていません。構成メモをご利用ください。')
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 900
  const c = canvas.getContext('2d'); if (!c) throw new Error('画像を作成できません。')
  c.fillStyle = '#10131a'; c.fillRect(0, 0, 1200, 900)
  c.fillStyle = '#f1f2f8'; c.font = 'bold 38px system-ui'; c.fillText('くみまえ / PC構成メモ', 44, 64)
  c.font = '20px system-ui'; c.fillStyle = '#c1b2ed'; c.fillText('入力寸法による模式図・初期値は架空の作例', 44, 104)
  const scale = Math.min(760 / source.width, 650 / source.height)
  c.drawImage(source, 30 + (760 - source.width * scale) / 2, 130 + (650 - source.height * scale) / 2, source.width * scale, source.height * scale)
  c.font = '20px system-ui'
  CATEGORIES.forEach((category, index) => {
    c.fillStyle = '#b4bdcf'; c.fillText(CATEGORY_LABELS[category], 820, 165 + index * 61)
    c.fillStyle = '#f1f2f8'; const value = values[`name_${category}`]?.trim() || '名称未入力'
    c.fillText(value.length > 20 ? value.slice(0, 19) + '…' : value, 820, 191 + index * 61, 345)
  })
  const result = evaluateInput(values)
  c.fillStyle = '#d7c9ff'; c.font = 'bold 27px system-ui'; c.fillText(`入力価格の小計 ${yen(result.cost.total)}`, 44, 805)
  c.font = '19px system-ui'; c.fillStyle = '#b4bdcf'; c.fillText(`${result.cost.entered}/8入力 · 未入力${result.cost.missing}件 · 判定と入力値は構成メモで確認`, 44, 840)
  c.fillText(SITE.url, 44, 875)
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('画像を作成できません。')), 'image/png'))
}
