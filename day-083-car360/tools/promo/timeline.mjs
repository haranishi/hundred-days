// Day083「カー360」のプロモーション動画の絵コンテ。映像（render-promo.mjs）と音楽（promo-audio.mjs）が、この1つの表を見て作る。
// 縦型 1080×1920・30fps・32秒。1拍＝約0.533秒・1小節（4拍）＝約2.133秒・15小節でちょうど32秒（音楽の切り替えを小節の頭に合わせるため）。
export const DURATION_SECONDS = 32;
export const BPM = 112.5;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const bar = (n) => Math.round(n * BAR * 1000) / 1000;

// 場面。lines は字幕（1行ずつ。ブランド名・車名は字幕に出さない＝実在の名車、と書く）。
// 1コマ目は動いている絵にする（タイトル札から始めない）。S0 は走行の夜のいちばん速い区間を切り出して、出だしに置く。
export const STORYBOARD = [
  { id: 'S0', name: 'フック',       start: bar(0),  end: bar(2),  lines: ['ブラウザだけで、', '湾岸ドライブ。'], music: 'intro' },
  { id: 'S1', name: 'ショールーム', start: bar(2),  end: bar(5),  lines: ['実在の名車を、', '360°まわして見る。'], music: 'groove' },
  { id: 'S2', name: 'ドアと色',     start: bar(5),  end: bar(6),  lines: ['ドアも開く。', '色も変えられる。'], music: 'lift' },
  { id: 'S3', name: '走り出す',     start: bar(6),  end: bar(7),  lines: ['そのまま、', '湾岸へ。'], music: 'riser' },
  { id: 'S4a', name: '走行（前半）', start: bar(7),  end: bar(9.5), lines: ['走り出せば、', 'そこは湾岸。'], music: 'drop' },
  { id: 'S4b', name: '走行（後半）', start: bar(9.5), end: bar(12), lines: ['昼も、夕暮れも、', '夜も走れる。'], music: 'drop' },
  { id: 'S5', name: '指で運転',     start: bar(12), end: bar(14), lines: ['スマホは、', '指だけで運転。'], music: 'breakdown' },
  { id: 'S6', name: 'エンド',       start: bar(14), end: bar(15), lines: [], music: 'resolve' },
];

// ショールームの車の切り替え（S1）。順番だけ決める。車名は画面の札に出る（字幕には出さない）。
export const SHOWROOM_CARS = [
  { key: 'nis-gtr-r35-2008', start: bar(2),  end: bar(3) },
  { key: 'nis-gtr-r34-1999', start: bar(3),  end: bar(4) },
  { key: 'nis-gtr-r32-1989', start: bar(4),  end: bar(5) },
];

// 指の動き（タップの輪を重ねる位置の目安。実際の位置は、押す部品の座標から計算する）。
export const TAPS = [
  { at: bar(3) + 0.05,  kind: 'chip',   target: 'nis-gtr-r34-1999' },
  { at: bar(4) + 0.05,  kind: 'chip',   target: 'nis-gtr-r32-1989' },
  { at: bar(5) + 0.15,  kind: 'doors',  target: 'ドアを開ける' },
  { at: bar(5) + 1.05,  kind: 'swatch', target: 'ボディカラー' },
  { at: bar(5) + 1.6,   kind: 'swatch', target: 'ボディカラー' },   // 2色目（赤 → 橙）。拍（bar(5) の3拍目）に合わせる
  { at: bar(7) - 0.5,   kind: 'drive',  target: 'ドライブを始める' },
  { at: bar(12) + 0.2,  kind: 'wheel',  target: 'ハンドル' },
  { at: bar(12) + 1.25, kind: 'pedal',  target: 'アクセル' },
];

// 音楽の合図（promo-audio.mjs が見る）。走り出しの瞬間（bar(7)）にドロップを置く。
export const MUSIC_CUES = {
  dropAt: bar(7),
  riser: { start: bar(6), end: bar(7) },
  breakdown: { start: bar(12), end: bar(14) },
  endChordAt: bar(14),
};

// 終わりのカード。URL・案内は meta.json の publicUrl と一致させる。
export const END_CARD = {
  title: 'カー360',
  sub: '大黒PAから、湾岸へ。',
  badges: ['無料', 'ログイン不要', 'ブラウザで遊べる'],
  url: 'day83.rairakku.com',
  day: 'DAY 083 / 100',
  note: '車の3Dモデルは第三者の作品（CC BY 4.0）。メーカーとは無関係です。出典はアプリの案内ページに記載。',
};
