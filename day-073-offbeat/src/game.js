import { clamp, wrap } from './synthesis.js';

export const MISSIONS = [
  { id: 'scratch', label: 'MAKE SOME NOISE', title: 'スクラッチでご挨拶。', hint: 'レコードを前後に4回擦ろう。S / K キーでもOK。', target: 4, actions: ['scratch'] },
  { id: 'drums', label: 'FIND YOUR RHYTHM', title: 'ビートに、音を重ねよう。', hint: '拍に合わせて下のパッドを6回。PERFECT / GOODでカウント。', target: 6, actions: ['pad'] },
  { id: 'sync', label: 'LOCK IT IN', title: '2つのビートを、ひとつに。', hint: '左右を再生して、どちらかのSYNCを押そう。', target: 1, actions: ['sync'] },
  { id: 'mix', label: 'SMOOTH TRANSITION', title: '次のグルーヴへ、つなごう。', hint: '両方を再生してフェーダーをA端→B端、またはB端→A端へ。', target: 1, actions: ['transition'] },
  { id: 'freestyle', label: 'THIS IS YOUR MOMENT', title: 'あとは、感じるままに。', hint: 'スクラッチやパッドを8回。自分だけのフィナーレを。', target: 8, actions: ['scratch', 'pad'] },
];

export function judgeTiming(seconds, bpm) {
  const beat = 60 / bpm, position = wrap(seconds, beat);
  const error = Math.min(position, beat - position);
  return { grade: error <= .085 ? 'PERFECT' : error <= .17 ? 'GOOD' : 'OFF BEAT', error, points: error <= .085 ? 150 : error <= .17 ? 90 : 30 };
}

export class GameSession {
  constructor() { this.reset(); }
  reset(mode = 'free') {
    this.mode = mode; this.running = false; this.finished = false; this.paused = false;
    this.startedAt = 0; this.pausedAt = 0; this.pausedDuration = 0; this.score = 0;
    this.combo = 0; this.maxCombo = 0; this.crowd = 25; this.hits = 0; this.timedHits = 0; this.rhythmicHits = 0;
    this.counts = MISSIONS.map(() => 0); this.completed = MISSIONS.map(() => false);
    this.lastActionAt = -Infinity; this.stageIndex = 0; this.lastTiming = null;
  }
  start(mode, now) { this.reset(mode); this.running = true; this.startedAt = now; }
  elapsed(now) { return this.finished ? 60 : this.running ? Math.max(0, (this.paused ? this.pausedAt : now) - this.startedAt - this.pausedDuration) : 0; }
  pause(now) { if (this.running && !this.paused) { this.pausedAt = now; this.paused = true; } }
  resume(now) { if (this.paused) { this.pausedDuration += now - this.pausedAt; this.paused = false; } }
  update(now) {
    if (!this.running || this.paused || this.mode !== 'challenge') return;
    const time = this.elapsed(now), next = Math.min(4, Math.floor(time / 12));
    if (next !== this.stageIndex) {
      for (let i = this.stageIndex; i < next; i++) if (!this.completed[i]) { this.crowd = clamp(this.crowd - 8, 0, 100); this.combo = 0; }
      this.stageIndex = next;
    }
    if (time >= 60) { this.running = false; this.finished = true; }
  }
  act(action, now, timing, options = {}) {
    this.update(now);
    if (!this.running || this.paused || now - this.lastActionAt < .12) return null;
    this.lastActionAt = now; this.hits++;
    const onBeat = timing.grade !== 'OFF BEAT';
    const rhythmic = action === 'pad' || action === 'scratch';
    if (rhythmic) {
      this.rhythmicHits++;
      this.lastTiming = timing.grade;
      if (onBeat) { this.combo++; this.timedHits++; } else this.combo = 0;
    }
    const multiplier = Math.min(4, 1 + Math.floor(this.combo / 8));
    const points = (rhythmic ? timing.points : 100) * multiplier;
    this.score += points;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.crowd = clamp(this.crowd + (onBeat || !rhythmic ? 2.4 : -.8), 0, 100);
    let missionComplete = false;
    if (this.mode === 'challenge') {
      const index = this.stageIndex, mission = MISSIONS[index];
      const eligible = mission.actions.includes(action) && (mission.id !== 'drums' || onBeat) && options.valid !== false;
      if (eligible && !this.completed[index]) {
        this.counts[index] = Math.min(mission.target, this.counts[index] + 1);
        if (this.counts[index] === mission.target) {
          this.completed[index] = true; this.score += 700; this.crowd = clamp(this.crowd + 10, 0, 100); missionComplete = true;
        }
      }
    }
    return { grade: rhythmic ? timing.grade : 'NICE MIX', points, multiplier, missionComplete };
  }
  get rank() { return this.score >= 11000 ? 'S' : this.score >= 6500 ? 'A' : this.score >= 3000 ? 'B' : 'C'; }
  get accuracy() { return this.rhythmicHits ? Math.round(this.timedHits / this.rhythmicHits * 100) : 0; }
}

export function readBest(storage) {
  try { const value = Number(storage.getItem('offbeat-best')); return Number.isFinite(value) && value > 0 ? value : 0; } catch { return 0; }
}
export function saveBest(storage, score) {
  const best = Math.max(readBest(storage), score);
  try { storage.setItem('offbeat-best', String(best)); } catch { /* Private browsing must not stop a set. */ }
  return best;
}
