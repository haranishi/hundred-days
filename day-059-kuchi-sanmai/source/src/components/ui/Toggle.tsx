import { useId } from 'react'
import { Phrases } from './Phrases'

interface ToggleProps {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
  hint?: string
  disabled?: boolean
  'data-testid'?: string
}

export function Toggle({ label, checked, onChange, hint, disabled, 'data-testid': testId }: ToggleProps) {
  const id = useId()
  return <div className={`toggle-field${disabled ? ' is-disabled' : ''}`}>
    <label htmlFor={id}><span className="field-label">{label}</span>{hint && <span id={`${id}-hint`} className="hint"><Phrases text={hint} /></span>}</label>
    <input id={id} className="toggle" type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} disabled={disabled} data-testid={testId} aria-describedby={hint ? `${id}-hint` : undefined} />
  </div>
}
