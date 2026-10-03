export const TOUCH_CSS = /* css */ `
.dr-mobile { --safe-l: env(safe-area-inset-left, 0px); --safe-r: env(safe-area-inset-right, 0px); --safe-b: env(safe-area-inset-bottom, 0px); --safe-t: env(safe-area-inset-top, 0px); }
.dr-mobile.playing #app { touch-action: none; }
.dr-touch { position: fixed; inset: 0; z-index: 20; pointer-events: none; user-select: none; -webkit-user-select: none; color: #fff8ee; font-family: system-ui, sans-serif; }
.dr-touch [data-touch] { pointer-events: auto; touch-action: none; -webkit-touch-callout: none; }
.dr-stick { position: absolute; left: calc(18px + var(--safe-l)); bottom: calc(20px + var(--safe-b)); width: 118px; height: 118px; border-radius: 50%; border: 2px solid #fff8ee66; background: #11152180; display: grid; place-items: center; }
.dr-stick-knob { width: 52px; height: 52px; border-radius: 50%; border: 1px solid #ffd7ab; background: #ffb07066; pointer-events: none; }
.dr-look { position: absolute; right: calc(18px + var(--safe-r)); top: calc(76px + var(--safe-t)); width: min(36vw, 280px); bottom: calc(178px + var(--safe-b)); min-height: 44px; border: 1px dashed #fff8ee50; border-radius: 14px; background: #10131b20; display: grid; place-items: center; font-size: 12px; color: #fff8eed9; }
.dr-actions { position: absolute; right: calc(18px + var(--safe-r)); bottom: calc(18px + var(--safe-b)); display: grid; grid-template-columns: repeat(3, 68px); gap: 7px; }
.dr-touch button { min-width: 44px; min-height: 44px; color: inherit; font: inherit; font-size: 12px; font-weight: 650; border: 1px solid #ffd6a87a; border-radius: 10px; background: #111521cc; padding: 8px 3px; }
.dr-touch button.is-held { background: #d46c28d9; border-color: #fff1d9; }
.dr-touch [data-touch="breath"] { grid-column: span 2; background: #713b20d9; }
.dr-touch-pause { position: absolute; top: calc(12px + var(--safe-t)); left: 50%; transform: translateX(-50%); pointer-events: auto; }
.dr-rotate { position: fixed; inset: 0; z-index: 80; background: #151824f5; color: #fff8ee; display: grid; place-content: center; gap: 18px; text-align: center; padding: 24px; font: 18px/1.6 system-ui, sans-serif; }
.dr-rotate button { min-height: 44px; border: 1px solid #ffd6a8; border-radius: 8px; background: #30271f; color: inherit; font: inherit; padding: 8px 16px; }
.dr-mobile .dr-tl { top: calc(10px + var(--safe-t)); left: calc(12px + var(--safe-l)); }
.dr-mobile .dr-tr { top: calc(10px + var(--safe-t)); right: calc(12px + var(--safe-r)); }
.dr-mobile .dr-time, .dr-mobile .dr-rate { font-size: 24px; }
.dr-mobile .dr-yen { font-size: 15px; margin-top: 2px; }
.dr-mobile .dr-corner { right: calc(18px + var(--safe-r)); bottom: calc(178px + var(--safe-b)); width: min(210px, 30vw); }
.dr-mobile .dr-combo { font-size: 17px; height: 24px; }
.dr-mobile .dr-bottom { bottom: calc(20px + var(--safe-b)); width: min(230px, 35vw); }
.dr-mobile .dr-coach { width: min(260px, 35vw); white-space: normal; box-sizing: border-box; font-size: 12px; line-height: 1.5; padding: 6px 10px; }
.dr-mobile .dr-panel { min-width: 0; max-width: calc(100vw - 24px - var(--safe-l) - var(--safe-r)); max-height: calc(100dvh - 24px - var(--safe-t) - var(--safe-b)); padding: 14px 20px; }
.dr-mobile .dr-start { align-self: start; margin-top: calc(64px + var(--safe-t)); }
.dr-mobile .dr-start .dr-cta { margin-top: 8px; font-size: 15px; }
.dr-mobile:not([data-touch-phase="playing"]) .dr-ui { visibility: hidden; }
.dr-mobile .dr-btn, .dr-mobile .dr-card { min-height: 44px; }
.dr-mobile .dr-start-dock { bottom: calc(10px + var(--safe-b)); }
.dr-mobile .dr-card { width: 145px; padding: 5px 8px; }
.dr-mobile .dr-card-art { height: 35px; }
.dr-mobile .dr-title { font-size: 22px; }
.dr-mobile .dr-keys { font-size: 12px; }
.dr-mobile #game-links { top: calc(10px + var(--safe-t)); left: calc(10px + var(--safe-l)); bottom: auto; right: auto; }
.dr-mobile[data-touch-phase="playing"] #game-links { visibility: hidden; pointer-events: none; }
@media (max-height: 390px) {
  .dr-mobile .dr-card-art, .dr-mobile .dr-card-best { display: none; }
  .dr-mobile .dr-look { top: calc(70px + var(--safe-t)); bottom: calc(170px + var(--safe-b)); }
  .dr-mobile .dr-start .dr-sub { margin-top: 4px; }
}
@media (max-height: 350px) {
  .dr-mobile .dr-start { margin-top: calc(58px + var(--safe-t)); }
  .dr-mobile .dr-start .dr-sub { display: none; }
}
`;
