/* 絵コンテ・字幕・振り付け。1コマは時刻 t の純関数で、DOMにも通信にも触れない。
   ここを差し替えれば別の Day のプロモにできる（README「他の Day へ流用するときに差し替える場所」）。 */

export const DURATION_SECONDS = 36;
export const DEFAULT_FPS = 30;

/* 出題は ?seed= で固定する。lib/rng.js の mulberry32 なので、同じ種なら必ず同じ10問。
   1問目は lib/quiz.js が「分かりやすい形」から選ぶ（都道府県は LEAD_PREFS の9県、市区町村は県内で大きい上位5件）。
   PREF_SEED 156 … 1問目=静岡県（選択肢の3番目）、2問目=北海道（2番目）
   TOWN_SEED 20 + 秋田県 … 1問目=仙北市（2番目）、2問目=男鹿市
   出題規則を変えたら WIKI_SUMMARIES の記事名も必ず合わせること（合わないと 404 で
   「解説は取れませんでした」の画が撮れる。render-promo.mjs 側でも撮る前に落とすようにしてある）。 */
export const PREF_SEED = 156;
export const TOWN_SEED = 20;
export const TOWN_PREF = '05';

/* 背景と各シーンに置く、実データから描くシルエット。コードは総務省コード */
export const BACKDROP_PREFS = Object.freeze(['01', '39', '47', '22', '12']);
export const MARK_PREF = '01';

// 場面の切れ目
export const TITLE_START = 3.2;
export const PREF_START = 6.2;
export const TOWN_START = 13.2;
export const T_WIKI = 20.6;
export const RESULT_START = 25.2;
export const PROMISE_START = 29.2;
export const END_START = 32.8;

// 指がボタンに触れる時刻
export const T_HOOK_TAP = 1.05;
export const T_PREF_TAP = 9.6;
export const T_HINT_TAP = 16;
export const T_TOWN_TAP = 19;

export const STORYBOARD = Object.freeze([
  { id: 'S0', name: 'フック（形→タップ→正解！）', start: 0, end: TITLE_START },
  { id: 'S1', name: 'タイトル', start: TITLE_START, end: PREF_START },
  { id: 'S2', name: '都道府県モード', start: PREF_START, end: TOWN_START },
  { id: 'S3', name: '秋田県の市町村とヒント', start: TOWN_START, end: T_WIKI },
  { id: 'S4', name: '正解のあとの1行', start: T_WIKI, end: RESULT_START },
  { id: 'S5', name: '結果とXへの投稿', start: RESULT_START, end: PROMISE_START },
  { id: 'S6', name: '約束と出典', start: PROMISE_START, end: END_START },
  { id: 'S7', name: 'エンド', start: END_START, end: DURATION_SECONDS }
]);

/* 字幕は1行16字以内・2行以内。フックだけ 0 より前から出して、1コマ目（Xのサムネ）に載せる */
export const CAPTIONS = Object.freeze([
  { start: -0.5, end: TITLE_START, lines: ['形だけで、どこか分かる？'], kind: 'hook' },
  { start: 6.35, end: T_PREF_TAP, lines: ['まずは47の都道府県'] },
  { start: T_PREF_TAP, end: TOWN_START, lines: ['4つから選ぶだけ'] },
  { start: 13.5, end: T_HINT_TAP, lines: ['市町村はぐっと難しい'] },
  { start: T_HINT_TAP, end: T_TOWN_TAP, lines: ['ヒントは県内の位置だけ'] },
  { start: T_TOWN_TAP, end: T_WIKI, lines: ['あ、そういう形か'] },
  { start: T_WIKI + .1, end: RESULT_START, lines: ['正解のあとに、1行の解説'] },
  { start: 25.4, end: PROMISE_START, lines: ['点数はそのままXへ'] }
]);

/** 押した瞬間の波紋。kind は色（正解は深緑、ヒントは墨） */
export const TAPS = Object.freeze([
  { at: T_HOOK_TAP, kind: 'correct' },
  { at: T_PREF_TAP, kind: 'correct' },
  { at: T_HINT_TAP, kind: 'hint' },
  { at: T_TOWN_TAP, kind: 'correct' }
]);

/* 指の通り道。target はアプリ内の要素名で、座標は毎コマ測って解決する。
   fade: true のキーフレームで指は消え、次のキーフレームまで出てこない。
   'answer' はその場面の正解ボタン（種から計算するので画面の並びが変わっても追従する）。 */
export const FINGER = Object.freeze([
  { at: -1, target: 'idle' },
  { at: T_HOOK_TAP, target: 'answer' },
  { at: 1.7, target: 'idle', fade: true },

  { at: 8.3, target: 'idle' },
  { at: T_PREF_TAP, target: 'answer' },
  { at: 10.2, target: 'idle', fade: true },

  { at: 14.5, target: 'idle' },
  { at: 15.3, target: 'choice:3' },
  { at: 15.72, target: 'choice:0' },
  { at: T_HINT_TAP, target: 'hint' },
  { at: 16.6, target: 'idle', fade: true },

  { at: 18.3, target: 'idle' },
  { at: T_TOWN_TAP, target: 'answer' },
  { at: 19.65, target: 'idle', fade: true },

  { at: 26.5, target: 'idle' },
  { at: 27.6, target: 'post' },
  { at: 29.05, target: 'post', fade: true }
]);

export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const mix = (from, to, amount) => from + (to - from) * amount;
export const easeOutCubic = (x) => 1 - (1 - clamp(x)) ** 3;
export const easeInOutCubic = (x) => {
  const p = clamp(x);
  return p < .5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
};
export const progress = (t, start, end, easing = (x) => x) => easing(clamp((t - start) / (end - start)));

export function captionAt(t) {
  return CAPTIONS.find(({ start, end }) => t >= start && t < end) ?? null;
}

