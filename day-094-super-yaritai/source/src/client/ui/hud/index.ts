/**
 * ゲーム中の表示（HUD）：残り時間・荒らし度・目立ち度・やっちゃダメリスト（進み具合）・コンボ・頭上の札・点の「ポン」・
 * カウントダウン・ラストスパート・店員の吹き出しと接近の矢印・店長の登場・放送の字幕・長押しと秒数の進み・案内。
 * WorldView だけを読む（ひとりでも、ネット対戦でも同じ）。DOM は変わったときだけ書き換える。
 */
import { MISDEEDS, SECRETS, misdeedById, type MisdeedId, type SecretId } from '../../../shared/rules/misdeeds';
import type { ActionPrompt, AvatarView, GameEvent, NpcView, StationsView, Vec3, WorldView } from '../../../shared/view';
import { PALETTE } from '../../render/palette';
import { BOWLING, CLERK, FREEZER, SCORE, TANTRUM } from '../../../shared/rules/tuning';
import { storeLayout, type StoreLayout } from '../../../shared/layout/store';
import { injectHudStyle } from './style';
import { bubbleY, edgeToward, misdeedPhrases, waitTexts, type Rect } from './guide';

export interface HudDeps {
  project(p: Vec3): { x: number; y: number; visible: boolean };
  mySlot(): number;
}

export interface Hud {
  show(): void;
  hide(): void;
  /** 新しい試合の前に、表示を初めに戻す */
  reset(): void;
  update(view: WorldView, dt: number): void;
  setTouchMode(on: boolean): void;
  onPause: (() => void) | null;
}

const fmtTime = (s: number): string => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const fmtNum = (n: number): string => n.toLocaleString('ja-JP');

