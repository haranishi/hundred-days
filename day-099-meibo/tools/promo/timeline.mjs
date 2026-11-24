// Day099 "meibo" 宣伝動画の絵コンテ正本。
// 映像（render-promo.mjs）と音（promo-audio.mjs / verify-audio.mjs）の両方がこの表を読む。
// 縦 1080x1920・30fps・30.000秒（120 BPM・1拍=0.5秒・1小節=2.0秒・15小節=900コマ）。

export const DURATION_SECONDS = 30;
export const BPM = 120;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const BARS = 15;
export const FPS = 30;
export const TOTAL_FRAMES = DURATION_SECONDS * FPS;
export const CROSSFADE_SECONDS = 0.4;
export const FADE_OUT_SECONDS = 1.5;

export const bar = (n) => Math.round(n * BAR * 1000) / 1000;
export const beat = (n) => Math.round(n * BEAT * 1000) / 1000;
export const at = (barNo, beatNo = 0) => Math.round((barNo * BAR + beatNo * BEAT) * 1000) / 1000;
export const frameAt = (seconds) => Math.round(seconds * FPS);

// ステージの寸法（CSS px。DPR 2 で 1080x1920）。
// 文字は、縦の安全域 y=77..768 と、左右の安全域 x=49..491（左右9%）に収める。
// 左右9%の理由：縦長のスマホで動画が全画面に敷き詰められる（cover）と、9:16 の動画は左右が約9%ずつ切れる。
// 下は画面の80%（y=768）まで。投稿アプリの操作・本文が下の約20%に重なる。
export const STAGE = {
  width: 540,
  height: 960,
  dpr: 2,
  safeY: { min: 77, max: 768 },
  safeX: { min: 49, max: 491 },
  captionBand: { top: 77, bottom: 200, padX: 49, fontSize: 34, bigFontSize: 36, lineHeight: 1.35 },
  captionTag: { top: 205, fontSize: 20, height: 40, padX: 49 },
  // 窓は画像なので左右の安全域の外に出てよい（中身の外側の約6%は切れても伝わる作り）。下端注記の分だけ、窓を16px上げた。
  window: { x: 20, y: 196, width: 500, height: 540, radius: 14 },
  footerBrand: { text: '営業リスト向けのCRM', logoHeight: 18, fontSize: 16 },
  footerNote: { y: 742, height: 22, fontSize: 16, padX: 49, text: '画面は合成データです' },
  colors: {
    navyTop: '#0B2545',
    navyBottom: '#13315C',
    amber: '#FFB703',
    white: '#FFFFFF',
  },
};

export const WINDOW_ASPECT = STAGE.window.width / STAGE.window.height; // 500 / 540
// アプリ本文（13px）がステージ上で 12px 以上になるカメラ最大幅（13 * 500 / 12 = 541.67px）。
export const MAX_READABLE_CAMERA_WIDTH = 540;
export const MIN_CAMERA_WIDTH = 340;

// AI生成の人物映像の使う区間（入り点は CLI --ai-a-in / --ai-b-in で変更可）。音声は捨てる。
export const AI_CLIPS = {
  a: { key: 'a', label: 'AI-A', start: 0, end: 4.0, duration: 4.0, defaultIn: 0 },
  b: { key: 'b', label: 'AI-B', start: 23.0, end: 30.0, duration: 7.0, defaultIn: 0.5 },
};

// 映像の場面構成（0〜30秒を連続で覆う）。
export const SCENES = [
  { id: 'ai-a', name: 'AI-A（夜の電話）', kind: 'ai', clip: 'a', start: 0, end: 4.0, viewport: null },
  { id: 'ui-1', name: 'UI-1（架電・再架電）', kind: 'ui', start: 4.0, end: 11.5, transitionIn: CROSSFADE_SECONDS, viewport: { width: 1280, height: 2200 } },
  { id: 'ui-2', name: 'UI-2（商談ボード）', kind: 'ui', start: 11.5, end: 17.0, viewport: { width: 960, height: 2200 } },
  { id: 'ui-3', name: 'UI-3（月次集計）', kind: 'ui', start: 17.0, end: 23.0, viewport: { width: 960, height: 2400 } },
  { id: 'ai-b', name: 'AI-B＋終わりのカード', kind: 'ai', clip: 'b', start: 23.0, end: 30.0, transitionIn: CROSSFADE_SECONDS, endCardAt: 26.0, viewport: null },
];

