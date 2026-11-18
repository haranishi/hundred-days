// ネット対戦の画面：だれかと（相手さがし）・待合室。
// 待合室は update() で顔ぶれが何度も変わる。焦点の置き場（試合の長さ・はじめる）は作り直さず、中身だけを書き換える。

import type { LobbyModel, LobbyPlayer, ScreensAPI } from '../../contracts';
import { MATCH } from '../../../shared/rules/tuning';
import { createShareBlock, inviteShareText, inviteUrl } from '../share';
import { button, h, nameBreaks, s, setText } from './dom';
import { charLabel, faceImg, icon, lookOf, slotBadge } from './looks';
import { menuPage } from './parts';

type MatchHandlers = Parameters<ScreensAPI['showMatchmaking']>[0];
type LobbyHandlers = Parameters<ScreensAPI['showLobby']>[1];
type MatchState = 'searching' | 'timeout' | 'error';

/** 部屋の人数の上限（docs/05：友だちの部屋は2〜4人） */
export const ROOM_CAPACITY = 4;

const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

export function matchmakingScreen(hd: MatchHandlers): {
  el: HTMLElement;
  focus: HTMLElement | null;
  setState(state: MatchState, secondsLeft?: number): void;
} {
  let maxSeconds = 0;
  const arc = s('circle', { class: 'sy-ring-arc', cx: 60, cy: 60, r: RING_R, 'stroke-dasharray': RING_C.toFixed(1), 'stroke-dashoffset': '0' });
  const ringNum = h('span', { class: 'sy-ring-num' });
  const ringUnit = h('span', { class: 'sy-ring-unit' }, '秒');
  const ring = h(
    'div',
    { class: 'sy-ring', 'aria-hidden': 'true' },
    s('svg', { viewBox: '0 0 120 120', width: 132, height: 132, focusable: 'false' }, s('circle', { class: 'sy-ring-bg', cx: 60, cy: 60, r: RING_R }), arc),
    h('span', { class: 'sy-ring-center' }, ringNum, ringUnit),
  );
  const title = h('h2', { class: 'sy-h2 sy-match-title' });
  const text = h('p', { class: 'sy-match-text' });
  const live = h('p', { class: 'sy-sr', 'aria-live': 'polite' });
  const playCpu = button([icon('play', 20), 'CPUと遊ぶ'], { cls: 'sy-btn--red sy-btn--big', a: 'cpu', onClick: hd.onPlayCpu });
  const quickCpu = button('待たずにCPUと遊ぶ', { cls: 'sy-btn--plain', a: 'cpu-now', onClick: hd.onPlayCpu });
  const cancel = button('やめる', { cls: 'sy-btn--plain', a: 'cancel', onClick: hd.onCancel });
  const actions = h('div', { class: 'sy-actions' });
  const card = h('section', { class: 'sy-card sy-match', 'data-state': 'searching' }, ring, title, text, live, actions);

  const setState = (state: MatchState, secondsLeft?: number): void => {
    card.dataset.state = state;
    if (state === 'searching') {
      const left = Math.max(0, Math.ceil(secondsLeft ?? 0));
      if (secondsLeft !== undefined) maxSeconds = Math.max(maxSeconds, left, 1);
      const ratio = maxSeconds > 0 ? left / maxSeconds : 1;
      arc.setAttribute('stroke-dashoffset', (RING_C * (1 - ratio)).toFixed(1));
      setText(ringNum, secondsLeft === undefined ? '…' : String(left));
      ringUnit.hidden = secondsLeft === undefined;
      setText(title, '相手をさがしています');
      setText(text, '見つからなければ、CPUのライバルと遊べます。名前は自動でつきます（例：試食ハンター）。');
      // 読み上げは5秒ごとだけ（毎秒読むとうるさい）
      if (secondsLeft !== undefined && left % 5 === 0) setText(live, `あと${left}秒`);
      if (actions.firstChild !== quickCpu) actions.replaceChildren(quickCpu, cancel);
      return;
    }
    const timeout = state === 'timeout';
    setText(title, timeout ? '相手が見つかりませんでした' : '相手さがしにつながりませんでした');
    setText(text, timeout ? 'いまは遊べる人がいないようです。CPUのライバルと遊びましょう。' : '通信のぐあいを確かめて、あとでもう一度ためしてください。');
    setText(live, title.textContent ?? '');
    if (actions.firstChild !== playCpu) {
      const hadFocus = card.contains(document.activeElement);
      actions.replaceChildren(playCpu, cancel);
      cancel.textContent = 'もどる';
      if (hadFocus || document.activeElement === document.body) playCpu.focus({ preventScroll: true });
    }
  };
  setState('searching');

  const el = menuPage({
    name: 'matchmaking',
    center: true,
    title: 'だれかと対戦',
    back: { label: 'もどる', a: 'back', onClick: hd.onCancel },
    body: [card],
  });
  return { el, focus: null, setState };
}

