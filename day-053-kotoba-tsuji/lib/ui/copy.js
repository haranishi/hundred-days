// 画面の言葉と案内役の台詞。正本は docs/COPY.md（文はそこからそのまま写す）
// 候補が複数ある台詞は pick() で毎回1つ選ぶ。同じ台詞が2回続かないようにする
import { formatDuration } from '../share.js';

export const TEXT = {
  title: {
    main: 'ことば辻',
    sub: '江戸のクロスワード',
    kojo: '言葉と言葉が交わる辻が、ところどころ空いておる。縦にも横にも合う一字を入れて、盤を仕上げるでござる。',
    small: '登録なし・広告なし・盤は何局でも',
    start: 'いざ、参る',
    resume: '続きから',
    banzuke: '番付',
    howto: '指南書',
    settings: 'しつらえ',
    welcomeBack: 'おかえりなされ。続きから参ろう。',
  },
  shareNote: 'InstagramとYouTubeはWebから直接投稿できない仕組みなので、「共有…」かコピーしたリンクから貼ってください。',
  // 「共有…」の札が出ていないときの注意書き
  shareNoteNoNative: 'InstagramとYouTubeはWebから直接投稿できない仕組みなので、コピーしたリンクから貼ってください。',
  shareButtons: { x: 'Xで投稿', line: 'LINEで送る', native: '共有…', copy: 'リンクをコピー' },
  copied: 'リンクをコピーしたでござる。',
  copyFailed: 'コピーできなんだ。下に出したリンクを長押しして写してくだされ。',
  select: {
    head: '腕前選び',
    lead: 'どの腕前で参るか、選ぶでござる。',
    lines: {
      1: 'まずは一字、気楽に参られよ。',
      2: '骨のある問じゃが、そなたなら解けるであろう。',
      3: '辻はすべて空いておる。腕に覚えのある者だけ、参られよ。',
    },
    about: '埋める字とは、空いた辻（縦と横の言葉が交わるマス）の数。多いほど手強いでござる。',
    blanks: '埋める字',
    busy: '問をこしらえておる…',
    genFailed: '問をこしらえ損ねたでござる。もう一度押してくだされ。',
    back: '戻る',
  },
  midway: {
    text: '途中の一局があるでござる。新しく始めると消えるが、よろしいか？',
    fresh: '新しく始める',
    resume: '続きから',
  },
  play: {
    leave: '退く',
    tools: { hint: '助太刀', check: '吟味', list: '問の一覧', dir: '縦⇄横' },
    listDown: '縦の問',
    listAcross: '横の問',
    listClose: '閉じる',
    giveUp: '降参する',
    coach: '朱の枠に、縦にも横にも合う一字を入れるべし。',
    level: '{level}・埋める字{b}',
    left: '残り',
    leftUnit: '字',
    prev: '前の問',
    next: '次の問',
    backToResult: '結果へ戻る',
  },
  hint: {
    text: '助太刀いたす。どれほど手を貸そうか？',
    letter: 'この一字',
    word: 'この一問まるごと',
    cancel: 'やめておく',
    giveUp: 'いっそ降参する…',
  },
  giveUp: { text: 'まことに降参いたすか？ 答えをすべて明かすでござる。', yes: '降参する', no: 'まだ粘る' },
  result: {
    sealWin: '天晴',
    sealLose: '無念',
    headWin: 'あっぱれ！ 空いた辻を、すべて埋めたり！',
    headLose: '無念…。されど、答えを知るのも修行のうち。',
    time: 'かかった時間',
    hints: '助太刀',
    blanks: '埋めた字',
    rankHead: '本日の番付',
    newBest: '新記録！ {level}の最速でござる。',
    again: 'もう一局',
    change: '腕前を変える',
    review: '盤を見返す',
    shareHead: '果たし状を送る',
    shareSub: 'この盤を友に出す',
    shareLead: '同じ盤が相手の端末に出るでござる。',
    // （v2-r2）手習いの結果に、解いた言葉を漢字つきで
    solvedWords: '解いた言葉：',
    // （v2-r3）4語以上のときは3語まで出して、残りをこう書く
    moreWords: 'ほか{n}語',
    // （v2-r2）同じ画面で手習いを3局続けて解いたとき
    graduate: '手習いは卒業かの？ そろそろ一人前へ参るか。',
    graduateGo: '一人前へ参る',
  },
  duel: {
    win: '果たし合い、そなたの勝ちでござる！（差出人 {theirs}・そなた {mine}）',
    lose: '無念、差出人の勝ちじゃ。次こそ討ち取るべし。（差出人 {theirs}・そなた {mine}）',
    draw: '引き分けにござる。好敵手とはこのことよな。（ともに {mine}）',
    giveUp: '果たし合いは差出人の勝ち。されど、また挑めばよい。',
    shareHead: '返し状を送る',
    shareSub: '同じ盤に、そなたの時間を添えて送り返す',
    shareText: '『ことば辻』の果たし状、{mine}で受けて立ったでござる。差出人は{theirs}。いざ、もう一番！',
  },
  challenge: {
    head: '果たし状が届いたでござる',
    body: '{level}（埋める字{b}）の問にて、そなたの腕を試したいとのこと。',
    time: '差出人は {time} で解いたそうな。',
    accept: '受けて立つ',
    decline: '今日はやめておく',
  },
  banzuke: {
    head: '番付',
    solved: '解いた数',
    best: '最速',
    rank: '最高位',
    total: '通算の解いた数',
    empty: 'まだ番付に名がないでござる。まずは手習いから参られよ。',
    back: '戻る',
  },
  howto: {
    head: '指南書',
    items: [
      '盤はほぼ埋まっておる。朱の枠のマスが、空いた辻（縦と横の言葉が交わるマス）じゃ。',
      '空いた辻を押すと、そこを通る横と縦の問が出る。両方の言葉に合う一字を、下の五十音盤で書き入れるべし。濁りは字のあとに「゛」、半濁りは「゜」を押す。',
      '小さい「ゃ・ゅ・ょ・っ」も大きく書くのが決まりじゃ。きゅうり → きゆうり、きって → きつて。',
      '困ったら「助太刀」。一字だけ、または一問まるごと教えてしんぜよう。「吟味」を押せば、違う字に朱で印を付ける。',
      '空いた辻がすべて埋まれば、あっぱれ！ かかった時間と助太刀の数で番付が決まる。腕前が上がるほど、埋める字が増えるでござる。',
    ],
    pcHead: 'PCの方へ',
    pc: 'ローマ字で書ける（neko → ねこ。「ん」は nn でも書ける）。矢印で動き、スペースで縦と横を入れ替え、Enter で次の空き辻へ。',
    back: '閉じる',
  },
  settings: {
    head: 'しつらえ',
    sound: '効果音',
    soundOn: '鳴らす',
    soundOff: '鳴らさない',
    autoCheck: '一問ごとの判定',
    autoCheckOn: 'する',
    autoCheckOff: 'しない',
    autoCheckNote: '言葉を書き終えたとき、正しいかどうかをすぐ知らせる',
    motion: '動き',
    motionAuto: '端末に合わせる',
    motionReduce: '控えめ',
    reset: '記録を消す',
    resetAsk: '番付の記録をすべて消すでござるか？ 元には戻せぬ。',
    resetYes: '消す',
    resetNo: 'やめる',
    resetDone: '記録を消したでござる。',
    close: '閉じる',
    noStore: 'この端末では記録を残せぬようでござる（遊ぶことはできる）。',
  },
};