// 音楽用の場面構成（小節境界にそろえる。0–4秒は呼出音のみ、4.0秒にBGMが入る）。
export const STORYBOARD = [
  { id: 'S0', name: '呼出音（夜）', start: bar(0), end: bar(2), music: 'ring' },
  { id: 'S1', name: '架電・再架電予約', start: bar(2), end: bar(4), music: 'drop' },
  { id: 'S2', name: '土日を除く翌日の再架電', start: bar(4), end: bar(6), music: 'groove' },
  { id: 'S3', name: '商談ボード', start: bar(6), end: bar(8), music: 'build' },
  { id: 'S4', name: '月次集計・着地予測', start: bar(8), end: bar(11), music: 'chorus' },
  { id: 'S5', name: '朝9時へ', start: bar(11), end: bar(13), music: 'breeze' },
  { id: 'S6', name: '終わりのカード', start: bar(13), end: bar(15), music: 'resolve' },
];

// 字幕（design.md の表と一字一句一致させる。lines.join('') が正本の文言）。
export const CAPTIONS = [
  { start: 0.2, end: 2.0, scene: 'ai-a', lines: ['電話、つながらなかった。'], big: true },
  { start: 2.0, end: 4.0, scene: 'ai-a', lines: ['かけ直し、忘れてない？'], big: true, tag: '営業リストの架電に' },
  // 14字の行が左右の安全域（442px）を超えるため、この字幕だけ 30px（34px だと約 480px になる）。
  { start: 4.0, end: 7.3, scene: 'ui-1', lines: ['「不在のため再架電を予約」に', 'チェックして、保存して次へ。'], fontSize: 30 },
  { start: 7.3, end: 11.5, scene: 'ui-1', lines: ['土日を除く翌日の朝9時に、', '再架電が入る。'] },
  { start: 11.5, end: 14.0, scene: 'ui-2', lines: ['商談は、', '段階ごとにひと目で。'] },
  { start: 14.0, end: 17.0, scene: 'ui-2', lines: ['段階は、', '選んで動かすだけ。'] },
  { start: 17.0, end: 20.0, scene: 'ui-3', lines: ['動かした分が、', '今月の着地に。'] },
  { start: 20.0, end: 23.0, scene: 'ui-3', lines: ['目標との差も、', '担当別に。'] },
  { start: 23.0, end: 26.0, scene: 'ai-b', lines: ['朝9時、かけ直せる。'], big: true },
];

// 終わりのカード（26.0–30.0秒。AI映像Bを暗くして重ねる）。
export const END_CARD = {
  start: 26.0,
  end: 30.0,
  series: '100日チャレンジ  DAY 99',
  title: 'meibo',
  sub: '営業リスト向けのCRM',
  badge: '無料のオープンソース',
  cta: 'GitHubで見る',
  url: 'github.com/haranishi/meibo',
  disclosure: '冒頭と最後の人物映像はAI生成／画面のデータは合成',
};

// 終わりのカードの縦配置寸法（stage.css の #end-inner と一致させ、安全域 y=77..768 と非重複を計算で確かめる）。
export const END_CARD_LAYOUT = {
  top: 152,
  padX: 49,
  items: [
    { key: 'series', marginTop: 0, fontSize: 16, lineHeight: 1.35, padY: 0, borderY: 0 },
    { key: 'brandCard', marginTop: 24, fixedHeight: 86 },
    { key: 'sub', marginTop: 26, fontSize: 30, lineHeight: 1.35, padY: 0, borderY: 0 },
    { key: 'badge', marginTop: 22, fontSize: 22, lineHeight: 1.35, padY: 20, borderY: 0 },
    { key: 'cta', marginTop: 28, fontSize: 18, lineHeight: 1.3, padY: 0, borderY: 0 },
    { key: 'url', marginTop: 10, fontSize: 21, lineHeight: 1.35, padY: 26, borderY: 3 },
    { key: 'disclosure', marginTop: 36, fontSize: 17, lineHeight: 1.5, padY: 0, borderY: 0 },
  ],
};

// 一覧カード用 demo.mp4 の切り出し区間（無音・540x960・合計15.6秒・UI場面のみ・AI映像は含めない）。
export const DEMO_RANGES = [
  [4.4, 9.6],
  [11.7, 16.5],
  [17.2, 22.8],
];

// 架電モードの活動メモは必須（required）のため、UI-1 の準備で入れる短い合成メモ。
export const PREP_ACTIVITY_NOTE = '担当者ご不在のため、再架電予定。';

