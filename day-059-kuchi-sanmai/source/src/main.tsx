import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DayBar } from './components/DayBar/DayBar'
import { PolicyBoundary } from './components/Legal/PolicyBoundary'

// 100日チャレンジ版：認証版と同意画面は持ち込まず、開くとすぐスタジオを出す。
// 規約・プライバシー・Cookieの説明は、画面の下のリンク（#terms など）から PolicyBoundary が重ねて出す。
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DayBar />
    <PolicyBoundary><App /></PolicyBoundary>
  </StrictMode>,
)
