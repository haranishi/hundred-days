// timeline.mjs — Day098「残火の鎌倉 — 隠れ谷の灯」宣伝動画（30秒・縦1080×1920・30fps・90 BPM）の時刻表と字幕定義。
// render-promo.mjs（映像・字幕・検査）と promo-audio.mjs / verify-audio.mjs（BGM合成・音声検査）が共通で参照する。

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const DURATION = 30;
export const TOTAL_FRAMES = DURATION * FPS; // 900

// 90 BPM（1拍 = 2/3 秒 = 20 コマ）。すべてのカット切替と打撃アクセントを拍の上に置く。
export const BPM = 90;
export const BEAT = 60 / BPM;

export const CUTS = [
  {
    id: 'burning_kamakura',
    startBeat: 0,
    endBeat: 6,
    frames: 120, // 0.00s - 4.00s
    note: '1333年、炎上する鎌倉の通り（オープニング舞台A：燃える家並みと舞い上がる火の粉・煙の中を進む）',
  },
  {
    id: 'valley_run',
    startBeat: 6,
    endBeat: 12,
    frames: 120, // 4.00s - 8.00s
    note: '夕暮れの隠れ谷と黄金の棚田の見渡し（45コマ）→ 主人公が紅葉の林道を駆け下りる追従視点（75コマ）',
  },
  {
    id: 'choice_stealth',
    startBeat: 12,
    endBeat: 20,
    frames: 160, // 8.00s - 13.33s
    note: '見晴らし岩での選択（正面から入る／脇道から回り込む・50コマ）→ 斥候の背後へ忍び寄り闇討ち（110コマ）',
  },
  {
    id: 'village_combat',
    startBeat: 20,
    endBeat: 29,
    frames: 180, // 13.33s - 19.33s
    note: '水穂の里での剣戟：侍大将・兵との斬り合い、弾きの火花と反撃・三連斬り → 崩れた敵へのとどめ',
  },
  {
    id: 'ally_touch',
    startBeat: 29,
    endBeat: 38,
    frames: 180, // 19.33s - 25.33s
    note: '救出した弓手・梓 弥十郎との共闘（弓の援護射撃）＋スマホ向けタッチ操作UIでの立ち回り',
  },
  {
    id: 'endcard',
    startBeat: 38,
    endBeat: 45,
    frames: 140, // 25.33s - 30.00s
    note: '廃寺の焚き火と夕景を背にしたエンドカード（残火の鎌倉／Day098／登録不要・無料）',
  },
];

export const CUT_BEATS = [6, 12, 20, 29, 38];

export const HITS = {
  stealthBeat: 16,  // 10.67s: 闇討ちの一閃
  parryBeat: 23,    // 15.33s: 弾き・反撃の火花
  finisherBeat: 26, // 17.33s: とどめの一撃
  endBeat: 38,      // 25.33s: エンドカード入り
};

export const FADE = 0.25;
export const FIRST_NO_FADE_IN = true;

// すべての行を16文字以内・2行以内に収め、上下左右10%のセーフエリア内へ配置する。
export const SUBTITLES = [
  { id: 's1', in: 0.0, out: 3.85, lines: ['1333年、鎌倉が燃えた。', '落ち延びた先は、信濃の隠れ谷。'] },
  { id: 's2', in: 4.0, out: 7.85, lines: ['夕暮れの谷に、追手の影。', '里へどう入るか、道を選ぶ。'] },
  { id: 's3', in: 8.0, out: 13.18, lines: ['正面から斬り込むか、', '脇道から、闇討ちするか。'] },
  { id: 's4', in: 13.333, out: 19.18, lines: ['光る刃を見て、弾き返す。', '構えを崩し、とどめを刺す。'] },
  { id: 's5', in: 19.333, out: 25.18, lines: ['弓手の仲間と、里を守り抜く。', 'PCでも、スマホでも遊べる。'] },
];

export const ENDCARD = {
  id: 'end',
  in: 38 * BEAT, // 25.333s
  out: DURATION,
  kicker: '第一章　隠れ谷の灯',
  title: '残火の鎌倉',
  lines: [
    '100日チャレンジ Day098',
    'ブラウザで今すぐ・登録不要',
    'day98.rairakku.com',
  ],
  note: '※実際のゲーム画面（撮影用視点・BGM付与）',
};

// 100日一覧カード用の 16秒デモ動画（540×960・無音）に切り出すフレーム範囲（合計 480 コマ = 16.0s）
export const DEMO_SEGMENTS = [
  { from: 20, count: 70 },   // 燃える鎌倉（2.33s）
  { from: 120, count: 90 },  // 隠れ谷俯瞰〜林道疾走（3.00s）
  { from: 290, count: 100 }, // 背後からの闇討ち（3.33s）
  { from: 410, count: 130 }, // 里の剣戟・弾き・三連斬り・とどめ（4.33s）
  { from: 590, count: 90 },  // 弥十郎との共闘＋スマホ操作（3.00s）
];
