import { initReflection } from './reflection.js';
import { ANSWER_OPTIONS, GUIDE_STORAGE_KEY } from './lib/guide-data.js';
import { GUIDE_LIMIT, nextQuestion, addAnswer, reviseFrom, buildGuideReport, guideText, encodeGuide, decodeGuide, questionOf, answerOf, GUIDE_EXAMPLE } from './lib/guide-model.js';

const $ = selector => document.querySelector(selector);
function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}
const reflection = initReflection();
let storage = null;
let savedText = null;
let initial = null;
let storageMessage = '';
try {
  storage = window.localStorage;
  savedText = storage.getItem(GUIDE_STORAGE_KEY);
  if (savedText !== null) {
    initial = decodeGuide(savedText);
    storageMessage = initial ? '保存した質問の続きから開きました。' : '保存した質問の回答を読み込めませんでした。新しく質問を始められます。';
  }
} catch { storageMessage = 'このブラウザでは保存を利用できません。質問にはそのまま答えられます。'; }
let answers = initial?.answers ?? [];
let view = initial?.view ?? 'welcome';
let demo = false;
let saveEnabled = Boolean(initial);
let savingPaused = false;
let mode = 'guide';
let reflectionOpened = false;
let answerTimer;
function announce(text) { $('#guide-status').textContent = text; }
function focusTop(selector) {
  requestAnimationFrame(() => { $(selector).focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); });
}
function pauseSaving() {
  saveEnabled = false; savingPaused = true;
  $('#guide-save-toggle').checked = false;
  announce('別のタブで質問の保存内容が変わりました。今の回答は画面に残っています。保存の再開時に確認します。');
}
function persist() {
  if (!saveEnabled || demo) return;
  try {
    if (storage.getItem(GUIDE_STORAGE_KEY) !== savedText) { pauseSaving(); return; }
    savedText = encodeGuide(answers, view);
    storage.setItem(GUIDE_STORAGE_KEY, savedText);
    announce('このブラウザに質問の回答を保存しています。');
  } catch {
    saveEnabled = false;
    $('#guide-save-toggle').checked = false;
    announce('保存できませんでした。今の回答は画面に残っています。結果はコピーやテキスト保存で残せます。');
  }
}
function enableSaving() {
  try { savedText = storage.getItem(GUIDE_STORAGE_KEY); } catch { /* persist reports the failure. */ }
  saveEnabled = true; savingPaused = false; $('#guide-save-toggle').checked = true; persist();
}
$('#guide-save-toggle').addEventListener('change', event => {
  if (event.target.checked) {
    try { if (storage.getItem(GUIDE_STORAGE_KEY) !== savedText) savingPaused = true; } catch { /* enableSaving reports unavailable storage. */ }
    if (savingPaused) {
      event.target.checked = false;
      reflection.confirm('保存内容を、今の回答で置き換えますか？', '別のタブで質問の保存内容が変わっています。今の回答で置き換えて保存を再開します。', 'この回答を保存する', enableSaving);
    } else enableSaving();
  } else {
    try {
      storage.removeItem(GUIDE_STORAGE_KEY); savedText = null; saveEnabled = false; savingPaused = false;
      announce('質問の保存をオフにして、保存内容を削除しました。今の回答は画面に残っています。');
    } catch {
      event.target.checked = true;
      announce('保存内容を削除できませんでした。ブラウザのサイトデータで確認してください。');
    }
  }
});
window.addEventListener('storage', event => { if (event.key === GUIDE_STORAGE_KEY || event.key === null) pauseSaving(); });

