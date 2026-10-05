// ゲーム画面（ひとり・ふたり・ネットで共通）。GameSession だけを見て描き、どの遊び方かは知らない。
//
// 骨格（docs/02 ④）：模型が画面全体。上の帯に「第3問／8」と得点、その下に進み具合の帯と「いま押すと◯点」。
// 下に早押しボタン（ひとり・ネットは中央に1つ、ふたりは左下と右下）。押した人が出たら模型は止まり、
// 画面の下半分に4択（2×2）と残り時間、押した人の色の枠。まちがいは「−200」と締め出しをはっきり見せる。
// 答えあわせはカード（スマホは下から、広い画面は右の板）。ひとり・ふたりは「次へ」で早送りできる。
//
// 状態が変わったとき（subscribe）に表示を作り直し、毎フレーム（requestAnimationFrame）は
// 進み具合・残り時間・ボタンの押せる／押せないだけを更新する。

import { ANSWER_MS, MIN_POINTS, REVEAL_MS, WRONG_PENALTY } from '../../../shared/config'
import { getLandmark } from '../../../shared/landmarks'
import { pointsAt } from '../../../shared/rules'
import type { Attempt, PlayerState, PublicGameState, QuestionResult } from '../../../shared/types'
import { LocalSession } from '../../game/local-session'
import type { ConnectionStatus, GameSession } from '../../game/session'
import type { AppContext, Screen } from '../app-context'
import { openConfirm, type ConfirmHandle } from '../confirm'
import { append, formatDelta, formatPoints, h, setAttr, setDisabled, setHidden, setText } from '../dom'
import { lookOf, shapeIcon, slotLabel, spokenName } from '../players'
import { createRevealCard, nameAfterSlot, type RevealCard } from './reveal-card'

export interface GameScreenParams {
  session: GameSession
  notice?: string
}

function readParams(raw: unknown): GameScreenParams | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as { session?: unknown; notice?: unknown }
  if (!p.session || typeof p.session !== 'object') return null
  const out: GameScreenParams = { session: p.session as GameSession }
  if (typeof p.notice === 'string' && p.notice !== '') out.notice = p.notice
  return out
}

export function createGameScreen(ctx: AppContext, raw: unknown): Screen {
  const params = readParams(raw)
  if (!params) {
    // ゲームが無いのにゲーム画面へ来た（作りの誤り）。タイトルへ戻す
    return {
      mount: () => queueMicrotask(() => ctx.go('title')),
      unmount: () => {},
    }
  }
  return new GameScreen(ctx, params)
}

interface Chip {
  el: HTMLElement
  score: HTMLElement
  pops: HTMLElement
}

interface Buzzer {
  btn: HTMLButtonElement
  pops: HTMLElement
  key: string
}

/** 押す・答えるのキー（ひとり・ネットは Space、ふたりは F と J） */
function buzzerKeys(mode: GameSession['mode'], count: number): string[] {
  if (mode === 'duo') return ['F', 'J'].slice(0, count)
  return ['Space']
}

function digitOf(e: KeyboardEvent): number | null {
  const m = /^(?:Digit|Numpad)([1-4])$/.exec(e.code)
  if (m) return Number(m[1])
  if (/^[1-4]$/.test(e.key)) return Number(e.key)
  return null
}

const OPEN_PHASES = new Set(['building', 'lastcall'])

class GameScreen implements Screen {
  private readonly ctx: AppContext
  private readonly session: GameSession
  private readonly notice: string | undefined
  private readonly local: readonly string[]

  private section!: HTMLElement
  private qNum!: HTMLElement
  private qTotal!: HTMLElement
  private chipList!: HTMLElement
  private readonly chips = new Map<string, Chip>()
  private meter!: HTMLElement
  private meterFill!: HTMLElement
  private meterText!: HTMLElement
  private conn!: HTMLElement
  private toast!: HTMLElement
  private center!: HTMLElement
  private readonly buzzers = new Map<string, Buzzer>()
  private answer!: HTMLElement
  private answerHead!: HTMLElement
  private answerTimerFill!: HTMLElement
  private choices: HTMLButtonElement[] = []
  private revealHost!: HTMLElement
  private reveal: RevealCard | null = null
  private revealIndex = -1
  private livePolite!: HTMLElement
  private liveAssertive!: HTMLElement
  private dialog: ConfirmHandle | null = null

