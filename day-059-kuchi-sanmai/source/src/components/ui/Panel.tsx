import { useId, type ReactNode } from 'react'

interface PanelProps {
  title: string
  eyebrow?: string
  children: ReactNode
  className?: string
  actions?: ReactNode
}

export function Panel({ title, eyebrow, children, className = '', actions }: PanelProps) {
  const titleId = useId()
  return <section className={`panel ${className}`} aria-labelledby={titleId}>
    <div className="panel-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2 id={titleId}>{title}</h2></div>{actions}</div>
    <div className="panel-content">{children}</div>
  </section>
}
