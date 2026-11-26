// Day100「kamoku」宣伝動画の絵コンテ正本。映像と音がこの表を読む。
// 縦 1080x1920・30fps・32.000秒（120 BPM・1拍=0.5秒・1小節=2秒・16小節=960コマ）。

export const DURATION_SECONDS = 32;
export const BPM = 120;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const BARS = 16;
export const FPS = 30;
export const TOTAL_FRAMES = DURATION_SECONDS * FPS;
export const FADE_OUT_SECONDS = 1.6;

export const bar = (n) => Math.round(n * BAR * 1000) / 1000;
export const frameTime = (frame) => Math.round((frame / FPS) * 1000) / 1000;

// ステージは CSS 540x960、DPR 2 で 1080x1920。
// 縦長スマホは左右約9%と下約20%を隠すので、文字と札は x=49..491、y=77..768。
export const STAGE = {
  width: 540,
  height: 960,
  dpr: 2,
  safeX: { min: 49, max: 491 },
  safeY: { min: 77, max: 768 },
};

// アプリは幅415（スマホ相当）で動かし、ステージ幅まで拡大する。本文12pxがステージ上で12px以上になる下限。
// 上の 0..BAND.h は字幕専用の帯（紺一色）。その下にアプリの窓（全幅・角丸）。窓の高さに iframe の高さを合わせ、
// 下の案内（ホーム・登録…）が切れないようにする。字幕はアプリに一切重ねない。
export const BAND = { h: 210 };
export const APP_VIEW = { width: 415, height: 560 };
export const APP_SCALE = STAGE.width / APP_VIEW.width;
export const WINDOW = { x: 0, y: 218, w: STAGE.width, h: Math.round(APP_VIEW.height * APP_SCALE * 100) / 100 };

export const STORYBOARD = [
  { id: 'S0', name: '後回し', start: 0, end: 2, music: 'intro' },
  { id: 'S1', name: '25件', start: 2, end: 4, music: 'intro' },
  { id: 'S2', name: '科目と確定', start: 4, end: 9, music: 'drop' },
  { id: 'S3', name: 'まとめて', start: 9, end: 12, music: 'groove' },
  { id: 'S4', name: '仕訳', start: 12, end: 18, music: 'build' },
  { id: 'S5', name: '利益', start: 18, end: 21, music: 'chorus' },
  { id: 'S6', name: '帳票', start: 21, end: 24, music: 'chorus' },
  { id: 'S7', name: '自分のPC', start: 24, end: 27, music: 'calm' },
  { id: 'S8', name: '締め', start: 27, end: 32, music: 'resolve' },
];

// 字幕は依頼の文言と一字一句一致（改行は幅のため。結合すると正本になる）。
export const CAPTIONS = [
  { start: 0, end: 2, lines: ['帳簿、また後回し？'], size: 36, tag: '個人事業主の方へ', tagSize: 28 },
  { start: 2, end: 4, lines: ['気づけば、未確認が25件。'], size: 32 },
  { start: 4, end: 9, lines: ['科目を選んで、確定。'], size: 36 },
  { start: 9, end: 12, lines: ['まとめて片づく。'], size: 36 },
  { start: 12, end: 18, lines: ['打つそばから、', '仕訳ができる。'], size: 30 },
  { start: 18, end: 21, lines: ['利益が、その場で分かる。'], size: 32 },
  { start: 21, end: 24, lines: ['帳票もCSVも、すぐ出せる。'], size: 30 },
  {
    start: 24, end: 27, card: true, size: 48,
    lines: ['本物の帳簿は、', '自分のPCの中だけ。'],
    note: '（ソースから動かす版）', noteSize: 24,
  },
];

export const END_CARD = {
  start: 27,
  end: 32,
  pills: '無料・登録なし',
  cta: 'まずはブラウザで触ってみて',
  url: 'rairakku.com/100days/day-100-kamoku/',
  series: '100日チャレンジ 100本目',
  disclaimer: '画面は架空の帳簿です・お試し版は保存されません・税の計算は参考値（税理士未確認）',
};

