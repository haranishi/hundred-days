/**
 * HUD とタッチ操作の見た目（CSS）。色は palette.ts の変数だけを使う。
 * 数字は幅をそろえ（tabular-nums）、見出しは値札POPのような太い字にする（docs/02 ⑤）。
 */
import { paletteCssVars } from '../../render/palette';

export const HUD_CSS = /* css */ `
#app { position: fixed; inset: 0; overflow: hidden; }
#stage { position: absolute; inset: 0; background: var(--sy-cream); }
#stage canvas { display: block; touch-action: none; }
#hud { position: absolute; inset: 0; pointer-events: none; z-index: 5; font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Noto Sans JP', 'Meiryo', system-ui, sans-serif; color: var(--sy-ink); -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
.syh-hud { position: absolute; inset: 0; display: none; }
.syh-hud.is-on { display: block; }
.syh-num { font-variant-numeric: tabular-nums; }

/* 上の帯：自分の荒らし度・残り時間・相手 */
.syh-top { position: absolute; top: max(8px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); display: flex; align-items: stretch; gap: 12px; width: max-content; }
.syh-timer { min-width: 114px; padding: 4px 14px 6px; border-radius: 16px; background: var(--sy-panel); box-shadow: 0 3px 0 var(--sy-shadow); text-align: center; font-weight: 900; font-size: 36px; line-height: 1.08; display: flex; flex-direction: column; justify-content: center; }
.syh-timer small { display: block; font-size: 12.5px; font-weight: 800; letter-spacing: .08em; opacity: .78; }
.syh-timer.is-spurt { background: var(--sy-red); color: var(--sy-white); animation: syh-pulse .5s ease-in-out infinite alternate; }
.syh-card { padding: 5px 12px 6px; border-radius: 14px; background: var(--sy-panel); box-shadow: 0 3px 0 var(--sy-shadow); min-width: 108px; display: flex; flex-direction: column; justify-content: center; }
.syh-card .syh-who { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 800; white-space: nowrap; max-width: 170px; overflow: hidden; text-overflow: ellipsis; }
.syh-card .syh-pts { font-size: 28px; font-weight: 900; line-height: 1.05; }
.syh-card .syh-pts small { font-size: 13px; font-weight: 800; margin-left: 2px; }
.syh-card.is-rival { opacity: .96; }
.syh-card.is-bump .syh-pts { animation: syh-bump .28s ease-out; }
.syh-card .syh-who > span:not(.syh-badge):not(.syh-cpu) { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.syh-cpu { flex: none; padding: 0 5px; border-radius: 6px; background: var(--sy-ink); color: var(--sy-white); font-size: 12px; font-weight: 900; line-height: 17px; }
.syh-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 30px; height: 20px; padding: 0 5px; border-radius: 10px; color: var(--sy-white); font-weight: 900; font-size: 12px; }

/* やっちゃダメリスト（左上） */
/* 一覧は見出しのボタンだけが指を受ける。項目に触れた指は下のスティックへ通す（開いていても動ける。round4 の F1） */
.syh-list { position: absolute; top: max(8px, env(safe-area-inset-top)); left: max(8px, env(safe-area-inset-left)); width: 232px; background: var(--sy-panel); border-radius: 14px; box-shadow: 0 3px 0 var(--sy-shadow); overflow: hidden; pointer-events: none; }
.syh-list-head { pointer-events: auto; }
/* 見出しは白地に赤い字（赤い面は「蹴る」のボタンに集める。C7） */
.syh-list-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; min-height: 40px; padding: 6px 12px; border: 0; border-bottom: 2px solid color-mix(in srgb, var(--sy-red) 22%, transparent); background: var(--sy-panel); color: var(--sy-red); font: inherit; font-size: 14px; font-weight: 900; cursor: pointer; text-align: left; }
.syh-list.is-collapsed .syh-list-head { border-bottom-color: transparent; }
.syh-list-head b { color: var(--sy-ink); }
.syh-list-head:focus-visible { outline: 3px solid var(--sy-blue); outline-offset: -3px; }
/* 達成したとき（横画面で一覧を開かない代わり）：見出しを黄色く光らせる */
.syh-list-head.is-got { animation: syh-got 1.1s ease-out; }
/* 店員の吹き出し・頭の札・点の「ポン」・待ち時間は、HUD の札の下に（点の欄に重ならない。C7） */
.syh-waits, .syh-npcs, .syh-heads, .syh-pops { position: absolute; inset: 0; z-index: 1; }
.syh-top, .syh-list, .syh-combo, .syh-feed, .syh-pause, .syh-hint, .syh-arrows, .syh-rivals, .syh-center, .syh-pa { z-index: 2; }
.syh-countbox { z-index: 3; }
.syh-list ul { list-style: none; margin: 0; padding: 4px 8px 6px; }
.syh-list li { position: relative; display: flex; align-items: center; gap: 6px; padding: 3px 2px; font-size: 12.5px; font-weight: 700; line-height: 1.3; border-bottom: 1px dashed rgba(43,43,58,.12); }
.syh-list li:last-child { border-bottom: 0; }
.syh-list li .syh-box { flex: none; width: 15px; height: 15px; border: 2px solid var(--sy-ink); border-radius: 4px; opacity: .55; }
.syh-list li.is-done { color: rgba(43,43,58,.55); }
.syh-list li.is-done .syh-box { opacity: 1; background: var(--sy-red); border-color: var(--sy-red); }
.syh-list li.is-done::after { content: '済'; position: absolute; right: 4px; top: 50%; width: 24px; height: 24px; margin-top: -12px; border: 2px solid var(--sy-stamp); border-radius: 50%; color: var(--sy-stamp); font-size: 12px; font-weight: 900; display: flex; align-items: center; justify-content: center; transform: rotate(-14deg); }
.syh-list li.is-new::after { animation: syh-stamp .45s cubic-bezier(.2,1.6,.4,1); }
.syh-list li.is-secret { font-style: normal; color: rgba(43,43,58,.6); }
.syh-list.is-collapsed ul { display: none; }
/* 畳んでいる間の「近く：〇〇 ↑」 */
.syh-next { display: none; align-items: center; gap: 6px; padding: 5px 8px 6px 10px; background: var(--sy-panel); font-size: 12px; font-weight: 900; line-height: 1.3; }
.syh-list.is-collapsed .syh-next.is-on { display: flex; }
.syh-next span { flex: 1; min-width: 0; word-break: keep-all; overflow-wrap: anywhere; }
.syh-next b { flex: none; min-width: 26px; height: 26px; padding: 0 5px; border-radius: 13px; background: var(--sy-blue); color: var(--sy-white); font-size: 16px; display: flex; align-items: center; justify-content: center; }
.syh-next.is-here b { font-size: 11px; background: var(--sy-red); }
.syh-list .syh-caret { font-size: 12px; }

/* コンボ（右） */
.syh-combo { position: absolute; right: max(10px, env(safe-area-inset-right)); top: 34%; min-width: 92px; padding: 6px 10px 8px; border-radius: 14px; background: var(--sy-yellow); box-shadow: 0 3px 0 var(--sy-shadow); text-align: center; font-weight: 900; opacity: 0; transform: translateX(16px); transition: opacity .15s, transform .15s; }
.syh-combo.is-on { opacity: 1; transform: none; }
.syh-combo .syh-combo-label { font-size: 12px; }
.syh-combo .syh-combo-mult { font-size: 30px; line-height: 1; }
.syh-combo .syh-combo-bar { height: 6px; margin-top: 5px; border-radius: 3px; background: rgba(43,43,58,.18); overflow: hidden; }
.syh-combo .syh-combo-bar i { display: block; height: 100%; background: var(--sy-red); }
.syh-combo.is-up { animation: syh-bump .3s ease-out; }
.syh-combo .syh-combo-tip { margin-top: 5px; font-size: 12px; line-height: 1.25; }
/* ×1.0（まだつながっていない）は小さく、×1.2 以上で大きく（C7） */
.syh-combo.is-base { min-width: 0; padding: 4px 8px 5px; background: var(--sy-panel); }
.syh-combo.is-base .syh-combo-label { display: none; }
.syh-combo.is-base .syh-combo-mult { font-size: 14px; opacity: .7; }
.syh-combo.is-base .syh-combo-bar { height: 4px; margin-top: 3px; }
.syh-combo.is-base .syh-combo-tip { margin-top: 3px; font-size: 12px; }

/* 頭の上の札と、点の「ポン」 */
.syh-head { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); white-space: nowrap; font-weight: 900; font-size: 12px; text-align: center; }
.syh-head .syh-badge { box-shadow: 0 2px 0 var(--sy-shadow); }
.syh-head .syh-head-combo { display: block; margin-top: 2px; color: var(--sy-red); font-size: 15px; text-shadow: 0 0 3px var(--sy-white), 0 0 3px var(--sy-white); }
.syh-pop { position: absolute; left: 0; top: 0; font-weight: 900; font-size: 20px; text-shadow: 0 2px 0 var(--sy-white), 0 0 4px var(--sy-white); animation: syh-pop .9s ease-out forwards; white-space: nowrap; }
.syh-pop.is-big { font-size: 28px; }
.syh-pop .syh-pop-mark { display: inline-flex; align-items: center; justify-content: center; width: 1.05em; height: 1.05em; margin-right: 2px; border-radius: 50%; color: var(--sy-white); font-size: .62em; vertical-align: .18em; text-shadow: none; box-shadow: 0 0 0 2px var(--sy-white); }

/* 中央の大きな文字（カウントダウン・ラストスパート・達成・そこまで） */
.syh-center { position: absolute; left: 0; right: 0; top: 30%; display: flex; flex-direction: column; align-items: center; gap: 8px; }
/* カウントダウンと「スタート！」は上の中央（残り時間の下）。キャラにも札にも重ねない（C6） */
.syh-countbox { position: absolute; left: 50%; top: calc(max(8px, env(safe-area-inset-top)) + 78px); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; pointer-events: none; }
/* 数字はクリームの下地ピル＋濃い縁取り（赤い缶ピラミッドの上でも「3」「2」「1」がはっきり読める） */
.syh-count { min-width: 84px; padding: 4px 20px 6px; border-radius: 26px; background: var(--sy-panel); border: 4px solid var(--sy-ink); box-shadow: 0 5px 0 var(--sy-shadow); text-align: center; font-size: 60px; font-weight: 900; line-height: 1; color: var(--sy-red); -webkit-text-stroke: 6px var(--sy-white); paint-order: stroke fill; text-shadow: 0 3px 0 var(--sy-shadow); animation: syh-in .25s cubic-bezier(.2,1.5,.4,1); }
.syh-count.is-go { font-size: 42px; color: var(--sy-blue); white-space: nowrap; }

/* 開始の3秒の「やっちゃダメ10個」の札：縦長は2列を上に、横長は左右に分けてキャラをよける（C6） */
.syh-intro { position: absolute; left: 0; right: 0; top: calc(max(8px, env(safe-area-inset-top)) + 150px); display: none; pointer-events: none; }
.syh-intro.is-on { display: block; }
.syh-intro-title { width: max-content; margin: 0 auto 6px; padding: 3px 14px; border-radius: 999px; background: var(--sy-panel); color: var(--sy-red); font-size: 15px; font-weight: 900; box-shadow: 0 3px 0 var(--sy-shadow); }
.syh-intro-title b { color: var(--sy-ink); font-size: 18px; }
.syh-intro-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; max-width: 440px; margin: 0 auto; padding: 0 10px; }
.syh-intro-col { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.syh-intro-card { display: flex; align-items: center; gap: 7px; min-height: 40px; padding: 5px 9px; border-radius: 12px; background: var(--sy-panel); box-shadow: 0 3px 0 var(--sy-shadow); font-size: 13px; font-weight: 800; line-height: 1.25; animation: syh-in .3s cubic-bezier(.2,1.4,.4,1) both; transition: transform .45s cubic-bezier(.55,0,.8,.3), opacity .45s ease-in; }
.syh-intro-card b { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: var(--sy-red); color: var(--sy-white); font-size: 12px; font-weight: 900; }
.syh-intro-card span { min-width: 0; word-break: keep-all; overflow-wrap: anywhere; }
.syh-intro-title { transition: transform .45s cubic-bezier(.55,0,.8,.3), opacity .45s ease-in; }
/* 吸い込むときは、出てくる動き（animation）を外して transform を効かせる */
.syh-intro.is-folding .syh-intro-card { animation: none; }
@media (min-aspect-ratio: 11/10) {
  .syh-intro { top: 50%; transform: translateY(-45%); }
  .syh-intro-cols { display: flex; justify-content: space-between; align-items: flex-start; max-width: none; padding: 0 max(12px, 3vw); }
  .syh-intro-col { width: min(30vw, 300px); }
  /* 見出しは左の列の上に。右の列は見出しの高さから始める（下の操作ボタンにかからない） */
  .syh-intro-title { margin: 0 0 8px max(12px, 3vw); }
  .syh-intro-col + .syh-intro-col { margin-top: -38px; }
}
@media (min-aspect-ratio: 11/10) and (max-height: 460px) {
  /* スマホ横：右下は操作ボタンなので、2列とも左（キャラの左、スティックの案内の上）にまとめる */
  .syh-intro { top: calc(max(8px, env(safe-area-inset-top)) + 58px); left: max(10px, env(safe-area-inset-left)); right: auto; width: min(372px, 44vw); transform: none; }
  .syh-intro-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 0; }
  .syh-intro-col { width: auto; gap: 4px; }
  .syh-intro-card { min-height: 28px; padding: 2px 7px; font-size: 11px; gap: 5px; }
  .syh-intro-card b { width: 18px; height: 18px; font-size: 10px; }
  .syh-intro-title { font-size: 12px; margin: 0 0 5px; }
  .syh-intro-col + .syh-intro-col { margin-top: 0; }
}

/* スマホ：カウントダウンの間だけ、左下に半透明のスティックと「ここをドラッグで移動」（C5） */
.syh-stick-hint { position: absolute; left: max(22px, env(safe-area-inset-left)); bottom: calc(max(22px, env(safe-area-inset-bottom)) + 40px); display: none; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; }
.syh-hud.is-touch .syh-stick-hint.is-on { display: flex; }
.syh-stick-hint i { position: relative; display: block; width: 110px; height: 110px; border-radius: 50%; background: rgba(255,255,255,.4); border: 3px dashed rgba(43,43,58,.35); }
.syh-stick-hint i b { position: absolute; left: 28px; top: 28px; width: 54px; height: 54px; border-radius: 50%; background: rgba(255,255,255,.85); box-shadow: 0 3px 0 var(--sy-shadow); animation: syh-drag 1.2s ease-in-out infinite; }
.syh-stick-hint span { padding: 4px 10px; border-radius: 10px; background: var(--sy-ink); color: var(--sy-white); font-size: 13px; font-weight: 900; white-space: nowrap; }
@media (max-height: 460px) {
  .syh-stick-hint { bottom: max(6px, env(safe-area-inset-bottom)); gap: 4px; }
  .syh-stick-hint i { width: 70px; height: 70px; }
  .syh-stick-hint i b { left: 14px; top: 14px; width: 36px; height: 36px; }
  .syh-stick-hint span { padding: 3px 8px; font-size: 11px; }
}
.syh-banner { padding: 10px 22px; border-radius: 16px; background: var(--sy-red); color: var(--sy-white); font-size: 24px; font-weight: 900; box-shadow: 0 4px 0 var(--sy-shadow); text-align: center; animation: syh-in .3s cubic-bezier(.2,1.5,.4,1); }
.syh-banner small { display: block; font-size: 14px; font-weight: 800; }
.syh-banner.is-yellow { background: var(--sy-yellow); color: var(--sy-ink); }
.syh-banner.is-blue { background: var(--sy-blue); }

/* 見つかった：店員がいる側の画面の端を赤く光らせ、「見つかった！」を1秒 */
.syh-found { position: absolute; inset: 0; display: none; z-index: 3; }
.syh-found.is-on { display: block; animation: syh-found 1s ease-out forwards; }
.syh-found::before { content: ''; position: absolute; }
.syh-found.is-left::before { left: 0; top: 0; bottom: 0; width: min(24vw, 180px); background: linear-gradient(to right, color-mix(in srgb, var(--sy-red) 78%, transparent), transparent); }
.syh-found.is-right::before { right: 0; top: 0; bottom: 0; width: min(24vw, 180px); background: linear-gradient(to left, color-mix(in srgb, var(--sy-red) 78%, transparent), transparent); }
.syh-found.is-top::before { left: 0; right: 0; top: 0; height: min(24vh, 160px); background: linear-gradient(to bottom, color-mix(in srgb, var(--sy-red) 78%, transparent), transparent); }
.syh-found.is-bottom::before { left: 0; right: 0; bottom: 0; height: min(24vh, 160px); background: linear-gradient(to top, color-mix(in srgb, var(--sy-red) 78%, transparent), transparent); }
.syh-found b { position: absolute; padding: 6px 14px; border-radius: 12px; background: var(--sy-red); color: var(--sy-white); font-size: 22px; font-weight: 900; white-space: nowrap; box-shadow: 0 3px 0 var(--sy-shadow); }
/* 「見つかった！」の字は、どの向きでも上寄り（下の操作ボタンにかからない。round4 の F5）。光る縁は店員の側 */
.syh-found.is-left b { left: 14px; top: 30%; transform: translateY(-50%); }
.syh-found.is-right b { right: 14px; top: 30%; transform: translateY(-50%); }
.syh-found.is-top b, .syh-found.is-bottom b { top: calc(max(8px, env(safe-area-inset-top)) + 120px); left: 50%; transform: translateX(-50%); }

/* 補充・積み直し・並び直しの待ち時間（台や棚の上に浮かべる） */
.syh-wait { position: absolute; left: 0; top: 0; padding: 3px 10px; border-radius: 10px; background: var(--sy-ink); color: var(--sy-white); font-size: 13px; font-weight: 900; white-space: nowrap; box-shadow: 0 2px 0 var(--sy-shadow); font-variant-numeric: tabular-nums; }

/* 捕まった帯：画面いっぱいの不透明な帯。キャラの頭より上に出して、つかまれているところは隠さない */
.syh-caught { position: absolute; left: 0; right: 0; top: 19%; z-index: 4; display: none; padding: 12px 16px 14px; background: var(--sy-ink); color: var(--sy-white); text-align: center; box-shadow: 0 5px 0 var(--sy-shadow); }
.syh-caught.is-on { display: block; animation: syh-band .25s cubic-bezier(.2,1.4,.4,1); }
.syh-caught b { display: block; font-size: 44px; font-weight: 900; line-height: 1.1; color: var(--sy-yellow); letter-spacing: .04em; }
.syh-caught span { display: block; margin-top: 2px; font-size: 20px; font-weight: 900; }
.syh-caught i { position: absolute; left: 0; bottom: 0; height: 5px; width: 100%; background: var(--sy-red); }

/* 目立ち度（自分の点の下の細い帯。30以上で店員に見つかる）。PC は帯の左に名前を出す */
.syh-heat-row { display: flex; align-items: center; gap: 5px; margin-top: 3px; }
.syh-heat-label { flex: none; font-size: 12.5px; font-weight: 900; line-height: 1; opacity: .82; }
.syh-hud.is-touch .syh-heat-label { display: none; }
.syh-heat { flex: 1; height: 5px; border-radius: 3px; background: rgba(43,43,58,.12); overflow: hidden; }
.syh-heat i { display: block; height: 100%; width: 0; background: var(--sy-yellow); transition: width .25s; }
.syh-heat.is-hot i { background: var(--sy-red); }

/* リストの進み具合（12/20） */
.syh-list li .syh-name { flex: 1; min-width: 0; word-break: keep-all; overflow-wrap: anywhere; }
.syh-list li .syh-prog { flex: none; font-size: 12px; font-weight: 900; color: var(--sy-blue); }
/* 補充などの待ち時間は、名前の下の段に（名前の文節が途中で折れないように） */
.syh-list li.is-wait { flex-wrap: wrap; }
.syh-list li.is-wait .syh-prog { flex-basis: 100%; padding-left: 21px; color: var(--sy-ink); opacity: .7; }

/* 店員・客の吹き出しと、追ってくる店員の矢印 */
.syh-bubble { position: absolute; left: 0; top: 0; padding: 2px 9px; border-radius: 10px; background: var(--sy-white); color: var(--sy-ink); font-size: 13px; font-weight: 900; box-shadow: 0 2px 0 var(--sy-shadow); white-space: nowrap; }
.syh-bubble::after { content: ''; position: absolute; left: 50%; bottom: -5px; margin-left: -5px; border: 5px solid transparent; border-bottom: 0; border-top-color: var(--sy-white); }
.syh-bubble.is-alert { background: var(--sy-red); color: var(--sy-white); font-size: 18px; padding: 1px 10px; }
.syh-bubble.is-alert::after { border-top-color: var(--sy-red); }
.syh-arrow { position: absolute; left: 0; top: 0; width: 46px; height: 46px; border-radius: 50%; background: var(--sy-red); color: var(--sy-white); display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900; box-shadow: 0 3px 0 var(--sy-shadow); animation: syh-pulse .4s ease-in-out infinite alternate; }
.syh-arrow b { position: relative; z-index: 1; }
.syh-arrow-tip { position: absolute; inset: 0; }
.syh-arrow-tip::before { content: ''; position: absolute; right: -11px; top: 50%; margin-top: -9px; border: 9px solid transparent; border-right: 0; border-left: 13px solid var(--sy-red); }
.syh-rival-arrow { position: absolute; left: 0; top: 0; width: 38px; height: 38px; border-radius: 50%; border: 3px solid var(--sy-ink); box-sizing: border-box; color: var(--sy-white); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; box-shadow: 0 3px 0 var(--sy-shadow); }
.syh-rival-arrow b { position: relative; z-index: 1; line-height: 1; }
.syh-rival-tip { position: absolute; inset: -3px; }
.syh-rival-tip::before { content: ''; position: absolute; right: -10px; top: 50%; margin-top: -6px; border: 6px solid transparent; border-right: 0; border-left: 10px solid var(--sy-ink); }

/* 店内放送の字幕 */
/* 店内放送の字幕は、上の帯（残り時間）の下の細い帯に（キャラの上に重ねない。round4 の F5） */
.syh-pa { position: absolute; left: 50%; top: calc(max(8px, env(safe-area-inset-top)) + 84px); transform: translateX(-50%); max-width: min(70vw, 640px); padding: 4px 14px; border-radius: 10px; background: var(--sy-ink); color: var(--sy-white); font-size: 14px; font-weight: 800; line-height: 1.45; text-align: center; opacity: 0; transition: opacity .2s; pointer-events: none; }
.syh-pa.is-on { opacity: 1; animation: syh-in .3s ease-out; }
.syh-pa b { color: var(--sy-yellow); margin-right: 6px; }
.syh-hud.is-touch .syh-pa { font-size: 13px; }

/* 長押しの進み（PCの案内） */
.syh-hold { display: inline-block; width: 60px; height: 8px; margin-left: 8px; border-radius: 4px; background: rgba(43,43,58,.18); overflow: hidden; vertical-align: middle; }
.syh-hold i { display: block; height: 100%; background: var(--sy-red); }
.syh-banner.is-dark { background: var(--sy-ink); }

/* 相手の達成の知らせ（右上） */
.syh-feed { position: absolute; right: max(10px, env(safe-area-inset-right)); top: calc(max(8px, env(safe-area-inset-top)) + 58px); display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.syh-feed-item { padding: 4px 10px; border-radius: 10px; background: var(--sy-panel); box-shadow: 0 2px 0 var(--sy-shadow); font-size: 12px; font-weight: 800; animation: syh-in .25s ease-out; }

/* 操作の案内（PC） */
.syh-hint { position: absolute; left: 50%; bottom: max(14px, env(safe-area-inset-bottom)); transform: translateX(-50%); padding: 7px 16px; border-radius: 999px; background: var(--sy-panel); box-shadow: 0 3px 0 var(--sy-shadow); font-size: 15px; font-weight: 900; white-space: nowrap; }
.syh-hint kbd { display: inline-block; min-width: 22px; padding: 1px 6px; margin: 0 2px; border-radius: 6px; background: var(--sy-ink); color: var(--sy-white); font: inherit; font-size: 13px; text-align: center; }
.syh-hint.is-special { background: var(--sy-yellow); }
.syh-hud.is-touch .syh-hint { display: none; }

.syh-pause { position: absolute; top: max(8px, env(safe-area-inset-top)); right: max(8px, env(safe-area-inset-right)); width: 48px; height: 48px; border: 0; border-radius: 14px; background: var(--sy-panel); box-shadow: 0 3px 0 var(--sy-shadow); font-size: 18px; font-weight: 900; color: var(--sy-ink); pointer-events: auto; cursor: pointer; }
.syh-pause:focus-visible { outline: 3px solid var(--sy-blue); }

/* タッチ操作 */
.syh-touch { position: absolute; inset: 0; display: none; }
#hud.syh-playing .syh-touch.is-on { display: block; }
.syh-stick-zone { position: absolute; left: 0; bottom: 0; width: 50%; top: 96px; pointer-events: auto; touch-action: none; }
.syh-stick { position: absolute; left: 0; top: 0; width: 120px; height: 120px; border-radius: 50%; background: rgba(255,255,255,.35); border: 3px solid rgba(43,43,58,.25); opacity: 0; pointer-events: none; }
.syh-stick.is-on { opacity: 1; }
.syh-stick-knob { position: absolute; left: 32px; top: 32px; width: 56px; height: 56px; border-radius: 50%; background: var(--sy-white); box-shadow: 0 3px 0 var(--sy-shadow); }
.syh-btn { position: absolute; z-index: 3; border: 3px solid var(--sy-ink); box-sizing: border-box; border-radius: 50%; pointer-events: auto; touch-action: none; font: inherit; font-weight: 900; color: var(--sy-white); box-shadow: 0 4px 0 var(--sy-shadow); -webkit-tap-highlight-color: transparent; }
.syh-btn.is-down { transform: translateY(3px); box-shadow: 0 1px 0 var(--sy-shadow); }
.syh-btn-action { right: max(18px, env(safe-area-inset-right)); bottom: max(22px, env(safe-area-inset-bottom)); width: 108px; height: 108px; background: var(--sy-red); font-size: 19px; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1; }
.syh-btn-action.is-special { background: var(--sy-blue); }
.syh-btn-action .syh-act-sub { font-size: 12px; }
/* 長押し・秒で数える悪事の進み（ボタンのまわりの輪） */
.syh-btn-action::after { content: ''; position: absolute; inset: -10px; border-radius: 50%; background: conic-gradient(var(--sy-yellow) calc(var(--p, 0) * 1%), transparent 0); -webkit-mask: radial-gradient(circle, transparent 56px, #000 57px); mask: radial-gradient(circle, transparent 56px, #000 57px); opacity: 0; pointer-events: none; }
.syh-btn-action.is-progress::after { opacity: 1; }
.syh-btn-dash, .syh-btn-jump { width: 70px; height: 70px; font-size: 13px; background: var(--sy-ink); }
.syh-btn-dash { right: max(140px, calc(env(safe-area-inset-right) + 140px)); bottom: max(28px, env(safe-area-inset-bottom)); }
.syh-btn-jump { right: max(36px, env(safe-area-inset-right)); bottom: max(146px, calc(env(safe-area-inset-bottom) + 146px)); }

@media (max-width: 860px) {
  /* 上の帯と重ならないよう、リストはその下に置く */
  .syh-list { top: calc(max(8px, env(safe-area-inset-top)) + 66px); }
}
@media (max-width: 720px) {
  .syh-top { gap: 6px; }
  .syh-timer { min-width: 84px; font-size: 26px; padding: 3px 10px 5px; }
  .syh-card { min-width: 76px; padding: 4px 8px 5px; }
  .syh-card .syh-pts { font-size: 20px; }
  .syh-card .syh-who { font-size: 11px; max-width: 92px; }
  .syh-timer small, .syh-card .syh-pts small, .syh-list li .syh-prog { font-size: 11px; }
  .syh-cpu { font-size: 10px; line-height: 16px; }
  .syh-combo .syh-combo-tip { font-size: 11px; }
  .syh-combo.is-base .syh-combo-tip { font-size: 10px; }
  .syh-list { width: min(176px, 46vw); top: calc(max(8px, env(safe-area-inset-top)) + 64px); }
  .syh-list-head { min-height: 36px; padding: 4px 10px; font-size: 13px; }
  .syh-list ul { padding: 3px 7px 5px; }
  /* 達成時に自動展開した一覧の下にバナーが収まるよう、スマホ縦だけ中央帯を少し下げる */
  .syh-center { top: 47%; }
  /* 放送の字幕は、一覧の見出しと「近く：」の段の下 */
  .syh-pa { top: calc(max(8px, env(safe-area-inset-top)) + 170px); max-width: 92vw; }
  /* 一覧の見出しの段（上の帯の下）に重ねないよう、数字はその下に */
  .syh-countbox { top: calc(max(8px, env(safe-area-inset-top)) + 116px); }
  .syh-intro { top: calc(max(8px, env(safe-area-inset-top)) + 172px); }
  .syh-list li { padding: 2px 2px; font-size: 11px; line-height: 1.2; }
  .syh-count { padding: 4px 16px 6px; border-width: 3px; font-size: 50px; }
  .syh-count.is-go { font-size: 34px; }
  .syh-banner { font-size: 19px; }
  .syh-combo { min-width: 70px; padding: 4px 8px 6px; top: 40%; }
  .syh-combo .syh-combo-mult { font-size: 22px; }
  .syh-pop { font-size: 16px; }
  .syh-pop.is-big { font-size: 22px; }
  .syh-caught b { font-size: 34px; }
  .syh-caught span { font-size: 16px; }
}
@media (max-width: 480px) {
  /* スマホ縦：右上の一時停止ボタンをよけて、その左の幅の真ん中に置く。
     相手の札は縮小（transform）をやめて字を小さくし、実際の幅を詰める（「2P▲ … CPU」と名前が消えないように） */
  .syh-top { left: calc((100% - 56px) / 2); }
  .syh-timer { min-width: 60px; padding: 3px 8px 5px; font-size: 25px; }
  .syh-card.is-rival { transform: none; min-width: 0; padding: 3px 7px 4px; }
  .syh-card.is-rival .syh-who { font-size: 10px; gap: 4px; max-width: 118px; }
  .syh-card.is-rival .syh-pts { font-size: 17px; }
  .syh-card.is-rival .syh-badge { min-width: 26px; height: 17px; padding: 0 4px; font-size: 10.5px; }
  .syh-card.is-rival .syh-cpu { padding: 0 4px; font-size: 9px; line-height: 14px; }
}
@media (max-height: 460px) {
  .syh-list { top: max(8px, env(safe-area-inset-top)); width: 180px; }
  .syh-center { top: 30%; }
  /* スマホ横：放送の字幕は上の帯の下（左の一覧にかからない幅）、コンボはジャンプのボタンより上、相手の知らせは一覧の下 */
  .syh-pa { top: calc(max(8px, env(safe-area-inset-top)) + 58px); max-width: 54vw; font-size: 12px; }
  .syh-combo { top: calc(max(8px, env(safe-area-inset-top)) + 58px); padding: 3px 8px 5px; }
  .syh-combo .syh-combo-label { font-size: 10px; }
  .syh-combo .syh-combo-mult { font-size: 20px; }
  .syh-combo .syh-combo-bar { margin-top: 3px; }
  .syh-combo .syh-combo-tip { margin-top: 3px; font-size: 10px; }
  /* 「見つかった！」の字は、どの向きでも上の帯のすぐ下の真ん中（右はコンボ、左は一覧があるので）。光る縁は店員の側 */
  .syh-found.is-left b, .syh-found.is-right b, .syh-found.is-top b, .syh-found.is-bottom b { top: calc(max(8px, env(safe-area-inset-top)) + 60px); left: 50%; right: auto; transform: translateX(-50%); font-size: 18px; }
  .syh-feed { right: auto; left: max(8px, env(safe-area-inset-left)); top: calc(max(8px, env(safe-area-inset-top)) + 108px); align-items: flex-start; }
  .syh-top { transform: translateX(-50%) scale(.85); transform-origin: top center; }
  .syh-countbox { top: calc(max(8px, env(safe-area-inset-top)) + 58px); }
  .syh-count { padding: 2px 14px 5px; border-width: 3px; font-size: 38px; }
  .syh-count.is-go { font-size: 28px; }
}

@keyframes syh-bump { 0% { transform: scale(1); } 40% { transform: scale(1.25); } 100% { transform: scale(1); } }
@keyframes syh-pop { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.5); } 15% { opacity: 1; transform: translate(-50%, -80%) scale(1.15); } 100% { opacity: 0; transform: translate(-50%, -240%) scale(1); } }
@keyframes syh-stamp { 0% { transform: rotate(-14deg) scale(2.4); opacity: 0; } 100% { transform: rotate(-14deg) scale(1); opacity: 1; } }
@keyframes syh-in { 0% { transform: scale(.6); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@keyframes syh-pulse { from { transform: scale(1); } to { transform: scale(1.06); } }
@keyframes syh-got { 0% { background: var(--sy-yellow); transform: scale(1.08); } 35% { background: var(--sy-yellow); transform: scale(1); } 100% { background: var(--sy-panel); } }
@keyframes syh-drag { 0%, 100% { transform: translate(0, 0); } 30% { transform: translate(0, -24px); } 60% { transform: translate(22px, 0); } }
@keyframes syh-found { 0% { opacity: 0; } 12% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; } }
@keyframes syh-band { 0% { transform: scaleY(.2); opacity: 0; } 100% { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .syh-timer.is-spurt, .syh-card.is-bump .syh-pts, .syh-combo.is-up, .syh-list li.is-new::after, .syh-banner, .syh-caught, .syh-found, .syh-intro-card, .syh-stick-hint i b, .syh-count { animation: none !important; }
  .syh-intro-card, .syh-intro-title { transition: none !important; }
  .syh-pop { animation-duration: .01s; animation-delay: .8s; }
}
`;

let injected = false;

export function injectHudStyle(): void {
  if (injected) return;
  injected = true;
  const style = document.createElement('style');
  style.id = 'sy-hud-style';
  style.textContent = `:root{${paletteCssVars()}}\n${HUD_CSS}`;
  document.head.appendChild(style);
}
