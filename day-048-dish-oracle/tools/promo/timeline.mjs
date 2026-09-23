// Day 048 プロモ動画の絵コンテと字幕。BGM（promo-audio.mjs）と描画（render-promo.mjs）が同じ時刻表を読む。
// 3/4拍子・90 BPM で1小節＝2秒。場面の切り替えは小節の頭にそろえ、字幕も絵もこの絶対時刻だけで切り替える。
export const DURATION_SECONDS = 34;
export const DEFAULT_FPS = 30;
export const BPM = 90;
export const BEATS_PER_BAR = 3;
export const BAR_SECONDS = 2;
export const REVEAL_AT = 16; // 水晶玉に料理がはっきり映る瞬間。BGMの鐘もここで鳴らす
export const END_START = 30;

export const STORYBOARD = Object.freeze([
  { id: 'S0', start: 0, end: 4, name: '質問の途中。水晶玉にぼやけた料理の影', music: 'hook' },
  { id: 'S1', start: 4, end: 10, name: '質問に答えていく', music: 'verse' },
  { id: 'S2', start: 10, end: REVEAL_AT, name: '答えるほど、影がはっきりする', music: 'build' },
  { id: 'S3', start: REVEAL_AT, end: 20, name: '推測：あなたの心にあるのは……', music: 'reveal' },
  { id: 'S4', start: 20, end: 26, name: '当たり。決め手になった答え', music: 'chorus' },
  { id: 'S5', start: 26, end: END_START, name: '外れたら教える。端末の中で覚える', music: 'soft' },
  { id: 'S6', start: END_START, end: DURATION_SECONDS, name: 'アプリ名・DAY 048・URL', music: 'end' },
]);

// 1行16字以内。{questions} は描画側が実際の問数で置き換える（字幕の数字は画面から取る）
export const CAPTIONS = Object.freeze([
  { start: 0, end: 4, lines: ['心にある一皿、当てます'] },
  { start: 4, end: 10, lines: ['質問に答えるだけ'] },
  { start: 10, end: REVEAL_AT, lines: ['答えるほど、見えてくる'] },
  { start: REVEAL_AT, end: 20, lines: ['{questions}問で、見抜く'] },
  { start: 20, end: 26, lines: ['決め手まで、見せます'] },
  { start: 26, end: END_START, lines: ['外れたら教えて。覚えます'] },
]);

export const sceneAt = (t) => STORYBOARD.find((scene) => t >= scene.start && t < scene.end) ?? STORYBOARD.at(-1);
export const captionAt = (t) => CAPTIONS.find((caption) => t >= caption.start && t < caption.end)?.lines ?? [];