// 終わりの札の配置（stage がこの数値をそのまま使う）。背景は紺一色。縦の中央が空かないように並べる。
export const END_BLOCKS = [
  { id: 'brand', x: 95, y: 118, w: 350, h: 112 },
  { id: 'pills', x: 80, y: 262, w: 380, h: 56, fontSize: 28, text: END_CARD.pills },
  { id: 'cta', x: 49, y: 340, w: 442, h: 56, fontSize: 32, text: END_CARD.cta },
  {
    id: 'url', x: 49, y: 416, w: 442, h: 104, fontSize: 30, text: END_CARD.url,
    lines: ['rairakku.com/100days/', 'day-100-kamoku/'],
  },
  { id: 'series', x: 49, y: 560, w: 442, h: 40, fontSize: 22, text: END_CARD.series },
  {
    id: 'disclaimer', x: 49, y: 636, w: 442, h: 78, fontSize: 16,
    text: END_CARD.disclaimer,
    lines: ['画面は架空の帳簿です・お試し版は', '保存されません・税の計算は参考値', '（税理士未確認）'],
  },
];

// 操作のコマ。音の合図は、確定ダイアログの「確定する」と保存のコマに置く。
// 0–1.5秒は問いと件数だけ（背景はぼかし）。4–12秒はアプリの全幅で映す。
export const BEATS = {
  question: 45,          // 1.5秒まで中央の問い
  openInbox: 45,
  scrollFrom: 60,
  scrollTo: 114,
  focusAccount: 120,
  typeAccount: 132,
  checkOne: 141,
  askOne: 153,
  confirmOne: 171,
  focusTwo: 204,         // 2行目も同じ手順（止まった絵にしない）
  typeTwo: 216,
  checkTwo: 228,
  askTwo: 240,
  confirmTwo: 255,
  fillStart: 270,        // ここから早送りで残りの行に科目を入れる
  fillStep: 2,
  selectAll: 322,
  askBatch: 328,
  confirmBatch: 336,
  openEntry: 360,
  pickIncome: 366,
  focusEntryAccount: 372,  // 科目と口座を先に決め、金額を打つたびにプレビューが追う
  typeEntryAccount: 375,
  enterEntryAccount: 381,
  focusWallet: 387,
  typeWallet: 390,
  enterWallet: 396,
  focusAmount: 405,
  typeAmount: 408,       // 6コマごとに1桁（13.6–14.6秒）
  amountStep: 6,
  save: 468,             // 15.6秒。打ち終わり（14.6秒）から約1秒
  openHome: 486,         // 保存の0.6秒後
  openReports: 630,
  openPL: 642,
  openBS: 654,
  showCsv: 666,          // 22.2秒に「CSVで書き出す」へ寄る
  csvRing: 690,
  calm: 720,
  end: 810,
};

export const ENTRY = { amount: '220000', account: '売上', accountName: '売上高', wallet: '普通', walletName: '普通預金' };

export const CUES = [
  { at: frameTime(BEATS.confirmOne), kind: 'confirm', n: 0 },
  { at: frameTime(BEATS.confirmTwo), kind: 'confirm', n: 1 },
  { at: frameTime(BEATS.confirmBatch), kind: 'confirm', n: 2 },
  { at: frameTime(BEATS.save), kind: 'save', n: 0 },
];

const FORBIDDEN = ['申告できる', '電子帳簿保存法', '自動で仕訳', '自動で提案', '他より速い', '他より簡単', '127.0.0.1'];

export function captionText(caption) {
  return caption.lines.join('');
}

const CAPTION_TOP = 88;
const CARD_TOP = 300;
export const CARD = { x: 27, y: 262, w: 486, h: 268, noteTop: 466 };
const CENTER = { until: 1.5, move: 0.2, top: 300, size: 46, tagTop: 226 };