export function playerBadge(slot: number): string {
  const color = PALETTE.players[slot % 4]!;
  const shape = PALETTE.playerShapes[slot % 4]!;
  return `<span class="syh-badge" style="background:${color}">${slot + 1}P${shape}</span>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** 秒で数える悪事（冷凍・駄々）の、いまの秒（案内の progress は「秒÷上限」） */
export function timedSeconds(p: ActionPrompt | null): number | null {
  if (!p || p.progress === undefined) return null;
  if (p.misdeed === 'freezer') return p.progress * FREEZER.maxSeconds;
  if (p.misdeed === 'tantrum') return p.progress * TANTRUM.maxSeconds;
  return null;
}

/** リストに出す進み具合（例：12/20、12/30m、1.5/3秒、最高3/5本） */
export function progressText(id: MisdeedId, value: number | undefined): string {
  if (!value || value <= 0) return '';
  const g = misdeedById(id).goal;
  switch (g.kind) {
    case 'count':
      return `${Math.floor(value)}/${g.target}`;
    case 'meters':
      return `${Math.floor(value)}/${g.target}m`;
    case 'seconds':
      return `${value.toFixed(1)}/${g.target}秒`;
    case 'single':
      return `最高${Math.floor(value)}/${g.target}本`;
    default:
      return '';
  }
}

export interface TodoHint {
  id: MisdeedId;
  name: string;
  /** 画面での向き（カメラは北向き固定なので、上＝北）。着いていれば「ここ！」 */
  arrow: string;
  dist: number;
}

const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'] as const;

/** 悪事をしに行く場所。なぎ払いは、いちばん近い棚の前 */
function todoSpot(id: MisdeedId, pos: { x: number; z: number }, holding: boolean, layout: StoreLayout): { x: number; z: number; r: number } {
  const p = layout.places;
  switch (id) {
    case 'cart':
      return p.carts;
    case 'bowling':
      return holding ? p.lane : p.wagon;
    case 'sweep': {
      let best = { x: p.tantrum.x, z: p.tantrum.z, r: 1 };
      let bestD = Infinity;
      for (const f of layout.faces) {
        const x = f.x + f.nx * 0.7;
        const z = f.z + f.nz * 0.7;
        const d = Math.hypot(x - pos.x, z - pos.z);
        if (d < bestD) {
          bestD = d;
          best = { x, z, r: f.halfLen };
        }
      }
      return best;
    }
    default:
      return p[id];
  }
}

/**
 * スマホでリストを畳んでいる間に出す「近く：〇〇 ↑」（round2 の4）。まだ達成していない悪事のうち、いちばん近いもの1つ。
 * 全部達成していれば null。
 */
export function nearestTodo(
  pos: { x: number; z: number },
  achieved: readonly string[],
  holding = false,
  layout: StoreLayout = storeLayout(),
  stations: StationsView | null = null,
): TodoHint | null {
  // 補充・積み直し・並び直しを待っている悪事は、行っても何もできないので候補から外す（C4）
  const waiting = waitTexts(stations);
  let best: TodoHint | null = null;
  for (const m of MISDEEDS) {
    if (achieved.includes(m.id) || waiting[m.id]) continue;
    const s = todoSpot(m.id, pos, holding, layout);
    const dx = s.x - pos.x;
    const dz = s.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (best && dist >= best.dist) continue;
    const here = m.id === 'sweep' ? dist < 1.2 : dist < s.r + 0.3;
    const arrow = here ? 'ここ！' : ARROWS[(Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) + 8) % 8]!;
    best = { id: m.id, name: m.name, arrow, dist };
  }
  return best;
}

export type ThrowVerdict = 'gutter' | 'close' | null;

/** 0本と決めるまでの秒（転がしてからピンまで約0.8秒） */
const GUTTER_AFTER = 2.2;
/** 最後のピンが倒れてから、これだけ待って本数を決める */
const SETTLE_AFTER = 1.3;

/**
 * 自分の1投の結果を見分ける（round2 の3「外れたらガター！、1〜2本ならおしい！」）。
 * 出来事は増やさず、転がした音（自分の足元）と自分のボウリングの点から数える。レーンの外で転がしたものは数えない。
 */
export class ThrowJudge {
  private at = -1;
  private pins = 0;
  private lastPinAt = -1;
  private readonly lane = storeLayout().places.lane;
  private readonly pinsAt = storeLayout().places.pins;

  /** 転がした音。pos が自分の足元で、レーンの通路の中なら1投の始まり */
  roll(clock: number, pos: Vec3, me: Vec3): void {
    if (Math.hypot(pos.x - me.x, pos.z - me.z) > 1.5) return;
    if (Math.abs(pos.x - this.lane.x) > 2.6 || pos.z < this.pinsAt.z + 0.8 || pos.z > this.lane.z + 4.5) return;
    this.at = clock;
    this.pins = 0;
    this.lastPinAt = -1;
  }

  /** 自分のボウリングの点（ピン1本ごとに1回） */
  pin(clock: number): void {
    if (this.at < 0) return;
    this.pins++;
    this.lastPinAt = clock;
  }

  tick(clock: number): ThrowVerdict {
    if (this.at < 0) return null;
    if (this.pins === 0) {
      if (clock - this.at < GUTTER_AFTER) return null;
      this.at = -1;
      return 'gutter';
    }
    if (clock - this.lastPinAt < SETTLE_AFTER && clock - this.at < BOWLING.throwWindow) return null;
    this.at = -1;
    return this.pins <= 2 ? 'close' : null;
  }
}

interface PopGroup {
  slot: number;
  x: number;
  z: number;
  t: number;
  total: number;
  el: HTMLElement;
}

/** 開始の札を見出しへ吸い込ませる長さ（ミリ秒） */
const FOLD_MS = 700;

/** 「見つかった！」を出す長さ（ミリ秒） */
const FOUND_MS = 1000;

/** 待ち時間を浮かべる所（台や棚の上） */
const WAIT_AT = ((): Record<'samples' | 'pyramid' | 'pins' | 'wagon', Vec3> => {
  const l = storeLayout();
  const fx = (kind: string): { x: number; z: number; y: number } => {
    const f = l.fixtures.find((q) => q.kind === kind);
    return f ? { x: f.pos.x, z: f.pos.z, y: f.size.y } : { x: 0, z: 0, y: 0 };
  };
  const st = fx('sample-table');
  const wg = fx('wagon');
  const pb = l.pyramidBase;
  return {
    samples: { x: st.x, y: st.y + 0.9, z: st.z },
    pyramid: { x: pb.x, y: pb.y + 1.9, z: pb.z },
    pins: { x: l.places.pins.x, y: 1.3, z: l.places.pins.z },
    wagon: { x: wg.x, y: wg.y + 0.9, z: wg.z },
  };
})();

/** 近い時刻・近い場所の点をまとめる（スマホで +10 が重なって読めないので） */
const POP_MERGE_TIME = 0.6;
const POP_MERGE_DIST = 2.5;
const POP_LIFE = 0.95;

/** 点の「ポン」：その人の形（●▲■◆）と色をつけて、だれの点かが色だけに頼らず分かるように（C9） */
export function popHtml(slot: number, points: number): string {
  const shape = PALETTE.playerShapes[slot % PALETTE.playerShapes.length]!;
  return `<b class="syh-pop-mark" style="background:${PALETTE.players[slot % 4]}">${shape}</b>+${points}`;
}

/** 畳んでいる間の「近く：〇〇」の HTML。文節の切れ目に <wbr> を入れて語中で折らない */
export function nextTodoHtml(hint: TodoHint): string {
  return `近く：<wbr>${misdeedPhrases(hint.id, hint.name).map(esc).join('<wbr>')}`;
}

/** 同じフレームの escape 得点イベントから、コンボ・ラストスパート込みの実際の点数を引く */
export function escapePointsFor(events: readonly GameEvent[], slot: number): number {
  for (const e of events) {
    if (e.t === 'score' && e.slot === slot && e.kind === 'escape' && e.points > 0) return e.points;
  }
  return SCORE.escape;
}

/** 画面外の目標（店員の「！」・対戦相手）を画面の端へ置く計算 */
export function edgePinPlacement(
  x: number,
  y: number,
  visible: boolean,
  w: number,
  h: number,
  padX = 46,
  padY = 56,
): { inside: boolean; x: number; y: number; ang: number } {
  const inside = visible && x > 40 && x < w - 40 && y > 70 && y < h - 40;
  let dx = x - w / 2;
  let dy = y - h / 2;
  if (!visible) {
    dx = -dx;
    dy = -dy;
  }
  const ang = Math.atan2(dy, dx);
  const k = Math.min((w / 2 - padX) / Math.max(1e-3, Math.abs(Math.cos(ang))), (h / 2 - padY) / Math.max(1e-3, Math.abs(Math.sin(ang))));
  return { inside, x: w / 2 + Math.cos(ang) * k, y: h / 2 + Math.sin(ang) * k, ang };
}

export function createHud(root: HTMLElement, deps: HudDeps): Hud {
  injectHudStyle();
  const el = document.createElement('div');
  el.className = 'syh-hud';
  el.innerHTML = `
    <div class="syh-top">
      <div class="syh-card is-me" data-testid="hud-me"><div class="syh-who"></div><div class="syh-pts syh-num">0</div><div class="syh-heat-row"><span class="syh-heat-label">目立ち度</span><div class="syh-heat" aria-label="目立ち度"><i></i></div></div></div>
      <div class="syh-timer syh-num" data-testid="hud-timer"><small>のこり</small><span>2:00</span></div>
      <div class="syh-card is-rival" data-testid="hud-rival"><div class="syh-who"></div><div class="syh-pts syh-num">0</div></div>
    </div>
    <div class="syh-countbox" aria-live="polite"></div>
    <div class="syh-intro" data-testid="hud-intro" aria-hidden="true"><div class="syh-intro-title">やっちゃダメ <b class="syh-num">10</b>個</div><div class="syh-intro-cols"><ol class="syh-intro-col"></ol><ol class="syh-intro-col" start="6"></ol></div></div>
    <div class="syh-stick-hint" data-testid="hud-stick-hint" aria-hidden="true"><i><b></b></i><span>ここをドラッグで移動</span></div>
    <div class="syh-list" data-testid="hud-list">
      <button type="button" class="syh-list-head" aria-expanded="true"><span>やっちゃダメ <b class="syh-num">0</b>/10</span><span class="syh-caret">▼</span></button>
      <div class="syh-next" data-testid="hud-next"><span></span><b></b></div>
      <ul></ul>
    </div>
    <div class="syh-combo" data-testid="hud-combo"><div class="syh-combo-label">コンボ</div><div class="syh-combo-mult syh-num">×1.0</div><div class="syh-combo-bar"><i></i></div><div class="syh-combo-tip">別の悪事で<br>コンボ！</div></div>
    <div class="syh-waits"></div>
    <div class="syh-npcs"></div>
    <div class="syh-heads"></div>
    <div class="syh-pops"></div>
    <div class="syh-rivals"></div>
    <div class="syh-arrows"></div>
    <div class="syh-center"></div>
    <div class="syh-feed" aria-live="polite"></div>
    <div class="syh-pa" data-testid="hud-pa" aria-live="polite"></div>
    <div class="syh-found" data-testid="hud-found" role="status"><b>見つかった！</b></div>
    <div class="syh-caught" data-testid="hud-caught" role="status"><b>つかまった！</b><span>3秒お休み</span><i></i></div>
    <div class="syh-hint" data-testid="hud-hint"></div>
    <button type="button" class="syh-pause" aria-label="一時停止" data-testid="btn-pause">❚❚</button>`;
  root.appendChild(el);
  const $ = <T extends HTMLElement>(sel: string): T => el.querySelector<T>(sel)!;
  const meWho = $('.is-me .syh-who');
  const mePts = $('.is-me .syh-pts');
  const meCard = $('.is-me');
  const topBar = $('.syh-top');
  const heatBar = $('.syh-heat i');
  const rivalCard = $('.is-rival');
  const rivalWho = $('.is-rival .syh-who');
  const rivalPts = $('.is-rival .syh-pts');
  const timer = $('.syh-timer');
  const timerText = $('.syh-timer span');
  const list = $('.syh-list');
  const listHead = $<HTMLButtonElement>('.syh-list-head');
  const listCount = $('.syh-list-head b');
  const ul = $('.syh-list ul');
  const next = $('.syh-next');
  const nextText = $('.syh-next span');
  const nextArrow = $('.syh-next b');
  const combo = $('.syh-combo');
  const comboMult = $('.syh-combo-mult');
  const comboBar = $('.syh-combo-bar i');
  const comboTip = $('.syh-combo-tip');
  const npcLayer = $('.syh-npcs');
  const heads = $('.syh-heads');
  const pops = $('.syh-pops');
  const rivals = $('.syh-rivals');
  const arrows = $('.syh-arrows');
  const center = $('.syh-center');
  const feed = $('.syh-feed');
  const paBar = $('.syh-pa');
  const caughtBand = $('.syh-caught');
  const countbox = $('.syh-countbox');
  const intro = $('.syh-intro');
  const stickHint = $('.syh-stick-hint');
  const found = $('.syh-found');
  const waitsLayer = $('.syh-waits');
  const caughtText = $('.syh-caught span');
  const caughtBar = $('.syh-caught i');
  const hint = $('.syh-hint');
  const pauseBtn = $<HTMLButtonElement>('.syh-pause');

  // 開始の3秒に見せる「やっちゃダメ10個」の札（2列。左に1〜5、右に6〜10）
  const introCols = el.querySelectorAll<HTMLElement>('.syh-intro-col');
  MISDEEDS.forEach((m, i) => {
    const li = document.createElement('li');
    li.className = 'syh-intro-card';
    li.innerHTML = `<b class="syh-num">${i + 1}</b><span>${misdeedPhrases(m.id, m.name).map(esc).join('<wbr>')}</span>`;
    introCols[i < 5 ? 0 : 1]!.appendChild(li);
  });

  ul.innerHTML = [
    ...MISDEEDS.map((m) => `<li data-id="${m.id}"><span class="syh-box"></span><span class="syh-name">${misdeedPhrases(m.id, m.name).map(esc).join('<wbr>')}</span><span class="syh-prog syh-num"></span></li>`),
    ...SECRETS.map((s) => `<li data-id="${s.id}" class="is-secret"><span class="syh-box"></span><span class="syh-name">？？？（ひみつ）</span></li>`),
  ].join('');

  let touchMode = false;
  let collapsed = false;
  let userToggled = false;
  let autoCloseAt = 0;
  /** カウントダウンの間だけ開いた（試合が始まったら畳み直す） */
  let openedForCountdown = false;
  let nextKey = '';
  let clock = 0;
  let last = { me: -1, rival: -1, time: '', count: -1, combo: '', hint: '', phase: '', heat: -1, caught: 'off' };
  const done = new Set<string>();
  const progShown = new Map<string, string>();
  const headEls = new Map<number, HTMLElement>();
  const npcEls = new Map<number, HTMLElement>();
  const bubbleSize = new Map<number, { w: number; h: number }>();
  /** 吹き出しを重ねたくない HUD の札（上の帯・一覧・一時停止・コンボ） */
  const hudRects = (): Rect[] => {
    const out: Rect[] = [];
    for (const node of [topBar, list, pauseBtn, combo]) {
      if (node === combo && !combo.classList.contains('is-on')) continue;
      const r = node.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
    return out;
  };
  const rivalEls = new Map<number, HTMLElement>();
  const arrowEls = new Map<number, HTMLElement>();
  const popGroups: PopGroup[] = [];
  const throwJudge = new ThrowJudge();
  const timers: number[] = [];

  /** スマホを横にしている（高さが足りず、一覧を開くと左の列がふさがる） */
  const isLandscapeTouch = (): boolean => window.innerWidth > window.innerHeight && (touchMode || window.innerHeight < 500);

  const setCollapsed = (c: boolean): void => {
    collapsed = c;
    list.classList.toggle('is-collapsed', c);
    listHead.setAttribute('aria-expanded', String(!c));
    $('.syh-caret').textContent = c ? '▶' : '▼';
  };
  listHead.addEventListener('click', () => {
    userToggled = true;
    setCollapsed(!collapsed);
  });
  pauseBtn.addEventListener('click', () => hud.onPause?.());

  const later = (ms: number, fn: () => void): void => {
    timers.push(window.setTimeout(fn, ms));
  };

  const banner = (html: string, cls = '', ms = 1600): void => {
    const b = document.createElement('div');
    b.className = `syh-banner ${cls}`;
    b.innerHTML = html;
    center.appendChild(b);
    while (center.querySelectorAll('.syh-banner').length > 2) center.querySelector('.syh-banner')?.remove();
    later(ms, () => b.remove());
  };

  const restart = (node: HTMLElement): void => {
    node.style.animation = 'none';
    void node.offsetWidth;
    node.style.animation = '';
  };
  /** 決まった動き（class で付ける）をもう一度最初から */
  const bump = (node: HTMLElement, cls: string): void => {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  };

  /** 点の「ポン」。近い時刻・近い場所の点は1つにまとめて、数字を足していく */
  const pop = (pos: Vec3, points: number, slot: number): void => {
    let g = popGroups.find((q) => q.slot === slot && clock - q.t < POP_MERGE_TIME && Math.hypot(q.x - pos.x, q.z - pos.z) < POP_MERGE_DIST);
    if (g) {
      g.total += points;
      g.t = clock;
      g.el.innerHTML = popHtml(slot, g.total);
      g.el.classList.toggle('is-big', g.total >= 100);
      restart(g.el);
      return;
    }
    const p = deps.project(pos);
    if (!p.visible) return;
    const d = document.createElement('div');
    d.className = `syh-pop${points >= 100 ? ' is-big' : ''}`;
    d.style.color = PALETTE.players[slot % 4]!;
    d.style.left = `${p.x}px`;
    d.style.top = `${p.y}px`;
    d.innerHTML = popHtml(slot, points);
    pops.appendChild(d);
    g = { slot, x: pos.x, z: pos.z, t: clock, total: points, el: d };
    popGroups.push(g);
  };

  const handleEvent = (e: GameEvent, view: WorldView): void => {
    const me = deps.mySlot();
    switch (e.t) {
      case 'score':
        pop(e.pos, e.points, e.slot);
        if (e.slot === me && e.kind === 'bowling') throwJudge.pin(clock);
        break;
      case 'sfx': {
        const mine = view.avatars.find((a) => a.slot === me);
        if (e.name === 'roll' && e.pos && mine) throwJudge.roll(clock, e.pos, mine.pos);
        break;
      }
      case 'achieve': {
        const isSecret = e.id.startsWith('secret-');
        const name = isSecret ? SECRETS.find((s) => s.id === e.id)?.name : MISDEEDS.find((m) => m.id === e.id)?.name;
        const who = view.avatars.find((a) => a.slot === e.slot);
        if (e.slot === me) {
          banner(`${isSecret ? 'ひみつ発見！' : 'やっちゃダメ達成！'}<small>${esc(name ?? '')}　+${e.bonus}</small>`, isSecret ? 'is-yellow' : '', 2200);
          // スマホ縦で畳んでいるときは、達成したときだけ開いてハンコを見せる。
          // 横画面では開かない（左の列を覆って、左下の親指＝スティックをふさぐ。round4 の F1）。見出しの数を光らせるだけ
          if (collapsed && !isLandscapeTouch()) {
            setCollapsed(false);
            autoCloseAt = clock + 2.6;
          } else bump(listHead, 'is-got');
        } else if (who) {
          // 相手の達成は右上に小さく（自分の画面の邪魔をしない）
          const f = document.createElement('div');
          f.className = 'syh-feed-item';
          f.innerHTML = `${playerBadge(who.slot)} ${esc(name ?? '')} を達成`;
          feed.prepend(f);
          while (feed.childElementCount > 3) feed.lastElementChild?.remove();
          later(2600, () => f.remove());
        }
        break;
      }
      case 'complete':
        if (e.slot === me) banner(`やっちゃダメ全制覇！<small>+${e.bonus}</small>`, 'is-yellow', 3000);
        break;
      case 'last-spurt':
        banner('ラストスパート！<small>入る点数が1.5倍</small>', '', 2200);
        break;
      case 'manager':
        banner('店長が出てきた！<small>追いかけてくる人が増えた</small>', 'is-dark', 2400);
        break;
      case 'escape':
        if (e.slot === me) banner(`逃げ切った！<small>+${escapePointsFor(view.events, me)}</small>`, 'is-yellow', 1500);
        break;
      case 'notice': {
        // 見つかった：店員がいる側の画面の端を赤く光らせ、「見つかった！」を1秒（C3）
        if (e.target !== me) break;
        const npc = view.npcs.find((n) => n.id === e.npc);
        const mine = view.avatars.find((a) => a.slot === me);
        if (!npc || !mine) break;
        const from = deps.project({ x: mine.pos.x, y: mine.pos.y + 1, z: mine.pos.z });
        const to = deps.project({ x: npc.pos.x, y: npc.pos.y + 1, z: npc.pos.z });
        const side = edgeToward(from, to, window.innerWidth, window.innerHeight);
        found.className = `syh-found is-on is-${side}`;
        restart(found);
        later(FOUND_MS, () => found.classList.remove('is-on'));
        break;
      }
      case 'slip':
        if (e.slot === me) banner('つるっ！', 'is-blue', 1000);
        break;
      case 'pa': {
        const who = view.avatars.find((a) => a.slot === e.slot);
        paBar.innerHTML = `<b>店内放送</b>${who ? ` ${playerBadge(who.slot)}` : ''}「${esc(e.text)}」`;
        paBar.classList.add('is-on');
        restart(paBar);
        later(4200, () => paBar.classList.remove('is-on'));
        break;
      }
      case 'combo':
        if (e.slot === me) bump(combo, 'is-up');
        break;
      case 'phase':
        if (e.phase === 'playing') {
          countbox.querySelector('.syh-count')?.remove();
          const g = document.createElement('div');
          g.className = 'syh-count is-go';
          g.textContent = 'スタート！';
          countbox.appendChild(g);
          later(900, () => g.remove());
          foldIntro();
        } else if (e.phase === 'ended') {
          banner('そこまで！', 'is-yellow', 2500);
        }
        break;
      default:
        break;
    }
  };

  const updateList = (av: AvatarView, stations: StationsView | null): void => {
    const waits = waitTexts(stations);
    const ids: (MisdeedId | SecretId)[] = [...av.achieved, ...av.secrets];
    for (const id of ids) {
      if (done.has(id)) continue;
      done.add(id);
      const li = ul.querySelector<HTMLElement>(`li[data-id="${id}"]`);
      if (!li) continue;
      li.classList.add('is-done', 'is-new');
      li.classList.remove('is-wait');
      if (id.startsWith('secret-')) li.querySelector('.syh-name')!.textContent = SECRETS.find((s) => s.id === id)?.name ?? '';
      li.querySelector('.syh-prog')?.replaceChildren();
      later(600, () => li.classList.remove('is-new'));
    }
    // 進み具合（12/20 など）。達成したものは出さない。補充などを待っている間は、その残り秒（C4）
    for (const m of MISDEEDS) {
      if (done.has(m.id)) continue;
      const text = waits[m.id] ?? progressText(m.id, av.progress?.[m.id]);
      if (progShown.get(m.id) === text) continue;
      progShown.set(m.id, text);
      const li = ul.querySelector<HTMLElement>(`li[data-id="${m.id}"]`);
      const span = li?.querySelector<HTMLElement>('.syh-prog');
      if (span) span.textContent = text;
      li?.classList.toggle('is-wait', !!waits[m.id]);
    }
    const count = av.achieved.length;
    if (count !== last.count) {
      last.count = count;
      listCount.textContent = String(count);
    }
  };

  const updateHeads = (view: WorldView): void => {
    for (const a of view.avatars) {
      let h = headEls.get(a.slot);
      if (!h) {
        h = document.createElement('div');
        h.className = 'syh-head';
        h.innerHTML = `${playerBadge(a.slot)}<span class="syh-head-combo syh-num"></span>`;
        heads.appendChild(h);
        headEls.set(a.slot, h);
      }
      const p = deps.project({ x: a.pos.x, y: a.pos.y + 2.05, z: a.pos.z });
      h.style.display = p.visible && a.connected ? '' : 'none';
      h.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
      const c = a.combo.level > 0 ? `×${a.combo.multiplier.toFixed(1)}` : '';
      const span = h.querySelector<HTMLElement>('.syh-head-combo')!;
      if (span.textContent !== c) span.textContent = c;
    }
  };

  /** 店員・客の頭上の吹き出しと、自分を追う店員の接近の矢印（画面の外にいるときは端に赤い「！」） */
  const updateNpcs = (npcs: readonly NpcView[], me: AvatarView | undefined): void => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const seen = new Set<number>();
    // HUD の札の範囲（吹き出しが入ったら、その下へずらす）。書き込む前にまとめて読む
    const avoid: Rect[] = npcs.some((n) => n.bubble) ? hudRects() : [];
    for (const n of npcs) {
      seen.add(n.id);
      let b = npcEls.get(n.id);
      if (!b) {
        b = document.createElement('div');
        b.className = 'syh-bubble';
        npcLayer.appendChild(b);
        npcEls.set(n.id, b);
      }
      const p = deps.project({ x: n.pos.x, y: n.pos.y + 2.1, z: n.pos.z });
      const text = n.bubble ?? '';
      if (b.textContent !== text) {
        b.textContent = text;
        b.classList.toggle('is-alert', text === '!' || text === 'こらー！');
        // 大きさは、文字が変わったときだけ測る（毎コマ測ると重い）
        b.style.display = '';
        bubbleSize.set(n.id, { w: b.offsetWidth || 40, h: b.offsetHeight || 24 });
      }
      b.style.display = text && p.visible ? '' : 'none';
      const size = bubbleSize.get(n.id) ?? { w: 40, h: 24 };
      const by = text && p.visible ? bubbleY(p.x, p.y, size.w, size.h, avoid) : p.y;
      b.style.transform = `translate(${p.x}px, ${by}px) translate(-50%, -100%)`;
      // 接近の矢印
      const chasingMe = me && n.target === me.slot && (n.state === 'chase' || n.state === 'notice');
      let a = arrowEls.get(n.id);
      if (!chasingMe || !me) {
        if (a) a.style.display = 'none';
        continue;
      }
      if (!a) {
        a = document.createElement('div');
        a.className = 'syh-arrow';
        a.innerHTML = '<span class="syh-arrow-tip"></span><b>！</b>';
        arrows.appendChild(a);
        arrowEls.set(n.id, a);
      }
      const q = deps.project({ x: n.pos.x, y: n.pos.y + 1, z: n.pos.z });
      const dist = Math.hypot(n.pos.x - me.pos.x, n.pos.z - me.pos.z);
      const scale = dist < 4 ? 1.35 : dist < 8 ? 1.1 : 0.85;
      const pin = edgePinPlacement(q.x, q.y, q.visible, W, H, 46, 56);
      if (pin.inside) {
        a.style.display = 'none';
        continue;
      }
      a.style.display = '';
      a.style.transform = `translate(${pin.x}px, ${pin.y}px) translate(-50%, -50%) scale(${scale})`;
      a.querySelector<HTMLElement>('.syh-arrow-tip')!.style.transform = `rotate(${pin.ang}rad)`;
    }
    for (const [id, b] of npcEls) {
      if (seen.has(id)) continue;
      b.remove();
      npcEls.delete(id);
      arrowEls.get(id)?.remove();
      arrowEls.delete(id);
    }
  };

  /** 画面外にいるライバル（CPU・対戦相手）の方向バッジを画面端に出す */
  const updateRivals = (view: WorldView, mySlot: number): void => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const seen = new Set<number>();
    if (view.phase === 'playing') {
      for (const av of view.avatars) {
        if (av.slot === mySlot || !av.connected) continue;
        seen.add(av.slot);
        let r = rivalEls.get(av.slot);
        if (!r) {
          r = document.createElement('div');
          r.className = 'syh-rival-arrow';
          const color = PALETTE.players[av.slot % PALETTE.players.length]!;
          const shape = PALETTE.playerShapes[av.slot % PALETTE.playerShapes.length]!;
          r.style.background = color;
          r.innerHTML = `<span class="syh-rival-tip"></span><b>${av.slot + 1}P${shape}</b>`;
          rivals.appendChild(r);
          rivalEls.set(av.slot, r);
        }
        const q = deps.project({ x: av.pos.x, y: av.pos.y + 1, z: av.pos.z });
        const pin = edgePinPlacement(q.x, q.y, q.visible, W, H, 34, 72);
        if (pin.inside) {
          r.style.display = 'none';
          continue;
        }
        r.style.display = '';
        r.style.transform = `translate(${pin.x}px, ${pin.y}px) translate(-50%, -50%)`;
        r.querySelector<HTMLElement>('.syh-rival-tip')!.style.transform = `rotate(${pin.ang}rad)`;
      }
    }
    for (const [slot, node] of rivalEls) {
      if (seen.has(slot)) continue;
      node.style.display = 'none';
    }
  };

  /** カウントダウンの数字は、上の中央（残り時間の下）。キャラにも札にも重ねない（C6） */
  const updateCenter = (view: WorldView): void => {
    const counting = view.phase === 'countdown';
    intro.classList.toggle('is-on', counting || intro.classList.contains('is-folding'));
    stickHint.classList.toggle('is-on', counting);
    if (!counting) {
      if (last.phase === 'countdown') countbox.querySelector('.syh-count:not(.is-go)')?.remove();
      return;
    }
    const n = String(Math.max(1, Math.ceil(view.timeLeft)));
    let c = countbox.querySelector<HTMLElement>('.syh-count:not(.is-go)');
    if (!c) {
      c = document.createElement('div');
      c.className = 'syh-count';
      c.setAttribute('data-testid', 'hud-countdown');
      countbox.appendChild(c);
    }
    if (c.textContent !== n) c.textContent = n;
  };

  /** 「スタート！」で、札を一覧の見出しへ吸い込ませて消す（C6） */
  const foldIntro = (): void => {
    if (!intro.classList.contains('is-on')) return;
    const head = listHead.getBoundingClientRect();
    const hx = head.left + head.width * 0.35;
    const hy = head.top + head.height / 2;
    intro.classList.add('is-folding');
    const cards = [...intro.querySelectorAll<HTMLElement>('.syh-intro-card, .syh-intro-title')];
    cards.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      c.style.transitionDelay = `${i * 0.025}s`;
      c.style.transform = `translate(${hx - (r.left + r.width / 2)}px, ${hy - (r.top + r.height / 2)}px) scale(.18)`;
      c.style.opacity = '0';
    });
    later(FOLD_MS, () => {
      intro.classList.remove('is-folding', 'is-on');
      for (const c of cards) {
        c.style.transitionDelay = '';
        c.style.transform = '';
        c.style.opacity = '';
      }
      bump(listHead, 'is-got');
      // PC は一覧を開く（スマホは畳んだまま「近く：〜」）
      if (!userToggled) setCollapsed(touchMode || window.innerWidth < 720);
    });
  };

  const updateHint = (p: ActionPrompt | null): void => {
    const label = p?.label ?? '蹴る';
    const secs = timedSeconds(p);
    const how = secs !== null ? `（${secs.toFixed(1)}/${p?.misdeed === 'freezer' ? FREEZER.maxSeconds : TANTRUM.maxSeconds}秒）` : p?.press === 'mash' ? '（連打）' : p?.press === 'hold' ? '（長押し）' : '';
    const prog = p?.press === 'hold' && p.progress !== undefined && secs === null ? Math.round(p.progress * 100) : -1;
    const key = `${label}${how}${prog}`;
    if (key === last.hint) return;
    last.hint = key;
    hint.innerHTML = `<kbd>WASD</kbd>／<kbd>矢印</kbd> 移動　<kbd>J</kbd>/<kbd>E</kbd> ${esc(label)}${how}${prog >= 0 ? `<span class="syh-hold"><i style="width:${prog}%"></i></span>` : ''}　<kbd>Shift</kbd> ダッシュ　<kbd>Space</kbd> ジャンプ`;
    hint.classList.toggle('is-special', !!p);
  };

  /** 捕まっている間（つかまれている0.6秒＋カウンターの3秒）、画面の上寄りに不透明の帯を出す（達成の帯より前） */
  const updateCaught = (me: AvatarView | undefined): void => {
    const on = !!me && me.stunned > 0 && me.anim === 'caught';
    const secs = on ? Math.max(1, Math.min(CLERK.caughtStun, Math.ceil(me.stunned - 0.05))) : 0;
    const key = on ? `on${secs}` : 'off';
    if (on) caughtBar.style.width = `${Math.min(100, (me.stunned / (CLERK.grabTime + CLERK.caughtStun)) * 100)}%`;
    if (key === last.caught) return;
    if (on && last.caught === 'off') restart(caughtBand);
    last.caught = key;
    caughtBand.classList.toggle('is-on', on);
    if (on) caughtText.textContent = `${secs}秒お休み`;
  };

  /**
   * カウントダウンの間は、一覧は見出しだけにして、10項目は画面の札で見せる（C6）。
   * 「スタート！」で札が見出しへ吸い込まれたら、PC は一覧を開く（foldIntro）
   */
  const updateListOpen = (view: WorldView): void => {
    if (view.phase === 'countdown' && last.phase !== 'countdown' && !collapsed && !userToggled) {
      setCollapsed(true);
      openedForCountdown = true;
    }
    if (view.phase === 'playing' && openedForCountdown && !intro.classList.contains('is-folding')) {
      openedForCountdown = false;
      if (!userToggled) setCollapsed(touchMode || window.innerWidth < 720);
    }
  };

  /** 畳んでいる間：近くの未達成の悪事を1件だけ出す */
  const updateNext = (view: WorldView, me: AvatarView | undefined): void => {
    // 開始の札を吸い込んでいる間は出さない（見出しの段を「スタート！」とぶつけない）
    const folding = intro.classList.contains('is-folding');
    const hint = me && view.phase === 'playing' && collapsed && !folding ? nearestTodo(me.pos, me.achieved, me.holding !== null, storeLayout(), view.stations) : null;
    const key = hint ? `${hint.id}${hint.arrow}` : '';
    if (key === nextKey) return;
    nextKey = key;
    next.classList.toggle('is-on', !!hint);
    if (!hint) return;
    nextText.innerHTML = nextTodoHtml(hint);
    nextArrow.textContent = hint.arrow;
    next.classList.toggle('is-here', hint.arrow === 'ここ！');
  };

  /** 空の試食台・崩れた缶ピラミッド・倒れたピン・空のワゴンの上に「補充まで14秒」など（C4） */
  const waitEls = new Map<string, HTMLElement>();
  const updateWaits = (view: WorldView): void => {
    const st = view.stations;
    const w = waitTexts(st);
    const items: { key: string; text: string | undefined; at: Vec3 }[] = [
      { key: 'samples', text: w.samples, at: WAIT_AT.samples },
      { key: 'pyramid', text: w.pyramid, at: WAIT_AT.pyramid },
      { key: 'pins', text: st && st.bowling.pinsDown > 0 && st.bowling.resetIn > 0 ? w.bowling : undefined, at: WAIT_AT.pins },
      { key: 'wagon', text: st && st.watermelons.left <= 0 && st.watermelons.refillIn > 0 ? waitTexts({ ...st, bowling: { pinsDown: 0, resetIn: 0 } }).bowling : undefined, at: WAIT_AT.wagon },
    ];
    for (const it of items) {
      let node = waitEls.get(it.key);
      const p = it.text && view.phase === 'playing' ? deps.project(it.at) : null;
      if (!it.text || !p || !p.visible) {
        if (node) node.style.display = 'none';
        continue;
      }
      if (!node) {
        node = document.createElement('div');
        node.className = 'syh-wait';
        node.setAttribute('data-testid', `hud-wait-${it.key}`);
        waitsLayer.appendChild(node);
        waitEls.set(it.key, node);
      }
      if (node.textContent !== it.text) node.textContent = it.text;
      node.style.display = '';
      node.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    }
  };

  const updatePops = (): void => {
    for (let i = popGroups.length - 1; i >= 0; i--) {
      const g = popGroups[i]!;
      if (clock - g.t > POP_LIFE) {
        g.el.remove();
        popGroups.splice(i, 1);
      }
    }
  };

  const hud: Hud = {
    onPause: null,
    show() {
      el.classList.add('is-on');
    },
    hide() {
      el.classList.remove('is-on');
    },
    reset() {
      for (const t of timers) window.clearTimeout(t);
      timers.length = 0;
      done.clear();
      progShown.clear();
      for (const li of ul.querySelectorAll('li')) li.classList.remove('is-done', 'is-new', 'is-wait');
      for (const s of ul.querySelectorAll('.syh-prog')) s.textContent = '';
      SECRETS.forEach((s) => {
        const span = ul.querySelector(`li[data-id="${s.id}"] .syh-name`);
        if (span) span.textContent = '？？？（ひみつ）';
      });
      pops.innerHTML = '';
      popGroups.length = 0;
      center.innerHTML = '';
      feed.innerHTML = '';
      heads.innerHTML = '';
      headEls.clear();
      npcLayer.innerHTML = '';
      npcEls.clear();
      arrows.innerHTML = '';
      arrowEls.clear();
      rivals.innerHTML = '';
      rivalEls.clear();
      paBar.classList.remove('is-on');
      openedForCountdown = false;
      nextKey = '';
      found.classList.remove('is-on');
      for (const n of waitEls.values()) n.style.display = 'none';
      intro.classList.remove('is-on', 'is-folding');
      countbox.innerHTML = '';
      next.classList.remove('is-on');
      last = { me: -1, rival: -1, time: '', count: -1, combo: '', hint: '', phase: '', heat: -1, caught: 'off' };
      caughtBand.classList.remove('is-on');
      userToggled = false;
      setCollapsed(touchMode || window.innerWidth < 720);
    },
    setTouchMode(on) {
      touchMode = on;
      el.classList.toggle('is-touch', on);
      if (!userToggled) setCollapsed(on || window.innerWidth < 720);
    },
    update(view, dt) {
      clock += dt;
      const mySlot = deps.mySlot();
      const me = view.avatars.find((a) => a.slot === mySlot);
      const rival = view.avatars.find((a) => a.slot !== mySlot);
      if (me) {
        if (me.score !== last.me) {
          if (last.me >= 0 && me.score > last.me) bump(meCard, 'is-bump');
          last.me = me.score;
          mePts.innerHTML = `${fmtNum(me.score)}<small>点</small>`;
          meWho.innerHTML = `${playerBadge(me.slot)}<span>${esc(me.name)}</span>`;
        }
        const heat = Math.round(me.heat);
        if (heat !== last.heat) {
          last.heat = heat;
          heatBar.style.width = `${heat}%`;
          heatBar.parentElement!.classList.toggle('is-hot', heat >= 30);
        }
        updateList(me, view.stations);
        // 点が入って猶予がある間は出す（×1.0 のときも。猶予のうちに別の悪事をすれば上がると分かるように）
        const top = me.combo.level >= SCORE.comboMultipliers.length - 1;
        const c = me.combo.remaining > 0 ? `×${me.combo.multiplier.toFixed(1)}${top ? '!' : ''}` : '';
        if (c !== last.combo) {
          last.combo = c;
          comboMult.textContent = c ? `×${me.combo.multiplier.toFixed(1)}` : '×1.0';
          combo.classList.toggle('is-on', !!c);
          combo.classList.toggle('is-base', !!c && me.combo.level === 0);
          comboTip.innerHTML = top ? '最高倍率！' : '別の悪事で<br>コンボ！';
        }
        if (c) comboBar.style.width = `${Math.min(100, (me.combo.remaining / SCORE.comboWindow) * 100)}%`;
        updateHint(me.prompt);
      }
      if (rival) {
        rivalCard.style.display = '';
        if (rival.score !== last.rival) {
          last.rival = rival.score;
          rivalPts.innerHTML = `${fmtNum(rival.score)}<small>点</small>`;
          rivalWho.innerHTML = `${playerBadge(rival.slot)}<span>${esc(rival.name)}</span>${rival.kind === 'cpu' ? '<span class="syh-cpu">CPU</span>' : ''}`;
        }
      } else rivalCard.style.display = 'none';
      const t = view.phase === 'countdown' ? fmtTime(view.duration) : fmtTime(view.timeLeft);
      if (t !== last.time) {
        last.time = t;
        timerText.textContent = t;
      }
      timer.classList.toggle('is-spurt', view.lastSpurt && view.phase === 'playing');
      for (const e of view.events) handleEvent(e, view);
      updateCenter(view);
      updateHeads(view);
      updateRivals(view, mySlot);
      updateNpcs(view.npcs, me);
      updateCaught(me);
      updateWaits(view);
      updateListOpen(view);
      updateNext(view, me);
      const verdict = throwJudge.tick(clock);
      if (verdict === 'gutter') banner('ガター！<small>足型に立って、線が赤くなる向きで</small>', 'is-dark', 1800);
      else if (verdict === 'close') banner('おしい！<small>もう少しまんなかへ</small>', 'is-blue', 1700);
      updatePops();
      if (autoCloseAt > 0 && clock > autoCloseAt) {
        autoCloseAt = 0;
        if (touchMode || window.innerWidth < 720) setCollapsed(true);
      }
      last.phase = view.phase;
    },
  };
  return hud;
}
