// ゲームの進行（画面にも3Dにも触らない）。時間は tick(dt) で進め、起きたことを文字列で返す。
// 流れ: ready → memorize → closing（途中で vanish）→ search → answer → reveal →（次の問題 or result）
import { LEVELS, MEMORIZE_SECONDS } from './catalog.js';

export const PACES = {
  normal: { ready: 2.4, closing: 3.4, vanishAt: 1.3, hintAfter: 20 },
  // テストと録画用。覚える・探す時間だけを短くする
  fast: { ready: 0.6, closing: 1.6, vanishAt: 0.6, hintAfter: 1.5, memorize: 4, search: 4 }
};

export class Game {
  constructor({ rounds, level, seed, pace = 'normal' }) {
    this.rounds = rounds;
    this.level = level;
    this.seed = seed;
    this.pace = PACES[pace] || PACES.normal;
    this.memorizeSeconds = this.pace.memorize ?? MEMORIZE_SECONDS;
    this.searchSeconds = this.pace.search ?? LEVELS[level].searchSeconds;
    this.round = 0;
    this.answers = [];
    this.paused = false;
    this.enter('ready');
  }

  get current() {
    return this.rounds[this.round];
  }

  get canMove() {
    return !this.paused && (this.phase === 'memorize' || this.phase === 'search');
  }

  get hintReady() {
    return this.phase === 'search' && !this.hintUsed && this.phaseTime >= this.pace.hintAfter;
  }

  get score() {
    return this.answers.filter(a => a.correct).length;
  }

  enter(phase) {
    this.phase = phase;
    this.phaseTime = 0;
    if (phase === 'ready') {
      this.timeLeft = this.pace.ready;
      this.choice = null;
      this.hintUsed = false;
      this.vanished = false;
    } else if (phase === 'memorize') {
      this.timeLeft = this.memorizeSeconds;
    } else if (phase === 'closing') {
      this.timeLeft = this.pace.closing;
    } else if (phase === 'search') {
      this.timeLeft = this.searchSeconds;
    } else {
      this.timeLeft = Infinity;
    }
    return [`enter:${phase}`];
  }

  tick(dt) {
    if (this.paused || !Number.isFinite(this.timeLeft)) return [];
    const events = [];
    const before = this.phaseTime;
    this.phaseTime += dt;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.phase === 'closing' && !this.vanished && this.phaseTime >= this.pace.vanishAt) {
      this.vanished = true;
      events.push('vanish');
    }
    if ((this.phase === 'memorize' || this.phase === 'search') && this.timeLeft > 0 && this.timeLeft <= 10) {
      if (Math.ceil(this.timeLeft) !== Math.ceil(this.timeLeft + dt)) events.push('countdown');
    }
    if (this.phase === 'search' && before < this.pace.hintAfter && this.phaseTime >= this.pace.hintAfter && !this.hintUsed) events.push('hint-ready');
    if (this.timeLeft <= 0) {
      if (this.phase === 'ready') events.push(...this.enter('memorize'));
      else if (this.phase === 'memorize') events.push('time-up', ...this.enter('closing'));
      else if (this.phase === 'closing') {
        if (!this.vanished) { this.vanished = true; events.push('vanish'); }
        events.push(...this.enter('search'));
      } else if (this.phase === 'search') events.push('time-up', ...this.enter('answer'));
    }
    return events;
  }

  /** 覚えた（覚える時間を切り上げる） */
  doneMemorizing() {
    return this.phase === 'memorize' && !this.paused ? this.enter('closing') : [];
  }

  /** わかった（探す時間を切り上げて答える） */
  answerNow() {
    return this.phase === 'search' && !this.paused ? this.enter('answer') : [];
  }

  useHint() {
    if (!this.hintReady) return [];
    this.hintUsed = true;
    return ['hint'];
  }

  /** この問の候補の数 */
  get choiceCount() {
    return this.current.choices.length;
  }

  choose(id) {
    if (this.phase !== 'answer' || this.paused || !this.current.choices.includes(id)) return [];
    this.choice = id;
    return ['choose'];
  }

  confirm() {
    if (this.phase !== 'answer' || this.paused || !this.choice) return [];
    const correct = this.choice === this.current.vanished;
    this.answers.push({ round: this.round, choice: this.choice, vanished: this.current.vanished, correct, hint: this.hintUsed });
    return [correct ? 'correct' : 'wrong', ...this.enter('reveal')];
  }

  next() {
    if (this.phase !== 'reveal') return [];
    if (this.round + 1 >= this.rounds.length) return this.enter('result');
    this.round += 1;
    return this.enter('ready');
  }

  /** 選んだ候補を外す（答えの画面の Esc） */
  unchoose() {
    if (this.phase !== 'answer' || !this.choice) return [];
    this.choice = null;
    return ['unchoose'];
  }

  /* 答えの画面は時間が進まないので止めない。評価の1周目で、答えの画面の Esc が見えない一時停止になり、
     「これにする」が効かなくなった（進行不能） */
  pause() {
    if (this.paused || !['ready', 'memorize', 'search'].includes(this.phase)) return [];
    this.paused = true;
    return ['pause'];
  }

  resume() {
    if (!this.paused) return [];
    this.paused = false;
    return ['resume'];
  }
}