// 操作・カメラ・効果音の予定表。
// 時刻は動画の秒数。render-promo.mjs が順番に実行し、実際の時刻を cues.json に書き出す。
export const ACTIONS = [
  // AI-A（0–4秒）：呼出音2回＋BGM前のライザー
  { at: 0.05, scene: 'ai-a', type: 'cue', label: '呼出音1回目', cue: { kind: 'ring', n: 0 } },
  { at: 2.0, scene: 'ai-a', type: 'cue', label: '呼出音2回目', cue: { kind: 'ring', n: 1 } },
  { at: 3.6, scene: 'ai-a', type: 'cue', label: 'BGM前ライザー', cue: { kind: 'riser' } },

  // UI-1（4–11.5秒）：架電モード → 不在チェック → 保存して次へ → 取引先一覧の次回対応
  { at: 4.0, scene: 'ui-1', type: 'camera-focus', label: '活動記録パネルへ寄る', target: 'activityPanel', over: 0, width: 490 },
  { at: 4.5, scene: 'ui-1', type: 'check-absence', label: '不在のため再架電を予約をチェック', lead: 0.4, cue: { kind: 'check' } },
  { at: 4.6, scene: 'ui-1', type: 'highlight', label: '再架電の注意書きを枠で強調', target: 'callbackTiming', hold: 0.9 },
  { at: 5.2, scene: 'ui-1', type: 'camera-focus', label: '保存して次へボタンと右上のトーストへ寄る', target: 'callModeNext', over: 0.6, width: 480 },
  { at: 5.9, scene: 'ui-1', type: 'save-and-next', label: '保存して次へを押す', lead: 0.4, cue: { kind: 'next' } },
  { at: 6.9, scene: 'ui-1', type: 'hide-notice', label: 'トーストを消す（次のボタンに重ならないように）' },
  { at: 6.9, scene: 'ui-1', type: 'camera-focus', label: '架電モードを終了ボタンへ寄る', target: 'exitCallMode', over: 0.3, width: 480 },
  { at: 7.3, scene: 'ui-1', type: 'exit-call-mode', label: '架電モードを終了する', lead: 0.25, cue: { kind: 'nav', n: 0 } },
  { at: 7.5, scene: 'ui-1', type: 'camera-focus', label: '1行目の担当・次回対応へ寄る', target: 'firstRowNextAction', over: 0.3, width: 500 },
  { at: 7.5, scene: 'ui-1', type: 'highlight', label: '1行目の次回対応セルを強調', target: 'firstRowNextActionCell', hold: 2.4, cue: { kind: 'pop' } },
  { at: 7.5, scene: 'ui-1', type: 'show-callout', label: '次回対応の大きな札を出す', calloutLabel: '次回対応', valueFrom: 'nextAction', hold: 2.4 },
  { at: 9.9, scene: 'ui-1', type: 'camera-focus', label: '札が消えたあと、ゆっくり引いて行全体の文脈を見せる', target: 'firstRowNextAction', over: 1.4, width: 540 },
  { at: 11.05, scene: 'ui-1', type: 'camera-focus', label: '商談タブへ戻る', target: 'navDeals', over: 0.3, width: 520 },

  // UI-2（11.5–17秒）：商談ボード → 横送り → 提案から受注へ移動（表示値変更を見せてから change 発火）
  { at: 11.5, scene: 'ui-2', type: 'set-viewport', label: '幅960へ切り替え', width: 960, height: 2200 },
  { at: 11.5, scene: 'ui-2', type: 'open-deals-board', label: '商談ボードを開く', nav: '商談', lead: 0.35, cue: { kind: 'nav', n: 1 } },
  { at: 11.5, scene: 'ui-2', type: 'camera-focus', label: '見込み・評価の列から開始', target: 'boardStart', over: 0, width: 500 },
  { at: 12.0, scene: 'ui-2', type: 'board-pan', label: '盤を右へ送り提案列へ', toLane: '提案', over: 1.7, cue: { kind: 'pan' } },
  { at: 14.0, scene: 'ui-2', type: 'highlight', label: '提案の先頭商談カードを強調', target: 'proposalTopDealCard', hold: 0.75 },
  { at: 14.2, scene: 'ui-2', type: 'focus-deal-stage', label: '提案の先頭商談の段階選択欄を押す', fromLane: '提案', lead: 0.4 },
  { at: 14.3, scene: 'ui-2', type: 'preview-deal-stage', label: '段階の表示値だけを「受注」へ変更', fromLane: '提案', toStage: '受注', stageValue: '4', cue: { kind: 'click' } },
  { at: 14.75, scene: 'ui-2', type: 'move-deal-won', label: '提案の先頭商談を受注へ移動', fromLane: '提案', toStage: '受注', stageValue: '4', cue: { kind: 'won' } },
  { at: 14.9, scene: 'ui-2', type: 'board-pan', label: '受注列へ寄る', toLane: '受注', over: 0.65 },
  { at: 15.35, scene: 'ui-2', type: 'highlight', label: '受注へ移ったカードを強調', target: 'movedDealCard', hold: 1.15 },
  { at: 16.55, scene: 'ui-2', type: 'camera-focus', label: '月次集計ボタンへ移動', target: 'salesReportBtn', over: 0.3, width: 520 },

  // UI-3（17–23秒）：月次集計 → 4カード・着地予測の大きな札 → 担当別の表と目標との差
  { at: 17.0, scene: 'ui-3', type: 'open-sales-report', label: '月次集計を開く', lead: 0.35, cue: { kind: 'nav', n: 2 } },
  { at: 17.0, scene: 'ui-3', type: 'camera-focus', label: '月次集計カード左側へ', target: 'reportTotalsLeft', over: 0, width: 510 },
  { at: 17.9, scene: 'ui-3', type: 'camera-focus', label: '着地予測カードへパン', target: 'reportTotalsRight', over: 0.4, width: 510 },
  { at: 19.0, scene: 'ui-3', type: 'show-callout', label: '着地予測の大きな札を出す', calloutLabel: '着地予測', valueFrom: 'landingForecast', hold: 0.9, cue: { kind: 'tally' } },
  { at: 19.0, scene: 'ui-3', type: 'highlight', label: '着地予測カードを強調', target: 'landingCard', hold: 0.9 },
  { at: 20.0, scene: 'ui-3', type: 'camera-focus', label: '担当別の表の右側（着地予測・月間目標・目標との差）へ寄る', target: 'projectionRight', over: 0.5, width: 520 },
  { at: 20.3, scene: 'ui-3', type: 'show-callout', label: '担当別の目標との差を大きな札で出す', calloutLabel: '目標との差', valueFrom: 'projectionDiffs', hold: 1.9 },
  { at: 20.3, scene: 'ui-3', type: 'highlight', label: '担当別の目標との差列を強調', target: 'projectionDiffColumn', hold: 1.9 },

  // AI-B＋終わりのカード（23–30秒）
  { at: 26.0, scene: 'ai-b', type: 'end-card', label: '終わりのカード', cue: { kind: 'end' } },
];

