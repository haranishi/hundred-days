import { useId, type CSSProperties } from 'react'
import { Phrases } from './Phrases'

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  formatValue?: (value: number) => string
  hint?: string
  disabled?: boolean
  'data-testid'?: string
}

export function Slider({ label, value, min, max, step = 0.01, onChange, formatValue, hint, disabled, 'data-testid': testId }: SliderProps) {
  const id = useId()
  const formatted = formatValue ? formatValue(value) : String(value)
  const percent = max > min ? Math.max(0, Math.min(100, (value - min) / (max - min) * 100)) : 0
  return <div className={`slider-field${disabled ? ' is-disabled' : ''}`}>
    <div className="control-row"><label htmlFor={id} className="field-label">{label}</label><output htmlFor={id} className="mono slider-value">{formatted}</output></div>
    <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(event.currentTarget.valueAsNumber)} disabled={disabled} data-testid={testId} aria-valuetext={formatted} aria-describedby={hint ? `${id}-hint` : undefined} style={{ '--range-progress': `${percent}%` } as CSSProperties} />
    {hint && <p id={`${id}-hint`} className="hint"><Phrases text={hint} /></p>}
  </div>
}
