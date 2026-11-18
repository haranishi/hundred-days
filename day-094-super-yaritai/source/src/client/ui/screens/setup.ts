// 遊ぶ前の準備：ひとりで（キャラとCPUの強さ）・友だちと（名前・キャラ・部屋を作る／あいことばで入る）。
// ひとりでは「強さのボタンを押したら始まる」。タイトルから2回押すだけで店に入れる（docs/01：10秒で最初の悪事）。

import type { ScreensAPI } from '../../contracts';
import type { CpuLevel } from '../../../shared/view';
import { button, focusEl, h } from './dom';
import {
  NAME_MAX_CHARS,
  cleanNameInput,
  graphemeCount,
  normalizeRoomCode,
  roomCodeHint,
  roomCodeProblem,
  sanitizeName,
} from './forms';
import { charLabel, icon } from './looks';
import { charPicker, menuPage } from './parts';
import { loadChoice, loadString, saveString } from './store';

type SoloHandlers = Parameters<ScreensAPI['showSoloSetup']>[0];
type FriendHandlers = Parameters<ScreensAPI['showFriendMenu']>[0];

const LEVELS: readonly { level: CpuLevel; label: string; desc: string; tone: string }[] = [
  { level: 'easy', label: 'やさしい', desc: '近くの簡単な悪事だけ。ダッシュしない', tone: 'green' },
  { level: 'normal', label: 'ふつう', desc: '全部の悪事を回る。追われたらダッシュで逃げる', tone: 'blue' },
  { level: 'hard', label: '本気', desc: '効率よく回り、バナナの皮で邪魔してくる', tone: 'red' },
];

export function soloScreen(hd: SoloHandlers): { el: HTMLElement; focus: HTMLElement | null } {
  const picker = charPicker();
  const last = loadChoice<CpuLevel>('level', ['easy', 'normal', 'hard'], 'normal');
  let lastBtn: HTMLButtonElement | null = null;
  const levelButtons = LEVELS.map((lv) => {
    const descId = `sy-level-${lv.level}`;
    const b = button(
      [
        h('span', { class: 'sy-level-name' }, lv.label),
        // 名前は「ふつう」だけにして、説明は aria-describedby で読ませる
        h('span', { class: 'sy-level-desc', id: descId, 'aria-hidden': 'true' }, lv.desc),
        h('span', { class: 'sy-level-go', 'aria-hidden': 'true' }, 'はじめる', icon('play', 18)),
      ],
      {
        cls: `sy-level sy-level--${lv.tone}`,
        a: lv.level,
        attrs: { 'aria-describedby': descId, 'data-last': lv.level === last ? 'true' : undefined },
        onClick: () => {
          saveString('level', lv.level);
          hd.onStart(lv.level, picker.value());
        },
      },
    );
    if (lv.level === last) lastBtn = b;
    return b;
  });

  const el = menuPage({
    name: 'solo',
    center: true,
    title: 'ひとりで遊ぶ',
    back: { label: 'もどる', a: 'back', onClick: hd.onBack },
    body: [
      h('p', { class: 'sy-lead' }, 'CPUのライバル1人と、荒らし度で勝負します。'),
      picker.el,
      h(
        'section',
        { class: 'sy-levels', 'aria-labelledby': 'sy-levels-h' },
        h('h2', { class: 'sy-h2', id: 'sy-levels-h' }, 'CPUの強さを選んで、はじめる'),
        h('div', { class: 'sy-levels-list' }, ...levelButtons),
      ),
    ],
  });
  return { el, focus: lastBtn };
}

