// 画面の確認用（screens-preview.html から読む。開発サーバー専用で、本番のビルドには入らない）。
// ?screen=<名前> で各画面をダミーのデータで出す。名前なしなら一覧と音の試聴を出す。
// 押したボタンは window.__UI__.calls に記録する（tools/ui-shots.mjs が中身を確かめる）。

import { PLAYER_CHARACTERS, type LobbyModel } from '../../contracts';
import { createAudio } from '../../audio';
import { renderLoop, renderMix, renderSfx, renderSfxReel, renderSong, wavBase64 } from '../../audio/offline';
import { VOICE_LIMITS } from '../../audio/limiter';
import { SFX_NAMES } from '../../audio/sfx';
import { MISDEED_IDS } from '../../../shared/rules/misdeeds';
import type { MatchResult, PlayerResult } from '../../../shared/view';
import { inviteUrl } from '../share';
import { createScreens } from './index';

const params = new URLSearchParams(location.search);
const screenName = params.get('screen') ?? '';
const calls: unknown[][] = [];
const log =
  (name: string) =>
  (...args: unknown[]): void => {
    calls.push([name, ...args]);
    console.info('[preview]', name, ...args);
  };

// 端末の共有シートがあるときの見た目を確かめる（native=1）
if (params.get('native') === '1' && typeof navigator.share !== 'function') {
  Object.defineProperty(navigator, 'share', { value: async () => {}, configurable: true });
}

const audio = createAudio();
const root = document.getElementById('screens') as HTMLElement;
const screens = createScreens(root);

const ch = (i: number): string => PLAYER_CHARACTERS[i]?.key ?? 'ch/character-female-b';

function player(p: Partial<PlayerResult> & Pick<PlayerResult, 'slot' | 'name' | 'score' | 'rank'>): PlayerResult {
  return {
    kind: 'human',
    character: ch(p.slot),
    title: 'ちょっと迷惑なお客さん',
    complete: false,
    achieved: [],
    secrets: [],
    breakdown: {},
    caught: 0,
    ...p,
  };
}

const RESULTS: Record<string, { result: MatchResult; mySlot: number; canRematch: boolean; waitingForHost: boolean }> = {
  win: {
    mySlot: 0,
    canRematch: true,
    waitingForHost: false,
    result: {
      duration: 120,
      winnerSlots: [0],
      damage: 0.42,
      aborted: false,
      players: [
        player({
          slot: 0,
          name: 'ミカン',
          score: 12550,
          rank: 1,
          title: '伝説の迷惑客',
          complete: true,
          achieved: [...MISDEED_IDS],
          secrets: ['secret-cart-strike'],
          caught: 1,
          // 内訳（初めて達成の+300を含む）＋extras（完全制覇・ひみつ）＝点。core の結果と同じ形
          breakdown: {
            sweep: { count: 34, points: 1320 },
            pyramid: { count: 31, points: 1265 },
            cart: { count: 41, points: 555 },
            bowling: { count: 9, points: 1250 },
            samples: { count: 8, points: 840 },
            pa: { count: 1, points: 800 },
            freezer: { count: 3, points: 600 },
            banana: { count: 1, points: 500 },
            tantrum: { count: 3, points: 600 },
            bell: { count: 20, points: 700 },
            knock: { count: 12, points: 120 },
            escape: { count: 2, points: 200 },
          },
          extras: [
            { label: 'やっちゃダメ全制覇', points: 3000 },
            { label: 'ひみつ：カートで缶ピラミッドに突っ込む', points: 800 },
          ],
        }),
        player({
          slot: 1,
          kind: 'cpu',
          name: 'ケンタ（CPU・ふつう）',
          character: ch(1),
          score: 5120,
          rank: 2,
          title: '店長に顔を覚えられた',
          achieved: ['bell', 'sweep', 'cart', 'freezer'],
          caught: 3,
        }),
      ],
    },
  },
  lose: {
    mySlot: 2,
    canRematch: false,
    waitingForHost: true,
    result: {
      duration: 180,
      winnerSlots: [1],
      damage: 0.67,
      aborted: false,
      players: [
        player({ slot: 0, name: 'たろう', score: 4210, rank: 2, title: '店長に顔を覚えられた', achieved: ['bell', 'cart'] }),
        player({ slot: 1, name: 'ＷＷＷＷＷＷＷＷ', score: 9870, rank: 1, title: '出入り禁止', achieved: ['bell', 'cart', 'sweep', 'pa', 'samples'], secrets: ['secret-staff-slip'] }),
        player({
          slot: 2,
          name: 'ユイ',
          character: ch(2),
          score: 1480,
          rank: 3,
          title: 'ちょっと迷惑なお客さん',
          achieved: ['bell'],
          caught: 4,
          breakdown: { bell: { count: 20, points: 400 }, knock: { count: 33, points: 330 }, sweep: { count: 15, points: 150 } },
        }),
        player({ slot: 3, name: 'カート番長', score: 980, rank: 4, achieved: [] }),
      ],
    },
  },
  tie: {
    mySlot: 0,
    canRematch: true,
    waitingForHost: false,
    result: {
      duration: 90,
      winnerSlots: [0, 1],
      damage: 0.18,
      aborted: false,
      players: [
        player({ slot: 0, name: 'サクラ', character: ch(4), score: 3000, rank: 1, title: '要注意人物', achieved: ['bell', 'sweep'], breakdown: { bell: { count: 20, points: 400 } } }),
        player({ slot: 1, name: 'ハカセ', character: ch(5), score: 3000, rank: 1, title: '要注意人物', achieved: ['bell', 'cart'] }),
      ],
    },
  },
  zero: {
    mySlot: 0,
    canRematch: true,
    waitingForHost: false,
    result: {
      duration: 120,
      winnerSlots: [1],
      damage: 0,
      aborted: true,
      players: [
        player({ slot: 0, name: 'ダイチ', character: ch(3), score: 0, rank: 2 }),
        player({ slot: 1, kind: 'cpu', name: 'ハカセ（CPU・本気）', character: ch(5), score: 8200, rank: 1, title: '出入り禁止' }),
      ],
    },
  },
};