// ───────── 待合室 ─────────

/** 「2分」「1分半」「45秒」の形 */
export function durationLabel(sec: number): string {
  if (sec >= 60 && sec % 60 === 0) return `${sec / 60}分`;
  if (sec > 60 && sec % 60 === 30) return `${Math.floor(sec / 60)}分半`;
  return `${sec}秒`;
}

/** 部屋の主が選べる試合の長さ（正本は rules/tuning.ts） */
const DURATIONS = MATCH.durations.map((sec) => ({ sec, label: durationLabel(sec) }));

function playerRow(p: LobbyPlayer): HTMLElement {
  const look = lookOf(p.slot);
  return h(
    'li',
    { class: `sy-member${p.connected ? '' : ' is-away'}${p.isYou ? ' is-you' : ''}`, style: `--pc:${look.color}`, 'data-slot': p.slot },
    slotBadge(p.slot, 'lg'),
    faceImg(p.character, 48),
    h('span', { class: 'sy-member-name' }, ...nameBreaks(p.name || charLabel(p.character) || '（名前なし）')),
    h(
      'span',
      { class: 'sy-member-tags' },
      p.isYou && !p.name.includes('あなた') ? h('span', { class: 'sy-tag sy-tag--you' }, 'あなた') : null,
      p.isHost ? h('span', { class: 'sy-tag sy-tag--host' }, icon('crown', 14), '主') : null,
      p.connected ? null : h('span', { class: 'sy-tag sy-tag--away' }, 'つなぎ直し中…'),
    ),
  );
}

/** 空いている席は1行にまとめる（4人分の空行を並べると、スマホで「はじめる」が遠くなる） */
function openSeatsRow(n: number): HTMLElement {
  return h('li', { class: 'sy-member is-empty' }, h('span', { class: 'sy-member-empty' }, `あと${n}人 入れます`));
}

