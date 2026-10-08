/**
 * 公開先に関わる設定はここ1か所にまとめる。
 * index.html の title・description・canonical・OGP は、ビルド時にここから差し込む（vite.config.ts の siteMeta）。
 */
export const SITE = {
  url: 'https://hundred-days.pages.dev/day-061-kumimae/',
  name: 'くみまえ',
  title: 'くみまえ｜入力した寸法で確かめるPC構成チェッカー',
  description:
    '自分で入力したPCパーツの寸法と規格を3Dの模式図で確認。組合せの注意点、電力の目安、価格メモをまとめられます。',
  ogImagePath: 'og.png',
} as const

export type SiteConfig = {
  readonly url: string
  readonly name: string
  readonly title: string
  readonly description: string
  readonly ogImagePath: string
}

/** OGP の画像は絶対 URL で出す（SNS のクローラーが相対パスを解決しないため） */
export function absoluteUrl(path: string, site: SiteConfig = SITE): string {
  return site.url.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '')
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * index.html の差し込み口を埋める。Vite の %ENV% 置換と混ざらないよう __KUMIMAE_*__ の形にしている。
 */
export function applySiteTokens(html: string, site: SiteConfig = SITE): string {
  const tokens: Record<string, string> = {
    __KUMIMAE_URL__: site.url,
    __KUMIMAE_NAME__: site.name,
    __KUMIMAE_TITLE__: site.title,
    __KUMIMAE_DESCRIPTION__: site.description,
    __KUMIMAE_OG_IMAGE__: absoluteUrl(site.ogImagePath, site),
  }
  return html.replace(/__KUMIMAE_[A-Z_]+__/g, (token) => {
    const value = tokens[token]
    if (value === undefined) throw new Error(`index.html に知らない差し込み口があります: ${token}`)
    return escapeHtml(value)
  })
}
