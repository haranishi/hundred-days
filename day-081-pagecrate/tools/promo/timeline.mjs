// 絵コンテの数値の正本。capture.mjs・audio.mjs・promo.jsx・audit.mjs が同じ値を読む。
export const FPS = 30;
export const TOTAL_FRAMES = 1080;
export const DURATION_SECONDS = TOTAL_FRAMES / FPS;
export const WIDTH = 1080;
export const HEIGHT = 1920;
/** 画面の撮影：CSS 540×720、倍率2 → 1080×1440。見出しの帯の下に置く */
export const VIEWPORT = Object.freeze({ width: 540, height: 720, scale: 2 });
export const FOOTAGE = Object.freeze({ top: 228, width: 1080, height: 1440 });
/** 撮影するコマ数。終わりの案内（outro）は最後のコマを暗くして使う */
export const CAPTURE_FRAMES = 864;

/** 字幕は2行・この文言のまま（変えるときは依頼の文面と照らす） */
export const CLIPS = Object.freeze([
  { id: 'hook', from: 0, length: 108, chapter: '01 / 困りごと', lines: ['ページの画像や動画、', '1つずつ保存してない？'] },
  { id: 'list', from: 108, length: 180, chapter: '02 / 並べる', lines: ['ページの素材を、', '一覧にして並べる。'] },
  { id: 'pick', from: 288, length: 180, chapter: '03 / 選ぶ', lines: ['プレビューで見比べて、', '必要なものだけ選ぶ。'] },
  { id: 'zip', from: 468, length: 180, chapter: '04 / 持ち帰る', lines: ['取得日時と出典を書いた', '記録つきのZIPで保存。'] },
  { id: 'trust', from: 648, length: 216, chapter: '05 / 安心', lines: ['ログイン不要。', '運営者は、素材を保存しません。'] },
  { id: 'outro', from: 864, length: 216, chapter: 'DAY 81 / 100', lines: [] },
]);

export const END_CARD = Object.freeze({
  title: 'PageCrate',
  sub: 'ページの素材を、出典つきで持ち帰る。',
  button: 'ブラウザで、デモを試す。',
  // 小さい2文。改行は文の切れ目だけに入れる（文言は変えない）
  notes: [
    ['いまは自作素材のデモです。', '実サイトの取得は、権利と規約の確認が済むまでお休み中です。'],
    ['取得できても、再利用の許諾ではありません。', '使う前に、権利者の許諾と規約の確認を。'],
  ],
  last: 'リンクは投稿に',
});

export const TAG = 'デモ素材（自作）';

export const clipAt = (frame) => [...CLIPS].reverse().find((clip) => frame >= clip.from) ?? CLIPS[0];
export const seconds = (frame) => frame / FPS;
/** 場面の始まり（秒）。音の構成もこの境目に合わせる */
export const SECTION = Object.freeze(Object.fromEntries(CLIPS.map((clip) => [clip.id, clip.from / FPS])));
