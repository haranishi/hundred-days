export const DURATION_SECONDS = 32;
export const RESULT_START = 8;
export const T_CONFIRM_TAP = 14;
export const STORYBOARD = [
  { id: 'S0', start: 0, end: 4, lines: ['終電まであと30分…', '本当にまだ飲める？'] },
  { id: 'S1', start: 4, end: 8, lines: ['会計・トイレ・徒歩…', 'リアルなタイムロスを逆算。'] },
  { id: 'S2', start: 8, end: 13, lines: ['「今すぐ店を出る限界時間」を', 'ミリ秒で突きつける！'] },
  { id: 'S3', start: 13, end: 18, lines: ['全国主要駅に対応。', '出発と帰着をサクッと設定。'] },
  { id: 'S4', start: 18, end: 23, lines: ['リミットが迫ると…', '臨界・サドンデス突入！'] },
  { id: 'S5', start: 23, end: 28, lines: ['逃せば『終電死亡』💀', '始発サバイバルモードへ。'] },
  { id: 'S6', start: 28, end: 32, lines: [] },
];
export const TAPS = [
  { at: 5.2, kind: 'hint', target: 'check-toilet' },
  { at: 9.5, kind: 'correct', target: 'timer-board' },
  { at: 14.8, kind: 'hint', target: 'route' },
  { at: 24.5, kind: 'hint', target: 'roulette' },
];