export function friendScreen(hd: FriendHandlers): { el: HTMLElement; focus: HTMLElement | null } {
  const preset = hd.presetCode ? normalizeRoomCode(hd.presetCode) : '';
  const picker = charPicker(() => syncName());

  // ── 名前 ──
  const nameInput = h('input', {
    class: 'sy-input sy-name-input',
    id: 'sy-name',
    type: 'text',
    autocomplete: 'nickname',
    enterkeyhint: 'done',
    'aria-describedby': 'sy-name-count',
    value: cleanNameInput(hd.savedName ?? loadString('name') ?? ''),
  });
  const nameCount = h('span', { class: 'sy-count', id: 'sy-name-count' });
  const syncName = (): void => {
    // 何も入れなければ、キャラの名前で入る（入力を必須にしない）
    nameInput.placeholder = charLabel(picker.value()) || 'なまえ';
    nameCount.textContent = `${graphemeCount(nameInput.value)}/${NAME_MAX_CHARS}文字`;
  };
  nameInput.addEventListener('input', (e) => {
    // 変換中（IME）は触らない。確定してから整える
    if ((e as InputEvent).isComposing) return;
    const cleaned = cleanNameInput(nameInput.value);
    if (cleaned !== nameInput.value) nameInput.value = cleaned;
    syncName();
  });
  nameInput.addEventListener('compositionend', () => {
    nameInput.value = cleanNameInput(nameInput.value);
    syncName();
  });
  syncName();

  const chosenName = (): string => {
    const name = sanitizeName(nameInput.value) || charLabel(picker.value()) || 'なまえ';
    saveString('name', sanitizeName(nameInput.value));
    return name;
  };

  // ── あいことば ──
  const codeInput = h('input', {
    class: 'sy-input sy-code-input',
    id: 'sy-code',
    type: 'text',
    inputmode: 'text',
    autocomplete: 'off',
    autocapitalize: 'characters',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'go',
    placeholder: 'K7QM',
    'aria-describedby': 'sy-code-hint',
    value: preset,
  });
  const codeHint = h('p', { class: 'sy-hint', id: 'sy-code-hint', 'aria-live': 'polite' });
  const join = button([icon('door', 22), '入る'], {
    cls: 'sy-btn--green sy-btn--big',
    a: 'join',
    onClick: () => {
      const code = normalizeRoomCode(codeInput.value);
      if (roomCodeProblem(code) !== null) {
        syncCode(true);
        focusEl(codeInput);
        return;
      }
      hd.onJoin(code, chosenName(), picker.value());
    },
  });
  const syncCode = (showShort = false): void => {
    const code = normalizeRoomCode(codeInput.value);
    if (code !== codeInput.value) codeInput.value = code;
    const problem = roomCodeProblem(code);
    codeHint.textContent = problem === 'confusable' || (showShort && problem === 'short') ? roomCodeHint(problem) : '英字と数字の4文字';
    codeHint.classList.toggle('is-error', problem === 'confusable');
    join.setAttribute('aria-disabled', String(problem !== null));
    codeInput.setAttribute('aria-invalid', String(problem === 'confusable'));
  };
  codeInput.addEventListener('input', () => syncCode());
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      join.click();
    }
  });
  syncCode();

  const create = button([icon('friends', 22), '部屋を作る'], {
    cls: 'sy-btn--blue sy-btn--big',
    a: 'create',
    onClick: () => hd.onCreate(chosenName(), picker.value()),
  });

  const createCard = h(
    'section',
    { class: 'sy-card sy-room-card', 'aria-labelledby': 'sy-create-h' },
    h('h2', { class: 'sy-h2', id: 'sy-create-h' }, '部屋を作る'),
    h('p', { class: 'sy-note' }, 'あいことばが出るので、友だちに送ってください。2〜4人で遊べます。'),
    create,
  );
  const joinCard = h(
    'section',
    { class: `sy-card sy-room-card${preset ? ' is-invited' : ''}`, 'aria-labelledby': 'sy-join-h' },
    h('h2', { class: 'sy-h2', id: 'sy-join-h' }, preset ? `あいことば ${preset} の部屋に入る` : 'あいことばで入る'),
    h('label', { class: 'sy-label', for: 'sy-code' }, '友だちから届いたあいことば'),
    h('div', { class: 'sy-code-row' }, codeInput, join),
    codeHint,
  );

  const el = menuPage({
    name: 'friends',
    center: true,
    title: '友だちと対戦',
    back: { label: 'もどる', a: 'back', onClick: hd.onBack },
    wide: true,
    body: [
      preset ? h('p', { class: 'sy-invited', role: 'status' }, '招待のリンクから来ました。名前とキャラを決めて「入る」を押してください。') : null,
      h(
        'div',
        { class: 'sy-friends-grid' },
        h(
          'section',
          { class: 'sy-card sy-me', 'aria-label': 'あなたの名前とキャラ' },
          h(
            'div',
            { class: 'sy-field' },
            h('label', { class: 'sy-label', for: 'sy-name' }, `なまえ（${NAME_MAX_CHARS}文字まで）`),
            nameInput,
            nameCount,
          ),
          picker.el,
        ),
        h('div', { class: 'sy-rooms' }, ...(preset ? [joinCard, createCard] : [createCard, joinCard])),
      ),
    ],
  });
  return { el, focus: preset ? nameInput : null };
}
