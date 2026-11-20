import { LEVELS, LEVEL_LABEL } from './contract.js';
import { CONFIDENCE_NOTE } from './rules.js';
import { button, controlId, element } from './ui-look.js';

const EDIT_PATH = { 'honest-limited': 'real', 'hero-first': 'title', 'hero-title-short': 'title' };

export function diagnosisModel(diagnosis) {
  const items = diagnosis?.items ?? [];
  const groups = LEVELS.map((level) => ({
    level, label: LEVEL_LABEL[level], items: items.filter((item) => !item.ok && item.level === level),
  })).filter((group) => group.items.length);
  const done = items.filter((item) => item.ok);
  const score = Math.max(0, Math.min(100, Math.round(diagnosis?.score || 0)));
  let comment = '項目を開くと、理由を読めます。';
  if (groups.length) comment = 'まずは「' + groups[0].label + '」の項目を見てみましょう。';
  else if (done.length) comment = '今回の項目はすべて満たしています。';
  return { score, angle: score * 360 / 100, groups, done, comment };
}

function scoreRing({ score, angle }) {
  const svg = (tag, attrs) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    return node;
  };
  const ring = svg('svg', { class: 'cs-ring', viewBox: '0 0 96 96', role: 'img', 'aria-label': 'UX診断 ' + score + '点' });
  const circle = { cx: 48, cy: 48, r: 42, fill: 'none', 'stroke-width': 6 };
  ring.append(svg('circle', { ...circle, class: 'cs-ring-track' }));
  if (angle > 0) ring.append(svg('circle', {
    ...circle, class: 'cs-ring-value', pathLength: 360, 'stroke-dasharray': angle + ' 360', transform: 'rotate(-90 48 48)',
  }));
  const digits = svg('text', { class: 'cs-ring-number', x: 48, y: 52, 'text-anchor': 'middle' });
  digits.textContent = score;
  const unit = svg('text', { class: 'cs-ring-unit', x: 48, y: 70, 'text-anchor': 'middle' });
  unit.textContent = '点';
  ring.append(digits, unit);
  return ring;
}

function scoreOverview(model, samples, ctx) {
  const overview = element('header', 'cs-score');
  const message = element('div');
  message.append(element('h2', 'cs-title', 'UX診断'), element('p', 'cs-score-comment', model.comment));
  overview.append(scoreRing(model), message, element('p', 'cs-help',
    'この点は、部品の組み立て方を見たものです。文章の良し悪しは見ていません。'));
  if (samples?.count > 0) {
    const actions = element('div', 'cs-actions');
    const count = element('span', 'cs-help', '見本の文章が残っている部品: ' + samples.count + '個');
    count.id = controlId('samples');
    const view = button('見る', () => ctx.select(samples.blockIds[0], { tab: 'edit' }));
    view.setAttribute('aria-describedby', count.id);
    view.dataset.control = 'samples/block';
    actions.append(count, view);
    overview.append(actions);
  }
  return overview;
}

function confidenceLegend(opened) {
  const legend = element('details');
  legend.dataset.detail = 'confidence';
  legend.open = opened.has('confidence');
  const summary = element('summary', 'cs-summary', '根拠の印の意味');
  summary.dataset.control = 'confidence';
  const meanings = element('dl', 'cs-explainer');
  for (const [name, note] of Object.entries(CONFIDENCE_NOTE)) {
    meanings.append(element('dt', '', name), element('dd', '', note));
  }
  legend.append(summary, meanings);
  return legend;
}

