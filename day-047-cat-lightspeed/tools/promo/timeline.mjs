// Day 047 プロモ動画の絵コンテと字幕。BGM（promo-audio.mjs）と描画（render-promo.mjs）が同じ時刻表を読む。
// 4/4拍子・120 BPM で1小節＝2秒。場面の切り替えは小節の頭にそろえ、字幕も絵もこの絶対時刻だけで切り替える。
// gameFrom は各場面で映すゲーム内の時刻（最大推力のとき）。字幕の出来事だけが写る窓を実測して決める。
export const DURATION_SECONDS = 34;
export const DEFAULT_FPS = 30;
export const BPM = 120;
export const BEATS_PER_BAR = 4;
export const BAR_SECONDS = 2;
export const VACUUM_FROM = 12; // 軌道の場面。ゲームは軌道速度以降を真空として音を止める。BGMもこもらせる
export const VACUUM_TO = 16;
export const LIGHT_AT = 20; // 光速の90%で猫が光りだす場面の頭
export const END_START = 30;

export const STORYBOARD = Object.freeze([
  { id: 'S0', start: 0, end: 4, name: '牧場。猫が走り、道の物を弾き飛ばす', music: 'hook' },
  { id: 'S1', start: 4, end: 8, name: '街。新幹線を追い越す', music: 'rise' },
  { id: 'S2', start: 8, end: VACUUM_FROM, name: '空。雲海の上で旅客機を抜く', music: 'drive' },
  { id: 'S3', start: VACUUM_FROM, end: VACUUM_TO, name: '軌道。画面下に地球の弧', music: 'vacuum' },
  { id: 'S4', start: VACUUM_TO, end: LIGHT_AT, name: '太陽系。環のある惑星が通り過ぎる', music: 'build' },
  { id: 'S5', start: LIGHT_AT, end: 24, name: '星間。光速の90%で猫の縁が光りだす', music: 'lift' },
  { id: 'S6', start: 24, end: 28, name: '猫の時計と地球の時計がずれていく', music: 'climax' },
  { id: 'S7', start: 28, end: END_START, name: '結果。光の猫の写真', music: 'resolve' },
  { id: 'S8', start: END_START, end: DURATION_SECONDS, name: 'アプリ名・DAY 047・URL・猫のモデルのクレジット', music: 'end' },
]);

// 1行16字以内。描画側は、各場面に字幕の出来事が実際に写っているかを確かめる
export const CAPTIONS = Object.freeze([
  { start: 0, end: 4, lines: ['こするほど、猫が速くなる'] },
  { start: 4, end: 8, lines: ['新幹線を追い越し'] },
  { start: 8, end: VACUUM_FROM, lines: ['旅客機を抜いて、空へ'] },
  { start: VACUUM_FROM, end: VACUUM_TO, lines: ['地球を回る速さ'] },
  { start: VACUUM_TO, end: LIGHT_AT, lines: ['惑星のあいだを駆ける'] },
  { start: LIGHT_AT, end: 24, lines: ['光速の90%、猫が光る'] },
  { start: 24, end: 28, lines: ['猫の時計が遅れていく'] },
  { start: 28, end: END_START, lines: ['最後は、光になる'] },
]);

export const sceneAt = (t) => STORYBOARD.find((scene) => t >= scene.start && t < scene.end) ?? STORYBOARD.at(-1);
export const captionAt = (t) => CAPTIONS.find((caption) => t >= caption.start && t < caption.end)?.lines ?? [];
