import { ACCENTS, SITE_NAME_MAX, THEMES, THEME_LABEL, clampText, countChars } from './contract.js';
import { counter } from './ui-form-model.js';

let sequence = 0;
export const controlId = (kind) => 'cs-' + kind + '-' + (++sequence);

export function element(tag, classes, text) {
  const el = document.createElement(tag);
  if (classes) el.className = classes;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function button(label, action, classes = 'cs-btn') {
  const el = element('button', classes, label);
  el.type = 'button';
  el.addEventListener('click', action);
  return el;
}

export function textField({ label, max, kind = 'text', value = '' }, onEdit) {
  const root = element('div', 'cs-field');
  const header = element('div', 'cs-field-head');
  const caption = element('label', 'cs-label', label);
  const count = element('span', 'cs-count');
  const warning = element('span', 'cs-limit');
  const multiline = kind === 'long';
  const input = element(multiline ? 'textarea' : 'input', 'cs-input');
  if (multiline) input.rows = 3;
  else input.type = 'text';
  input.id = controlId('field');
  caption.htmlFor = input.id;
  count.id = input.id + '-count';
  warning.id = input.id + '-limit';
  warning.setAttribute('role', 'status');
  input.setAttribute('aria-describedby', count.id + ' ' + warning.id);
  header.append(caption, count);
  root.append(header, input, warning);

  let composing = false;
  let modelValue = value;
  let suffix = '';
  input.value = value;

  function showCount() {
    const result = counter(input.value, max);
    const text = result.count + '/' + max;
    if (text !== count.textContent) count.textContent = text;
    const limit = result.count >= max ? max + '文字まで入力できます。' : '';
    if (warning.textContent !== limit) warning.textContent = limit;
    // maxlength は UTF-16 の長さなので、絵文字の分を足して状態と同じ文字数を許す。
    input.maxLength = composing ? max * 2 : max + input.value.length - result.count;
  }

  function writeValue(next, start, end, direction) {
    input.value = next;
    if (document.activeElement === input && start !== null) {
      input.setSelectionRange(Math.min(next.length, start), Math.min(next.length, end), direction);
    }
  }

  function commitInput() {
    const raw = input.value;
    // 文中で長い文を貼ったり変換したとき、上限で削るのは挿入部分だけにする。
    const tail = raw.endsWith(suffix) ? suffix : '';
    suffix = '';
    const boundary = raw.length - tail.length;
    const room = Math.max(0, max - countChars(tail));
    const prefix = clampText(raw.slice(0, boundary), room, multiline);
    const next = clampText(prefix + tail, max, multiline);
    if (raw !== next) {
      const offset = (pos) => pos > boundary ? next.length - (raw.length - pos) : clampText(raw.slice(0, pos), room, multiline).length;
      writeValue(next, offset(input.selectionStart), offset(input.selectionEnd), input.selectionDirection);
    }
    showCount();
    if (modelValue === next) return;
    modelValue = next;
    onEdit(next);
  }

  function beginEdit() {
    suffix = input.value.slice(input.selectionEnd);
    input.maxLength = max * 2;
  }
  input.addEventListener('beforeinput', () => { if (!composing) beginEdit(); });
  input.addEventListener('compositionstart', () => {
    beginEdit();
    composing = true;
  });
  input.addEventListener('input', (event) => {
    if (event.isComposing) composing = true;
    if (composing) showCount();
    else commitInput();
  });
  input.addEventListener('compositionend', () => {
    composing = false;
    commitInput();
  });
  showCount();

  return {
    root, input,
    update(next) {
      // 同じ値を代入するだけでも、ブラウザによって変換候補や選択範囲が閉じる。
      if (next === modelValue) return;
      modelValue = next;
      if (composing || next === input.value) return;
      writeValue(next, input.selectionStart, input.selectionEnd, input.selectionDirection);
      showCount();
    },
  };
}

export function radioChoices(label, options, choose) {
  const root = element('div', 'cs-field');
  const group = element('div', 'cs-choices');
  const name = controlId('choices');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', label);
  root.append(element('h3', 'cs-subtitle', label), group);
  const radios = options.map((option) => {
    const wrap = element('label', 'cs-choice');
    const input = element('input', 'cs-radio');
    input.type = 'radio';
    input.name = name;
    input.value = String(option.value);
    input.setAttribute('role', 'radio');
    input.setAttribute('aria-label', option.name ?? option.label);
    input.addEventListener('change', () => { if (input.checked) choose(option.value); });
    wrap.append(input);
    if (option.sample) wrap.append(option.sample);
    wrap.append(element('span', 'cs-choice-text', option.label));
    group.append(wrap);
    return input;
  });
  return {
    root, group,
    update(value) {
      options.forEach((option, index) => { radios[index].checked = option.value === value; });
    },
  };
}

export function mountLook(root, ctx) {
  const panel = element('div', 'cs-panel');
  const site = textField({ label: 'サイトの名前', max: SITE_NAME_MAX }, (name) => {
    ctx.dispatch({ type: 'setSite', name }, { coalesce: 'site.name' });
  });
  site.input.dataset.path = 'site.name';
  const themes = radioChoices('テーマ', THEMES.map((preset) => {
    const sample = element('span', 'cs-theme-sample');
    sample.dataset.preset = preset;
    sample.setAttribute('aria-hidden', 'true');
    sample.append(element('i', 'cs-sample-line'), element('i', 'cs-sample-button'));
    const label = THEME_LABEL[preset];
    return { value: preset, label, name: 'テーマ: ' + label, sample };
  }), (preset) => ctx.dispatch({ type: 'setTheme', preset }));
  themes.group.classList.add('cs-theme-choices');

  const accents = radioChoices('強調色', ACCENTS.map(({ label, hex }, index) => {
    const sample = element('span', 'cs-color-sample');
    sample.style.backgroundColor = hex;
    sample.setAttribute('aria-hidden', 'true');
    return { value: index, label, name: '強調色: ' + label, sample };
  }), (accent) => ctx.dispatch({ type: 'setTheme', accent }));
  accents.group.classList.add('cs-accent-choices');

  panel.append(site.root, themes.root, accents.root);
  root.replaceChildren(panel);
  const off = ctx.subscribe(({ state }) => {
    if (!state) return;
    site.update(state.site.name);
    themes.update(state.theme.preset);
    accents.update(state.theme.accent);
    themes.root.style.setProperty('--cs-sample-accent', ACCENTS[state.theme.accent].hex);
  });
  return {
    focusPath() { site.input.focus(); },
    destroy() { off(); root.replaceChildren(); },
  };
}
