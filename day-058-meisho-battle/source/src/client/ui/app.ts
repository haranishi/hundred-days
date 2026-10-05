// app-context.ts の AppContext の本体。画面の登録と切り替え、ゲームの始め方を持つ。
// - 画面は1つずつ。go(name) で今の画面を片付けて（unmount）、次の画面を uiRoot に置く（mount）
// - ゲームの進行（GameSession）はゲーム画面と結果の画面をまたいで生きる。それ以外の画面へ移るときに片付ける（leave）
// - 登録されていない画面へ移ろうとしたら「準備中」を出す（ネット対戦の画面がまだ無いときなど）

import { LocalSession } from '../game/local-session'
import { settingsRecentStore } from '../game/recent'
import type { GameSession } from '../game/session'
import { exposeLocalSession } from '../game/test-hook'
import type { UrlOptions } from '../game/url-options'
import type { AppContext, LocalGameOptions, Screen, ScreenFactory, Settings } from './app-context'
import type { GameAudio } from '../audio'
import type { ViewProxy } from './backdrop'
import { showTitleBackdrop } from './backdrop'
import { focusHeading, h } from './dom'

/** ゲームの進行を持ち続ける画面 */
const SESSION_SCREENS = new Set(['game', 'result'])

export interface AppOptions {
  uiRoot: HTMLElement
  view: ViewProxy
  audio: GameAudio
  settings: Settings
  url: UrlOptions
}

export class App implements AppContext {
  readonly uiRoot: HTMLElement
  readonly view: ViewProxy
  readonly audio: GameAudio
  readonly settings: Settings
  readonly url: UrlOptions
  private readonly screens = new Map<string, ScreenFactory>()
  private current: { name: string; screen: Screen } | null = null
  private session: GameSession | null = null

  constructor(opts: AppOptions) {
    this.uiRoot = opts.uiRoot
    this.view = opts.view
    this.audio = opts.audio
    this.settings = opts.settings
    this.url = opts.url
  }

  /** いまの画面の名前 */
  get screenName(): string | null {
    return this.current?.name ?? null
  }

  registerScreen(name: string, factory: ScreenFactory): void {
    this.screens.set(name, factory)
  }

  go(name: string, params?: unknown): void {
    if (!SESSION_SCREENS.has(name)) this.endSession()
    const prev = this.current
    this.current = null
    if (prev) {
      try {
        prev.screen.unmount()
      } catch (err) {
        console.error(`[app] ${prev.name} の片付けで誤り`, err)
      }
    }
    this.uiRoot.replaceChildren()
    const factory = this.screens.get(name)
    let screen: Screen
    try {
      screen = factory ? factory(this, params) : notReadyScreen(this)
    } catch (err) {
      console.error(`[app] ${name} の画面を作れなかった`, err)
      screen = errorScreen(this)
    }
    const entry = { name, screen }
    this.current = entry
    this.uiRoot.dataset.screen = name
    try {
      screen.mount(this.uiRoot)
    } catch (err) {
      console.error(`[app] ${name} の画面を出せなかった`, err)
      if (this.current === entry) {
        this.uiRoot.replaceChildren()
        const fallback = errorScreen(this)
        this.current = { name: 'error', screen: fallback }
        fallback.mount(this.uiRoot)
      }
    }
  }

  startLocalGame(opts: LocalGameOptions): void {
    const session = new LocalSession({
      mode: opts.mode,
      scope: opts.scope,
      level: opts.level,
      seed: this.url.seed,
      speed: this.url.speed,
      recent: settingsRecentStore(this.settings),
    })
    this.startSession(session, opts.notice ? { notice: opts.notice } : undefined)
  }

  startSession(session: GameSession, opts?: { notice?: string }): void {
    if (this.session && this.session !== session) this.endSession()
    this.session = session
    // 自動テストの窓口は、ひとり・ふたりのときだけ（ネット対戦では正解を出さない）
    exposeLocalSession(this.url.test && session instanceof LocalSession ? session : null)
    this.go('game', opts?.notice ? { session, notice: opts.notice } : { session })
  }

  private endSession(): void {
    const s = this.session
    if (!s) return
    this.session = null
    exposeLocalSession(null)
    try {
      s.leave()
    } catch (err) {
      console.error('[app] ゲームの片付けで誤り', err)
    }
  }
}

/** 登録されていない画面（ネット対戦の画面がまだ無いときなど） */
function notReadyScreen(ctx: AppContext): Screen {
  return simpleNotice(ctx, '準備中です', 'この画面はまだ用意できていません。', true)
}

function errorScreen(ctx: AppContext): Screen {
  return simpleNotice(ctx, 'うまく表示できませんでした', '画面を作るところで問題が起きました。タイトルからやり直してください。', true)
}

/** 見出しと短い文だけの画面 */
export function simpleNotice(ctx: AppContext, title: string, body: string, withBack: boolean): Screen {
  let section: HTMLElement | null = null
  return {
    mount(root) {
      try {
        showTitleBackdrop(ctx)
      } catch {
        // 描画が使えなくても文は出す
      }
      section = h(
        'section',
        { class: 'screen menu notice' },
        h(
          'div',
          { class: 'card' },
          h('h1', null, title),
          h('p', null, body),
          withBack ? h('button', { type: 'button', class: 'btn btn-secondary btn-block', on: { click: () => ctx.go('title') } }, 'タイトルへ') : null,
        ),
      )
      root.appendChild(section)
      focusHeading(section)
    },
    unmount() {
      section?.remove()
      section = null
    },
  }
}
