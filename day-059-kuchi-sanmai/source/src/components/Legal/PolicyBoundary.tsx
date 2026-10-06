import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { APP_NAME } from '../../appName'
import { OPERATOR, POLICIES, POLICY_DATE, POLICY_VERSIONS, policyFromHash } from '../../legal/policies'
import type { PolicyId } from '../../legal/policies'
import { LegalLinks } from './LegalFooter'
import './legal.css'

// 規約・プライバシー・Cookieの説明を、#terms / #privacy / #cookies のときだけ重ねて出す。
// 100日チャレンジ版では同意画面を置かない。スタジオは文書を読んでいる間も隠すだけで、作業中の素材は残る。

function OperatorNotice() {
  return (
    <aside className="legal-operator" data-testid="legal-operator">
      <strong>運営とお問い合わせ</strong>
      <p>運営：{OPERATOR.name}</p>
      <p>
        お問い合わせ：
        {OPERATOR.links.map((link, index) => (
          <span key={link.href}>
            {index > 0 && ' または '}
            <a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>
          </span>
        ))}
      </p>
    </aside>
  )
}

function PolicyDocument({ id, onBack }: { id: PolicyId; onBack: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
    window.scrollTo(0, 0)
    const previousTitle = document.title
    document.title = `${POLICIES[id].title} | ${APP_NAME}`
    return () => { document.title = previousTitle }
  }, [id])
  const policy = POLICIES[id]
  return (
    <main className="legal-page">
      <button className="button button-ghost" data-testid="legal-back" onClick={onBack}>← スタジオに戻る</button>
      <article className="legal-document" data-testid="legal-document">
        <p className="eyebrow">{APP_NAME} · 規約と説明</p>
        <h1 ref={heading} tabIndex={-1}>{policy.title}</h1>
        <p className="legal-version">施行・更新日：{POLICY_DATE} · 版 {POLICY_VERSIONS[id]}</p>
        <p className="legal-summary">{policy.summary}</p>
        {policy.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.items && <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
            {section.links && (
              <ul className="legal-section-links">
                {section.links.map((link) => <li key={link.href}><a href={link.href} target="_blank" rel="noopener noreferrer">{link.label} ↗</a></li>)}
              </ul>
            )}
          </section>
        ))}
        <OperatorNotice />
      </article>
      <LegalLinks />
    </main>
  )
}

export function PolicyBoundary({ children }: { children: ReactNode }) {
  const [documentId, setDocumentId] = useState(() => policyFromHash(window.location.hash))

  useEffect(() => {
    const update = () => setDocumentId(policyFromHash(window.location.hash))
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])

  function back() {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    setDocumentId(null)
    window.scrollTo(0, 0)
  }

  return (
    <>
      <div hidden={Boolean(documentId)}>{children}</div>
      {documentId && <PolicyDocument id={documentId} onBack={back} />}
    </>
  )
}
