/* Day 055 プロモ動画の絵コンテと字幕（32秒・縦型1080×1920・BGM付き）
   字幕の決まり: 1行16字以内、2行以内、10%セーフティゾーン */

export const DURATION_SECONDS = 32;
export const DEFAULT_FPS = 30;

export const S1_PICK_START = 0.0;     // 絵をえらぶ・サンプルクリック
export const S2_SPLIT_START = 5.0;    // 食材への自動割り当て・完成イメージ
export const S3_ADJUST_START = 10.5;  // 弁当箱と難易度の変更
export const S4_STEPS_START = 16.0;   // 前の晩と朝の段取り・買い物メモ
export const S5_TEMPLATE_START = 22.0;// 食材ごとの実寸型紙
export const S6_END_START = 27.5;     // エンド画面（登録不要・端末内完結）

export const STORYBOARD = [
  { id: 'pick', start: S1_PICK_START, dur: 5.0 },
  { id: 'split', start: S2_SPLIT_START, dur: 5.5 },
  { id: 'adjust', start: S3_ADJUST_START, dur: 5.5 },
  { id: 'steps', start: S4_STEPS_START, dur: 6.0 },
  { id: 'template', start: S5_TEMPLATE_START, dur: 5.5 },
  { id: 'end', start: S6_END_START, dur: 4.5 },
];

export const CAPTIONS = [
  {
    start: 0.5,
    end: 4.5,
    lines: ['絵を1枚えらぶだけ'],
    pos: 'bottom',
  },
  {
    start: 5.5,
    end: 10.0,
    lines: ['のりやハム、卵に', '自動でパーツを分解'],
    pos: 'bottom',
  },
  {
    start: 11.0,
    end: 15.5,
    lines: ['弁当箱に合わせて', 'ご飯の量も実寸化'],
    pos: 'bottom',
  },
  {
    start: 16.5,
    end: 21.0,
    lines: ['前の晩と当日の朝、', 'やることが分かれている'],
    pos: 'bottom',
  },
  {
    start: 22.5,
    end: 27.0,
    lines: ['食材ごとの実寸型紙を', '印刷してそのまま切れる'],
    pos: 'bottom',
  },
];
