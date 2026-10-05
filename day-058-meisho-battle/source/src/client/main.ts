// 入口。模型の描画（アプリ全体で1つ）を全画面の後ろに置き、その上に画面の層を重ねる。
// 画面の登録 → タイトルへ。100日チャレンジ版（Day58）はネット対戦を入れない（サーバーを置かない）ので、
// ネット対戦の画面と ?room= のリンクの扱いは登録しない。

import './styles/base.css'
import './styles/screens.css'
import './styles/game.css'

import { createAudio } from './audio'
import { readUrlOptions } from './game/url-options'
import { createDioramaView, type DioramaView } from './render'
import { App } from './ui/app'
import { nullView, ViewProxy } from './ui/backdrop'
import { h } from './ui/dom'
import { registerCoreScreens } from './ui/screens'
import { createSettings } from './ui/settings-store'

function boot(): void {
  const host = document.getElementById('app')
  if (!host) return
  host.replaceChildren()
  const stage = h('div', { class: 'stage', 'aria-hidden': 'true' })
  const uiRoot = h('div', { class: 'ui' })
  host.append(stage, uiRoot)

  const settings = createSettings()
  const audio = createAudio(settings)
  const url = readUrlOptions()

  // WebGL が使えない端末では mount が例外を投げる。受け止めて、理由を出す画面へ
  let real: DioramaView | null = null
  let webgl = true
  try {
    real = createDioramaView()
    real.mount(stage)
  } catch (err) {
    console.warn('[main] 3Dの描画を始められなかった', err)
    try {
      real?.dispose()
    } catch {
      // 片付けに失敗しても先へ進む
    }
    real = null
    webgl = false
    stage.replaceChildren()
  }
  const view = new ViewProxy(real ?? nullView())
  // 部品の着地「コトッ」と色塗り「シャラン」（間引きは audio の側）
  view.onPartLanded((e) => audio.play('land', { size: e.size }))
  view.onPaintStart(() => audio.play('paint'))

  const app = new App({ uiRoot, view, audio, settings, url })
  document.documentElement.dataset.webgl = webgl ? 'yes' : 'no'

  // 最初のタップ・キーで音を使えるようにする（それより前は鳴らさない）
  const unlockEvents = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const
  const unlock = (): void => {
    audio.unlock()
    if (audio.ready) for (const ev of unlockEvents) window.removeEventListener(ev, unlock, true)
  }
  for (const ev of unlockEvents) window.addEventListener(ev, unlock, true)

  registerCoreScreens(app)

  if (!webgl) {
    app.go('nogl')
    return
  }
  app.go('title')
}

boot()
