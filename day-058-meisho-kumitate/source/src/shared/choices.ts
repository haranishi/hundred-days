// 出題する名所の選び方と、4択の作り方（docs/03「出題と選択肢」）。

import { getLandmark, inScope, LANDMARKS, landmarksInScope } from './landmarks'
import type { Rng } from './rng'
import type { Landmark, Scope } from './types'

/** 選択肢の数（正解1＋はずれ3） */
export const CHOICE_COUNT = 4

/** 並べ方の探索の上限（問題数が多いときに時間をかけすぎない） */
const ORDER_SEARCH_BUDGET = 20000

const isEasy = (l: Landmark): boolean => l.difficulty === 1
const isHard = (l: Landmark): boolean => l.difficulty >= 2

/**
 * 範囲の中から、模型のある名所を count 問ぶん選んで並べる。
 * 守る順（上ほど強い）：重複なし・範囲の中・模型あり ＞ 1〜2問目は難しさ1 ＞ 直前のゲームの名所を避ける
 *   ＞ 最後の問題は難しさ2以上 ＞ 同じ種類が続かない。
 * 名所が足りなければ、ある分だけ返す。
 */
export function selectQuestions(rng: Rng, scope: Scope, count: number, avoidIds: readonly string[] = []): string[] {
  const pool = rng.shuffle(landmarksInScope(scope, { modeledOnly: true }))
  const n = Math.max(0, Math.min(Number.isFinite(count) ? Math.floor(count) : 0, pool.length))
  if (n === 0) return []

  // 1問目と2問目はやさしい名所。最後は難しさ2以上（1問しかないときは、やさしい名所を優先する）
  const easySlots = n >= 3 ? 2 : 1
  const wantHardLast = n >= 2

  const avoid = new Set(avoidIds)
  const fresh = pool.filter((l) => !avoid.has(l.id))
  const stale = pool.filter((l) => avoid.has(l.id))

  const chosen: Landmark[] = []
  const chosenIds = new Set<string>()
  const categoryCount = new Map<string, number>()
  const add = (l: Landmark): void => {
    chosen.push(l)
    chosenIds.add(l.id)
    categoryCount.set(l.category, (categoryCount.get(l.category) ?? 0) + 1)
  }
  /** list から pred に合うものを k 個まで取る。同じ種類が少ないものを先に取り、種類をばらけさせる */
  const take = (list: readonly Landmark[], pred: (l: Landmark) => boolean, k: number): number => {
    let taken = 0
    while (taken < k) {
      let best: Landmark | undefined
      let bestCount = Infinity
      for (const l of list) {
        if (chosenIds.has(l.id) || !pred(l)) continue
        const c = categoryCount.get(l.category) ?? 0
        if (c < bestCount) {
          best = l
          bestCount = c
        }
      }
      if (!best) break
      add(best)
      taken++
    }
    return taken
  }

  // やさしい名所（直前のゲームと重なっても、1問目のやさしさを優先する）
  const easyFromFresh = take(fresh, isEasy, easySlots)
  take(stale, isEasy, easySlots - easyFromFresh)
  // 最後の問題用の難しい名所。直前の名所を使うのは、どのみち直前の名所を使う必要があるときだけ
  if (wantHardLast && take(fresh, isHard, 1) === 0) {
    const freshLeft = fresh.filter((l) => !chosenIds.has(l.id)).length
    if (n - chosen.length > freshLeft) take(stale, isHard, 1)
  }
  // 残りを埋める：まだ出ていない名所から先に
  take(fresh, () => true, n - chosen.length)
  take(stale, () => true, n - chosen.length)

  return orderQuestions(rng, chosen, easySlots, wantHardLast).map((l) => l.id)
}

/** 並べ方の決まりを守れているほど小さくなる点数で、いちばん良い並びを探す */
function orderQuestions(rng: Rng, items: readonly Landmark[], easySlots: number, wantHardLast: boolean): Landmark[] {
  const arr = rng.shuffle(items)
  const n = arr.length
  const slotCost = (pos: number, l: Landmark, prev: Landmark | undefined): number => {
    let cost = 0
    if (pos < easySlots && !isEasy(l)) cost += 1000
    if (wantHardLast && pos === n - 1 && !isHard(l)) cost += 20
    if (prev && prev.category === l.category) cost += 1
    return cost
  }

  let best: Landmark[] = arr
  let bestCost = Infinity
  let budget = ORDER_SEARCH_BUDGET
  const seq: Landmark[] = []
  const used = new Array<boolean>(n).fill(false)

  const dfs = (cost: number): void => {
    if (budget-- <= 0 || cost >= bestCost) return
    if (seq.length === n) {
      best = seq.slice()
      bestCost = cost
      return
    }
    const pos = seq.length
    for (let i = 0; i < n && bestCost > 0; i++) {
      if (used[i]) continue
      const l = arr[i] as Landmark
      const c = slotCost(pos, l, seq[pos - 1])
      used[i] = true
      seq.push(l)
      dfs(cost + c)
      seq.pop()
      used[i] = false
    }
  }
  dfs(0)
  return best
}

export interface ChoiceSet {
  /** 4つの名所 id（並びは乱数） */
  choiceIds: string[]
  correctIndex: number
}

/**
 * 正解1＋はずれ3の4択を作る。はずれは次の順に探す：
 *   ①正解の「見間違えやすい名所」 ②同じ種類 ③同じ地域 ④範囲の中のほか。
 * どの段でも、範囲の外の名所と正解そのものは使わない。名前だけの名所もはずれに使う。
 */
export function generateChoices(rng: Rng, correctId: string, scope: Scope): ChoiceSet {
  const correct = getLandmark(correctId)
  if (!correct) throw new Error(`知らない名所: ${correctId}`)
  const allowed = (l: Landmark): boolean => l.id !== correct.id && inScope(l, scope)

  const wrong: string[] = []
  const takeFrom = (candidates: readonly Landmark[]): void => {
    for (const l of rng.shuffle(candidates)) {
      if (wrong.length >= CHOICE_COUNT - 1) return
      if (!wrong.includes(l.id)) wrong.push(l.id)
    }
  }
  const confusables = correct.confusables.map(getLandmark).filter((l): l is Landmark => l !== undefined)
  takeFrom(confusables.filter(allowed))
  if (wrong.length < CHOICE_COUNT - 1) takeFrom(LANDMARKS.filter((l) => allowed(l) && l.category === correct.category))
  if (wrong.length < CHOICE_COUNT - 1) takeFrom(LANDMARKS.filter((l) => allowed(l) && l.scope === correct.scope))
  if (wrong.length < CHOICE_COUNT - 1) takeFrom(LANDMARKS.filter(allowed))
  if (wrong.length < CHOICE_COUNT - 1) throw new Error(`はずれの名所が足りない: ${correctId}`)

  const choiceIds = rng.shuffle([correct.id, ...wrong])
  return { choiceIds, correctIndex: choiceIds.indexOf(correct.id) }
}