export function lobbyScreen(
  first: LobbyModel,
  hd: LobbyHandlers,
): { el: HTMLElement; focus: HTMLElement | null; update(model: LobbyModel): void } {
  let model = first;

  // あいことば（大きく）と招待
  const code = h(
    'p',
    { class: 'sy-code-tiles', 'aria-label': `あいことば ${model.code.split('').join(' ')}` },
    ...model.code.split('').map((c) => h('span', { class: 'sy-code-tile', 'aria-hidden': 'true' }, c)),
  );
  const codeCard = h(
    'section',
    { class: 'sy-card sy-lobby-code', 'aria-labelledby': 'sy-lobby-code-h' },
    h('h2', { class: 'sy-h2', id: 'sy-lobby-code-h' }, 'あいことば'),
    code,
    h('p', { class: 'sy-note' }, 'この4文字か、下の招待リンクを友だちに送ってください。'),
    createShareBlock({ heading: '招待を送る', text: inviteShareText(model.code), url: model.url || inviteUrl(model.code) }),
  );

  // 顔ぶれ
  const countText = h('span', { class: 'sy-count-badge' });
  const members = h('ol', { class: 'sy-members' });
  const membersCard = h(
    'section',
    { class: 'sy-card sy-lobby-members', 'aria-labelledby': 'sy-lobby-mem-h' },
    h('h2', { class: 'sy-h2', id: 'sy-lobby-mem-h' }, '顔ぶれ', countText),
    members,
  );

  // 主だけ：試合の長さ（中身）と「はじめる」（下に貼りつける）。参加者：待っている表示（下に貼りつける）
  const side = h('div', { class: 'sy-lobby-side' }, membersCard);
  const bar = h('div', { class: 'sy-bottom-bar sy-lobby-bar' });
  let builtForHost: boolean | null = null;
  let durationCard: HTMLElement | null = null;
  let radios: HTMLInputElement[] = [];
  let start: HTMLButtonElement | null = null;
  let startHint: HTMLElement | null = null;
  let waitText: HTMLElement | null = null;

  const buildControls = (): void => {
    builtForHost = model.isHost;
    durationCard?.remove();
    durationCard = null;
    radios = [];
    start = null;
    startHint = null;
    waitText = null;
    if (model.isHost) {
      radios = DURATIONS.map((d) =>
        h('input', {
          type: 'radio',
          name: 'sy-duration',
          value: d.sec,
          class: 'sy-seg-input',
          id: `sy-dur-${d.sec}`,
          on: { change: () => hd.onDuration(d.sec) },
        }),
      );
      durationCard = h(
        'section',
        { class: 'sy-card sy-lobby-controls', 'aria-label': '試合の準備' },
        h(
          'fieldset',
          { class: 'sy-seg' },
          h('legend', { class: 'sy-h2' }, '試合の長さ'),
          h(
            'div',
            { class: 'sy-seg-items' },
            ...DURATIONS.map((d, i) => h('label', { class: 'sy-seg-item', for: `sy-dur-${d.sec}` }, radios[i] ?? null, h('span', { class: 'sy-seg-box' }, d.label))),
          ),
        ),
      );
      side.appendChild(durationCard);
      start = button([icon('play', 22), 'はじめる'], {
        cls: 'sy-btn--red sy-btn--big',
        a: 'start',
        attrs: { 'aria-describedby': 'sy-start-hint' },
        onClick: () => {
          if (model.canStart) hd.onStart();
        },
      });
      startHint = h('p', { class: 'sy-bar-hint', id: 'sy-start-hint', 'aria-live': 'polite' });
      bar.replaceChildren(startHint, start);
    } else {
      waitText = h('p', { class: 'sy-wait sy-wait--bar', role: 'status' });
      bar.replaceChildren(waitText);
    }
  };

  const render = (): void => {
    if (builtForHost !== model.isHost) buildControls();
    const players = [...model.players].sort((a, b) => a.slot - b.slot);
    const open = Math.max(0, ROOM_CAPACITY - players.length);
    members.replaceChildren(...players.map(playerRow), ...(open > 0 ? [openSeatsRow(open)] : []));
    setText(countText, `${players.length}/${ROOM_CAPACITY}人`);
    for (const r of radios) r.checked = Number(r.value) === model.duration;
    if (start && startHint) {
      start.setAttribute('aria-disabled', String(!model.canStart));
      setText(startHint, model.canStart ? `${durationLabel(model.duration)}の試合をはじめます` : '2人そろうと「はじめる」を押せます');
    }
    if (waitText) {
      const host = model.players.find((p) => p.isHost);
      setText(waitText, `部屋の主（${host?.name || '主'}）がはじめるのを待っています。試合の長さ：${durationLabel(model.duration)}`);
    }
  };
  render();

  const el = menuPage({
    name: 'lobby',
    center: true,
    title: '待合室',
    back: { label: 'ぬける', a: 'leave', onClick: hd.onLeave, icon: 'door' },
    wide: true,
    pageClass: 'sy-page--bar',
    body: [h('div', { class: 'sy-lobby-grid' }, codeCard, side), bar],
  });

  return {
    el,
    focus: null,
    update(next: LobbyModel) {
      model = next;
      render();
    },
  };
}