// 候補が複数ある台詞
const LINES = {
  start: ['いざ尋常に、勝負でござる！', 'さあ、やるでござるよ！', '空いた辻は{n}か所。易しい所から埋めるが吉であろう。'],
  solved: ['{label}、見事でござる！', '{label}、お見事！', 'うむ、{label}は正解じゃ。', '冴えておるな。{label}、あっぱれ！'],
  wrong: ['むむ、{label}はどこか違うようでござる。', '{label}…惜しい。一字、見直してみるがよい。'],
  // 1字で縦横2つの言葉が同時に解けたとき（台詞を1つにまとめる）
  cross: ['一字で{a}と{b}、二つとも解けたり！ 見事でござる！', '{a}も{b}も、一挙に片付いたな。あっぱれ！'],
  lastOne: ['残るは一字のみ。もうひと踏ん張りじゃ！'],
  // 空きはすべて埋まったが、違う字が残っている
  allFilled: ['すべて埋まったが、どこか違うようでござる。「吟味」で確かめるがよい。'],
  // 最初から書いてある字を消そうとした
  given: ['その字は最初から書いてあるでござる。朱の枠を埋めるべし。'],
  checkWrong: ['朱で印を付けた字が違うておる。{n}字、直すがよい。'],
  checkOk: ['今のところ、間違いは見当たらぬ。この調子じゃ。'],
  checkEmpty: ['まだ何も書かれておらぬぞ。'],
  noDakuten: ['その字に濁りは付けられぬ。'],
  hintLetter: ['助太刀いたす！ この一字は「{ch}」じゃ。'],
  hintWord: ['助太刀いたす！ {label}は「{answer}」でござる。'],
  alreadySolved: ['その問はもう解けておるでござる。'],
  // （v2-r3）番付の一言。毎回選び、同じ一言が2回続かないようにする。1つ目は lib/rank.js の line と同じ
  rank_yokozuna: ['天下無双！ 江戸じゅうの評判でござる。', '土俵の上に敵なし。まさに横綱の貫禄じゃ。', '瓦版に載るほどの早業でござる。'],
  rank_ozeki: ['見事な腕前。横綱まであと一歩じゃ。', '堂々たる取り口。綱はもう目の前ぞ。', 'あっぱれな腕前。次は横綱を張るがよい。'],
  rank_sekiwake: ['なかなかの腕前でござる。', '手堅い取り口じゃ。大関も狙えよう。', '筋がよい。もう一番、腕を磨かれよ。'],
  rank_komusubi: ['よう粘った。次はもっと速く参ろう。', '粘り勝ちでござる。次は助太刀なしで参ろう。', '最後まで諦めぬ心意気、見事なり。'],
  rank_maegashira: ['解き切ったのが何より。精進あるのみ！', 'まずは一勝。稽古を重ねれば番付も上がろう。', '解けたことが肝要じゃ。次はもう一段上を目指そうぞ。'],
};