function lobby(kind: 'host' | 'guest' | 'alone'): LobbyModel {
  const players = [
    { slot: 0, name: 'たろう', character: ch(1), isHost: true, isYou: kind !== 'guest', connected: true },
    { slot: 1, name: 'はなこ', character: ch(0), isHost: false, isYou: kind === 'guest', connected: true },
    { slot: 2, name: 'ＷＷＷＷＷＷＷＷ', character: ch(4), isHost: false, isYou: false, connected: false },
  ];
  const list = kind === 'alone' ? players.slice(0, 1) : kind === 'host' ? players.slice(0, 2) : players;
  return { code: 'K7QM', url: inviteUrl('K7QM'), players: list, isHost: kind !== 'guest', duration: kind === 'guest' ? 180 : 120, canStart: kind === 'host' };
}

const handles: Record<string, unknown> = {};

function show(name: string): void {
  const titleHandlers = {
    onSolo: log('onSolo'),
    onFriends: log('onFriends'),
    onRandom: log('onRandom'),
    onHowTo: log('onHowTo'),
    onToggleMute: () => {
      log('onToggleMute')();
      audio.setMuted(!audio.muted);
    },
    muted: audio.muted,
  };
  switch (name) {
    case 'title':
    case 'title-3d':
      return screens.showTitle(titleHandlers);
    case 'toast':
      screens.showTitle(titleHandlers);
      screens.toast('友だちと対戦は準備中です');
      return;
    case 'howto':
      return screens.showHowTo({ onBack: log('onBack') });
    case 'solo':
      return screens.showSoloSetup({ onStart: log('onStart'), onBack: log('onBack') });
    case 'friends':
      return screens.showFriendMenu({ onCreate: log('onCreate'), onJoin: log('onJoin'), onBack: log('onBack') });
    case 'friends-invited':
      return screens.showFriendMenu({ presetCode: 'k7qm', savedName: 'はなこ', onCreate: log('onCreate'), onJoin: log('onJoin'), onBack: log('onBack') });
    case 'matchmaking':
    case 'matchmaking-timeout':
    case 'matchmaking-error': {
      const m = screens.showMatchmaking({ onCancel: log('onCancel'), onPlayCpu: log('onPlayCpu') });
      handles.matchmaking = m;
      m.setState('searching', 20);
      if (name === 'matchmaking') m.setState('searching', 14);
      if (name === 'matchmaking-timeout') m.setState('timeout');
      if (name === 'matchmaking-error') m.setState('error');
      return;
    }
    case 'lobby-host':
    case 'lobby-guest':
    case 'lobby-alone': {
      const kind = name.slice(6) as 'host' | 'guest' | 'alone';
      handles.lobby = screens.showLobby(lobby(kind), { onStart: log('onStart'), onLeave: log('onLeave'), onDuration: log('onDuration') });
      handles.lobbyModel = lobby;
      return;
    }
    case 'connecting':
      return screens.showConnecting('部屋につないでいます…', log('onCancel'));
    case 'error':
      return screens.showError('部屋が見つかりませんでした。あいことばをもう一度確かめてください。', log('onBack'));
    case 'pause':
      return screens.showPause({ onResume: log('onResume'), onQuit: log('onQuit') });
    case 'pause-live':
      return screens.showPause({ onResume: log('onResume'), onQuit: log('onQuit'), live: true });
    case 'results-win':
    case 'results-lose':
    case 'results-tie':
    case 'results-zero': {
      const r = RESULTS[name.slice(8)];
      if (!r) return;
      return screens.showResults(r.result, {
        mySlot: r.mySlot,
        canRematch: r.canRematch,
        waitingForHost: r.waitingForHost,
        onRematch: r.canRematch ? log('onRematch') : undefined,
        onTitle: log('onTitle'),
      });
    }
    case 'hidden':
      screens.showTitle(titleHandlers);
      screens.hide();
      screens.toast('試合中のトースト');
      return;
  }
}

