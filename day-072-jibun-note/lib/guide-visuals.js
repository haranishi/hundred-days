import { AXES } from './guide-data.js';
import { questionOf } from './guide-model.js';

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const motions = new Set();
const paths = {
  care: ['M7 21c-3-2-4-4-4-7a6 6 0 0 1 11-3 6 6 0 0 1 11 3c0 5-7 10-11 13l-3-2', 'm3 25 4-4 4 1 7-4c3-1 4 2 1 4l-6 5H7'],
  improve: ['M5 24V9h14', 'm15 5 4 4-4 4', 'M27 8v15H13', 'm17 19-4 4 4 4', 'M5 9h.01M27 23h.01'],
  create: ['m8 24 2-7L23 4l5 5-13 13-7 2Z', 'm20 7 5 5', 'M5 8V2M2 5h6M24 24v6m-3-3h6'],
  connect: ['M6 16a4 4 0 1 0 0 .1M22 7a4 4 0 1 0 0 .1M22 25a4 4 0 1 0 0 .1', 'm10 14 8-5m-8 9 8 5M22 11v10'],
  mastery: ['M16 8C12 4 6 4 3 6v20c4-2 9-2 13 1 4-3 9-3 13-1V6c-3-2-9-2-13 2v19', 'M7 11h4m-4 5h4m10-5h4m-4 5h4'],
  sustain: ['M16 3 5 8v8c0 6 5 10 11 13 6-3 11-7 11-13V8L16 3Z', 'm10 16 4 4 8-9'],
  industry: ['M5 28V10h14v18M19 17h8v11H3', 'M9 14h2m4 0h.01M9 19h2m4 0h.01M10 28v-4h4v4M23 21h.01m0 4h.01M8 10V5h8v5'],
  question: ['M7 24H4V5h24v19H15l-8 5v-5Z', 'M12 11a4 4 0 1 1 5 4c-1 0-1 1-1 2m0 3h.01'],
};
export function guideIcon(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 32 32'); svg.setAttribute('aria-hidden', 'true');
  for (const d of paths[id] ?? paths.create) {
    const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', d); svg.append(path);
  }
  return svg;
}
function el(tag, className, text) {
  const item = document.createElement(tag); item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}
export function animateGuide(item, keyframes, options = {}) {
  if (!item || reducedMotion.matches || !item.animate) return;
  const animation = item.animate(keyframes, { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)', ...options });
  motions.add(animation); animation.finished.then(() => motions.delete(animation), () => motions.delete(animation));
}
export function cancelGuideMotion() { for (const animation of motions) animation.cancel(); motions.clear(); }

export function setupPreview(report) {
  const items = [
    { id: 'axis', label: 'わたしの就活軸', icon: report.leading[0].id, text: report.leading[0].title },
    { id: 'industry', label: '次に調べる業界', icon: 'industry', text: report.industries[0].name + 'など。仕事の例も見られます。' },
    { id: 'question', label: '企業への質問', icon: 'question', text: report.leading[0].question },
  ];
  const buttons = [];
  for (const [index, item] of items.entries()) {
    const button = el('button', 'guide-preview-card'); button.type = 'button'; button.dataset.preview = item.id;
    button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', 'guide-preview-' + item.id);
    const top = el('span', 'guide-preview-top'); top.append(el('span', '', '0' + (index + 1)), guideIcon(item.icon));
    const label = el('span', 'guide-preview-label', item.label);
    const front = el('span', 'guide-preview-front', 'タップでひらく ↗');
    const content = el('span', 'guide-preview-content', item.text); content.id = 'guide-preview-' + item.id; content.hidden = true;
    const close = el('span', 'guide-preview-close', 'もう一度押すと閉じます'); close.hidden = true;
    button.append(top, label, front, content, close);
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      for (const other of buttons) {
        const expanded = other === button && open;
        other.setAttribute('aria-expanded', String(expanded));
        other.querySelector('.guide-preview-content').hidden = !expanded;
        other.querySelector('.guide-preview-close').hidden = !expanded;
        other.querySelector('.guide-preview-front').hidden = expanded;
      }
      animateGuide(content, [{ opacity: .2, transform: 'translateY(7px)' }, { opacity: 1, transform: 'translateY(0)' }]);
    });
    buttons.push(button); document.querySelector('#guide-preview-cards').append(button);
  }
}

export function renderJourney(answers) {
  const count = answers.length;
  document.querySelector('#guide-chapter').textContent = count < 6 ? 'CHAPTER 01 / 興味をひろう' : 'CHAPTER 02 / 場面を深める';
  document.querySelector('#guide-collected-count').textContent = count + ' / 12';
  const stops = Array.from({ length: 12 }, (_, index) => {
    const item = el('li', index < count ? 'is-done' : index === count ? 'is-current' : '');
    const number = el('span', '', index < count ? '✓' : String(index + 1)); number.setAttribute('aria-hidden', 'true'); item.append(number);
    item.setAttribute('aria-label', '質問' + (index + 1) + (index < count ? ' 回答済み' : index === count ? ' 回答中' : ' 未回答'));
    if (index === count) item.setAttribute('aria-current', 'step');
    return item;
  });
  document.querySelector('#guide-journey').replaceChildren(...stops);
  const entries = AXES.map(axis => {
    const completed = answers.filter(entry => questionOf(entry.q).axis === axis.id).length;
    const item = el('div', 'guide-collection-item'); item.dataset.axis = axis.id; item.dataset.count = completed;
    item.setAttribute('role', 'img'); item.setAttribute('aria-label', axis.short + '：2問中' + completed + '問に回答');
    const mark = el('span', 'guide-collection-icon'); mark.append(guideIcon(axis.id));
    const dots = el('span', 'guide-collection-dots');
    for (let i = 0; i < 2; i++) dots.append(el('span', i < completed ? 'is-filled' : '', i < completed ? '✓' : ''));
    item.append(mark, el('span', 'guide-collection-label', axis.short), dots); return item;
  });
  document.querySelector('#guide-collection').replaceChildren(...entries);
}
