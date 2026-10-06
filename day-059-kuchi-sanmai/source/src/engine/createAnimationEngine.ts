// エンジンの生成口。UI はここだけを呼び、どの実装が動いているかを知らない。

import { SpriteAnimationEngine } from './SpriteAnimationEngine'
import type { AnimationEngine, AnimationEngineDeps, AnimationEngineId } from '../types/animation'

export function createAnimationEngine(id: AnimationEngineId = 'sprite', deps?: AnimationEngineDeps): AnimationEngine {
  // 'ai' は MVP の対象外。呼ばれたら黙って sprite に落とさず、実装が無いことを明示して落とす
  if (id === 'ai') throw new Error('AIAnimationEngine is not available yet')
  return new SpriteAnimationEngine(deps)
}