// 音側（promo-audio.mjs / verify-audio.mjs）が使う合図一覧。絵コンテから一意に組み立てる。
export function buildCues() {
  const cues = [];
  for (const action of ACTIONS) {
    if (action.cue) cues.push({ at: action.at, ...action.cue });
  }
  return cues.sort((x, y) => x.at - y.at);
}
export const CUES = buildCues();

// ---- 純粋な計算関数（映像描画・単体テスト・--selftest で共用）----

export const clamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, value));
export const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - ((-2 * p + 2) ** 3) / 2);
export const easeOut = (p) => 1 - (1 - p) ** 3;

export function sceneAt(t) {
  const safeT = clamp(t, 0, DURATION_SECONDS - 1e-6);
  return SCENES.find((s) => safeT >= s.start - 1e-9 && safeT < s.end - 1e-9) ?? SCENES.at(-1);
}

// 字幕の状態を時刻 t から計算する。透明度は常に 1（切り替えの途中の薄いコマを作らない）。下から 14px 上がるだけ。
export function captionAt(t) {
  const cap = CAPTIONS.find((c) => t >= c.start - 1e-9 && t < c.end - 1e-9);
  if (!cap) return null;
  const local = t - cap.start;
  const rise = cap.start <= 0.25 ? 1 : easeOut(clamp(local / 0.16));
  return {
    lines: cap.lines,
    big: Boolean(cap.big),
    fontSize: cap.fontSize ?? null,
    tag: cap.tag ?? null,
    scene: cap.scene,
    alpha: 1,
    dy: Math.round((1 - rise) * 14),
  };
}

// AI レイヤーと UI 窓の合成比率（0..1）を計算する。
export function layerMixAt(t) {
  const aiAEnd = AI_CLIPS.a.end;
  const aiBStart = AI_CLIPS.b.start;
  if (t < aiAEnd - 1e-9) {
    return { mode: 'ai-a', clip: 'a', aiAlpha: 1, uiAlpha: 0, scrimAlpha: 1, aiOnTop: true, aiFrameIndex: Math.floor(t * FPS + 1e-6) };
  }
  if (t < aiAEnd + CROSSFADE_SECONDS - 1e-9) {
    const p = clamp((t - aiAEnd) / CROSSFADE_SECONDS);
    return {
      mode: 'crossfade-in',
      clip: 'a',
      aiAlpha: 1 - p,
      uiAlpha: 1,
      scrimAlpha: 1 - p,
      aiOnTop: true,
      aiFrameIndex: Math.round(AI_CLIPS.a.duration * FPS) - 1,
    };
  }
  if (t < aiBStart - 1e-9) {
    return { mode: 'ui', clip: null, aiAlpha: 0, uiAlpha: 1, scrimAlpha: 0, aiOnTop: false, aiFrameIndex: 0 };
  }
  if (t < aiBStart + CROSSFADE_SECONDS - 1e-9) {
    const p = clamp((t - aiBStart) / CROSSFADE_SECONDS);
    const local = t - aiBStart;
    return {
      mode: 'crossfade-out',
      clip: 'b',
      aiAlpha: p,
      uiAlpha: 1,
      scrimAlpha: p,
      aiOnTop: true,
      aiFrameIndex: Math.floor(local * FPS + 1e-6),
    };
  }
  const local = t - aiBStart;
  const maxB = Math.round(AI_CLIPS.b.duration * FPS) - 1;
  return {
    mode: 'ai-b',
    clip: 'b',
    aiAlpha: 1,
    uiAlpha: 0,
    scrimAlpha: t < END_CARD.start ? 1 : Math.max(0, 1 - (t - END_CARD.start) / 0.35),
    aiOnTop: true,
    aiFrameIndex: clamp(Math.floor(local * FPS + 1e-6), 0, maxB),
  };
}

