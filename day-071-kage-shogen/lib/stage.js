// 1夜の操作と評価。成功を保つ時間の判断は呼び出し側が行う。
import { stageOf } from './cases.js';
import { STEP } from './config.js';
import { diagnose } from './diagnose.js';
import { buildTarget, evaluate, solutionArrangement } from './score.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const startArrangement = (stage) => ({
  ly: stage.lamp.start,
  xs: Object.fromEntries(stage.props.map((prop) => [prop.id, prop.x.start])),
});

function assess(session) {
  session.assessment = evaluate(session.stage, session.target, session.arrangement);
}

export function createSession(caseDef) {
  const stage = stageOf(caseDef);
  const target = buildTarget(stage);
  const arrangement = startArrangement(stage);
  return {
    caseId: caseDef.id, caseDef, stage, target, arrangement, selected: 'lamp',
    assessment: evaluate(stage, target, arrangement), status: 'playing',
    guideOn: caseDef.guide === 'on', usedGuide: false, hintsUsed: 0, shownHints: [],
  };
}

export function movableIds(session) {
  return ['lamp', ...session.stage.props.filter((prop) => prop.x.min < prop.x.max).map((prop) => prop.id)];
}

export function select(session, id) {
  if (!movableIds(session).includes(id)) return false;
  session.selected = id;
  return true;
}

export function setLamp(session, ly) {
  if (session.status === 'solved' || !Number.isFinite(ly)) return false;
  const next = clamp(ly, session.stage.lamp.min, session.stage.lamp.max);
  if (next === session.arrangement.ly) return false;
  session.arrangement.ly = next;
  assess(session);
  return true;
}

export function setPropX(session, id, x) {
  if (session.status === 'solved' || !Number.isFinite(x)) return false;
  const prop = session.stage.props.find((item) => item.id === id);
  if (!prop || prop.x.min === prop.x.max) return false;
  const next = clamp(x, prop.x.min, prop.x.max);
  if (next === session.arrangement.xs[id]) return false;
  session.arrangement.xs[id] = next;
  assess(session);
  return true;
}

export function nudge(session, direction, step = STEP.fine) {
  if (direction !== -1 && direction !== 1) throw new RangeError('direction must be -1 or 1');
  if (!Number.isFinite(step) || step <= 0) return false;
  if (session.selected === 'lamp') return setLamp(session, session.arrangement.ly + direction * step);
  return setPropX(session, session.selected, session.arrangement.xs[session.selected] + direction * step);
}

export function reset(session) {
  session.arrangement = startArrangement(session.stage);
  session.status = 'playing';
  assess(session);
}

// 夜1のガイドは練習用なので、何度出し入れしても星を減らさない。夜2以降は、付けた時点で使用を記録する。
export function toggleGuide(session) {
  session.guideOn = !session.guideOn;
  if (session.guideOn && session.caseDef.guide !== 'on') session.usedGuide = true;
  return session.guideOn;
}

// ヒントは、押すたびに、まだ出していない文を1つ出す。いまの配置でいちばんずれているものの名指し（kind: 'diagnosis'。
// 配置が変わって文が替わったときは、また最初に出す）→ その夜の考え方（kind: 'principle'）の順。全部出したら kind: 'end'。
// 同じ文を番号だけ変えて出さない。星は、最初に使ったとき1回分だけ減る。index は何回目かの数（0から）。
export const HINT_END = 'ヒントはここまで。灯りと道具を、1cmずつ動かして確かめよう。';

export function useHint(session) {
  const index = session.hintsUsed;
  session.hintsUsed += 1;
  const candidates = [
    { kind: 'diagnosis', text: diagnose(session.stage, session.target, session.assessment, session.arrangement).text },
    ...session.caseDef.hints.map((text) => ({ kind: 'principle', text })),
  ];
  const next = candidates.find((candidate) => !session.shownHints.includes(candidate.text));
  if (!next) return { index, kind: 'end', text: HINT_END };
  session.shownHints.push(next.text);
  return { index, kind: next.kind, text: next.text };
}

// 合格が保たれたら、灯りと必要な道具を正解の位置へそろえる。邪魔な道具は、置いた位置のまま残す
// （壁の外ならどちらの端でも合格なので、左右を入れ替えない）。
export function confirmSolve(session) {
  if (!session.assessment.success) return false;
  const solution = solutionArrangement(session.stage);
  for (const prop of session.stage.props) {
    if (prop.decoy) solution.xs[prop.id] = session.arrangement.xs[prop.id];
  }
  session.arrangement = solution;
  session.status = 'solved';
  assess(session);
  return true;
}

// 近さのメーター：4つの目盛りの、それぞれの満ち具合（0〜1）。IoUが各段の範囲のどこにあるかで連続して伸びる。
function fillsOf({ iou, success }, { warm, near, union }) {
  if (success) return [1, 1, 1, 1];
  const part = (low, high) => Math.max(0, Math.min(1, (iou - low) / (high - low)));
  return [part(0, warm), part(warm, near), part(near, union), 0];
}

// 灯りと道具が正解の位置からこれ以内なら、「合っている」とみなす（cm）。
const CLOSE_ENOUGH = 3;

// 近いのに合格しないとき、何が足りないかを、答えを言わずに大きく2つに分けて添える：
// 邪魔な道具の影が残っている／灯りの高さがずれている／道具の横位置がずれている。どの道具かと向きは、ヒントで言う。
function shortfall(session) {
  const { assessment, stage, arrangement } = session;
  if (!assessment.decoysOk) return '関係ない道具の影が残っている';
  const movable = stage.props.filter((prop) => !prop.decoy && prop.x.min < prop.x.max);
  if (Math.abs(arrangement.ly - stage.lamp.solution) > CLOSE_ENOUGH) return movable.length > 0 ? '灯りの高さがずれている' : '';
  if (movable.some((prop) => Math.abs(arrangement.xs[prop.id] - prop.x.solution) > CLOSE_ENOUGH)) return '道具の横位置がずれている';
  return 'ずれている道具がある';
}

export function describeAssessment(session) {
  const { assessment, stage } = session;
  const fills = fillsOf(assessment, stage.threshold);
  if (assessment.success) return { step: 4, label: '再現できた', detail: '', fills };
  if (assessment.iou >= stage.threshold.union) return { step: 3, label: 'あと少し', detail: shortfall(session) || 'ずれている道具がある', fills };
  if (assessment.band === 'near') return { step: 3, label: '近い', detail: shortfall(session), fills };
  if (assessment.band === 'warm') return { step: 2, label: 'すこし似ている', detail: '', fills };
  return { step: 1, label: '遠い', detail: '', fills };
}

export const lampReadout = (session) => Math.round(session.arrangement.ly);
export const propReadout = (session, id) => Math.round(session.arrangement.xs[id]);
