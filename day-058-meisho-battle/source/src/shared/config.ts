// ゲームの数字はここに集める（docs/03 の表と同じ値）。調整するときはここだけを変える。
// 画面・ルール・サーバーのすべてがこの値を読む。

import type { CpuLevel } from './types'

/** 1ゲームの問題数 */
export const QUESTIONS_PER_GAME = 8

/** 1問目の前の「3・2・1」 */
export const COUNTDOWN_MS = 3000
/** 各問の頭の「第◯問」の札 */
export const INTRO_MS = 1200
/** 組み立て（進み具合 0→1）にかかる時間。押した人が答えている間は止まる */
export const BUILD_MS = 15000
/** 完成後もまだ押せる時間 */
export const LAST_CALL_MS = 4000
/** 押してから4択を選ぶまでの制限時間。過ぎたらまちがいと同じ */
export const ANSWER_MS = 6000
/** 答えあわせの表示時間 */
export const REVEAL_MS = 5500

/** 正解の得点：MAX − (MAX − MIN) × 進み具合 を10点単位で丸める */
export const MAX_POINTS = 1000
export const MIN_POINTS = 200
/** まちがい（お手つき・時間切れ）の減点 */
export const WRONG_PENALTY = 200

/** ネット対戦：最初の押しが届いてから、ほかの押しを集める時間 */
export const BUZZ_WINDOW_MS = 150
/** ネット対戦：端末が申告した進み具合が、サーバーの値からさかのぼれる上限 */
export const BUZZ_MAX_REWIND = 0.03

/** ネット対戦の人数 */
export const ROOM_MIN_PLAYERS = 2
export const ROOM_MAX_PLAYERS = 4
/** 切断した人の席を残す時間 */
export const RECONNECT_GRACE_MS = 60000
/** 相手探しで待つ時間。過ぎたらコンピューター対戦へ切り替える */
export const MATCH_TIMEOUT_MS = 20000
/** 名前の最大文字数 */
export const NAME_MAX_CHARS = 8
/** 1つの接続から受け付ける1秒あたりの通数 */
export const MAX_MESSAGES_PER_SECOND = 20

// ── コンピューター（ガイドさん）：docs/03 の表と規則 ──

/** 強さごとの「押す進み具合（平均・ばらつき＝標準偏差）」と「当たる確率」 */
export const CPU_LEVELS = {
  minarai: { buzzMean: 0.7, buzzSd: 0.08, accuracy: 0.65 },
  veteran: { buzzMean: 0.52, buzzSd: 0.08, accuracy: 0.8 },
  densetsu: { buzzMean: 0.36, buzzSd: 0.07, accuracy: 0.92 },
} as const satisfies Record<CpuLevel, { buzzMean: number; buzzSd: number; accuracy: number }>
/** 名所の難しさが1上がるごとに、押す進み具合を遅らせる量 */
export const CPU_DIFFICULTY_DELAY = 0.06
/** 押す進み具合の範囲。1を超えたら最後のチャンスに押す */
export const CPU_BUZZ_MIN = 0.12
export const CPU_BUZZ_MAX = 1.05
/** 組み立てが再開したとき、押す予定を過ぎていたら、この間の時間で押す */
export const CPU_RESUME_DELAY_MIN_MS = 600
export const CPU_RESUME_DELAY_MAX_MS = 1200
/** 押してから答えるまで「考える」時間 */
export const CPU_THINK_MIN_MS = 1000
export const CPU_THINK_MAX_MS = 1800