  private prev: PublicGameState | null = null
  private raf = 0
  private unsub: (() => void) | null = null
  private shownQuestion = -1
  private completeShown = -1
  private choicesFor = -1
  private lastCount = 0
  private lastConn: ConnectionStatus = 'ok'
  private toastTimer: ReturnType<typeof setTimeout> | null = null
  private toResult = false
  private alive = false
  private modelReady = true
  private offModelReady: (() => void) | undefined

  constructor(ctx: AppContext, params: GameScreenParams) {
    this.ctx = ctx
    this.session = params.session
    this.notice = params.notice
    this.local = params.session.localPlayerIds
  }

  // ── 画面の出し入れ ──

  mount(root: HTMLElement): void {
    this.alive = true
    this.build()
    root.appendChild(this.section)
    this.ctx.view.setInteractive(true)
    this.ctx.audio.setBgmPlaying(true)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    this.offModelReady = this.ctx.view.onModelReady?.(() => {
      if (!this.alive) return
      this.modelReady = true
      if (this.session instanceof LocalSession) this.session.resume('model-loading')
    })
    this.unsub = this.session.subscribe((s) => this.onState(s))
    this.onState(this.session.getState())
    this.session.begin()
    if (this.notice) {
      this.showToast(this.notice, 7000)
      this.say(this.notice)
    }
    this.raf = requestAnimationFrame(this.frame)
  }

  unmount(): void {
    this.alive = false
    this.offModelReady?.()
    this.offModelReady = undefined
    cancelAnimationFrame(this.raf)
    this.unsub?.()
    this.unsub = null
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.dialog?.close()
    this.dialog = null
    if (this.toastTimer !== null) clearTimeout(this.toastTimer)
    this.ctx.audio.setBgmPlaying(false)
    this.section.remove()
  }

  // ── 組み立て ──

  private build(): void {
    const s = this.session.getState()
    const mode = this.session.mode

    this.qNum = h('b', { class: 'q-num' })
    this.qTotal = h('span', { class: 'q-total' })
    this.chipList = h('ul', { class: 'chips', 'aria-label': '得点' })
    for (const p of s.players) this.addChip(p)

    this.meterFill = h('span', { class: 'meter-fill' })
    this.meterText = h('p', { class: 'meter-text' })
    this.meter = h(
      'div',
      { class: 'meter' },
      h('span', { class: 'meter-track', 'aria-hidden': 'true' }, this.meterFill, h('span', { class: 'meter-paint' })),
      this.meterText,
    )

    const quit = h('button', { type: 'button', class: 'btn btn-quit', on: { click: () => this.openQuit() } }, 'やめる')

    // 接続の帯と知らせは、上の帯のすぐ下に浮かせる（帯の高さが画面幅で変わっても重ならない）
    this.conn = h('div', { class: 'conn-banner', role: 'status', hidden: true })
    this.toast = h('div', { class: 'toast', 'aria-hidden': 'true', hidden: true })

    const top = h(
      'header',
      { class: 'hud-top' },
      h(
        'div',
        { class: 'hud-row' },
        h('h1', { class: 'q-label' }, h('span', { class: 'q-dai' }, '第'), this.qNum, h('span', { class: 'q-mon' }, '問'), this.qTotal),
        this.chipList,
        quit,
      ),
      this.meter,
      h('div', { class: 'hud-float' }, this.conn, this.toast),
    )

    this.center = h('div', { class: 'center-call', 'aria-hidden': 'true' })

    // 早押しボタン：この端末で操作するプレイヤーの分だけ
    const keys = buzzerKeys(mode, this.local.length)
    const buzzerRow = h('div', { class: `buzzers count-${this.local.length}` })
    this.local.forEach((pid, i) => {
      const p = s.players.find((x) => x.id === pid)
      const slot = p?.slot ?? i
      const key = keys[i] ?? ''
      const b = this.makeBuzzer(pid, slot, key, mode === 'duo' ? (i === 0 ? '左' : '右') : '')
      this.buzzers.set(pid, b)
      buzzerRow.appendChild(b.btn)
    })

    // 4択（2×2）
    this.answerHead = h('p', { class: 'answer-head' })
    this.answerTimerFill = h('span', { class: 'answer-timer-fill' })
    this.choices = [0, 1, 2, 3].map((i) =>
      h(
        'button',
        { type: 'button', class: 'choice', 'data-index': i, on: { click: () => this.choose(i) } },
        h('span', { class: 'choice-num', 'aria-hidden': 'true' }, String(i + 1)),
        h('span', { class: 'choice-text' }, h('span', { class: 'choice-name' }), h('span', { class: 'choice-place' })),
      ),
    )
    this.answer = h(
      'section',
      { class: 'answer', hidden: true, 'aria-label': '4択' },
      this.answerHead,
      h('span', { class: 'answer-timer', 'aria-hidden': 'true' }, this.answerTimerFill),
      h('div', { class: 'choices' }, ...this.choices),
    )

    this.revealHost = h('div', { class: 'reveal-host' })
    this.livePolite = h('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' })
    this.liveAssertive = h('div', { class: 'sr-only', 'aria-live': 'assertive', 'aria-atomic': 'true' })