const lastPicked = new Map();

export function pick(key, vars = {}) {
  const list = LINES[key] ?? [key];
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && lastPicked.get(key) === i) i = (i + 1) % list.length;
  lastPicked.set(key, i);
  return fill(list[i], vars);
}

export function fill(str, vars = {}) {
  return String(str).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '').toString());
}

// 果たし合いの決着（秒の付いた果たし状から受けて立った局）。秒だけで比べる
export function duelOutcome({ mine, theirs, gaveUp = false }) {
  if (gaveUp) return { key: 'giveup', text: TEXT.duel.giveUp };
  const vars = { mine: formatDuration(mine), theirs: formatDuration(theirs) };
  if (mine < theirs) return { key: 'win', text: fill(TEXT.duel.win, vars) };
  if (mine > theirs) return { key: 'lose', text: fill(TEXT.duel.lose, vars) };
  return { key: 'draw', text: fill(TEXT.duel.draw, vars) };
}

export function returnShareText({ mine, theirs }) {
  return fill(TEXT.duel.shareText, { mine: formatDuration(mine), theirs: formatDuration(theirs) });
}

// 腕前の札の数字：「言葉 5つ」「言葉 12」（二桁に「つ」は付けない）
export function wordsCount(n) {
  return n < 10 ? `${n}つ` : `${n}`;
}
