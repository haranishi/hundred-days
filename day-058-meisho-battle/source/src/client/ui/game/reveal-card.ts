// 答えあわせのカード：名前（大）・正式名・場所・完成の年・地図の印・豆知識（出典つき）・誰が何点を取ったか。
// スマホでは下から出るカード、広い画面では右の板（見た目は game.css）。

import { getLandmark } from '../../../shared/landmarks'
import type { PlayerState, PublicGameState, QuestionResult } from '../../../shared/types'
import { createLocatorMap } from '../../map/map-view'
import { formatDelta, h } from '../dom'
import { displayName, lookOf, shapeIcon, slotLabel } from '../players'

export interface RevealCardOptions {
  state: PublicGameState
  result: QuestionResult
  selfId: string | null
  /** 「次へ」で早送りできるか（ひとり・ふたり） */
  canSkip: boolean
  onSkip(): void
}

export interface RevealCard {
  el: HTMLElement
  /** 自動で次へ進むまでの残り（0〜1） */
  setRemaining(fraction: number): void
}

function attemptText(result: QuestionResult, index: number): { label: string; delta: number; kind: 'correct' | 'wrong' | 'timeout' } {
  const a = result.attempts[index]
  if (!a) return { label: '', delta: 0, kind: 'wrong' }
  if (a.correct) return { label: '正解', delta: a.points, kind: 'correct' }
  if (a.choiceIndex === null) return { label: '時間切れ', delta: a.points, kind: 'timeout' }
  const chosen = getLandmark(result.choiceIds[a.choiceIndex] ?? '')
  return { label: chosen ? `まちがい（${chosen.name}）` : 'まちがい', delta: a.points, kind: 'wrong' }
}

/** 番号のあとに添える名前（番号と同じなら空） */
export function nameAfterSlot(p: PlayerState, selfId: string | null): string {
  const name = displayName(p, selfId)
  return name === slotLabel(p.slot) ? '' : ` ${name}`
}

function summaryText(result: QuestionResult): string {
  if (result.winnerId !== null) return ''
  if (result.attempts.length === 0) return 'だれも押しませんでした'
  if (result.endedBy === 'allLockedOut') return '全員がまちがえました'
  return '正解は出ませんでした'
}

export function createRevealCard(opts: RevealCardOptions): RevealCard {
  const { result, state } = opts
  const lm = getLandmark(result.landmarkId)
  const players = new Map<string, PlayerState>(state.players.map((p) => [p.id, p]))
  const isLast = result.index >= state.questionCount - 1

  const rows = result.attempts.map((a, i) => {
    const p = players.get(a.playerId)
    const t = attemptText(result, i)
    const slot = p?.slot ?? 0
    return h(
      'li',
      { class: `reveal-row is-${t.kind}`, 'data-player': a.playerId, style: `--pc:${lookOf(slot).color}` },
      shapeIcon(slot, 18),
      h('span', { class: 'reveal-who' }, h('b', null, slotLabel(slot)), p ? nameAfterSlot(p, opts.selfId) : ''),
      h('span', { class: 'reveal-what' }, t.label),
      h('span', { class: 'reveal-delta' }, formatDelta(t.delta)),
    )
  })
  const summary = summaryText(result)

  const timerFill = h('span', { class: 'reveal-timer-fill' })
  const nextBtn = opts.canSkip
    ? h(
        'button',
        { type: 'button', class: 'btn btn-primary reveal-next', on: { click: () => opts.onSkip() } },
        isLast ? '結果へ' : '次へ',
      )
    : h('p', { class: 'reveal-wait' }, isLast ? 'まもなく結果です' : 'まもなく次の問題です')

  const sources = lm?.factSources ?? []
  const el = h(
    'aside',
    { class: 'reveal', 'aria-labelledby': 'reveal-name', 'data-landmark': result.landmarkId },
    h(
      'div',
      { class: 'reveal-scroll' },
      h(
        'header',
        { class: 'reveal-head' },
        h('p', { class: 'reveal-kicker' }, `第${result.index + 1}問の答え`),
        h('h2', { class: 'reveal-name', id: 'reveal-name' }, lm?.name ?? result.landmarkId),
        lm && lm.officialName !== lm.name ? h('p', { class: 'reveal-official' }, lm.officialName) : null,
      ),
      h(
        'div',
        { class: 'reveal-body' },
        lm ? h('div', { class: 'reveal-map' }, createLocatorMap(lm)) : null,
        h(
          'dl',
          { class: 'reveal-facts' },
          h('div', null, h('dt', null, '場所'), h('dd', { class: 'reveal-place' }, lm?.place ?? '')),
          lm?.built ? h('div', null, h('dt', null, '年代'), h('dd', { class: 'reveal-built' }, lm.built)) : null,
        ),
      ),
      lm?.fact
        ? h(
            'p',
            { class: 'reveal-fact' },
            lm.fact,
            sources.length > 0 ? h('small', { class: 'reveal-source' }, `出典：${sources.map((s) => s.title).join('、')}`) : null,
          )
        : null,
      h(
        'section',
        { class: 'reveal-points', 'aria-label': 'この問題の点数' },
        rows.length > 0 ? h('ul', { class: 'reveal-rows' }, ...rows) : null,
        summary ? h('p', { class: 'reveal-summary' }, summary) : null,
      ),
    ),
    h(
      'footer',
      { class: 'reveal-foot' },
      h('span', { class: 'reveal-timer', 'aria-hidden': 'true' }, timerFill),
      nextBtn,
    ),
  )

  return {
    el,
    setRemaining(fraction: number) {
      const f = Math.min(1, Math.max(0, fraction))
      timerFill.style.transform = `scaleX(${f.toFixed(3)})`
    },
  }
}