export function captionAt(t) {
  const caption = CAPTIONS.find((item) => t >= item.start - 1e-9 && t < item.end - 1e-9);
  if (!caption) return null;
  const rise = caption.start === 0 ? Math.min(1, t / 0.16) : Math.min(1, (t - caption.start) / 0.16);
  const dy = Math.round((1 - easeOut(rise)) * 14);
  let top = (caption.card ? CARD_TOP : CAPTION_TOP) + dy;
  let size = caption.size;
  let tagTop = 148 + dy;
  const tagW = caption.tag ? estimateWidth(caption.tag, caption.tagSize) + 28 : 0;
  let tagLeft = 49;
  if (caption.start === 0) {
    // 0–1.5秒は中央に大きく。1.5–1.7秒で上の定位置へ動く。
    const p = easeOut((t - CENTER.until) / CENTER.move);
    top = Math.round(CENTER.top + dy + (CAPTION_TOP - CENTER.top) * p);
    size = Math.round(CENTER.size + (caption.size - CENTER.size) * p);
    tagTop = Math.round(CENTER.tagTop + dy + (148 - CENTER.tagTop) * p);
    tagLeft = Math.round(49 + ((442 - tagW) / 2) * (1 - p));
  }
  return { ...caption, text: captionText(caption), alpha: 1, dy, top, size, tagTop, tagLeft, tagW };
}

export function calloutSlot(t) {
  if (t < CENTER.until) return { kind: 'pending', x: 70, y: 420, w: 400, h: 150 };
  // 2行目の確定の窓が出ている間は、窓を隠さないよう札を引っこめる。
  if (t >= frameTime(BEATS.confirmOne) && t < 9 && !(t >= frameTime(BEATS.askTwo) && t < frameTime(BEATS.confirmTwo))) {
    return { kind: 'count', x: 78, y: 600, w: 384, h: 112 };
  }
  if (t >= frameTime(BEATS.confirmBatch) && t < 12) return { kind: 'final', x: 70, y: 560, w: 400, h: 170 };
  if (t >= 18 && t < 21) return { kind: 'delta', x: 49, y: 286, w: 442, h: 340 };
  return null;
}

// 仕訳のプレビューの札（12–18秒、画面の下半分）。早送りの札（科目を入れる区間）。
export const PREVIEW_SLOT = { x: 49, y: 554, w: 442, h: 206, from: frameTime(BEATS.typeAmount), to: 18 };
export const FF_SLOT = { x: 405, y: 100, w: 80, h: 30, from: frameTime(BEATS.fillStart), to: frameTime(BEATS.selectAll) };

// 背景のぼかしと紺の幕（0..1）。
export function backdropAt(t) {
  const ramp = (a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
  if (t < 1.4) return { blur: 10, scrim: 0.7, zoom: 1 - t / 1.5 };
  if (t < 1.6) return { blur: 10 * (1 - ramp(1.4, 1.6)), scrim: 0.7 * (1 - ramp(1.4, 1.6)), zoom: Math.max(0, 1 - t / 1.5) };
  const home = frameTime(BEATS.openHome);
  if (t >= home && t < 21) return { blur: 10 * ramp(home, home + 0.3), scrim: 0.5 * ramp(home, home + 0.3), zoom: (t - home) / (21 - home) };
  if (t >= 24 && t < 27) return { blur: 10 * ramp(24, 24.2), scrim: 0.6 * ramp(24, 24.2), zoom: (t - 24) / 3 };
  if (t >= 27) return { blur: 10, scrim: 0.6 + 0.4 * ramp(27, 27.25), zoom: 1 };
  return { blur: 0, scrim: 0, zoom: 0 };
}

function easeOut(p) {
  const x = Math.max(0, Math.min(1, p));
  return 1 - (1 - x) ** 3;
}

export function estimateWidth(text, fontSize) {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    width += code <= 0x7f ? fontSize * 0.56 : fontSize;
  }
  return width;
}

