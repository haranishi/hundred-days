// 「スーパーやりたい放題」縦型プロモ動画（1080×1920・30fps・30秒・120 BPM）の単一ストーリーボード。
// 映像（render-promo.mjs）と BGM（promo-audio.mjs / verify-audio.mjs）が同じ時刻表を参照する。
export const DURATION_SECONDS = 30;
export const FPS = 30;
export const BPM = 120;
export const BEAT = 60 / BPM; // 0.50 s
export const BAR = BEAT * 4;  // 2.00 s（15小節 = 30.00 s）
export const BARS = 15;
export const bar = (n) => Math.round(n * BAR * 1000) / 1000;
export const beat = (n) => Math.round(n * BEAT * 1000) / 1000;
export const frameAt = (seconds) => Math.round(seconds * FPS);
export const STEP = 1 / 60; // 1/60s の描画・物理ティック

export const PUBLIC_URL = 'https://day94.rairakku.com/';
export const DISPLAY_URL = 'day94.rairakku.com';

// 各ゲーム画面テイクの範囲とタイムワープ設定
export const TAKES = {
  // S0+S1 (0.00–4.00s): 1コマ目(0.00s)が衝突0.10s後(kickAt=-0.10)で缶が宙に舞い、2.00–4.00sはスロー崩壊でS1背景へ
  pyramid: { from: bar(0), to: bar(2), kickAt: -0.10 },
  // S2 (4.00–6.00s): 4.00s音ドロップと同時に棚なぎ払い（2角度）
  sweep: { from: bar(2), to: bar(3) },
  // S3 (6.00–8.00s): カートで赤缶ピラミッド/棚端へ正面突入
  cart: { from: bar(3), to: bar(4) },
  // S4+S4b (8.00–12.00s): スイカ追従スロー(0.42x) → 10.00sストライク着弾（2角度）
  bowling: {
    from: bar(4),
    to: bar(6),
    throwAt: bar(4) + beat(1),    // 8.50s 投球
    impactAt: bar(5),             // 10.00s ピン命中（音楽ヒット完全同期）
    slowFactor: 0.42,
  },
  // S5 (12.00–14.00s): 店員がバナナの皮を踏んで宙に浮く瞬間をスローで捉える
  banana: { from: bar(6), to: bar(7) },
  // S6a (14.00–15.00s): 試食を食べ尽くす
  samples: { from: bar(7), to: bar(7) + beat(2) },
  // S6b (15.00–16.00s): 冷凍ケースに飛び込んで涼む
  freezer: { from: bar(7) + beat(2), to: bar(8) },
  // S6c (16.00–18.00s): ベル連打で最高倍率×3.0＋紙吹雪
  combo: { from: bar(8), to: bar(9) },
  // S7+S7b (18.00–22.00s): 店員追走「！」→ 20.80s (f84) 逮捕スロー＆揺れ
  chase: { from: bar(9), to: bar(11), caughtAt: 20.80 },
  // S8 (22.00–23.50s): 1.50秒・1P勝ち＆CPU得点入りのリザルト（内訳非表示）
  results: { from: bar(11), to: bar(11) + 1.50 },
  // S8b (23.50–26.00s): 1P vs 2P(CPU本気) の並走・カオス対戦（2.50s。友だち対戦は末尾バッジで紹介）
  showdown: { from: bar(11) + 1.50, to: bar(13) },
};