    this.section = h(
      'section',
      { class: `screen game mode-${mode}`, 'data-mode': mode, 'data-phase': s.phase },
      h('div', { class: 'answer-frame', 'aria-hidden': 'true' }),
      top,
      this.center,
      buzzerRow,
      this.answer,
      this.revealHost,
      this.livePolite,
      this.liveAssertive,
    )
  }

  private addChip(p: PlayerState): void {
    const look = lookOf(p.slot)
    const score = h('span', { class: 'chip-score' }, formatPoints(p.score))
    const pops = h('span', { class: 'chip-pops', 'aria-hidden': 'true' })
    const keyIndex = this.local.indexOf(p.id)
    const key = this.session.mode === 'duo' && keyIndex >= 0 ? (keyIndex === 0 ? 'F' : 'J') : ''
    const el = h(
      'li',
      {
        class: 'chip',
        'data-player': p.id,
        'data-slot': p.slot,
        style: `--pc:${look.color};--pc-ink:${look.ink}`,
      },
      shapeIcon(p.slot, 18),
      h(
        'span',
        { class: 'chip-main' },
        h(
          'span',
          { class: 'chip-id' },
          h('span', { class: 'chip-num' }, slotLabel(p.slot)),
          h('span', { class: 'chip-name' }, nameAfterSlot(p, this.session.selfId).trim()),
          key ? h('kbd', { class: 'chip-key' }, key) : null,
        ),
        score,
      ),
      h('span', { class: 'chip-lock' }, 'おてつき'),
      h('span', { class: 'chip-off' }, 'つなぎ直し中'),
      h('span', { class: 'chip-gone' }, 'ぬけた'),
      pops,
    )
    this.chips.set(p.id, { el, score, pops })
    this.chipList.appendChild(el)
  }

  private makeBuzzer(pid: string, slot: number, key: string, side: string): Buzzer {
    const look = lookOf(slot)
    const pops = h('span', { class: 'buzzer-pops', 'aria-hidden': 'true' })
    const label = `早押し（${slotLabel(slot)}${side ? `・${side}` : ''}${key ? `・${key === 'Space' ? 'スペース' : key}キー` : ''}）`
    const btn = h(
      'button',
      {
        type: 'button',
        class: 'buzzer',
        'data-player': pid,
        'data-slot': slot,
        'data-state': 'wait',
        'aria-label': label,
        disabled: true,
        style: `--pc:${look.color};--pc-ink:${look.ink}`,
      },
      h(
        'span',
        { class: 'buzzer-face' },
        shapeIcon(slot, 22, look.ink),
        h('span', { class: 'buzzer-label' }, '押す'),
        h('span', { class: 'buzzer-who' }, `${slotLabel(slot)}${side ? `・${side}` : ''}`),
        key ? h('kbd', { class: 'buzzer-key' }, key === 'Space' ? 'Space' : key) : null,
      ),
      h(
        'span',
        { class: 'buzzer-lock' },
        h('span', { class: 'buzzer-lock-x', 'aria-hidden': 'true' }, '×'),
        h('span', null, 'この問題は'),
        h('span', null, '押せません'),
      ),
      pops,
    )
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      this.press(pid)
    })
    // キーボードの Enter で押したとき（指やマウスの押しは pointerdown で済ませている）
    btn.addEventListener('click', (e) => {
      if (e.detail === 0) this.press(pid)
    })
    return { btn, pops, key }
  }

  // ── 状態が変わったとき ──

  private onState(s: PublicGameState): void {
    if (!this.alive) return
    const prev = this.prev
    this.prev = s
    this.transitions(prev, s)
    this.render(s)
    if (s.phase === 'finished' && !this.toResult) {
      this.toResult = true
      // 知らせの途中で画面を差し替えないよう、少し後で結果へ
      setTimeout(() => {
        if (this.alive) this.ctx.go('result', { session: this.session })
      }, 0)
    }
  }

  private player(id: string | null): PlayerState | undefined {
    if (id === null) return undefined
    return this.prev?.players.find((p) => p.id === id)
  }

  private spoken(id: string | null): string {
    const p = this.player(id)
    return p ? spokenName(p, this.session.selfId) : 'だれか'
  }

  /** 音・読み上げ・飛び出す数字など、変わった瞬間にだけ起こすこと */
  private transitions(prev: PublicGameState | null, s: PublicGameState): void {
    const q = s.question
    const pq = prev?.question ?? null
    const sameQ = q !== null && pq !== null && pq.index === q.index

    if (s.phase === 'intro' && (prev === null || prev.phase !== 'intro' || prev.questionIndex !== s.questionIndex)) {
      const last = s.questionIndex === s.questionCount - 1
      this.say(`第${s.questionIndex + 1}問${last ? '。最後の問題です' : ''}`)
      if (prev?.phase === 'countdown') this.ctx.audio.play('go')
    }

    if (q && s.phase === 'answering' && q.buzzerId !== null) {
      const changed = !sameQ || pq?.buzzerId !== q.buzzerId || pq?.buzzedAt !== q.buzzedAt
      if (changed && prev !== null) {
        this.ctx.audio.play('buzz')
        this.sayNow(`${this.spoken(q.buzzerId)}が押しました`)
      }
    }

    if (q) {
      const before = prev === null ? q.attempts.length : sameQ && pq ? pq.attempts.length : 0
      for (const a of q.attempts.slice(before)) this.onAttempt(a, q.choiceIds)
    }

    if (s.phase === 'reveal' && prev !== null && prev.phase !== 'reveal') {
      const r = this.currentResult(s)
      const lm = r ? getLandmark(r.landmarkId) : undefined
      if (r && lm) {
        const nobody = r.winnerId === null ? '。だれも当てられませんでした' : ''
        this.say(`答えは${lm.name}（${lm.place}）${nobody}`)
      }
    }
  }

  private onAttempt(a: Attempt, choiceIds: readonly string[]): void {
    const p = this.player(a.playerId)
    const who = this.spoken(a.playerId)
    this.popDelta(a.playerId, a.points)
    if (a.correct) {
      this.ctx.audio.play('correct')
      this.sayNow(`正解！ ${who}に${a.points}点`)
      return
    }
    this.ctx.audio.play('wrong')
    const chosen = a.choiceIndex !== null ? getLandmark(choiceIds[a.choiceIndex] ?? '') : undefined
    const what = a.choiceIndex === null ? '時間切れ' : 'まちがい'
    this.sayNow(`${what}。${who}は${WRONG_PENALTY}点減点。この問題はもう押せません`)
    const label = p ? `${slotLabel(p.slot)}${nameAfterSlot(p, this.session.selfId)}` : who
    this.showToast(
      a.choiceIndex === null
        ? `${label}：時間切れ ${formatDelta(a.points)}`
        : `${label}：「${chosen?.name ?? '？'}」はまちがい ${formatDelta(a.points)}`,
      2600,
    )
  }

  private currentResult(s: PublicGameState): QuestionResult | undefined {
    const r = s.results[s.results.length - 1]
    return r && r.index === s.questionIndex ? r : undefined
  }

  // ── 表示 ──

  private render(s: PublicGameState): void {
    const q = s.question
    setAttr(this.section, 'data-phase', s.phase)
    setText(this.qNum, s.questionIndex >= 0 ? String(s.questionIndex + 1) : '1')
    setText(this.qTotal, `／${s.questionCount}`)

    // 得点の札
    for (const p of s.players) {
      if (!this.chips.has(p.id)) this.addChip(p)
      const chip = this.chips.get(p.id)
      if (!chip) continue
      setText(chip.score, formatPoints(p.score))
      const locked = q !== null && q.lockedOut.includes(p.id) && p.active && s.phase !== 'reveal' && s.phase !== 'intro'
      setAttr(chip.el, 'data-locked', locked ? 'true' : null)
      setAttr(chip.el, 'data-left', p.active ? null : 'true')
      setAttr(chip.el, 'data-answering', q?.buzzerId === p.id && s.phase === 'answering' ? 'true' : null)
      setAttr(chip.el, 'data-negative', p.score < 0 ? 'true' : null)
    }

    // 4択
    if (q && s.phase === 'answering' && q.buzzerId !== null) {
      const buzzer = this.player(q.buzzerId)
      const look = lookOf(buzzer?.slot ?? 0)
      const mine = this.local.includes(q.buzzerId)
      this.section.style.setProperty('--answer-pc', look.color)
      this.answer.style.setProperty('--pc', look.color)
      this.answer.style.setProperty('--pc-ink', look.ink)
      setAttr(this.answer, 'data-slot', String(buzzer?.slot ?? 0))
      setAttr(this.answer, 'data-mine', mine ? 'true' : 'false')
      const pts = pointsAt(q.buzzProgress ?? 1)
      this.answerHead.replaceChildren(
        shapeIcon(buzzer?.slot ?? 0, 20),
        h('b', null, buzzer ? `${slotLabel(buzzer.slot)}${nameAfterSlot(buzzer, this.session.selfId)}` : ''),
        mine ? ` が答える番（正解で${pts}点）` : buzzer?.kind === 'cpu' ? ' が考えています…' : ' が答えています…',
      )
      if (this.choicesFor !== q.index) {
        this.choicesFor = q.index
        q.choiceIds.forEach((id, i) => {
          const btn = this.choices[i]
          const lm = getLandmark(id)
          if (!btn) return
          setText(btn.querySelector('.choice-name') as HTMLElement, lm?.name ?? id)
          setText(btn.querySelector('.choice-place') as HTMLElement, lm?.place ?? '')
        })
      }
      const wrongPicked = new Set(q.attempts.filter((a) => !a.correct && a.choiceIndex !== null).map((a) => a.choiceIndex))
      this.choices.forEach((btn, i) => {
        setHidden(btn, i >= q.choiceIds.length)
        setDisabled(btn, !mine)
        setAttr(btn, 'data-wrong', wrongPicked.has(i) ? 'true' : null)
      })
      // 焦点は移さない（指の届く位置にあり、読み上げは「押しました」で伝える）
      setHidden(this.answer, false)
    } else {
      setHidden(this.answer, true)
    }

    // 答えあわせ
    const r = s.phase === 'reveal' ? this.currentResult(s) : undefined
    if (r) {
      if (this.revealIndex !== r.index) {
        this.revealIndex = r.index
        this.reveal = createRevealCard({
          state: s,
          result: r,
          selfId: this.session.selfId,
          canSkip: this.session.canSkipReveal,
          onSkip: () => this.session.skipReveal(),
        })
        this.revealHost.replaceChildren(this.reveal.el)
      }
    } else if (this.reveal) {
      this.reveal = null
      this.revealIndex = -1
      this.revealHost.replaceChildren()
    }

    // 真ん中の札（「第3問」）
    if (s.phase === 'intro') {
      const key = `intro-${s.questionIndex}`
      if (this.center.getAttribute('data-key') !== key) {
        const last = s.questionIndex === s.questionCount - 1
        this.center.replaceChildren()
        append(this.center, h('span', { class: 'center-q' }, `第${s.questionIndex + 1}問`), last ? h('span', { class: 'center-sub' }, '最後の問題') : null)
        setAttr(this.center, 'data-kind', 'intro')
        setAttr(this.center, 'data-key', key)
      }
      this.lastCount = 0
    } else if (s.phase !== 'countdown') {
      setAttr(this.center, 'data-key', null)
      if (this.center.childNodes.length > 0) this.center.replaceChildren()
      setAttr(this.center, 'data-kind', null)
    }

    // 模型：問題が変わったら作り直し、答えあわせで完成へ
    if (q && this.shownQuestion !== q.index) {
      this.shownQuestion = q.index
      this.completeShown = -1
      this.modelReady = !this.ctx.view.onModelReady
      if (this.session instanceof LocalSession && this.ctx.view.onModelReady) this.session.pause('model-loading')
      this.ctx.view.setLandmark(q.landmarkId)
    }
    if (q && (s.phase === 'reveal' || s.phase === 'finished') && this.completeShown !== q.index) {
      this.completeShown = q.index
      this.ctx.view.showComplete()
    }
  }

  /** 毎フレーム：進み具合・残り時間・押せるかどうか・接続 */
  private readonly frame = (): void => {
    if (!this.alive) return
    this.raf = requestAnimationFrame(this.frame)
    const s = this.session.getState()
    const now = this.session.now()
    const q = s.question
    const open = OPEN_PHASES.has(s.phase)

    if (q && (open || s.phase === 'answering')) {
      const p = this.session.progress()
      this.ctx.view.setProgress(p)
      this.meterFill.style.transform = `scaleX(${Math.min(1, Math.max(0, p)).toFixed(4)})`
      if (s.phase === 'building') {
        this.setMeterText(`いま押すと`, `${pointsAt(p)}`, '点')
      } else if (s.phase === 'lastcall') {
        const left = s.phaseEndsAt !== null ? Math.max(0, Math.ceil((s.phaseEndsAt - now) / 1000)) : 0
        this.setMeterText(`最後のチャンス あと${left}秒`, `${MIN_POINTS}`, '点')
      } else {
        this.setMeterText('止まっています', '', '')
      }
    } else if (s.phase === 'intro') {
      this.meterFill.style.transform = 'scaleX(0)'
      this.setMeterText('まもなく組み立て', '', '')
    } else if (s.phase === 'countdown') {
      this.meterFill.style.transform = 'scaleX(0)'
      this.setMeterText('まもなく始まります', '', '')
    } else if (s.phase === 'reveal') {
      this.meterFill.style.transform = 'scaleX(1)'
      this.setMeterText('答えあわせ', '', '')
    }

    if (s.phase === 'countdown') {
      if (s.started && s.phaseEndsAt !== null) {
        const n = Math.min(3, Math.max(1, Math.ceil((s.phaseEndsAt - now) / 1000)))
        if (n !== this.lastCount) {
          this.lastCount = n
          this.center.replaceChildren(h('span', { class: 'center-count' }, String(n)))
          setAttr(this.center, 'data-kind', 'count')
          this.ctx.audio.play('tick')
        }
      } else if (this.center.getAttribute('data-kind') !== 'wait') {
        this.center.replaceChildren(h('span', { class: 'center-wait' }, 'まもなく始まります'))
        setAttr(this.center, 'data-kind', 'wait')
      }
    }

    if (s.phase === 'answering' && q?.answerEndsAt != null) {
      const f = Math.min(1, Math.max(0, (q.answerEndsAt - now) / ANSWER_MS))
      this.answerTimerFill.style.transform = `scaleX(${f.toFixed(4)})`
    }
    if (s.phase === 'reveal' && this.reveal && s.phaseEndsAt !== null) {
      this.reveal.setRemaining((s.phaseEndsAt - now) / REVEAL_MS)
    }

    for (const [pid, b] of this.buzzers) {
      const can = this.modelReady && this.session.canBuzz(pid)
      const me = s.players.find((p) => p.id === pid)
      const locked = q !== null && q.lockedOut.includes(pid) && (open || s.phase === 'answering') && me?.active !== false
      const answering = s.phase === 'answering' && q?.buzzerId === pid
      const state = locked ? 'locked' : answering ? 'answering' : can ? 'ready' : 'wait'
      setDisabled(b.btn, !can)
      setAttr(b.btn, 'data-state', state)
    }

    const c = this.session.connection()
    if (c !== this.lastConn) {
      this.lastConn = c
      setHidden(this.conn, c === 'ok')
      setAttr(this.conn, 'data-status', c)
      setText(
        this.conn,
        c === 'reconnecting' ? '通信が切れました。つなぎ直しています…' : c === 'lost' ? '接続が切れました' : '',
      )
    }
  }

  private meterKey = ''

  private setMeterText(label: string, value: string, unit: string): void {
    const key = `${label}|${value}|${unit}`
    if (key === this.meterKey) return
    this.meterKey = key
    this.meterText.replaceChildren(label, value ? h('b', { class: 'meter-points' }, ` ${value}`) : '', unit)
  }

  // ── 操作 ──

  private press(pid: string): void {
    if (this.dialog?.open) return
    if (this.modelReady && this.session.canBuzz(pid)) {
      this.session.buzz(pid)
      return
    }
    // 締め出し中に押した：揺らして「押せない」ことを伝える
    const b = this.buzzers.get(pid)
    if (b && b.btn.getAttribute('data-state') === 'locked') {
      b.btn.classList.remove('shake')
      void b.btn.offsetWidth
      b.btn.classList.add('shake')
    }
  }

  private choose(index: number): void {
    if (this.dialog?.open) return
    const s = this.session.getState()
    const buzzerId = s.question?.buzzerId ?? null
    if (s.phase !== 'answering' || buzzerId === null || !this.local.includes(buzzerId)) return
    this.session.answer(buzzerId, index)
    const active = document.activeElement
    if (active instanceof HTMLElement && this.answer.contains(active)) active.blur()
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.dialog?.open || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return
    const t = e.target
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault()
      if (!e.repeat && this.session.mode !== 'duo' && this.local[0] !== undefined) this.press(this.local[0])
      return
    }
    if (this.session.mode === 'duo' && (e.code === 'KeyF' || e.code === 'KeyJ')) {
      e.preventDefault()
      const pid = this.local[e.code === 'KeyF' ? 0 : 1]
      if (!e.repeat && pid !== undefined) this.press(pid)
      return
    }
    const d = digitOf(e)
    if (d !== null) {
      e.preventDefault()
      if (!e.repeat) this.choose(d - 1)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      this.openQuit()
    }
  }

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    // Space で焦点のあるボタンが押されないようにする（Space は早押しに使う）
    if ((e.code === 'Space' || e.key === ' ') && !e.isComposing && !this.dialog?.open) e.preventDefault()
  }

  private openQuit(): void {
    if (this.dialog?.open) return
    const local = this.session instanceof LocalSession ? this.session : null
    local?.pause('confirm')
    this.dialog = openConfirm(
      this.section,
      {
        title: 'ゲームをやめますか？',
        body: 'やめると、このゲームの点数は残りません。',
        okLabel: 'やめる',
        cancelLabel: 'つづける',
        danger: true,
      },
      (ok) => {
        this.dialog = null
        local?.resume('confirm')
        if (ok && this.alive) this.ctx.go('title')
      },
    )
  }

  // ── 小さな表示 ──

  private popDelta(pid: string, points: number): void {
    const text = formatDelta(points)
    const kind = points < 0 ? 'minus' : 'plus'
    const hosts = [this.chips.get(pid)?.pops, this.buzzers.get(pid)?.pops]
    for (const host of hosts) {
      if (!host) continue
      const pop = h('span', { class: `delta-pop is-${kind}` }, text)
      host.appendChild(pop)
      setTimeout(() => pop.remove(), 2200)
    }
  }

  private showToast(text: string, ms: number): void {
    setText(this.toast, text)
    setHidden(this.toast, false)
    if (this.toastTimer !== null) clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => {
      this.toastTimer = null
      setHidden(this.toast, true)
    }, ms)
  }

  private say(text: string): void {
    this.livePolite.textContent = ''
    setTimeout(() => {
      if (this.alive) this.livePolite.textContent = text
    }, 30)
  }

  private sayNow(text: string): void {
    this.liveAssertive.textContent = ''
    setTimeout(() => {
      if (this.alive) this.liveAssertive.textContent = text
    }, 30)
  }
}
