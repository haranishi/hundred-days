// 1夜の操作と評価。成功を保つ時間の判断は呼び出し側が行う。
import { stageOf } from './cases.js';
import { STEP } from './config.js';
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
    guideOn: caseDef.guide === 'on', usedGuide: false, hintsUsed: 0, hintIndex: 0,
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

export function toggleGuide(session) {
  session.guideOn = !session.guideOn;
  if (session.guideOn) session.usedGuide = true;
  return session.guideOn;
}

export function useHint(session) {
  const index = session.hintIndex;
  session.hintIndex = (index + 1) % session.caseDef.hints.length;
  session.hintsUsed += 1;
  return { index, text: session.caseDef.hints[index] };
}

export function confirmSolve(session) {
  if (!session.assessment.success) return false;
  session.arrangement = solutionArrangement(session.stage);
  session.status = 'solved';
  assess(session);
  return true;
}

export function describeAssessment(session) {
  const { assessment, stage } = session;
  if (assessment.success) return { step: 4, label: '再現できた', detail: '' };
  if (assessment.iou >= stage.threshold.union) {
    const detail = assessment.decoysOk ? 'ずれている道具がある' : '関係ない道具の影が残っている';
    return { step: 3, label: 'あと少し', detail };
  }
  if (assessment.band === 'near') return { step: 3, label: '近い', detail: '' };
  if (assessment.band === 'warm') return { step: 2, label: 'すこし似ている', detail: '' };
  return { step: 1, label: '遠い', detail: '' };
}

export const lampReadout = (session) => Math.round(session.arrangement.ly);
export const propReadout = (session, id) => Math.round(session.arrangement.xs[id]);
