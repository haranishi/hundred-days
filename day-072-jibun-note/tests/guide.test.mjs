import test from 'node:test';
import assert from 'node:assert/strict';
import { AXES, INDUSTRIES, GUIDE_QUESTIONS, ANSWER_OPTIONS } from '../lib/guide-data.js';
import { nextQuestion, addAnswer, reviseFrom, validAnswers, buildGuideReport, guideText, encodeGuide, decodeGuide, GUIDE_EXAMPLE } from '../lib/guide-model.js';

function finish(choose) {
  let answers = [];
  while (nextQuestion(answers)) answers = addAnswer(answers, choose(nextQuestion(answers), answers.length));
  return answers;
}

test('each completed path covers six viewpoints twice without repeated questions', () => {
  for (const option of ANSWER_OPTIONS) {
    const answers = finish(() => option.id);
    assert.equal(answers.length, 12);
    assert.equal(new Set(answers.map(a => a.q)).size, 12);
    assert.equal(nextQuestion(answers), null);
    for (const axis of AXES) assert.equal(answers.filter(a => a.q.startsWith(axis.id + '-')).length, 2);
    assert.equal(validAnswers(answers), true);
  }
});

test('all positive and all negative answers lead to different concrete follow-up questions', () => {
  const yes = finish(() => 'yes'); const no = finish(() => 'no');
  assert.deepEqual(yes.slice(0, 6).map(a => a.q), no.slice(0, 6).map(a => a.q));
  assert.ok(yes.slice(6).every(a => a.q.endsWith('-deepen')));
  assert.ok(no.slice(6).every(a => a.q.endsWith('-explore')));
});

test('different interests produce relevant industry exploration with actual answer evidence', () => {
  const care = buildGuideReport(finish(q => q.axis === 'care' ? 'yes' : 'no'));
  const technical = buildGuideReport(finish(q => ['improve', 'mastery'].includes(q.axis) ? 'yes' : 'no'));
  assert.equal(care.leading[0].id, 'care');
  assert.equal(care.industries[0].id, 'education');
  assert.ok(technical.industries.some(i => i.id === 'it'));
  assert.ok(!care.industries.some(i => i.id === 'it'));
  for (const report of [care, technical]) for (const axis of report.leading) {
    assert.equal(axis.entries.length, 2);
    assert.ok(axis.positive.length > 0);
  }
});

test('unknown and rejected activities never manufacture a recommendation', () => {
  const unknown = buildGuideReport(finish(() => 'unknown'));
  const negative = buildGuideReport(finish(() => 'no'));
  assert.equal(unknown.status, 'unknown'); assert.equal(unknown.known, 0);
  assert.equal(negative.status, 'open'); assert.equal(negative.known, 12);
  for (const report of [unknown, negative]) {
    assert.deepEqual(report.leading, []); assert.deepEqual(report.industries, []); assert.equal(report.draft, '');
  }
});

test('equal enthusiasm preserves all tied axes and candidates instead of forcing a top three', () => {
  const report = buildGuideReport(finish(() => 'yes'));
  assert.equal(report.status, 'broad'); assert.equal(report.leading.length, 6);
  assert.equal(report.industries.length, INDUSTRIES.length); assert.equal(report.tied, true);
  assert.equal(report.draft, '');
});

test('opposing answers remain visible as mixed feelings rather than asserted preferences', () => {
  const report = buildGuideReport(finish((q, index) => index < 6 ? 'yes' : 'no'));
  assert.equal(report.mixed.length, 6); assert.equal(report.leading.length, 0);
  assert.deepEqual(report.industries, []);
  assert.ok(report.mixed.every(axis => axis.positive.length === 1 && axis.negative.length === 1));
});

test('one unsure answer reduces evidence and is not treated as a negative choice', () => {
  const answers = finish((q, index) => q.axis === 'care' ? index < 6 ? 'yes' : 'unknown' : 'no');
  const report = buildGuideReport(answers);
  const care = report.axes.find(axis => axis.id === 'care');
  assert.equal(care.known, 1); assert.equal(care.negative.length, 0); assert.equal(care.score, 1);
  assert.ok(report.leading.some(axis => axis.id === 'care'));
});

test('editing an early answer discards obsolete branches and invalidates the old result', () => {
  const original = finish(() => 'yes');
  let revised = reviseFrom(original, 0);
  assert.equal(buildGuideReport(revised), null);
  revised = addAnswer(revised, 'no');
  for (let i = 1; i < 6; i++) revised = addAnswer(revised, 'yes');
  while (nextQuestion(revised)) revised = addAnswer(revised, 'yes');
  assert.equal(validAnswers(revised), true);
  assert.ok(revised.some(a => a.q === 'care-explore'));
  assert.ok(!revised.some(a => a.q === 'care-deepen'));
  const obsolete = original.map((a, index) => index === 0 ? { ...a, a: 'no' } : a);
  assert.equal(validAnswers(obsolete), false);
  assert.equal(decodeGuide(JSON.stringify({ version: 1, answers: obsolete, view: 'result' })), null);
});

test('saving validates question order, answer IDs, count and version before restoring', () => {
  assert.deepEqual(decodeGuide(encodeGuide(GUIDE_EXAMPLE, 'result')), { answers: GUIDE_EXAMPLE, view: 'result' });
  const short = GUIDE_EXAMPLE.slice(0, 2);
  assert.equal(decodeGuide(encodeGuide(short, 'result')).view, 'question');
  for (const text of ['null', '{broken', JSON.stringify({ version: 2, answers: [] }), JSON.stringify({ version: 1, answers: [{ q: 'care-first', a: '<script>' }] }), JSON.stringify({ version: 1, answers: [...GUIDE_EXAMPLE, GUIDE_EXAMPLE[0]] }), JSON.stringify({ version: 1, answers: [GUIDE_EXAMPLE[1]] })]) assert.equal(decodeGuide(text), null);
  assert.equal(buildGuideReport(short), null);
  assert.deepEqual(addAnswer(short, 'invalid'), short);
});

test('result text includes reasons, example identity and useful next actions', () => {
  const text = guideText(GUIDE_EXAMPLE, { demo: true });
  assert.match(text, /架空の結果見本/); assert.match(text, /就活軸のたたき台/);
  assert.match(text, /仕事の例：|仕事例：/); assert.match(text, /企業に確かめる質問/);
  for (const axis of buildGuideReport(GUIDE_EXAMPLE).leading) for (const entry of axis.entries) assert.ok(text.includes(entry.question.text));
  assert.ok(!text.includes('適合率')); assert.equal(guideText([]), '');
});

test('authored data has unique IDs, valid weights and complete question branches', () => {
  assert.equal(new Set(GUIDE_QUESTIONS.map(q => q.id)).size, GUIDE_QUESTIONS.length);
  for (const industry of INDUSTRIES) {
    assert.ok(Object.keys(industry.weights).every(id => AXES.some(axis => axis.id === id)));
    assert.ok(Object.values(industry.weights).every(weight => Number.isFinite(weight) && weight > 0));
  }
});
