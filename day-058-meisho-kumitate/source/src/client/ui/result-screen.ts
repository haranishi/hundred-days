// 結果の画面：勝敗（ひきわけあり）・各問の結果・称号・シェア・「もう一回」「タイトルへ」。
// ゲーム画面から同じ GameSession を受け取る。「もう一回」で新しいゲームが始まったら（状態が finished でなくなったら）
// ゲーム画面へ戻す。100日チャレンジ版（Day58）はひとり・ふたりだけなので、「もう一回」はいつでも押せる。

import { getLandmark } from '../../shared/landmarks'
import { titleFor } from '../../shared/title'
import type { PlayerState, PublicGameState, QuestionResult } from '../../shared/types'
import type { GameSession } from '../game/session'
import { createShareBlock } from '../share/share'
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from '../site'
import type { AppContext, Screen } from './app-context'
import { focusHeading, formatDelta, formatPoints, h, setDisabled } from './dom'
import { nameAfterSlot } from './game/reveal-card'
import { lookOf, shapeIcon, slotLabel } from './players'
import { showTitleBackdrop } from './backdrop'

const SCOPE_LABEL = { japan: '日本', world: '世界', all: 'ぜんぶ' } as const

function readSession(raw: unknown): GameSession | null {
  if (!raw || typeof raw !== 'object') return null
  const s = (raw as { session?: unknown }).session
  return s && typeof s === 'object' ? (s as GameSession) : null
}

/** 主役のプレイヤー：ひとり＝人、ふたり＝勝った人（ひきわけなら1P） */
function featuredPlayer(state: PublicGameState, session: GameSession): PlayerState | undefined {
  if (session.mode === 'solo') return state.players.find((p) => p.kind === 'human')
  const winners = state.outcome?.winnerIds ?? []
  return state.players.find((p) => winners.length === 1 && p.id === winners[0]) ?? state.players[0]
}

function headline(state: PublicGameState, session: GameSession): { text: string; tone: 'win' | 'lose' | 'draw' } {
  const outcome = state.outcome
  const winners = outcome?.winnerIds ?? []
  if (!outcome || winners.length === 0) return { text: 'ゲーム終了', tone: 'draw' }
  if (outcome.draw) return { text: 'ひきわけ', tone: 'draw' }
  const winner = state.players.find((p) => p.id === winners[0])
  if (session.mode === 'solo') {
    return winner?.kind === 'human' ? { text: 'あなたの勝ち！', tone: 'win' } : { text: `${winner?.name ?? 'ガイドさん'}の勝ち`, tone: 'lose' }
  }
  return { text: `${winner ? slotLabel(winner.slot) : ''}の勝ち！`, tone: 'win' }
}

function questionRow(r: QuestionResult, players: Map<string, PlayerState>, selfId: string | null): HTMLElement {
  const lm = getLandmark(r.landmarkId)
  const parts = r.attempts.map((a) => {
    const p = players.get(a.playerId)
    const slot = p?.slot ?? 0
    return h(
      'span',
      { class: `qr-attempt ${a.correct ? 'is-correct' : 'is-wrong'}`, style: `--pc:${lookOf(slot).color}` },
      shapeIcon(slot, 14),
      `${slotLabel(slot)}${p ? nameAfterSlot(p, selfId) : ''} ${formatDelta(a.points)}`,
    )
  })
  return h(
    'li',
    { class: 'qr', 'data-winner': r.winnerId ?? '' },
    h('span', { class: 'qr-no' }, `第${r.index + 1}問`),
    h('span', { class: 'qr-name' }, lm?.name ?? r.landmarkId),
    h('span', { class: 'qr-who' }, ...(parts.length > 0 ? parts : [h('span', { class: 'qr-none' }, 'だれも当てられず')])),
  )
}

function shareText(state: PublicGameState, session: GameSession, featured: PlayerState | undefined): string {
  const scope = SCOPE_LABEL[state.scope]
  if (session.mode === 'duo') {
    const scores = state.players.map((p) => `${slotLabel(p.slot)} ${formatPoints(p.score)}点`).join('・')
    const h1 = headline(state, session).text.replace('！', '')
    return `${SITE_NAME}（ふたりで・${scope}）で${h1}！ ${scores}。${SITE_TAGLINE}`
  }
  const score = featured?.score ?? 0
  return `${SITE_NAME}（ひとりで・${scope}）で ${formatPoints(score)}点、称号は「${titleFor(score)}」でした。${SITE_TAGLINE}`
}