function boxInside(box, label, errors) {
  const right = box.x + box.w;
  const bottom = box.y + box.h;
  if (box.x < STAGE.safeX.min - 0.1 || right > STAGE.safeX.max + 0.1 || box.y < STAGE.safeY.min - 0.1 || bottom > STAGE.safeY.max + 0.1) {
    errors.push(`${label} が安全域の外 x=${box.x}..${right} y=${box.y}..${bottom}`);
  }
}

export function selftestStoryboard() {
  const errors = [];
  if (TOTAL_FRAMES !== 960) errors.push('960コマではない');
  if (BARS !== 16 || BAR !== 2 || BEAT !== 0.5) errors.push('小節の長さが違う');
  if (Math.abs(APP_SCALE - 540 / 415) > 1e-9) errors.push('拡大率が違う');

  let cursor = 0;
  for (const scene of STORYBOARD) {
    if (Math.abs(scene.start - cursor) > 1e-9) errors.push(`場面 ${scene.id} が連続していない`);
    cursor = scene.end;
  }
  if (cursor !== DURATION_SECONDS) errors.push('絵コンテが32秒で終わらない');

  const expected = [
    [0, 2, '帳簿、また後回し？'],
    [2, 4, '気づけば、未確認が25件。'],
    [4, 9, '科目を選んで、確定。'],
    [9, 12, 'まとめて片づく。'],
    [12, 18, '打つそばから、仕訳ができる。'],
    [18, 21, '利益が、その場で分かる。'],
    [21, 24, '帳票もCSVも、すぐ出せる。'],
    [24, 27, '本物の帳簿は、自分のPCの中だけ。'],
  ];
  if (CAPTIONS.length !== expected.length) errors.push('字幕の本数が違う');
  expected.forEach(([start, end, text], index) => {
    const caption = CAPTIONS[index];
    if (!caption || caption.start !== start || caption.end !== end || captionText(caption) !== text) {
      errors.push(`字幕 ${index} が正本と違う`);
    }
    if ((caption?.size ?? 0) < 30) errors.push(`字幕 ${index} が30px未満`);
  });
  if (CAPTIONS[0].tag !== '個人事業主の方へ') errors.push('小さな札の文言が違う');
  if (CAPTIONS[7].note !== '（ソースから動かす版）' || CAPTIONS[7].noteSize < 16) errors.push('ソース版の注記が違う');
  if (END_BLOCKS.find((block) => block.id === 'disclaimer').lines.join('') !== END_CARD.disclaimer) {
    errors.push('断り書きの改行が文言を変えている');
  }
  if (END_BLOCKS.find((block) => block.id === 'disclaimer').fontSize < 16) errors.push('断り書きが16px未満');
  if (END_BLOCKS.find((block) => block.id === 'url').lines.join('') !== END_CARD.url) errors.push('URLの改行が文言を変えている');

  const spoken = [
    ...CAPTIONS.flatMap((caption) => caption.lines),
    CAPTIONS[0].tag,
    CAPTIONS[7].note,
    END_CARD.pills,
    END_CARD.cta,
    END_CARD.url,
    END_CARD.series,
    END_CARD.disclaimer,
  ].join('\n');
  for (const word of FORBIDDEN) {
    if (spoken.includes(word)) errors.push(`禁止表現: ${word}`);
  }

  for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
    const view = captionAt(frame / FPS);
    if (!view) continue;
    if (view.alpha !== 1) errors.push(`frame ${frame} の字幕が透明`);
    if (view.dy < 0 || view.dy > 14) errors.push(`frame ${frame} の字幕の移動が範囲外`);
    const y = view.top;
    view.lines.forEach((line, index) => {
      const width = estimateWidth(line, view.size);
      if (width > STAGE.safeX.max - STAGE.safeX.min) errors.push(`字幕が幅を超える: ${line}`);
      boxInside({ x: 49, y: y + index * (view.size * 1.35), w: 442, h: view.size * 1.35 }, `字幕 ${line}`, errors);
    });
    if (view.tag) boxInside({ x: view.tagLeft, y: view.tagTop, w: view.tagW, h: 36 }, '小さな札', errors);
    if (view.note) boxInside({ x: 49, y: CARD.noteTop, w: 442, h: 34 }, 'ソース版の注記', errors);
    const t = frame / FPS;
    if (!view.card && t >= CENTER.until + CENTER.move) {
      const bottom = view.top + view.lines.length * view.size * 1.35;
      const tagBottom = view.tag ? view.tagTop + 44 : 0;
      if (Math.max(bottom, tagBottom) > BAND.h) errors.push(`frame ${frame} の字幕が帯（y<${BAND.h}）からはみ出してアプリに重なる`);
    }
    if (errors.length > 12) break;
  }

  for (const block of END_BLOCKS) {
    boxInside(block, `締め ${block.id}`, errors);
    const widest = block.lines ? Math.max(...block.lines.map((line) => estimateWidth(line, block.fontSize))) : estimateWidth(block.text || '', block.fontSize);
    if (block.text && block.fontSize && widest > block.w) {
      errors.push(`締め ${block.id} の1行が箱より広い`);
    }
  }
  const pending = calloutSlot(0.4);
  const count = calloutSlot(frameTime(BEATS.confirmOne) + 0.2);
  const final = calloutSlot(frameTime(BEATS.confirmBatch) + 0.2);
  const delta = calloutSlot(18.2);
  for (const slot of [pending, count, final, delta, { ...PREVIEW_SLOT, kind: 'preview' }, { ...FF_SLOT, kind: 'ff' }]) {
    if (!slot) errors.push('札の枠が無い');
    else boxInside(slot, `札 ${slot.kind}`, errors);
  }
  if (pending?.kind !== 'pending' || final?.kind !== 'final' || delta?.kind !== 'delta') errors.push('札の種類が違う');
  if (BEATS.confirmOne >= BEATS.fillStart || BEATS.selectAll <= BEATS.fillStart || BEATS.confirmBatch >= 12 * FPS) errors.push('確定とまとめての順が違う');
  if (BEATS.save - (BEATS.typeAmount + BEATS.amountStep * (ENTRY.amount.length - 1)) > 1.2 * FPS) errors.push('打ち終わりから保存まで長い');
  if (BEATS.openHome - BEATS.save > 0.8 * FPS) errors.push('保存のあとの待ちが長い');
  if (BEATS.showCsv > 23 * FPS) errors.push('CSVを23秒までに見せていない');
  if (WINDOW.y < BAND.h || WINDOW.y + WINDOW.h > STAGE.height) errors.push('アプリの窓が帯に重なるか、画面からはみ出す');

  const cueTimes = CUES.map((cue) => cue.at);
  if (new Set(cueTimes).size !== cueTimes.length) errors.push('合図の時刻が重なっている');
  for (const cue of CUES) {
    const frame = Math.round(cue.at * FPS);
    if (Math.abs(frameTime(frame) - cue.at) > 1e-9) errors.push(`合図がコマ境界にない: ${cue.at}`);
    if (cue.at < 4 || cue.at >= DURATION_SECONDS) errors.push('合図が曲の範囲外');
  }
  if (CUES.filter((cue) => cue.kind === 'confirm').length !== 3 || CUES.filter((cue) => cue.kind === 'save').length !== 1) {
    errors.push('確定3回と保存1回の合図がない');
  }

  // 場面の境目では、その前後0.8秒にカメラかスクロールの予定がある（何も動かない区間を作らない）。
  const motion = [0, 2, 4, frameTime(BEATS.confirmOne), 9, 12, 18, 21, 24, 27, 29.2];
  for (let index = 1; index < STORYBOARD.length; index++) {
    const boundary = STORYBOARD[index].start;
    const near = motion.some((t) => Math.abs(t - boundary) < 0.05);
    if (!near) errors.push(`場面の境 ${boundary}s に動き始めがない`);
  }

  return { ok: errors.length === 0, errors, totalFrames: TOTAL_FRAMES, captions: CAPTIONS.length };
}