function showGuide(nextView = view, { focus = true } = {}) {
  mode = 'guide'; view = nextView;
  document.body.dataset.mode = mode;
  $('#reflection').hidden = true; $('#guide').hidden = false;
  $('#save-control').hidden = true; $('#reset-button').hidden = true; $('#storage-status').hidden = true;
  render();
  if (focus) focusTop(view === 'welcome' ? '#guide-welcome-title' : view === 'question' ? '#guide-question-title' : '#guide-result-title');
}
function showReflection() {
  mode = 'reflection'; document.body.dataset.mode = mode;
  $('#guide').hidden = true; $('#reflection').hidden = false;
  $('#guide-save-control').hidden = true; $('#storage-status').hidden = false;
  if (reflection.restored && !reflectionOpened) reflection.show(); else reflection.home();
  reflectionOpened = true;
}
$('#reflection-button').addEventListener('click', showReflection);
if (reflection.restored) $('#reflection-button').textContent = '保存した経験ワークの続きへ ↗';
$('#home-button').addEventListener('click', () => { demo = false; showGuide('welcome'); persist(); });
$('#guide-start').addEventListener('click', () => { demo = false; showGuide(answers.length === GUIDE_LIMIT ? 'result' : 'question'); persist(); });
$('#guide-example').addEventListener('click', () => { demo = true; showGuide('result'); });
$('#guide-exit-demo').addEventListener('click', () => { demo = false; showGuide(answers.length === GUIDE_LIMIT ? 'result' : answers.length ? 'question' : 'welcome'); });
$('#guide-back').addEventListener('click', () => {
  if (!answers.length) showGuide('welcome');
  else { answers = reviseFrom(answers, answers.length - 1); showGuide('question'); }
  persist();
});

