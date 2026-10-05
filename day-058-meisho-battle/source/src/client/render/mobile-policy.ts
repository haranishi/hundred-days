import type { Quality } from './diorama'

/** Coarse pointers default to the bounded mobile preset; explicit user settings win. */
export function defaultQuality(coarsePointer: boolean): Quality {
  return coarsePointer ? 'low' : 'high'
}

/** Cap both DPR and total pixels so large tablets cannot allocate unbounded post buffers. */
export function boundedPixelRatio(width: number, height: number, dpr: number, maximum: number): number {
  const pixels = Math.max(1, width) * Math.max(1, height)
  const safeDpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
  return Math.min(safeDpr, maximum, Math.sqrt(4_000_000 / pixels))
}

export function canStartDrag(button: number, dragging: boolean): boolean {
  return button === 0 && !dragging
}

export function releaseVelocity(velocity: number, idleMs: number, reducedMotion: boolean, cancelled: boolean): number {
  return reducedMotion || cancelled || idleMs > 120 ? 0 : Math.max(-240, Math.min(240, velocity))
}