export function endCardAt(t) {
  if (t < END_CARD.start - 1e-9) return { alpha: 0, fadeCurtain: 0 };
  const alpha = easeOut(clamp((t - END_CARD.start) / 0.45));
  const fadeStart = DURATION_SECONDS - FADE_OUT_SECONDS;
  const fadeCurtain = t > fadeStart ? easeInOut(clamp((t - fadeStart) / FADE_OUT_SECONDS)) * 0.92 : 0;
  return { alpha, fadeCurtain };
}

// 対象要素の矩形（ドキュメント座標）から、窓のアスペクト比を保ったカメラ目標 { cx, cy, w } を計算する。
// 文字が読めないほど引かないよう、幅は [MIN_CAMERA_WIDTH, MAX_READABLE_CAMERA_WIDTH] に収める。
export function computeCameraForRect(rect, { padX = 24, padY = 24, preferredWidth = null, alignX = 'center', alignY = 'center', bounds = null } = {}) {
  const aspect = WINDOW_ASPECT;
  const minW = Math.max(MIN_CAMERA_WIDTH, rect.width + padX * 2, (rect.height + padY * 2) * aspect);
  let w = preferredWidth ?? minW;
  w = clamp(w, MIN_CAMERA_WIDTH, MAX_READABLE_CAMERA_WIDTH);
  if (bounds?.width) w = Math.min(w, bounds.width);
  const h = w / aspect;

  let cx = rect.x + rect.width / 2;
  if (alignX === 'left') cx = rect.x - padX + w / 2;
  else if (alignX === 'right') cx = rect.x + rect.width + padX - w / 2;

  let cy = rect.y + rect.height / 2;
  if (alignY === 'top') cy = rect.y - padY + h / 2;
  else if (alignY === 'bottom') cy = rect.y + rect.height + padY - h / 2;

  if (bounds) {
    const minCx = w / 2;
    const maxCx = Math.max(minCx, bounds.width - w / 2);
    const minCy = h / 2;
    const maxCy = Math.max(minCy, bounds.height - h / 2);
    cx = clamp(cx, minCx, maxCx);
    cy = clamp(cy, minCy, maxCy);
  }
  return { cx, cy, w, h };
}

export function interpolateCamera(from, to, progress) {
  const p = easeInOut(clamp(progress));
  const w = from.w + (to.w - from.w) * p;
  return {
    cx: from.cx + (to.cx - from.cx) * p,
    cy: from.cy + (to.cy - from.cy) * p,
    w,
    h: w / WINDOW_ASPECT,
  };
}

// カメラ中心・幅からドキュメント座標の矩形を返し、さらにビューポート内収まりのための scrollY と clip を計算する。
export function cameraToClip(camera, viewport, docHeight = viewport.height) {
  const w = Math.min(camera.w, viewport.width);
  const h = Math.min(w / WINDOW_ASPECT, viewport.height);
  const maxDocY = Math.max(viewport.height, docHeight);
  const docX = clamp(camera.cx - w / 2, 0, Math.max(0, viewport.width - w));
  const docY = clamp(camera.cy - h / 2, 0, Math.max(0, maxDocY - h));
  // clip がビューポート内に確実に収まる scrollY を決める。
  let scrollY = 0;
  if (docY + h > viewport.height) {
    scrollY = Math.min(Math.max(0, maxDocY - viewport.height), Math.floor(docY));
  }
  const clipY = clamp(docY - scrollY, 0, Math.max(0, viewport.height - h));
  const clipX = clamp(docX, 0, Math.max(0, viewport.width - w));
  return {
    scrollY,
    docRect: { x: clipX, y: scrollY + clipY, width: w, height: h },
    clip: {
      x: Math.round(clipX * 100) / 100,
      y: Math.round(clipY * 100) / 100,
      width: Math.round(w * 100) / 100,
      height: Math.round(h * 100) / 100,
    },
  };
}

