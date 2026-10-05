// コンピューター（ガイドさん）の動き（docs/03「コンピューター」）。
// 出題の時点で「押す進み具合・当たるか・考える時間・はずれならどれを選ぶか」を決め、rules.ts が時刻に合わせて動かす。

import {
  CPU_BUZZ_MAX,
  CPU_BUZZ_MIN,
  CPU_DIFFICULTY_DELAY,
  CPU_LEVELS,
  CPU_RESUME_DELAY_MAX_MS,
  CPU_RESUME_DELAY_MIN_MS,
  CPU_THINK_MAX_MS,
  CPU_THINK_MIN_MS,
} from './config'
import { getLandmark } from './landmarks'
import type { Rng } from './rng'
import type { CpuLevel, CpuPlan } from './types'

/** 画面に出す強さの名前 */
export const CPU_LEVEL_NAMES: Readonly<Record<CpuLevel, string>> = {
  minarai: '見習いガイド',
  veteran: 'ベテランガイド',
  densetsu: '伝説のガイド',
}

export const CPU_LEVEL_ORDER: readonly CpuLevel[] = ['minarai', 'veteran', 'densetsu']

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/**
 * その問題でのコンピューターの動きを決める。乱数は毎回同じ順で同じ数だけ使う（当たる問題でも、はずれの番号まで決める）。
 * difficulty は名所の難しさ（1〜3）。1上がるごとに押す進み具合を 0.06 遅らせ、0.12〜1.05 に収める。
 */
export function cpuPlan(
  rng: Rng,
  level: CpuLevel,
  difficulty: number,
  choiceIds: readonly string[],
  correctIndex: number,
): CpuPlan {
  const spec = CPU_LEVELS[level] ?? CPU_LEVELS.minarai
  const d = clamp(Math.round(Number.isFinite(difficulty) ? difficulty : 1), 1, 3)
  const raw = rng.normal(spec.buzzMean, spec.buzzSd) + (d - 1) * CPU_DIFFICULTY_DELAY
  const buzzProgress = clamp(raw, CPU_BUZZ_MIN, CPU_BUZZ_MAX)
  const correct = rng.chance(spec.accuracy)
  const thinkMs = Math.round(rng.range(CPU_THINK_MIN_MS, CPU_THINK_MAX_MS))
  const wrongChoiceIndex = pickWrongChoice(rng, choiceIds, correctIndex)
  return { buzzProgress, correct, thinkMs, wrongChoiceIndex }
}

/** はずれのときに選ぶ番号。選択肢の中に正解の「見間違えやすい名所」があれば、その中から選ぶ */
function pickWrongChoice(rng: Rng, choiceIds: readonly string[], correctIndex: number): number {
  const correctId = choiceIds[correctIndex]
  const confusables = new Set(correctId === undefined ? [] : (getLandmark(correctId)?.confusables ?? []))
  const wrong: number[] = []
  const tricky: number[] = []
  choiceIds.forEach((id, i) => {
    if (i === correctIndex) return
    wrong.push(i)
    if (confusables.has(id)) tricky.push(i)
  })
  if (wrong.length === 0) return correctIndex === 0 ? 1 : 0 // 選択肢が1つしかない誤った入力。正解とは別の番号を返す
  return rng.pick(tricky.length > 0 ? tricky : wrong)
}

/** 組み立てが再開したとき、押す予定を過ぎていたら押すまでの時間（0.6〜1.2秒） */
export function cpuResumeDelayMs(rng: Rng): number {
  return Math.round(rng.range(CPU_RESUME_DELAY_MIN_MS, CPU_RESUME_DELAY_MAX_MS))
}
