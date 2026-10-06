import { OPERATOR } from '../../legal/policies'

// ライセンス表示は公開フォルダの中（/day-…/legal/）にある。サイトの根元を指さないよう、BASE_URL（ビルドでは ./）から組む。
const NOTICES_HREF = `${import.meta.env.BASE_URL}legal/THIRD_PARTY_NOTICES.txt`

export function LegalLinks() {
  return (
    <nav className="legal-links" aria-label="規約・データの取扱い">
      <a href="#terms">利用規約</a>
      <a href="#privacy">プライバシーポリシー</a>
      <a href="#cookies">Cookie・端末保存</a>
      <a href={NOTICES_HREF} target="_blank" rel="noopener noreferrer" data-testid="third-party-notices">第三者ライセンス ↗</a>
    </nav>
  )
}

export function LegalFooter() {
  return (
    <div className="legal-footer">
      <LegalLinks />
      <p className="legal-operator-line"><span>運営：{OPERATOR.name}</span><span>お問い合わせ：{OPERATOR.contact}</span></p>
    </div>
  )
}
