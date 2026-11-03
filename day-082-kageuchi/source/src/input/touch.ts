// OWNER: core
// タッチ操作の DOM 層（TouchControls）と、触れる端末の判定（detectTouchMode）。
// 指の動きは InputState の注入口へ流すだけ：スティック＝injectStick、視点＝injectMotion、ボタン＝touchKeyDown/Up。
// 規則（src/sim）には触れない。計算は touchMath（純粋）、数値は config/touch.ts。
// モードの正本は <html> の kg-touch クラス1つ。クラスが無ければ、この層は作られない（デスクトップの操作と見た目は変更前と同じ）。
// 追跡中の指は window のリスナで追う（pointer capture は使えたら使う補助。合成イベントでも動くように）。
// 部品の位置は CSS 変数（touch.css の冒頭）で外から動かせる。
// 2026-11-03 スマホ対応で新設（tasks 2.4）。
import '../ui/touch.css';
import { TOUCH } from '../config/touch';
import type { GameStateOut } from '../game/state';
import type { InputState } from './input';
import { onTap } from '../ui/tap';
import { AimButton, LookDrag, clampOrigin, stickFromDrag, stickRadius, type AimEffect, type AimState } from './touchMath';

export const TOUCH_CLASS = 'kg-touch';

export type TouchMode = 'on' | 'off' | 'auto';

/** URL の ?touch=1|0 が最優先。次に、主な指し手が粗い（指）端末。どちらでもなければ auto（最初のタッチで有効にする）。 */
export function detectTouchMode(params: URLSearchParams, mm: ((q: string) => { matches: boolean }) | null = typeof matchMedia === 'function' ? (q) => matchMedia(q) : null): TouchMode {
  const p = params.get('touch');
  if (p === '1') return 'on';
  if (p === '0') return 'off';
  try {
    if (mm && mm('(pointer: coarse)').matches) return 'on';
  } catch {
    // matchMedia が使えない環境は auto
  }
  return 'auto';
}

export function touchModeOn(): boolean {
  return document.documentElement.classList.contains(TOUCH_CLASS);
}

export type TouchButtonName = 'action' | 'attack' | 'crouch' | 'stone' | 'cancel' | 'pause';

export interface TouchCallbacks {
  /** 狙いをやめる要求（main.ts の cancelAimReq を立てる）。Q を離す前に呼ぶ。 */
  cancelAim(): void;
  /** 一時停止ボタン（main.ts の interruptPlay({ pause: true })）。 */
  pause(): void;
  /** 小石の残り（状態機械が始めてよいか）。 */
  stones(): number;
}

export interface DOMRectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TouchInfo {
  active: boolean;
  stick: { x: number; y: number; run: boolean; down: boolean };
  aim: AimState;
  crouch: boolean;
  lookGain: number;
  /** いまの画面の高さでのスティックの半径 R（CSS px。stickRadius(innerHeight)）。 */
  stickRadius: number;
  zones: { stick: DOMRectLike; look: DOMRectLike };
  /**
   * タッチ層が受けた pointer イベント（down・move・up・cancel）の、指し手の種類ごとの回数（読み込み後の合計）。
   * window で数えるので、層の外で起きたものも含む。タッチだけの通しプレイ（tools/play.mjs --touch）で mouse が0かを確かめる。
   */
  events: { touch: number; mouse: number; pen: number };
}

type Track = { kind: 'stick'; ox: number; oy: number } | { kind: 'look' } | { kind: 'btn'; name: TouchButtonName; el: HTMLElement };

