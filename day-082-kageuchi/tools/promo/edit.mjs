// 絵コンテ（編集の正本）：どの撮影のどのコマを何コマ使うか、字幕をいつ出すか、曲のテンポ。
// render.mjs（映像）・audio.mjs（曲）・subtitles.mjs（字幕の画像）・audit.mjs（検査）が、みなここを読む。
// コマは撮影の印（capture.mjs の take.json の marks）からの相対で決める（撮り直しでコマ番号が1つずれても同じ場面になる）。

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const DURATION = 36;

/** 曲のテンポ。90 BPM（1拍 = 2/3 秒 = 20 コマ）。切り替えはすべて拍の上に置く。 */
export const BPM = 90;
export const BEAT = 60 / BPM;

/**
 * 映像の切れ目（clips）。from は「撮影 take の印 mark から off コマ目」、frames は使うコマ数。
 * note はその区間に実際に映っているもの（README の表と報告に使う）。
 */
export const CLIPS = [
  { take: 'gate', mark: 'rec-on', off: 39, frames: 300, note: '暗い南の通りをしゃがんで東へ→2.6秒で立って表門の篝火の灯りの縁へ（5.0秒に明るさが「薄明」）。門番の扇が伸び、頭上に「？」が溜まる→5.6秒にしゃがんで闇へ戻ると「？」が引いていく' },
  { take: 'gate', mark: 'aim', off: -1, frames: 40, note: 'Q で狙う。塀越しに境内の白砂へ、小石の落ちる先と弧が出る→投げる' },
  { take: 'gate', mark: 'lure-cam', off: 1, frames: 80, note: '境内の側から（固定の構図）。小石の音を聞いた門番が「？」を出し、持ち場の篝火を離れて歩き出す' },
  { take: 'atemi', mark: 'down', off: -90, frames: 120, note: '裏門の提灯持ちの背後をしゃがんで追い、「E 背後から制圧」→当て身で気絶させる' },
  { take: 'ura', mark: 'rec-on', off: 170, frames: 60, note: '竹林を抜け、奥庭をしゃがんで進む（道順の台本 ura）' },
  { take: 'ura', mark: 'garden-cam', off: 1, frames: 120, note: '光秀の背中越しに、行灯のそばに座る信長と、内から橙に光る書院の障子（固定の構図）' },
  { take: 'ura', mark: 'finale', off: -60, frames: 360, note: 'しゃがんだまま信長の背後へ→討ち取り（スロー・寄り・「……是非に及ばず」）→全景へ引き、本能寺が燃え上がる。31.33 秒からは燃える寺を背に終わりの画面' },
];

/** 字幕（入りと出の秒。フェードは 0.25 秒で、入りの秒にフェードが始まり、出の秒にフェードが終わる）。 */
export const FADE = 0.25;
export const SUBTITLES = [
  { id: 's1', in: 0.0, out: 3.9, lines: ['夜明け前、本能寺。'] },
  { id: 's2', in: 4.0, out: 9.9, lines: ['灯りに寄れば、気づかれる。'] },
  { id: 's3', in: 10.0, out: 17.9, lines: ['音で釣り、', '背後で黙らせる。'] },
  { id: 's4', in: 18.0, out: 23.9, lines: ['奥の庭へ。', '狙うのは、信長ただ一人。'] },
  { id: 's5', in: 24.0, out: 31.2, lines: ['背後から、討つ。'] },
];
/** 終わりの画面（燃える寺の上に重ねる）。31.33 秒＝47 拍目から最後まで。 */
export const ENDCARD = { id: 'end', in: 47 * BEAT, out: DURATION, title: '影討ち', lines: ['100日チャレンジ Day082', 'PCブラウザで遊べる・登録なし'] };

/** 1つめの字幕だけは 0 秒から出ている（1コマ目から遊びの画面と字幕。黒や題名から始めない）。 */
export const FIRST_NO_FADE_IN = true;

/** 映像の切れ目の秒（0 を除く）。 */
export function cutTimes() {
  const out = [];
  let f = 0;
  for (const c of CLIPS) {
    f += c.frames;
    out.push(f / FPS);
  }
  return out.slice(0, -1);
}

/** 曲の山場に合わせる出来事（秒）：audio.mjs が太鼓を置き、README に書く。 */
export const HITS = {
  /** 当て身の E（atemi の印 down の 90 コマ前から始まる区間で、E は 16.0 秒＝24拍目。render.mjs が状態から測って timeline.json に出す） */
  takedownBeat: 24,
  /** 討ち取りの E（finale の印 = 区間の 60 コマ目 → 24 + 2.0 = 26.0 秒 = 39 拍目） */
  killBeat: 39,
};