function ruleCard(item, ctx, opened) {
  const card = element('article', 'cs-rule');
  const details = element('details', 'cs-rule-details');
  details.dataset.detail = item.id;
  details.open = opened.has(item.id);
  const summary = element('summary', 'cs-rule-summary');
  summary.dataset.control = item.id + '/reason';
  const marker = element('span', 'cs-rule-mark', item.ok ? '✓' : '！');
  marker.setAttribute('aria-hidden', 'true');
  const status = element('span', 'cs-rule-status', item.ok ? 'できています' : 'まだです');
  status.prepend(marker);
  const title = element('span', 'cs-rule-title', item.title);
  title.id = controlId('rule-title');
  summary.append(status, title);
  const reason = element('div', 'cs-reason');
  reason.append(element('p', '', item.why));
  if (item.note) reason.append(element('p', 'cs-help', item.note));
  if (item.sources?.length) {
    const sources = element('ul', 'cs-sources');
    for (const source of item.sources) {
      const row = element('li');
      const reference = /^https:\/\//i.test(source.url ?? '') ? element('a', 'cs-source', source.label) : element('span', '', source.label);
      if (reference.tagName === 'A') {
        reference.href = source.url;
        reference.target = '_blank';
        reference.rel = 'noopener noreferrer';
        reference.dataset.control = item.id + '/source/' + sources.childElementCount;
      }
      const badge = element('span', 'cs-confidence', source.confidence);
      badge.title = CONFIDENCE_NOTE[source.confidence] ?? '';
      row.append(reference, badge);
      sources.append(row);
    }
    reason.append(element('h4', 'cs-label', '根拠'), sources);
  }
  details.append(summary, reason);
  card.append(details);
  const actions = element('div', 'cs-actions cs-rule-actions');
  // 期限や人数は、編集する人が元の表示を確かめてから確認の印を付ける。
  if (!item.ok && item.fix && item.id !== 'honest-limited') {
    const label = element('p', 'cs-fix-label', item.fix.label);
    label.id = controlId('fix');
    const fix = button('なおす', () => {
      const before = ctx.getState();
      ctx.dispatch(item.fix.action);
      if (ctx.getState() === before) {
        ctx.toast('今の構成にはこの変更を加えられません。', { kind: 'error' });
        return;
      }
      ctx.toast('なおしました', { actionLabel: '元に戻す', onAction: () => ctx.undo() });
    }, 'cs-btn cs-primary');
    fix.setAttribute('aria-describedby', label.id);
    fix.dataset.control = item.id + '/fix';
    actions.append(label, fix);
  }
  // 見出しを足す前は先頭の別部品のIDが返ることがあり、そこにはキャッチコピーがない。
  const canView = item.blockId && (item.id !== 'hero-first'
    || ctx.getState().blocks.some(block => block.id === item.blockId && block.type === 'hero'));
  if (canView) {
    const path = EDIT_PATH[item.id];
    const view = button('この部品を見る', () => ctx.select(item.blockId, path ? { tab: 'edit', path } : { tab: 'edit' }));
    view.setAttribute('aria-describedby', title.id);
    view.dataset.control = item.id + '/block';
    actions.append(view);
  }
  if (actions.childElementCount) card.append(actions);
  return card;
}

export function mountDiagnosis(root, ctx) {
  let previous;
  const off = ctx.subscribe(({ state, diagnosis }) => {
    const current = diagnosis ?? (state ? ctx.diagnose() : null);
    if (previous === current && root.firstChild) return;
    previous = current;
    if (current?.empty) {
      root.replaceChildren(element('p', 'cs-empty', '部品がありません。「構成」の「部品を足す」で足すか、目的を選び直してください。'));
      root.scrollTop = 0;
      return;
    }
    const model = diagnosisModel(current);
    const openDetails = new Set(Array.from(root.querySelectorAll('details[open]'), (el) => el.dataset.detail));
    const active = document.activeElement;
    const focusKey = root.contains(active) ? active.dataset.control : null;
    const scroll = root.scrollTop;
    const panel = element('div', 'cs-panel cs-diagnosis');
    panel.append(scoreOverview(model, current?.samples, ctx));
    for (const group of model.groups) {
      const section = element('section', 'cs-rule-group');
      section.append(element('h3', 'cs-group-title', group.label));
      section.append(...group.items.map((item) => ruleCard(item, ctx, openDetails)));
      panel.append(section);
    }

    const done = element('details', 'cs-done');
    done.dataset.detail = 'completed';
    done.open = openDetails.has('completed');
    const summary = element('summary', 'cs-summary', 'できていること（' + model.done.length + '）');
    summary.dataset.control = 'completed';
    done.append(summary, ...model.done.map((item) => ruleCard(item, ctx, openDetails)));
    if (!model.done.length) done.append(element('p', 'cs-help', '項目を満たすと、ここに表示されます。'));
    const guide = element('footer', 'cs-guide');
    guide.append(element('h3', 'cs-subtitle', '診断の見かた'),
      element('p', 'cs-help', '点はこのアプリの目安です。各項目を開くと、理由とその根拠を確認できます。'),
      confidenceLegend(openDetails));
    panel.append(done, guide);
    root.replaceChildren(panel);
    if (focusKey) {
      const target = Array.from(panel.querySelectorAll('[data-control]')).find((el) => el.dataset.control === focusKey);
      // なおした項目は閉じた「できていること」に移るので、その入口にフォーカスを返す。
      const destination = !target || (target !== summary && done.contains(target) && !done.open) ? summary : target;
      destination.focus({ preventScroll: true });
    }
    root.scrollTop = scroll;
  });
  return { destroy() { off(); root.replaceChildren(); } };
}
