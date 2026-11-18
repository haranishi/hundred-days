/**
 * スマホの操作：左半分は触れた所が中心になるスティック、右下に大きなアクションボタン（96px以上）、その上にダッシュとジャンプ（64px以上）。
 * Pointer Events で受ける（指でもマウスでも、試験の合成イベントでも同じに動く）。
 */
import type { ActionPrompt } from '../../shared/view';

export interface TouchState {
  moveX: number;
  moveZ: number;
  action: boolean;
  actionPressed: boolean;
  actionReleased: boolean;
  dash: boolean;
  jump: boolean;
}

const STICK_R = 56;
/** 指のぶれとみなす小ささ（半径に対する割合）。小さいほど早く動き出す */
const STICK_DEAD = 0.06;
/** 半径のこの割合まで倒せば全速（指をそこまで動かす時間を待たない） */
const STICK_FULL = 0.55;

/**
 * スティックの倒し具合（中心からの画素）→ 移動の向きと強さ（画面の上＝北＝moveZ が負）。
 * 不感帯を小さくし、半径の55%で全速にする：指を少し動かしただけで、キーと同じくらい早く動き出す（round3 の C5）
 */
export function stickVector(dx: number, dy: number, radius = STICK_R): { x: number; z: number } {
  const len = Math.hypot(dx, dy);
  const m = Math.min(1, len / radius);
  if (m < STICK_DEAD || len < 1e-6) return { x: 0, z: 0 };
  const mag = Math.min(1, (m - STICK_DEAD) / (STICK_FULL - STICK_DEAD));
  return { x: (dx / len) * mag, z: (dy / len) * mag };
}

export class TouchControls {
  readonly root: HTMLElement;
  private readonly stick: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly actionBtn: HTMLButtonElement;
  private readonly actionLabel: HTMLElement;
  private readonly actionSub: HTMLElement;
  private stickId: number | null = null;
  private center = { x: 0, y: 0 };
  private move = { x: 0, z: 0 };
  private actionDown = false;
  private pressed = false;
  private released = false;
  private dash = false;
  private jump = false;
  private lastLabel = '';
  /** 一度でも指で触ったか（以後はキーボードの案内より指の案内を出す） */
  used = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'syh-touch';
    this.root.innerHTML = `
      <div class="syh-stick-zone" data-testid="stick-zone"></div>
      <div class="syh-stick" aria-hidden="true"><div class="syh-stick-knob"></div></div>
      <button type="button" class="syh-btn syh-btn-jump" data-testid="btn-jump" aria-label="ジャンプ">ジャンプ</button>
      <button type="button" class="syh-btn syh-btn-dash" data-testid="btn-dash" aria-label="ダッシュ">ダッシュ</button>
      <button type="button" class="syh-btn syh-btn-action" data-testid="btn-action" aria-label="アクション"><span class="syh-act-label">蹴る</span><span class="syh-act-sub"></span></button>`;
    parent.appendChild(this.root);
    this.stick = this.root.querySelector('.syh-stick')!;
    this.knob = this.root.querySelector('.syh-stick-knob')!;
    this.actionBtn = this.root.querySelector('.syh-btn-action')!;
    this.actionLabel = this.root.querySelector('.syh-act-label')!;
    this.actionSub = this.root.querySelector('.syh-act-sub')!;
    const zone = this.root.querySelector<HTMLElement>('.syh-stick-zone')!;
    zone.addEventListener('pointerdown', (e) => this.stickDown(e));
    zone.addEventListener('pointermove', (e) => this.stickMove(e));
    zone.addEventListener('pointerup', (e) => this.stickUp(e));
    zone.addEventListener('pointercancel', (e) => this.stickUp(e));
    this.button(this.actionBtn, () => {
      this.actionDown = true;
      this.pressed = true;
    }, () => {
      this.actionDown = false;
      this.released = true;
    });
    this.button(this.root.querySelector('.syh-btn-dash')!, () => (this.dash = true));
    this.button(this.root.querySelector('.syh-btn-jump')!, () => (this.jump = true));
    // 画面の拡大・選択・長押しのメニューを出さない
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private button(el: HTMLElement, down: () => void, up?: () => void): void {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.used = this.used || e.pointerType === 'touch';
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // 合成イベントでは捕まえられないことがある
      }
      el.classList.add('is-down');
      down();
    });
    const release = (): void => {
      el.classList.remove('is-down');
      up?.();
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  }

  private stickDown(e: PointerEvent): void {
    if (this.stickId !== null) return;
    e.preventDefault();
    this.used = this.used || e.pointerType === 'touch';
    this.stickId = e.pointerId;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // 合成イベントでは捕まえられないことがある
    }
    this.center = { x: e.clientX, y: e.clientY };
    this.stick.style.transform = `translate(${e.clientX - 60}px, ${e.clientY - 60}px)`;
    this.stick.classList.add('is-on');
    this.knob.style.transform = 'translate(0px, 0px)';
    this.move = { x: 0, z: 0 };
  }

  private stickMove(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    let dx = e.clientX - this.center.x;
    let dy = e.clientY - this.center.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_R) {
      dx = (dx / len) * STICK_R;
      dy = (dy / len) * STICK_R;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.move = stickVector(dx, dy);
  }

  private stickUp(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    this.stickId = null;
    this.move = { x: 0, z: 0 };
    this.stick.classList.remove('is-on');
  }

  /** ボタンの文字（近くにある物で変わる） */
  setPrompt(p: ActionPrompt | null): void {
    // 長い案内（「皮を置く（あと1枚）」）は、ボタンには前半だけ出し、残りを小さく添える
    const full = p?.label ?? '蹴る';
    const m = /^(.*?)（(.*)）$/.exec(full);
    const label = m ? m[1]! : full;
    const timed = p && (p.misdeed === 'freezer' || p.misdeed === 'tantrum') && p.progress !== undefined;
    const sub = timed ? `${(p.progress! * 3).toFixed(1)}秒` : m ? m[2]! : p?.press === 'mash' ? '連打！' : p?.press === 'hold' ? '長押し' : '';
    const prog = p && p.progress !== undefined && (p.press === 'hold' || timed) ? Math.round(p.progress * 100) : -1;
    const key = `${label}|${sub}|${prog}`;
    if (key === this.lastLabel) return;
    this.lastLabel = key;
    this.actionLabel.textContent = label;
    this.actionSub.textContent = sub;
    this.actionBtn.classList.toggle('is-special', !!p);
    this.actionBtn.classList.toggle('is-progress', prog > 0);
    this.actionBtn.style.setProperty('--p', String(Math.max(0, prog)));
  }

  read(): TouchState {
    const out: TouchState = { moveX: this.move.x, moveZ: this.move.z, action: this.actionDown, actionPressed: this.pressed, actionReleased: this.released, dash: this.dash, jump: this.jump };
    this.pressed = false;
    this.released = false;
    this.dash = false;
    this.jump = false;
    return out;
  }

  reset(): void {
    this.stickId = null;
    this.move = { x: 0, z: 0 };
    this.actionDown = false;
    this.stick.classList.remove('is-on');
  }
}