const KEY_OF: Partial<Record<TouchButtonName, string>> = { action: 'KeyE', attack: 'KeyF', crouch: 'KeyC' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function rectOf(e: HTMLElement): DOMRectLike {
  const r = e.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

export class TouchControls {
  readonly layer: HTMLElement;
  private readonly stickZone: HTMLElement;
  private readonly lookZone: HTMLElement;
  private readonly stickBase: HTMLElement;
  private readonly stickKnob: HTMLElement;
  private readonly stickHint: HTMLElement;
  private readonly buttons = new Map<TouchButtonName, HTMLButtonElement>();
  private readonly labels = new Map<TouchButtonName, HTMLElement>();
  private readonly stoneCount: HTMLElement;
  private readonly tracks = new Map<number, Track>();
  private readonly aim = new AimButton();
  private readonly look = new LookDrag();
  /** 小石ボタンを押している指の動きを、視点へも流す（A2 追加：ボタンの上で親指を動かして狙える）。 */
  private readonly stoneLook = new LookDrag();
  /** スティックと視点を、それぞれ一度でも動かしたか（遊び始めの操作のヒントを早めに消すため）。 */
  private usedStick = false;
  private usedLook = false;
  private active = false;
  private R: number = TOUCH.stick.radius;
  private running = false;
  private crouch = false;
  /** 最後に DOM へ書いた見た目の鍵（変わったときだけ書く）。 */
  private lastView = '';
  /** 受けた pointer イベントの種類ごとの回数（info().events）。 */
  private readonly events = { touch: 0, mouse: 0, pen: 0 };

  constructor(private readonly input: InputState, private readonly cb: TouchCallbacks) {
    this.layer = el('div', 'kg-touch-layer');
    this.layer.dataset.testid = 'touch-layer';
    this.lookZone = el('div', 'kg-touch-look-zone');
    this.lookZone.dataset.testid = 'touch-look-zone';
    this.stickZone = el('div', 'kg-touch-stick-zone');
    this.stickZone.dataset.testid = 'touch-stick-zone';

    // 指がないときの薄い目印（左下）
    this.stickHint = el('div', 'kg-stick-hint');
    this.stickHint.setAttribute('aria-hidden', 'true');
    this.stickHint.append(el('span', 'kg-stick-hint-text', '歩く'));
    // 触れた所に出るスティック：原点の輪（R）・外側の破線の輪（1.5R、縁に「走」）・つまみ
    this.stickBase = el('div', 'kg-stick');
    this.stickBase.dataset.testid = 'touch-stick';
    this.stickBase.setAttribute('aria-hidden', 'true');
    const runRing = el('div', 'kg-stick-run');
    runRing.append(el('span', 'kg-stick-run-label', '走'));
    this.stickKnob = el('div', 'kg-stick-knob');
    this.stickBase.append(runRing, el('div', 'kg-stick-ring'), this.stickKnob);
    this.stickZone.append(this.stickHint, this.stickBase);

    const pad = el('div', 'kg-touch-btns');
    const mk = (name: TouchButtonName, text: string, aria: string): HTMLButtonElement => {
      const b = el('button', `kg-tbtn kg-tbtn-${name}`);
      b.type = 'button';
      b.tabIndex = -1;
      b.dataset.testid = `touch-btn-${name === 'cancel' ? 'aim-cancel' : name}`;
      b.setAttribute('aria-label', aria);
      const label = el('span', 'kg-tbtn-label', text);
      b.append(label);
      this.buttons.set(name, b);
      this.labels.set(name, label);
      b.addEventListener('pointerdown', (e) => this.onButtonDown(e, name, b));
      // 押下はポインタで扱う。クリック（キーボードの決定など）は何もしない
      b.addEventListener('click', (e) => e.preventDefault());
      return b;
    };
    pad.append(
      mk('cancel', 'やめる', '小石をやめる'),
      mk('attack', '攻撃', '攻撃'),
      mk('stone', '小石', '小石'),
      mk('crouch', 'しゃがむ', 'しゃがむ'),
      mk('action', '当て身', '当て身・使う'),
    );
    this.stoneCount = el('span', 'kg-tbtn-count');
    this.buttons.get('stone')!.append(this.stoneCount);
    const pauseBtn = mk('pause', '', '一時停止');
    pauseBtn.replaceChildren(el('span', 'kg-tbtn-pause-bars'));
    this.layer.append(this.lookZone, this.stickZone, pad, pauseBtn);

    this.stickZone.addEventListener('pointerdown', (e) => this.onStickDown(e));
    this.lookZone.addEventListener('pointerdown', (e) => this.onLookDown(e));
    this.layer.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointermove', this.onMove, { passive: true });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancel);
    // 数えるだけ（捕捉の段階。層の部品が止めた伝播にも左右されない）。2026-11-03 4.3 追加
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const) window.addEventListener(type, this.countEvent, { capture: true, passive: true });
    this.setActive(false);
  }

  // ------------------------------------------------------------------ 状態

  isActive(): boolean {
    return this.active;
  }

  /** 遊ぶ画面のときだけ表示する。切るときは押下を全部解放し、スティックを 0、小石の状態機械を idle に戻す。 */
  setActive(on: boolean): void {
    if (!on) this.releaseAll();
    this.active = on;
    this.layer.classList.toggle('kg-on', on);
  }

  /** 押下を全部解放する（タッチ側だけ）。狙っていれば、投げずにやめる。 */
  releaseAll(): void {
    this.applyAim(this.aim.cancel());
    for (const [id, t] of this.tracks) this.endTrack(id, t, false);
    this.tracks.clear();
    this.running = false;
    this.input.releaseTouch();
    this.showStick(false);
    this.lastView = '';
  }

  /** スティックで歩いたか・視点をなぞったか（読み込み後の合計。やり直しでも戻さない）。 */
  usage(): { stick: boolean; look: boolean } {
    return { stick: this.usedStick, look: this.usedLook };
  }

  info(): TouchInfo {
    const s = this.input.stick();
    let stickDown = false;
    for (const t of this.tracks.values()) if (t.kind === 'stick') stickDown = true;
    return {
      active: this.active,
      stick: { x: s.x, y: s.y, run: s.run, down: stickDown },
      aim: this.aim.state,
      crouch: this.crouch,
      lookGain: TOUCH.look.gain,
      stickRadius: stickRadius(window.innerHeight),
      zones: { stick: rectOf(this.stickZone), look: rectOf(this.lookZone) },
      events: { ...this.events },
    };
  }

  /** 毎コマ：ボタンの文字と状態を、変わったときだけ書き直す。 */
  sync(st: GameStateOut): void {
    this.crouch = st.player.crouch;
    if (this.aim.state !== 'idle' && (st.player.stones <= 0 || st.screen !== 'play')) this.applyAim(this.aim.cancel());
    const p = st.player.prompt;
    // 文言は「当て身」（待機・背後で番兵を制圧できるとき）・「討つ」（信長の背後）・「使う」（板戸などの仕掛け）の3つ。案内の文と揃える（見た目の採点 第1周）
    const act = p === 'assassinate' ? '討つ' : p === 'takedown' ? '当て身' : st.mission.interaction ? '使う' : '当て身';
    const ready = p === 'assassinate' || p === 'takedown' || !!st.mission.interaction;
    const aimLabel = this.aim.state === 'hold' ? 'はなす' : this.aim.state === 'latched' ? '投げる' : '小石';
    const key = [act, ready, p === 'assassinate', st.player.crouch, st.player.stones, this.aim.state, aimLabel].join('|');
    if (key === this.lastView) return;
    this.lastView = key;
    const action = this.buttons.get('action')!;
    this.labels.get('action')!.textContent = act;
    action.classList.toggle('kg-ready', ready);
    action.classList.toggle('kg-kill', p === 'assassinate');
    action.classList.toggle('kg-dim', !ready);
    const crouch = this.buttons.get('crouch')!;
    this.labels.get('crouch')!.textContent = st.player.crouch ? '立つ' : 'しゃがむ';
    crouch.classList.toggle('kg-pressed', st.player.crouch);
    crouch.setAttribute('aria-pressed', String(st.player.crouch));
    crouch.setAttribute('aria-label', st.player.crouch ? '立つ' : 'しゃがむ');
    const stone = this.buttons.get('stone')!;
    this.labels.get('stone')!.textContent = aimLabel;
    this.stoneCount.textContent = String(st.player.stones);
    stone.classList.toggle('kg-dim', st.player.stones <= 0 && this.aim.state === 'idle');
    stone.classList.toggle('kg-aiming', this.aim.state !== 'idle');
    stone.setAttribute('aria-label', this.aim.state === 'idle' ? `小石（残り${st.player.stones}）` : aimLabel);
    this.buttons.get('cancel')!.classList.toggle('kg-on', this.aim.state === 'latched' || this.aim.state === 'hold');
  }

  // ------------------------------------------------------------------ 試験・評価の口（DOM を通さない）

  stickTo(x: number, y: number, run: boolean): void {
    this.input.injectStick(x, y, run);
  }

  lookBy(dx: number, dy: number): void {
    this.input.injectMotion(dx * TOUCH.look.gain, dy * TOUCH.look.gain);
  }

  press(name: TouchButtonName): void {
    this.pressButton(name, performance.now(), 0, 0);
  }

  release(name: TouchButtonName): void {
    this.releaseButton(name, performance.now(), undefined, undefined);
  }

  // ------------------------------------------------------------------ 指の扱い

  private readonly countEvent = (e: PointerEvent): void => {
    const k = e.pointerType;
    if (k === 'touch' || k === 'mouse' || k === 'pen') this.events[k]++;
  };

  private readonly onMove = (e: PointerEvent): void => {
    const t = this.tracks.get(e.pointerId);
    if (!t) return;
    if (t.kind === 'stick') this.updateStick(e.clientX - t.ox, e.clientY - t.oy);
    else if (t.kind === 'look') {
      const d = this.look.move(e.clientX, e.clientY);
      if (d.dx || d.dy) {
        this.usedLook = true;
        this.input.injectMotion(d.dx * TOUCH.look.gain, d.dy * TOUCH.look.gain);
      }
    } else if (t.name === 'stone') {
      // 押している間（hold）は、指の動きを視点へも流す（左右＝向き、上下＝投げる距離）。12px 以上動かして離せば投げる、は状態機械のまま
      const holding = this.aim.state === 'hold';
      this.aim.move(e.clientX, e.clientY);
      const d = this.stoneLook.move(e.clientX, e.clientY);
      if (holding && (d.dx || d.dy)) {
        this.usedLook = true;
        this.input.injectMotion(d.dx * TOUCH.look.gain, d.dy * TOUCH.look.gain);
      }
    }
  };

  private readonly onUp = (e: PointerEvent): void => {
    const t = this.tracks.get(e.pointerId);
    if (!t) return;
    this.tracks.delete(e.pointerId);
    this.endTrack(e.pointerId, t, true, e);
  };

  private readonly onCancel = (e: PointerEvent): void => {
    const t = this.tracks.get(e.pointerId);
    if (!t) return;
    this.tracks.delete(e.pointerId);
    // 取り消し（着信・端の操作など）は、押下を解放し、狙っていれば投げずにやめる
    if (t.kind === 'btn' && t.name === 'stone') this.applyAim(this.aim.cancel());
    this.endTrack(e.pointerId, t, false, e);
  };

  private capture(e: PointerEvent, target: HTMLElement): void {
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // 合成イベントや対応しない環境では捕まえられない。window のリスナで追うので問題ない
    }
  }

  private onStickDown(e: PointerEvent): void {
    if (!this.active) return;
    e.preventDefault();
    this.dropStale(e);
    for (const t of this.tracks.values()) if (t.kind === 'stick') return;
    this.R = stickRadius(window.innerHeight);
    const o = clampOrigin(e.clientX, e.clientY, this.R, window.innerWidth, window.innerHeight);
    this.tracks.set(e.pointerId, { kind: 'stick', ox: o.x, oy: o.y });
    this.capture(e, this.stickZone);
    this.running = false;
    const zr = this.stickZone.getBoundingClientRect();
    this.stickBase.style.setProperty('--sx', `${o.x - zr.left}px`);
    this.stickBase.style.setProperty('--sy', `${o.y - zr.top}px`);
    this.stickBase.style.setProperty('--r', `${this.R}px`);
    this.showStick(true);
    this.updateStick(e.clientX - o.x, e.clientY - o.y);
  }

  private onLookDown(e: PointerEvent): void {
    if (!this.active) return;
    e.preventDefault();
    this.dropStale(e);
    // 1本目の指だけが視点を持つ
    for (const t of this.tracks.values()) if (t.kind === 'look') return;
    this.tracks.set(e.pointerId, { kind: 'look' });
    this.capture(e, this.lookZone);
    this.look.start(e.clientX, e.clientY);
  }

  private onButtonDown(e: PointerEvent, name: TouchButtonName, b: HTMLElement): void {
    e.preventDefault();
    e.stopPropagation();
    if (!this.active) return;
    this.dropStale(e);
    if (this.tracks.has(e.pointerId)) return;
    // 同じボタンを2本目の指が押しても数えない（1本目を離したときに終わる。小石の視点の基準が飛ばないように）
    for (const t of this.tracks.values()) if (t.kind === 'btn' && t.name === name) return;
    this.tracks.set(e.pointerId, { kind: 'btn', name, el: b });
    this.capture(e, b);
    if (name === 'stone') this.stoneLook.start(e.clientX, e.clientY);
    this.pressButton(name, performance.now(), e.clientX, e.clientY);
  }

  private endTrack(_id: number, t: Track, normal: boolean, e?: PointerEvent): void {
    if (t.kind === 'stick') {
      this.running = false;
      this.input.injectStick(0, 0, false);
      this.showStick(false);
    } else if (t.kind === 'btn') {
      // 小石は、取り消し・一括の解放では状態機械の側（applyAim(cancel)）が終わらせる。押された見た目は、どの終わり方でも消す
      t.el.classList.remove('kg-down');
      if (normal && e) this.releaseButton(t.name, performance.now(), e.clientX, e.clientY);
      else if (t.name !== 'stone') this.releaseButton(t.name, performance.now(), undefined, undefined);
    }
  }

  /**
   * 画面に他の指が無い（touch の isPrimary）のに指の記録が残っていれば、pointerup も pointercancel も届かなかった取りこぼし。
   * 残したままだと、スティックも視点も次の指を受けなくなるので、捨ててから受ける。
   */
  private dropStale(e: PointerEvent): void {
    if (e.pointerType === 'touch' && e.isPrimary && this.tracks.size > 0) this.releaseAll();
  }

  private pressButton(name: TouchButtonName, t: number, x: number, y: number): void {
    const b = this.buttons.get(name);
    b?.classList.add('kg-down');
    const code = KEY_OF[name];
    if (code) this.input.touchKeyDown(code);
    else if (name === 'stone') this.applyAim(this.aim.press(t, x, y, this.cb.stones()));
    else if (name === 'cancel') this.applyAim(this.aim.cancel());
    else if (name === 'pause') this.cb.pause();
    this.lastView = '';
  }

  private releaseButton(name: TouchButtonName, t: number, x: number | undefined, y: number | undefined): void {
    this.buttons.get(name)?.classList.remove('kg-down');
    const code = KEY_OF[name];
    if (code) this.input.touchKeyUp(code);
    else if (name === 'stone') this.applyAim(this.aim.release(t, x, y));
    this.lastView = '';
  }

  private applyAim(fx: AimEffect): void {
    if (fx === 'down') this.input.touchKeyDown('KeyQ');
    else if (fx === 'up') this.input.touchKeyUp('KeyQ');
    else if (fx === 'cancel') {
      // 先に「やめる」を立ててから Q を離す（規則側は投げない）
      this.cb.cancelAim();
      this.input.touchKeyUp('KeyQ');
    }
    if (fx !== 'none') this.lastView = '';
  }

  private updateStick(dx: number, dy: number): void {
    const o = stickFromDrag(dx, dy, this.R, this.running);
    if (o.x || o.y) this.usedStick = true;
    this.running = o.run;
    this.input.injectStick(o.x, o.y, o.run);
    this.stickKnob.style.setProperty('--kx', `${o.knobX}px`);
    this.stickKnob.style.setProperty('--ky', `${o.knobY}px`);
    this.stickBase.classList.toggle('kg-run', o.run);
    this.stickKnob.textContent = o.run ? '走る' : '';
  }

  private showStick(on: boolean): void {
    this.stickBase.classList.toggle('kg-on', on);
    this.stickHint.classList.toggle('kg-off', on);
    if (!on) {
      this.stickBase.classList.remove('kg-run');
      this.stickKnob.textContent = '';
      this.stickKnob.style.setProperty('--kx', '0px');
      this.stickKnob.style.setProperty('--ky', '0px');
    }
  }
}

/** 画面いっぱいの案内（縦向き・描画の停止）。文と、必要ならボタン1つ。DOM は createElement と textContent だけで組む。 */
export function makeNotice(cls: string, testId: string, lines: string[], action?: { text: string; testId: string; onClick: () => void }): HTMLElement {
  const root = el('div', `kg-notice ${cls}`);
  root.dataset.testid = testId;
  root.setAttribute('role', 'alert');
  const box = el('div', 'kg-notice-box');
  lines.forEach((t, i) => box.append(el('p', i === 0 ? 'kg-notice-main' : 'kg-notice-sub', t)));
  if (action) {
    const b = el('button', 'kg-btn', action.text);
    b.type = 'button';
    b.dataset.testid = action.testId;
    onTap(b, () => action.onClick());
    box.append(b);
  }
  root.append(box);
  return root;
}