/* アプリを読み直す単位。場面が変わったときだけ iframe を開き直し、同じ場面の中では読み直さない。
   キーは promo.js の PLANS（どの種で開き、どのボタンを順に押すか）と対になっている。 */
export function appSceneAt(t) {
  if (t < T_HOOK_TAP) return 'hook-q';
  if (t < PREF_START) return 'hook-reveal';
  if (t < T_PREF_TAP) return 'pref-q';
  if (t < TOWN_START) return 'pref-reveal';
  if (t < T_HINT_TAP) return 'town-q';
  if (t < T_TOWN_TAP) return 'town-hint';
  if (t < RESULT_START) return 'town-reveal';
  return 'result';
}

/* 出題が変わるたびにシルエットをふわっと出す（動きを減らす設定ではアプリ側が描かない）。
   窓の始まりは場面の始まりと同じ時刻にしてある。そこでは端末が透明なので、1→0 の戻りは見えない。 */
const SHAPE_FADES = [-0.6, PREF_START, TOWN_START];
export function shapeFadeAt(t) {
  const start = SHAPE_FADES.filter((value) => t >= value).pop();
  return start === undefined ? 0 : progress(t, start, start + 0.45, easeOutCubic);
}

/** 正解表示のせり上がり。タップした瞬間から 0.32 秒 */
export function revealFadeAt(t) {
  const tap = [T_HOOK_TAP, T_PREF_TAP, T_TOWN_TAP].filter((value) => t >= value).pop();
  return tap === undefined ? 0 : progress(t, tap, tap + 0.32, easeOutCubic);
}

/** 解説が届いた度合い。0 なら「読み込み中」のまま（S4 で本文に入れ替わる） */
export function wikiPhaseAt(t) {
  if (t < T_WIKI || t >= RESULT_START) return 0;
  return progress(t, T_WIKI, T_WIKI + 0.4, easeOutCubic);
}

/* 正解表示までスクロールする窓。値は「測った目標位置に掛ける率」で、
   目標そのものは promo.js が毎コマ測る（Wikipedia の1行が開くと目標も下がる＝続きを読む動きになる）。 */
const SCROLL_WINDOWS = [
  { tap: T_HOOK_TAP, from: T_HOOK_TAP + .15, to: T_HOOK_TAP + .95, until: PREF_START },
  { tap: T_PREF_TAP, from: T_PREF_TAP + .15, to: T_PREF_TAP + .95, until: TOWN_START },
  { tap: T_TOWN_TAP, from: T_TOWN_TAP + .15, to: T_TOWN_TAP + 1, until: RESULT_START }
];
export function scrollProgressAt(t) {
  const window = SCROLL_WINDOWS.find(({ tap, until }) => t >= tap && t < until);
  return window ? progress(t, window.from, window.to, easeInOutCubic) : 0;
}

/* 端末の出入り。S3 と S5 は別の場面へ切り替わるので、横にスワイプして入れ替える */
const SWIPES = [TOWN_START, RESULT_START];
export function phoneTimeline(t) {
  if (t < TITLE_START) return { opacity: 1 - progress(t, TITLE_START - .3, TITLE_START, easeInOutCubic), x: 0, y: 0 };
  if (t < PREF_START || t >= PROMISE_START) return { opacity: 0, x: 0, y: 0 };
  let opacity = progress(t, PREF_START, PREF_START + .4, easeOutCubic)
    * (1 - progress(t, PROMISE_START - .32, PROMISE_START, easeInOutCubic));
  let x = 0;
  for (const at of SWIPES) {
    if (t >= at - .26 && t < at) {
      const p = progress(t, at - .26, at, easeInOutCubic);
      x = mix(0, -170, p);
      opacity *= 1 - p;
    } else if (t >= at && t < at + .3) {
      const p = progress(t, at, at + .3, easeOutCubic);
      x = mix(170, 0, p);
      opacity *= p;
    }
  }
  return { opacity, x, y: mix(110, 0, progress(t, PREF_START, PREF_START + .45, easeOutCubic)) };
}

/** 背景のシルエットのゆっくりした漂い（コマの純関数のまま息をさせる） */
export function backdropDrift(t, index) {
  return {
    x: Math.sin(t * .19 + index * 1.7) * 16,
    y: Math.cos(t * .15 + index * 2.3) * 20
  };
}

export function previewTimes() {
  return [
    0, .55, 1.05, 1.4, 2.2, 3, 3.6, 4.4, 5.6, 6.5, 7.4, 8.8,
    9.6, 10.3, 12.4, 13.5, 14.8, 15.5, 16.05, 17.2, 18.8, 19.05, 19.8, 20.4,
    20.9, 22.6, 23.8, 25.4, 26.6, 27.9, 29, 30.3, 31.7, 32.9, 34, 35.4
  ];
}

/* Wikipedia は実APIを叩かず、この固定応答に差し替えて撮る（render-promo.mjs の route）。
   本文は 2026-09-07 に ja.wikipedia.org の REST API が返した要約そのまま。
   写真は CC BY-SA の作品なので動画には焼き込まない＝ thumbnail を持たせない。
   ここに無い記事名は 404 を返す（＝アプリの「取れなかった」表示になる）ので、
   出題に出る3件（静岡県・北海道・仙北市）は必ず揃えておく。 */
export const WIKI_SUMMARIES = Object.freeze({
  '静岡県': '静岡県（しずおかけん）は、日本の中部地方（東海地方）に位置する県。県庁所在地は静岡市。',
  '北海道': '北海道（ほっかいどう）は、日本の北東部に位置する唯一の「道」。道庁所在地は札幌市である。',
  '仙北市': '仙北市（せんぼくし）は、秋田県東部に位置する市。'
});