// 画面カットと字幕（1行15字以内・最大2行・上8%/下20%セーフゾーン外・実画面事実のみ）
export const STORYBOARD = [
  { id: 'S0', name: 'ピラミッド爆散', start: bar(0), end: bar(1), take: 'pyramid', lines: ['スーパーで、', 'やっちゃダメ、全部やる。'], captionTop: 146, music: 'intro' },
  { id: 'S1', name: 'おねがい対比', start: bar(1), end: bar(2), take: 'pyramid', card: 'rules', lines: ['お店の「おねがい」、', 'ぜんぶ逆をやれ。'], captionTop: 128, music: 'build' },
  { id: 'S2', name: '棚なぎ払い', start: bar(2), end: bar(3), take: 'sweep', lines: ['棚の商品を、', 'なぎ払う！'], captionTop: 144, music: 'drop' },
  { id: 'S3', name: 'カート爆走', start: bar(3), end: bar(4), take: 'cart', lines: ['カートで、', '突っ込め！'], captionTop: 144, music: 'groove' },
  { id: 'S4', name: 'スイカ投球', start: bar(4), end: bar(5), take: 'bowling', lines: ['スイカを抱えて、', 'ピンの山へ…'], captionTop: 144, music: 'approach' },
  { id: 'S4b', name: 'ストライク', start: bar(5), end: bar(6), take: 'bowling', lines: ['ド真ん中に、', 'スイカが直撃！'], captionTop: 144, music: 'chorus' },
  { id: 'S5', name: 'バナナの皮', start: bar(6), end: bar(7), take: 'banana', lines: ['バナナの皮で、', '店員も転ぶ！'], captionTop: 266, music: 'chorus' },
  { id: 'S6', name: '試食と冷凍', start: bar(7), end: bar(8), take: 'samples', lines: ['試食も、冷凍庫も、', 'やり放題！'], captionTop: 144, music: 'chorus' },
  { id: 'S6b', name: 'コンボ3倍', start: bar(8), end: bar(9), take: 'combo', lines: ['悪事をつないで、', '最高倍率 ×3.0！'], captionTop: 144, music: 'peak' },
  { id: 'S7', name: '店員追走', start: bar(9), end: 20.80, take: 'chase', lines: ['店員が、', '本気で追ってくる！'], captionTop: 118, music: 'chase' },
  { id: 'S7b', name: '捕獲', start: 20.80, end: bar(11), take: 'chase', lines: [], music: 'caught' },
  { id: 'S8', name: '結果と称号', start: bar(11), end: bar(11) + 1.50, take: 'results', lines: [], music: 'results' },
  { id: 'S8b', name: 'CPU対戦', start: bar(11) + 1.50, end: bar(13), take: 'showdown', lines: ['CPUと、', '荒らし対決！'], captionTop: 144, music: 'results' },
  { id: 'S9', name: 'エンドカード', start: bar(13), end: bar(15), card: 'end', lines: [], music: 'end' },
];

export function takeForTime(sc, sec) {
  if (sc.id === 'S6') return sec < TAKES.freezer.from ? 'samples' : 'freezer';
  return sc.take;
}

// S1 抑圧カードのポップ項目（2.94sまでに4枚勢揃い）
export const RULE_PILLS = [
  { text: 'おねがい：商品を崩さないで', at: 2.10 },
  { text: 'おねがい：商品はていねいに', at: 2.38 },
  { text: 'おねがい：ベルは1回だけ', at: 2.66 },
  { text: 'おねがい：冷凍ケースに入らないで', at: 2.94 },
];
export const STAMP_AT = 3.25;

// カット・衝撃点の白フラッシュ [時刻秒, 強さ]（0コマ目のサムネ白霞み防止のため0.07sへ）
export const FLASHES = [
  [0.07, 0.30],
  [bar(2), 0.50],
  [bar(5), 0.55],
  [20.80, 0.42],
  [bar(11), 0.35],
  [bar(11) + 1.50, 0.32],
  [bar(13), 0.38],
];

// UIタップ輪（現在の構成では未使用）
export const PRESSES = [];

// 擬音スタンプ（画面事実と一致する衝撃点のみ短時間出す）
export const ONOMATOPOEIA = [
  { text: 'ドーン！', from: 0.03, to: 0.53, top: 615, right: 24, rot: -8, color: '#ffcf35' },
  { text: 'ガシャーン！', from: 4.10, to: 4.65, top: 615, right: 24, rot: 7, color: '#ffcf35' },
  { text: 'ストライク！', from: 10.05, to: 10.65, top: 245, left: 24, rot: -6, color: '#ffcf35' },
  { text: 'ズルッ！', from: 12.22, to: 12.78, top: 350, right: 24, rot: 8, color: '#ffcf35' },
];

// 音楽同期キュー（promo-audio.mjs / verify-audio.mjs 共用）
export const MUSIC_CUES = {
  kickImpactAt: 0.0,
  buildAt: bar(1),
  stampAt: STAMP_AT,
  dropAt: bar(2),
  approachAt: bar(4),
  throwAt: TAKES.bowling.throwAt,
  impactAt: TAKES.bowling.impactAt,
  bellAt: bar(8),
  chaseAt: bar(9),
  caughtAt: TAKES.chase.caughtAt,
  caughtResumeAt: 21.15,
  resultsAt: bar(11),
  endChordAt: bar(13),
  fadeSeconds: 1.5,
};
export const TAP_CUES = PRESSES.map((p) => p.at);
export const CARD_TIMES = RULE_PILLS.map((r) => r.at);

export const END_CARD = {
  pill: '無料・登録なし',
  title: 'スーパーやりたい放題',
  sub: '2分間で、スーパーの“やっちゃダメ”を全部やれ',
  badges: ['ブラウザですぐ', 'スマホ・PC対応', 'CPU 3段階', 'あいことば2〜4人対戦'],
  url: DISPLAY_URL,
  note: '※映像は実際のゲーム画面です。\n撮影用の視点・演出・BGMを加えています',
};