// アプリ上のドキュメント座標の点・矩形を、ステージ上の CSS 座標へ変換する。
export function appToStagePoint(point, camDocRect, win = STAGE.window) {
  const scale = win.width / camDocRect.width;
  return {
    x: win.x + (point.x - camDocRect.x) * scale,
    y: win.y + (point.y - camDocRect.y) * scale,
  };
}

export function appToStageRect(rect, camDocRect, win = STAGE.window) {
  const scale = win.width / camDocRect.width;
  const rawX = win.x + (rect.x - camDocRect.x) * scale;
  const rawY = win.y + (rect.y - camDocRect.y) * scale;
  const rawW = rect.width * scale;
  const rawH = rect.height * scale;
  const left = Math.max(win.x + 2, rawX);
  const top = Math.max(win.y + 2, rawY);
  const right = Math.min(win.x + win.width - 2, rawX + rawW);
  const bottom = Math.min(win.y + win.height - 2, rawY + rawH);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

// 日本語文字列の概算幅（em）。約物（「」・、。）は palt でやや狭い。
export function estimateTextEm(line) {
  let em = 0;
  for (const ch of line) {
    if (/[「」『』、。・？！\s]/.test(ch)) em += 0.65;
    else if (/[\u0020-\u007e]/.test(ch)) em += 0.58;
    else em += 1.0;
  }
  return em;
}

// 終わりのカード各要素の縦位置を計算し、安全域（y=77..768）収まり・非重複・横幅を確認する。
export function computeEndCardLayout(card = END_CARD, layout = END_CARD_LAYOUT) {
  const maxWidthPx = STAGE.width - layout.padX * 2;
  let y = layout.top;
  const boxes = [];
  for (const spec of layout.items) {
    y += spec.marginTop;
    let height = spec.fixedHeight ?? 0;
    let estWidthPx = 0;
    let lines = 1;
    if (!spec.fixedHeight) {
      const text = String(card[spec.key] ?? '');
      estWidthPx = estimateTextEm(text) * spec.fontSize;
      lines = Math.max(1, Math.ceil(estWidthPx / maxWidthPx));
      height = Math.ceil(spec.fontSize * spec.lineHeight) * lines + (spec.padY || 0) + (spec.borderY || 0);
    }
    const top = y;
    const bottom = top + height;
    boxes.push({ key: spec.key, top, bottom, height, lines, estWidthPx: Math.round(estWidthPx) });
    y = bottom;
  }
  const hasOverlap = boxes.some((b, i) => i > 0 && b.top < boxes[i - 1].bottom);
  const topY = boxes[0]?.top ?? layout.top;
  const bottomY = boxes.at(-1)?.bottom ?? layout.top;
  const withinSafeY = topY >= STAGE.safeY.min && bottomY <= STAGE.safeY.max;
  return { boxes, topY, bottomY, maxWidthPx, hasOverlap, withinSafeY };
}

// ステージの文字・札の左右の端（stage.measureText の結果）が、左右の安全域に収まっているかを調べる（純粋な関数）。
export function textBoundsViolations(boxes, safeX = STAGE.safeX, tolerance = 1.5) {
  return boxes.filter((b) => b.left < safeX.min - tolerance || b.right > safeX.max + tolerance);
}

// ブラウザなしで絵コンテの整合性を一括検査する（render-promo.mjs --selftest および単体テストから呼ぶ）。
export function selftestStoryboard() {
  const errors = [];
  if (TOTAL_FRAMES !== 900) errors.push(`TOTAL_FRAMES が 900 ではない: ${TOTAL_FRAMES}`);
  if (BAR * BARS !== DURATION_SECONDS) errors.push(`小節数×小節長が ${DURATION_SECONDS}秒と不一致`);

  // 場面の境（SCENES / STORYBOARD）が 0..30 秒を隙間・重複なく覆うこと
  for (const [label, list] of [['SCENES', SCENES], ['STORYBOARD', STORYBOARD]]) {
    if (!list.length || list[0].start !== 0) errors.push(`${label} が 0秒から始まっていない`);
    if (list.at(-1)?.end !== DURATION_SECONDS) errors.push(`${label} が ${DURATION_SECONDS}秒で終わっていない`);
    for (let i = 1; i < list.length; i++) {
      if (Math.abs(list[i].start - list[i - 1].end) > 1e-9) {
        errors.push(`${label}[${i}] の境がずれている: ${list[i - 1].end} != ${list[i].start}`);
      }
      if (list[i].end <= list[i].start) errors.push(`${label}[${i}] の長さが正でない`);
    }
  }

  // 字幕の並び・安全域・幅・任意タグ（札）のチェック
  const maxWidthPx = STAGE.safeX.max - STAGE.safeX.min; // 左右の安全域（442px）
  for (let i = 0; i < CAPTIONS.length; i++) {
    const c = CAPTIONS[i];
    if (c.start < 0 || c.end > END_CARD.start || c.end <= c.start) errors.push(`CAPTIONS[${i}] の時刻が不正`);
    if (i > 0 && c.start < CAPTIONS[i - 1].end - 1e-9) errors.push(`CAPTIONS[${i}] が前の字幕と重なっている`);
    const fontSize = c.fontSize ?? (c.big ? STAGE.captionBand.bigFontSize : STAGE.captionBand.fontSize);
    const totalHeight = c.lines.length * fontSize * STAGE.captionBand.lineHeight;
    const topY = STAGE.captionBand.top;
    const bottomY = topY + totalHeight;
    if (topY < STAGE.safeY.min || bottomY > STAGE.captionBand.bottom || bottomY > STAGE.safeY.max) {
      errors.push(`CAPTIONS[${i}] の縦位置が帯/安全域外: ${topY}..${bottomY.toFixed(1)}`);
    }
    for (const line of c.lines) {
      const estPx = estimateTextEm(line) * fontSize;
      if (estPx > maxWidthPx) errors.push(`CAPTIONS[${i}] 「${line}」の推定幅 ${estPx.toFixed(0)}px > ${maxWidthPx}px`);
    }
    if (c.tag) {
      const tagTop = STAGE.captionTag.top;
      const tagBottom = tagTop + STAGE.captionTag.height;
      if (tagTop < STAGE.captionBand.bottom || tagTop < STAGE.safeY.min || tagBottom > STAGE.safeY.max) {
        errors.push(`CAPTIONS[${i}] の札の縦位置が安全域/帯外: ${tagTop}..${tagBottom}`);
      }
      const tagWidthPx = estimateTextEm(c.tag) * STAGE.captionTag.fontSize + 40;
      if (tagWidthPx > maxWidthPx) {
        errors.push(`CAPTIONS[${i}] の札「${c.tag}」の推定幅 ${tagWidthPx.toFixed(0)}px > ${maxWidthPx}px`);
      }
    }
  }

  // 終わりのカードの文言・縦位置（安全域 y=77..768 と非重複）
  if (!END_CARD.cta) errors.push('END_CARD.cta が未設定');
  const endLayout = computeEndCardLayout();
  if (!endLayout.withinSafeY) {
    errors.push(`終わりのカードが安全域外: y=${endLayout.topY}..${endLayout.bottomY} (safe ${STAGE.safeY.min}..${STAGE.safeY.max})`);
  }
  if (endLayout.hasOverlap) errors.push('終わりのカードの要素が重なっている');
  for (const box of endLayout.boxes) {
    if (box.key !== 'disclosure' && box.key !== 'brandCard' && box.estWidthPx > endLayout.maxWidthPx) {
      errors.push(`終わりのカード ${box.key} の推定幅 ${box.estWidthPx}px > ${endLayout.maxWidthPx}px`);
    }
  }

  // 下端注記：窓の下に収まり、縦の安全域内で、左右の安全域（442px）に横幅が収まる（左ブランド＋右注記＋すき間12px）
  const windowBottom = STAGE.window.y + STAGE.window.height;
  if (STAGE.footerNote.y < windowBottom + 4 || STAGE.footerNote.y + STAGE.footerNote.height > STAGE.safeY.max) {
    errors.push(`下端注記の位置が想定外: y=${STAGE.footerNote.y}..${STAGE.footerNote.y + STAGE.footerNote.height}（窓の下端 ${windowBottom}・安全域の下端 ${STAGE.safeY.max}）`);
  }
  const footerBrandPx = estimateTextEm(STAGE.footerBrand.text) * STAGE.footerBrand.fontSize + 6 + STAGE.footerBrand.logoHeight * 3.4;
  const footerNotePx = estimateTextEm(STAGE.footerNote.text) * STAGE.footerNote.fontSize;
  if (footerBrandPx + footerNotePx + 12 > maxWidthPx) {
    errors.push(`下端注記の推定幅 ${(footerBrandPx + footerNotePx + 12).toFixed(0)}px > ${maxWidthPx}px`);
  }

  // ACTIONS の整合性（時刻順・廃止手順の残存禁止・UI-1幅1280維持・大きな札の引数・札の残像防止）
  const retiredTargets = new Set(['navHome', 'followupCard', 'followupFirst']);
  const retiredTypes = new Set(['nav-click', 'show-landing-callout']);
  for (let i = 0; i < ACTIONS.length; i++) {
    const a = ACTIONS[i];
    if (!Number.isFinite(a.at) || a.at < 0 || a.at >= DURATION_SECONDS) errors.push(`ACTIONS[${i}] の時刻が範囲外: ${a.at}`);
    if (i > 0 && a.at < ACTIONS[i - 1].at - 1e-9) errors.push(`ACTIONS[${i}] が時刻順でない: ${a.at} < ${ACTIONS[i - 1].at}`);
    if (retiredTypes.has(a.type)) errors.push(`ACTIONS[${i}] に廃止された操作型が残っている: ${a.type}`);
    if (a.target && retiredTargets.has(a.target)) errors.push(`ACTIONS[${i}] に廃止された対象が残っている: ${a.target}`);
    if (a.scene === 'ui-1' && a.type === 'set-viewport') errors.push('UI-1 の途中で viewport 幅を変えている（1280 のままにする）');
    if (a.type === 'show-callout') {
      if (!a.calloutLabel || !a.valueFrom || !(a.hold > 0)) {
        errors.push(`ACTIONS[${i}] の show-callout に必須項目が不足`);
      }
    }
  }
  const ui2Viewport = ACTIONS.find((a) => a.scene === 'ui-2' && a.type === 'set-viewport');
  if (!ui2Viewport || ui2Viewport.width !== 960) errors.push('UI-2 開始時の幅960切り替え（set-viewport）が無い');

  const landingCallout = ACTIONS.find((a) => a.type === 'show-callout' && a.valueFrom === 'landingForecast');
  const projectionCam = ACTIONS.find((a) => a.type === 'camera-focus' && a.target === 'projectionRight');
  if (!landingCallout || !projectionCam || landingCallout.at + landingCallout.hold >= projectionCam.at - 1e-9) {
    errors.push('着地予測の大きな札が 20.0 秒の担当別カメラ移動より前に消え切らない');
  }
  const projCallout = ACTIONS.find((a) => a.type === 'show-callout' && a.valueFrom === 'projectionDiffs');
  if (!projCallout || projCallout.at !== 20.3 || Math.abs(projCallout.hold - 1.9) > 1e-9) {
    errors.push('担当別の「目標との差」の大きな札（20.3–22.2秒）が正しく設定されていない');
  }
  const previewStage = ACTIONS.find((a) => a.type === 'preview-deal-stage');
  const moveWon = ACTIONS.find((a) => a.type === 'move-deal-won');
  if (!previewStage || !moveWon || previewStage.at !== 14.3 || moveWon.at !== 14.75) {
    errors.push('UI-2 の段階表示変更（14.3s）→ change 発火移動（14.75s）の手順が不足または時刻不一致');
  }

  // 合図（CUES）の並びと範囲
  if (!CUES.length) errors.push('CUES が空');
  for (let i = 0; i < CUES.length; i++) {
    const cue = CUES[i];
    if (!Number.isFinite(cue.at) || cue.at < 0 || cue.at >= DURATION_SECONDS) errors.push(`CUES[${i}] の時刻が範囲外: ${cue.at}`);
    if (i > 0 && cue.at < CUES[i - 1].at - 1e-9) errors.push(`CUES[${i}] が時刻順でない`);
  }

  // demo.mp4 区間（AI場面を含めない・合計14〜18秒）
  let demoTotal = 0;
  for (const [a, b] of DEMO_RANGES) {
    if (b <= a) errors.push(`DEMO_RANGES 不正: ${a}-${b}`);
    if (a < AI_CLIPS.a.end || b > AI_CLIPS.b.start) errors.push(`DEMO_RANGES が AI 場面を含んでいる: ${a}-${b}`);
    demoTotal += b - a;
  }
  if (demoTotal < 14 || demoTotal > 18) errors.push(`DEMO_RANGES の合計秒数が16秒前後から外れる: ${demoTotal.toFixed(2)}`);

  // 全900コマで計算関数が落ちず、有効な値を返すこと
  for (let f = 0; f < TOTAL_FRAMES; f++) {
    const t = f / FPS;
    const sc = sceneAt(t);
    const mix = layerMixAt(t);
    const cap = captionAt(t);
    const end = endCardAt(t);
    if (!sc || !mix || !Number.isFinite(mix.aiAlpha) || !Number.isFinite(end.alpha)) {
      errors.push(`frame ${f} の状態計算に失敗`);
      break;
    }
    if (cap && cap.alpha !== 1) {
      errors.push(`frame ${f} の字幕透明度が 1 ではない（薄いコマ防止）`);
      break;
    }
  }

  return {
    ok: errors.length === 0,
    totalFrames: TOTAL_FRAMES,
    durationSeconds: DURATION_SECONDS,
    scenes: SCENES.length,
    captions: CAPTIONS.length,
    cues: CUES.length,
    demoSeconds: Math.round(demoTotal * 100) / 100,
    errors,
  };
}
