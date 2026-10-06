import { describe, expect, it } from 'vitest'
import { APP_NAME } from '../appName'
import { plainText } from '../lib/phrases'
import { IMAGE_RIGHTS_NOTICE, MIC_PLACE_NOTICE, VOICE_RIGHTS_NOTICE } from './notices'
import { OPERATOR, POLICIES, POLICY_DATE, POLICY_VERSIONS, SITE_PRIVACY } from './policies'

const text = JSON.stringify(POLICIES)

describe('運営者の表記（100日チャレンジ版）', () => {
  it('100 DAYS / 100 APPS の表記と、サイト共通の窓口（X と GitHub の Issue）を使う', () => {
    expect(OPERATOR.name).toBe('100 DAYS / 100 APPS（haranishi）')
    expect(OPERATOR.contact).toBe('X の @haranishi_ikki または GitHub の Issue')
    expect(OPERATOR.links.map((link) => link.href)).toEqual([
      'https://x.com/haranishi_ikki',
      'https://github.com/haranishi/hundred-days/issues',
    ])
    expect(text).toContain(OPERATOR.name)
  })

  it('文書にメールアドレスの形の文字列が無い', () => {
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
  })
})

describe('配信の実際に合わせた文', () => {
  it('ローカル版・一般公開前・同意の保存と撤回の文が残っていない', () => {
    expect(text).not.toMatch(/ローカル版|一般公開に先立ち|同意を撤回|同意を保存|プライバシー設定|180日/)
  })

  it('共通のプライバシーポリシーへ案内し、アクセス解析が無いことを書く', () => {
    expect(SITE_PRIVACY.href).toBe('https://hundred-days.pages.dev/privacy.html')
    expect(text).toContain(SITE_PRIVACY.href)
    expect(text).toContain('Cloudflare Pages')
    expect(text).toContain('このアプリのページにアクセス解析はありません')
  })

  it('版と日付を 2026-10-06 にそろえる', () => {
    expect(POLICY_DATE).toBe('2026年10月6日')
    expect(Object.values(POLICY_VERSIONS)).toEqual(['2026-10-06.1', '2026-10-06.1', '2026-10-06.1'])
  })

  it('アプリの名前は APP_NAME から入る', () => {
    expect(POLICIES.terms.summary.startsWith(APP_NAME)).toBe(true)
    expect(text).toContain(`「${APP_NAME}」`)
  })
})

describe('選ぶ欄の注意書き', () => {
  it('画像・声・マイクの注意に、許可と実在の人物の扱いを書く（文節の区切りを外した文で見る）', () => {
    expect(plainText(IMAGE_RIGHTS_NOTICE)).toContain('SNSなどへの投稿には許可が要ることがあります')
    expect(plainText(VOICE_RIGHTS_NOTICE)).toContain('本人や権利者の許可なく使わないでください')
    expect(plainText(VOICE_RIGHTS_NOTICE)).toContain('実在の人物が言っていないこと')
    expect(plainText(MIC_PLACE_NOTICE)).toBe('周りの人の声が入らない場所で使ってください。')
  })

  it('注意書きの全文は、権利の調べで決めた文言のまま（削らない）', () => {
    expect(plainText(IMAGE_RIGHTS_NOTICE)).toBe('他の人が描いたキャラクター・イラスト・写真は、作者や権利者が決めた利用条件（ガイドラインや配布素材の規約）の範囲で使ってください。自分で見るだけなら使える場合でも、SNSなどへの投稿には許可が要ることがあります。')
    expect(plainText(VOICE_RIGHTS_NOTICE)).toBe('他の人の声（声優・配信者・友だちの録音、アニメ・ドラマ・歌の切り抜き）は、本人や権利者の許可なく使わないでください。実在の人物が言っていないことを言っているように見える動画は、作らず、公開しないでください。読み上げソフト・AI音声・OSの読み上げ音声は、提供元の規約で公開が制限されていることがあります。')
  })
})