export const SCREEN_NAMES = [
  'title',
  'title-3d',
  'toast',
  'howto',
  'solo',
  'friends',
  'friends-invited',
  'matchmaking',
  'matchmaking-timeout',
  'matchmaking-error',
  'lobby-host',
  'lobby-guest',
  'lobby-alone',
  'connecting',
  'error',
  'pause',
  'pause-live',
  'results-win',
  'results-lose',
  'results-tie',
  'results-zero',
] as const;

// タイトルの後ろの3D：店の絵のつもりの単色を敷いて、透け具合を確かめる（本物の店の絵に替えたいときは、手元でゲームを撮って、ここで敷く）
if (screenName === 'title-3d') {
  const stage = document.getElementById('stage');
  if (stage) stage.style.cssText = 'position:fixed;inset:0;background:#fff8ec';
}

// 一時停止は試合の上に出るので、後ろに店のつもりの絵を敷く（透け具合を確かめる）
if (screenName === 'pause' || screenName === 'pause-live' || screenName === 'hidden') {
  const stage = document.getElementById('stage');
  if (stage) {
    stage.style.cssText =
      'position:fixed;inset:0;background:linear-gradient(#cfe9f5 0 30%, transparent 30%),repeating-linear-gradient(90deg,#3baa5c 0 40px,#ffc93c 40px 80px,#e8423f 80px 120px) 0 30%/100% 22% no-repeat,conic-gradient(#fff 90deg,#ddf2e6 90deg 180deg,#fff 180deg 270deg,#ddf2e6 270deg) 0 0/60px 60px';
  }
}

if (params.get('faces') === '1') {
  // 顔の画像づくり（tools/ui-faces.mjs）。three.js はここでだけ読む
  void import('./faces-render').then((m) => {
    (window as unknown as { __FACES__: unknown }).__FACES__ = m;
  });
} else if (screenName) {
  show(screenName);
} else {
  // 一覧と音の試聴
  screens.hide();
  const list = document.createElement('div');
  list.style.cssText = 'position:fixed;inset:0;overflow:auto;padding:16px;font:600 15px/1.8 system-ui;color:#2b2b3a;background:#fff8ec';
  list.innerHTML = `<h1 style="font-size:20px;margin:0 0 8px">画面の確認</h1>
    <p>${SCREEN_NAMES.map((n) => `<a href="?screen=${n}">${n}</a>`).join('　')}　<a href="?screen=results-win&native=1">results-win（共有あり）</a></p>
    <h2 style="font-size:17px">音の試聴（最初にどこかを押すと鳴るようになる）</h2>
    <p id="sfx"></p>
    <p><button data-bgm="title">BGM タイトル</button> <button data-bgm="game">BGM 試合</button> <button data-int="0">強さ0</button> <button data-int="1">強さ1</button> <button data-int="2">強さ2</button> <button data-bgm="stop">BGM 止める</button></p>
    <p><label>カート <input type="range" min="0" max="1" step="0.05" value="0" data-loop="cart"></label> <label>冷凍 <input type="range" min="0" max="1" step="0.05" value="0" data-loop="freezer"></label></p>`;
  document.body.appendChild(list);
  const sfx = list.querySelector('#sfx') as HTMLElement;
  for (const n of SFX_NAMES) {
    const b = document.createElement('button');
    b.textContent = n;
    b.addEventListener('click', () => audio.play(n));
    sfx.append(b, ' ');
  }
  list.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const bgm = t.dataset.bgm;
    if (bgm === 'stop') audio.stopBgm();
    else if (bgm === 'title' || bgm === 'game') audio.startBgm(bgm);
    if (t.dataset.int) audio.setBgmIntensity(Number(t.dataset.int) as 0 | 1 | 2);
  });
  list.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.loop === 'cart' || t.dataset.loop === 'freezer') audio.setLoop(t.dataset.loop, Number(t.value));
  });
}

declare global {
  interface Window {
    __UI__?: unknown;
  }
}

window.__UI__ = { screens, audio, calls, handles, show, renderSfx, renderSong, renderLoop, renderMix, renderSfxReel, wavBase64, VOICE_LIMITS, SFX_NAMES, SCREEN_NAMES, lobby };
