// 画面をまとめて登録する（100日チャレンジ版はネット対戦の画面を持たない）。

import type { AppContext } from '../app-context'
import { simpleNotice } from '../app'
import { createGameScreen } from '../game/game-screen'
import { createResultScreen } from '../result-screen'
import { createCreditsScreen, createHowtoScreen, createSettingsScreen, createSourcesScreen } from './info'
import { createDuoScreen, createSoloScreen } from './setup'
import { createTitleScreen } from './title'

export function registerCoreScreens(ctx: AppContext): void {
  ctx.registerScreen('title', (c) => createTitleScreen(c))
  ctx.registerScreen('howto', createHowtoScreen)
  ctx.registerScreen('solo', createSoloScreen)
  ctx.registerScreen('duo', createDuoScreen)
  ctx.registerScreen('settings', createSettingsScreen)
  ctx.registerScreen('credits', createCreditsScreen)
  ctx.registerScreen('sources', createSourcesScreen)
  ctx.registerScreen('game', createGameScreen)
  ctx.registerScreen('result', createResultScreen)
  // WebGL が使えない端末（模型を描けないと遊べないので、理由だけを出す）
  ctx.registerScreen('nogl', (c) =>
    simpleNotice(
      c,
      'この端末では3Dの模型を表示できません',
      'このゲームは模型を3Dで描きます。ブラウザの設定でハードウェアアクセラレーション（WebGL）を有効にするか、別のブラウザでお試しください。',
      false,
    ),
  )
}
