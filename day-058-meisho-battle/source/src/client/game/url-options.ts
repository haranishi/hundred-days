// URL で渡せる指定（自動テストと確認用）。
//   ?seed=数字   乱数の種を固定する（同じ種なら同じ出題・同じコンピューターの動き）
//   ?speed=数字  ひとり・ふたりの時間を速める（8 なら8倍）
//   ?test=1      ひとり・ふたりの状態を window.__MMB__ に出す（ネット対戦では出さない）
//   ?gfx=test    描画を軽くする（描画の側が自分で読む。ここでは扱わない）

export interface UrlOptions {
  seed: number | null
  speed: number
  test: boolean
}

const SPEED_MIN = 0.25
const SPEED_MAX = 32

export function readUrlOptions(search: string = typeof location === 'undefined' ? '' : location.search): UrlOptions {
  const params = new URLSearchParams(search)
  const rawSeed = params.get('seed')
  const seed = rawSeed !== null && /^\d{1,10}$/.test(rawSeed) ? Number(rawSeed) >>> 0 : null
  const rawSpeed = Number(params.get('speed') ?? '1')
  const speed = Number.isFinite(rawSpeed) && rawSpeed > 0 ? Math.min(SPEED_MAX, Math.max(SPEED_MIN, rawSpeed)) : 1
  return { seed, speed, test: params.get('test') === '1' }
}