export function createResultScreen(ctx: AppContext, raw: unknown): Screen {
  const session = readSession(raw)
  let section: HTMLElement | null = null
  let unsub: (() => void) | null = null
  let leftForGame = false

  return {
    mount(root) {
      if (!session) {
        queueMicrotask(() => ctx.go('title'))
        return
      }
      showTitleBackdrop(ctx)
      const state = session.getState()
      const players = new Map(state.players.map((p) => [p.id, p]))
      const featured = featuredPlayer(state, session)
      const head = headline(state, session)
      const winners = new Set(state.outcome?.winnerIds ?? [])
      const ranked = [...state.players].sort((a, b) => b.score - a.score || a.slot - b.slot)

      const standings = h(
        'ol',
        { class: 'standings' },
        ...ranked.map((p) =>
          h(
            'li',
            {
              class: 'standing',
              'data-player': p.id,
              'data-winner': winners.has(p.id) ? 'true' : 'false',
              style: `--pc:${lookOf(p.slot).color}`,
            },
            shapeIcon(p.slot, 22),
            h('span', { class: 'standing-who' }, h('b', null, slotLabel(p.slot)), nameAfterSlot(p, session.selfId)),
            h('span', { class: 'standing-title' }, titleFor(p.score)),
            h('span', { class: 'standing-score' }, `${formatPoints(p.score)}点`),
            winners.has(p.id) && !state.outcome?.draw ? h('span', { class: 'standing-badge' }, '勝ち') : null,
          ),
        ),
      )

      const rematch = h(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary btn-block',
          'data-action': 'rematch',
          on: {
            click: () => {
              ctx.audio.play('tap')
              if (session.canRematch()) session.rematch()
            },
          },
        },
        'もう一回',
      )
      const toTitle = h(
        'button',
        { type: 'button', class: 'btn btn-secondary btn-block', 'data-action': 'title', on: { click: () => ctx.go('title') } },
        'タイトルへ',
      )
      const syncRematch = (): void => {
        setDisabled(rematch, !session.canRematch())
      }

      const titleScore = featured?.score ?? 0
      section = h(
        'section',
        { class: 'screen menu result', 'data-tone': head.tone },
        h(
          'div',
          { class: 'card card-wide' },
          h('p', { class: 'result-kicker' }, `結果・${SCOPE_LABEL[state.scope]}・全${state.questionCount}問`),
          h('h1', { class: 'result-headline' }, head.text),
          state.outcome?.endedEarly ? h('p', { class: 'result-note' }, '抜けた人がいたので、ここで終わりました') : null,
          featured
            ? h(
                'p',
                { class: 'result-title' },
                h('span', { class: 'result-title-label' }, session.mode === 'duo' ? `${slotLabel(featured.slot)}の称号` : '称号'),
                h('strong', { class: 'result-title-name' }, titleFor(titleScore)),
                h('span', { class: 'result-score' }, `${formatPoints(titleScore)}点`),
              )
            : null,
          standings,
          // 「もう一回」はスクロールしなくても届く位置に置く（docs/01：終わったあと「もう一回」を押す）
          h('div', { class: 'result-actions' }, rematch, toTitle),
          createShareBlock({ text: shareText(state, session, featured), url: SITE_URL, title: SITE_NAME }),
          h(
            'section',
            { class: 'result-questions', 'aria-labelledby': 'result-q-heading' },
            h('h2', { id: 'result-q-heading' }, '各問の結果'),
            h('ol', { class: 'qr-list' }, ...state.results.map((r) => questionRow(r, players, session.selfId))),
          ),
        ),
      )
      root.appendChild(section)
      syncRematch()
      focusHeading(section)
      ctx.audio.play('fanfare')

      unsub = session.subscribe((s) => {
        if (leftForGame) return
        if (s.phase !== 'finished') {
          leftForGame = true
          setTimeout(() => ctx.go('game', { session }), 0)
          return
        }
        syncRematch()
      })
    },
    unmount() {
      unsub?.()
      unsub = null
      section?.remove()
      section = null
    },
  }
}
