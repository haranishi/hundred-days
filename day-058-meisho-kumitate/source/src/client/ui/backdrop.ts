// 模型の描画（アプリ全体で1つ）の扱い。
// - ViewProxy：ctx.view として渡す薄い包み。'title'（タイトルの島）がすでに出ているときの setLandmark('title') は
//   作り直さない（画面を移るたびに島が組み上がり直すのを防ぐ。島はゲームに使わないので、いつも完成のまま）
// - nullView：WebGL が使えない端末で使う、何もしない描画
// - showTitleBackdrop：タイトルや設定の画面の後ろに、ゆっくり回る島を出す

import type { DioramaView, PartLandedEvent, Quality } from '../render'
import type { AppContext } from './app-context'

export class ViewProxy implements DioramaView {
  private readonly inner: DioramaView
  private current: string | null = null

  constructor(inner: DioramaView) {
    this.inner = inner
  }

  /** いま出している模型の id */
  get landmarkId(): string | null {
    return this.current
  }

  mount(container: HTMLElement): void {
    this.inner.mount(container)
  }

  setLandmark(id: string): void {
    if (id === 'title' && this.current === 'title') return
    this.current = id
    this.inner.setLandmark(id)
  }

  setProgress(p: number): void {
    this.inner.setProgress(p)
  }

  showComplete(): void {
    this.inner.showComplete()
  }

  setInteractive(enabled: boolean): void {
    this.inner.setInteractive(enabled)
  }

  onPartLanded(cb: (e: PartLandedEvent) => void): void {
    this.inner.onPartLanded(cb)
  }

  onPaintStart(cb: () => void): void {
    this.inner.onPaintStart(cb)
  }

  onModelReady(cb: () => void): () => void {
    return this.inner.onModelReady?.(cb) ?? (() => {})
  }

  setQuality(q: Quality): void {
    this.inner.setQuality(q)
  }

  resize(): void {
    this.inner.resize()
  }

  dispose(): void {
    this.inner.dispose()
  }
}

export function nullView(): DioramaView {
  const noop = (): void => {}
  let onReady = noop
  return {
    onModelReady(cb) { onReady = cb; return () => { onReady = noop } },
    mount: noop,
    setLandmark: () => onReady(),
    setProgress: noop,
    showComplete: noop,
    setInteractive: noop,
    onPartLanded: noop,
    onPaintStart: noop,
    setQuality: noop,
    resize: noop,
    dispose: noop,
  }
}

export function showTitleBackdrop(ctx: AppContext, interactive = true): void {
  ctx.view.setLandmark('title')
  ctx.view.showComplete()
  ctx.view.setInteractive(interactive)
}
