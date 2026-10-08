import { useEffect, useId, useRef, type ChangeEvent } from 'react'
import { FIELDS, type ManualInput } from '../domain/manual'
import { CATEGORIES, CATEGORY_LABELS, type Category } from '../domain/types'
import './editor.css'

export interface EditorProps {
  values: ManualInput
  onChange: (key: string, value: string) => void
  category: Category
  onCategoryChange: (category: Category) => void
  errors: Record<string, string>
}

type Field = (typeof FIELDS)[number]

const DESCRIPTIONS: Record<Category, string> = {
  case: 'ケースの外寸と、内部に収められる部品の大きさを確認します。',
  motherboard: '基板の規格を、ケース・CPU・メモリと照らし合わせます。',
  cpu: 'ソケットと消費電力の目安を入力して、組み合わせを確認します。',
  cooler: '空冷クーラーの高さを入力して、ケースに収まるか確認します。',
  memory: 'メモリの規格・枚数・高さを入力します。規格と枚数を基板に照らし合わせます。',
  gpu: 'GPUの長さをケースと照らし合わせます。高さと厚みは追加の仕様へ。',
  storage: 'SSDの名前と価格をメモします。接続規格の判定は行いません。',
  psu: '電源の奥行きと容量を入力して、収まり方と電力の余裕を確認します。',
}

function rangeText(field: Field): string | null {
  if (field.kind !== 'number' || (field.min === undefined && field.max === undefined)) return null
  const number = (n: number) => n.toLocaleString('ja-JP')
  const range = field.min !== undefined && field.max !== undefined
    ? `${number(field.min)}〜${number(field.max)}`
    : field.min !== undefined ? `${number(field.min)}以上` : `${number(field.max!)}以下`
  return `入力範囲：${range}${field.unit ? ` ${field.unit}` : ''}`
}

function InputField({ field, value, error, onChange }: {
  field: Field
  value: string
  error?: string
  onChange: EditorProps['onChange']
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const range = rangeText(field)
  const hasHint = Boolean(field.help || range)
  const describedBy = [hasHint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  const options = field.options?.filter(option => option.value !== '') ?? []
  const unknownOption = field.kind === 'select' && value !== '' && !options.some(option => option.value === value)
  const attributes = {
    id,
    name: field.key,
    value,
    'aria-invalid': error ? true as const : undefined,
    'aria-describedby': describedBy,
    'data-field': field.key,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange(field.key, event.currentTarget.value),
  }

  return <div className="manual-editor__field" data-kind={field.kind} data-invalid={error ? 'true' : undefined}>
    <label className="manual-editor__label" htmlFor={id}>
      <span>{field.label}</span>
      {field.unit && <span className="manual-editor__unit">（{field.unit}）</span>}
    </label>
    {field.kind === 'select'
      ? <select {...attributes}>
          <option value="">未入力・不明</option>
          {unknownOption && <option value={value}>未対応の値：{value}</option>}
          {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      : <input {...attributes}
          type="text"
          inputMode={field.kind === 'number' ? 'decimal' : 'text'}
          autoComplete="off"
          spellCheck={false}
          maxLength={field.kind === 'text' ? 80 : 32}
          placeholder={field.kind === 'number' ? '未入力' : '任意で入力'}
        />}
    {hasHint && <p className="manual-editor__hint" id={hintId}>
      {field.help && <span>{field.help}</span>}
      {range && <span>{range}</span>}
    </p>}
    {error && <p className="manual-editor__error" id={errorId}><span aria-hidden="true">!</span>{error}</p>}
  </div>
}

function CategoryFields({ values, category, errors, onChange }: Omit<EditorProps, 'onCategoryChange'>) {
  const fields = FIELDS.filter(field => field.category === category)
  // 大きさを先に確かめられるよう、基本項目の中では寸法を前へ。追加仕様は折り畳みに残す。
  const basic = fields.filter(field => !field.advanced).sort((a, b) => Number(b.unit === 'mm') - Number(a.unit === 'mm'))
  const advanced = fields.filter(field => field.advanced)
  const details = useRef<HTMLDetailsElement>(null)
  const advancedErrors = advanced.filter(field => Boolean(errors[field.key]))
  const advancedErrorKeys = advancedErrors.map(field => field.key).join('|')
  useEffect(() => {
    // 復元した値にエラーがあれば、折り畳みの中に隠さない。
    if (advancedErrorKeys && details.current) details.current.open = true
  }, [advancedErrorKeys])
  const input = (field: Field) => <InputField key={field.key} field={field} value={values[field.key] ?? ''} error={errors[field.key]} onChange={onChange} />

  return <>
    <div className="manual-editor__fields">{basic.map(input)}</div>
    {advanced.length > 0 && <details className="manual-editor__advanced" ref={details}>
      <summary>
        <span className="manual-editor__disclosure" aria-hidden="true">＋</span>
        <span>追加の仕様</span>
        <span className="manual-editor__advanced-count">{advancedErrors.length ? `${advancedErrors.length}項目を確認` : `${advanced.length}項目`}</span>
      </summary>
      <div className="manual-editor__fields">{advanced.map(input)}</div>
    </details>}
  </>
}

export function Editor({ values, onChange, category, onCategoryChange, errors }: EditorProps) {
  const id = useId()
  const titleId = `${id}-title`
  const categoryId = `${id}-category`
  const number = String(CATEGORIES.indexOf(category) + 1).padStart(2, '0')

  return <section className="manual-editor" aria-labelledby={titleId}>
    <header className="manual-editor__header">
      <div className="manual-editor__eyebrow"><span>寸法と仕様</span><span>入力すると反映</span></div>
      <div className="manual-editor__category-row">
        <span className="manual-editor__number" aria-hidden="true">{number}<small> / 08</small></span>
        <div className="manual-editor__category-control">
          <label htmlFor={categoryId}>入力する部品</label>
          <select id={categoryId} value={category} onChange={event => onCategoryChange(event.currentTarget.value as Category)}>
            {CATEGORIES.map((value, index) => <option key={value} value={value}>{index + 1}. {CATEGORY_LABELS[value]}</option>)}
          </select>
        </div>
      </div>
      <h2 id={titleId}>{CATEGORY_LABELS[category]}を確かめる</h2>
      <p className="manual-editor__description">{DESCRIPTIONS[category]}</p>
      <p className="manual-editor__empty-note">分からない値は空欄に。空欄は「未確認」として扱います。</p>
    </header>
    <CategoryFields key={category} values={values} onChange={onChange} category={category} errors={errors} />
  </section>
}