function renderQuestion() {
  const question = nextQuestion(answers);
  if (!question) { showGuide('result'); return; }
  const count = answers.length;
  $('#guide-count').textContent = String(count + 1).padStart(2, '0') + ' / 12';
  $('#guide-progress').value = count;
  $('#guide-question-number').textContent = 'QUESTION ' + String(count + 1).padStart(2, '0');
  $('#guide-question-title').textContent = question.text;
  $('#guide-question-title').dataset.question = question.id;
  $('#guide-question-hint').textContent = question.hint;
  $('#guide-remaining').textContent = '結果まで、あと' + (GUIDE_LIMIT - count) + '問';
  $('#guide-followup').textContent = count >= 6 ? 'ここからは、あなたの回答に合わせて、もう少し具体的に聞きます。' : '6つの角度から、仕事への気持ちを聞いていきます。';
  const host = $('#guide-answers'); host.replaceChildren();
  for (const [index, option] of ANSWER_OPTIONS.entries()) {
    const button = node('button', 'guide-answer' + (option.value === null ? ' guide-answer-unknown' : ''));
    button.type = 'button'; button.dataset.answer = option.id;
    const mark = node('span', 'guide-answer-mark', option.value === null ? '?' : String(index + 1).padStart(2, '0')); mark.setAttribute('aria-hidden', 'true');
    button.append(mark, node('span', '', option.label), node('span', 'guide-answer-arrow', '→'));
    button.addEventListener('click', () => {
      if (button.disabled) return;
      answers = addAnswer(answers, option.id);
      showGuide(answers.length === GUIDE_LIMIT ? 'result' : 'question'); persist();
      // 押した直後に同じ位置を連打して、次の問いまで答えるのを防ぐ。
      const nextButtons = [...host.querySelectorAll('button')];
      nextButtons.forEach(item => { item.disabled = true; });
      clearTimeout(answerTimer);
      answerTimer = setTimeout(() => nextButtons.forEach(item => { item.disabled = false; }), 180);
    });
    host.append(button);
  }
}
function editAnswer(index) {
  if (demo) { demo = false; showGuide(answers.length === GUIDE_LIMIT ? 'result' : 'question'); return; }
  reflection.confirm('この質問から、選び直しますか？', 'この質問以降の回答を取り消して、答えに合わせて質問し直します。今の結果は更新されます。', 'ここから選び直す', () => {
    answers = reviseFrom(answers, index); showGuide('question'); persist();
  });
}
$('#guide-review').addEventListener('click', () => {
  if (demo) { demo = false; showGuide('welcome'); return; }
  $('#guide-answer-review').open = true; $('#guide-answer-review').scrollIntoView({ block: 'start' });
  $('#guide-answer-list button')?.focus({ preventScroll: true });
});
function renderResult() {
  const current = demo ? GUIDE_EXAMPLE : answers;
  const report = buildGuideReport(current);
  if (!report) { showGuide('question'); return; }
  $('#guide-demo').hidden = !demo;
  $('#guide-reset').hidden = demo;
  $('#guide-review').textContent = demo ? '← 最初の画面に戻る' : '← 回答を見直す';
  const summaries = {
    focused: '仕事選びで大切にしたいことが、こんな言葉になりました。根拠になった回答と一緒に見てみよう。',
    broad: 'いくつかの方向に、同じくらい関心がありそうです。ひとつに決めず、仕事内容を比べる手がかりにしてみよう。',
    unknown: '今はまだ、気持ちがはっきりしないことが多そうです。今回の回答だけでは、軸や業界を絞れませんでした。',
    open: '今回の場面からは、軸を絞るだけの手がかりが集まりませんでした。気持ちに近い仕事を、別の角度から探してみよう。',
  };
  $('#guide-result-summary').textContent = summaries[report.status];
  const axesHost = $('#guide-axes'); axesHost.replaceChildren();
  for (const [index, axis] of report.leading.entries()) {
    const card = node('article', 'guide-axis-card');
    const title = node('h2');
    const phrases = axis.title.split('、');
    phrases.forEach((phrase, i) => title.append(node('span', 'guide-title-phrase', phrase + (i < phrases.length - 1 ? '、' : ''))));
    card.append(node('p', 'section-index', '仕事選びの軸の候補 ' + String(index + 1).padStart(2, '0')), title);
    const badge = node('span', 'guide-axis-badge', axis.label); card.append(badge, node('p', 'guide-evidence-label', 'この回答が、手がかりになりました'));
    for (const entry of axis.entries) {
      const evidence = node('div', 'guide-evidence'); evidence.append(node('p', '', entry.question.text), node('span', '', '→ ' + entry.answer.label)); card.append(evidence);
    }
    if (axis.known < 2) card.append(node('p', 'guide-caution', 'まだ分からない回答もあるため、仮の手がかりとして見てみよう。'));
    if (axis.mixed) card.append(node('p', 'guide-caution', '場面によって気持ちが分かれています。どんな場面ならやってみたいか、仕事内容で確かめよう。'));
    axesHost.append(card);
  }
  if (!report.leading.length) {
    const card = node('article', 'guide-axis-card guide-empty-card');
    card.append(node('h2', '', '今、決まっていなくても大丈夫。'), node('p', '', '気になった会社の社員の一日や、仕事体験を見てから答え直すと、自分の気持ちと比べやすくなります。'));
    if (report.mixed.length) card.append(node('p', 'guide-caution', '肯定と否定が分かれた観点：' + report.mixed.map(axis => axis.label).join(' / ')));
    axesHost.append(card);
  }
  $('#guide-draft-card').hidden = !report.draft; $('#guide-draft').textContent = report.draft;
  $('#guide-industry-note').textContent = report.industries.length
    ? (report.tied ? '同点の候補も含めています。順位を決め切らず、気になる仕事内容から比較してみよう。' : '回答に接点のある候補です。仕事の中身まで見て、自分の気持ちと比べてみよう。')
    : '今の回答からは候補を絞れていません。公的な仕事情報から、気になる場面を探してみよう。';
  const industryHost = $('#guide-industries'); industryHost.replaceChildren();
  for (const industry of report.industries) {
    const card = node('article', 'guide-industry-card'); card.dataset.industry = industry.id;
    card.append(node('h3', '', industry.name), node('p', 'guide-industry-description', industry.description));
    const tags = node('div', 'guide-industry-tags');
    for (const axis of industry.matches) tags.append(node('span', '', axis.label));
    card.append(node('p', 'guide-evidence-label', 'あなたの回答との接点'), tags, node('p', 'guide-small', '↑ 根拠となる質問・回答は、上の就活軸で確認できます。'));
    if (industry.matches.some(axis => !report.leading.some(lead => lead.id === axis.id))) {
      const detail = node('details', 'guide-other-evidence'); detail.append(node('summary', '', 'この候補の回答根拠も見る'));
      for (const axis of industry.matches) for (const entry of axis.entries) detail.append(node('p', '', entry.question.text + ' → ' + entry.answer.label));
      card.append(detail);
    }
    card.append(node('p', 'guide-job-example', '仕事の例：' + industry.jobs), node('p', 'guide-industry-check', industry.check));
    if (industry.cautions.length) card.append(node('p', 'guide-caution', '関心が低かった「' + industry.cautions.map(axis => axis.label).join(' / ') + '」の比重も、仕事内容で確かめよう。'));
    const link = node('a', 'guide-job-link', industry.sourceLabel + ' ↗');
    link.href = industry.source ? 'https://shigoto.mhlw.go.jp/User/Occupation/Detail/' + industry.source : 'https://shigoto.mhlw.go.jp/User/Occupation';
    link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(link); industryHost.append(card);
  }
  $('#guide-company-questions').hidden = !report.leading.length;
  $('#guide-company-list').replaceChildren(...report.leading.map(axis => { const item = node('li'); item.append(node('span', '', axis.label), node('p', '', axis.question)); return item; }));
  const review = $('#guide-answer-list'); review.replaceChildren();
  current.forEach((entry, index) => {
    const item = node('li'); item.append(node('p', '', questionOf(entry.q).text), node('span', '', answerOf(entry.a).label));
    if (!demo) { const button = node('button', 'text-button', 'ここから選び直す'); button.type = 'button'; button.addEventListener('click', () => editAnswer(index)); item.append(button); }
    review.append(item);
  });
  $('#guide-answer-review').open = false;
  $('#guide-copy-text').value = guideText(current, { demo });
  $('#guide-manual-copy').hidden = true; $('#guide-manual-copy').open = false; $('#guide-export-status').textContent = '';
}
function render() {
  for (const screen of ['welcome', 'question', 'result']) $('#guide-' + screen).hidden = view !== screen;
  $('#guide-save-control').hidden = demo || (view === 'welcome' && !answers.length);
  $('#guide-save-toggle').checked = saveEnabled;
  $('#guide-start').textContent = answers.length === GUIDE_LIMIT ? '自分の結果を見る →' : answers.length ? '続きの質問に答える →' : '質問に答えてみる →';
  $('#guide-resume-note').textContent = answers.length ? answers.length + '問の回答が残っています。' : '';
  if (view === 'question') renderQuestion();
  if (view === 'result') renderResult();
}
$('#guide-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#guide-copy-text').value); $('#guide-export-status').textContent = '就活軸と業界候補をコピーしました。'; }
  catch { $('#guide-manual-copy').hidden = false; $('#guide-manual-copy').open = true; $('#guide-export-status').textContent = '自動コピーが使えませんでした。文章を選んでコピーできます。'; $('#guide-copy-text').focus(); $('#guide-copy-text').select(); }
});
$('#guide-download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([$('#guide-copy-text').value], { type: 'text/plain;charset=utf-8' }));
  const link = node('a'); link.href = url; link.download = 'じぶんの手がかり-就活軸.txt'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('#guide-export-status').textContent = 'テキストファイルの保存を開始しました。';
});
$('#guide-print').addEventListener('click', () => window.print());
$('#guide-reset').addEventListener('click', () => reflection.confirm('質問の回答を消して、やり直しますか？', 'この質問の回答と保存内容を削除します。経験ワークの回答は残ります。必要なら先に結果をコピーしてください。', '消してやり直す', () => {
  let removed = false;
  try { storage.removeItem(GUIDE_STORAGE_KEY); savedText = null; removed = true; } catch { /* report below */ }
  answers = []; demo = false; saveEnabled = false; savingPaused = false;
  for (const selector of ['#guide-axes', '#guide-industries', '#guide-answer-list', '#guide-company-list', '#guide-answers']) $(selector).replaceChildren();
  $('#guide-draft').textContent = ''; $('#guide-copy-text').value = ''; $('#guide-result-summary').textContent = ''; $('#guide-export-status').textContent = '';
  $('#guide-manual-copy').hidden = true;
  showGuide('welcome'); announce(removed ? '質問の回答と、保存した内容を消しました。' : '画面の回答は消しましたが、保存内容を削除できませんでした。ブラウザのサイトデータで確認してください。');
}));

showGuide(view, { focus: false });
if (storageMessage) announce(storageMessage);
if (location.hash === '#usage-examples') { showReflection(); requestAnimationFrame(() => $('#usage-examples').scrollIntoView()); }
