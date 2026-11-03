// OWNER: core
// HTML と CSS の重ね：タイトル・ステージ選択・説明・HUD・一時停止・討たれた・結果・討ち取り演出の重ね。
// 文字はヒラギノ明朝。小さいキーの表記（W A S D・Shift・E など）だけヒラギノ角ゴ（外のフォントは読み込まない）。色は墨黒・朱・金・生成り。
// r02-fix-play: レーダーの下に信長までの距離、説明の画面に見取り図、発見に入ったとき一度だけの逃げ方の案内を足した。
// r03-fix-play: 発見中に誰にも見られていない間は、帯を墨と金に変えて「見られていない　残り N 秒」と出す。
// 2026-11-03 スマホ対応（tasks 3.2）：setTouchMode(true) で、画面の文からキー名を消し（ボタンの見出し・操作の一覧・ステージの文）、
//   一時停止に音の入切と画質の表示、縦向きの注記、遊び始めの操作のヒントを足す。タッチでないときは、見える画面と文を変えない（見えない要素と class を足すだけ）。
//   HUD の置き場所は touch.css（.kg-touch 配下）が決める。
import './style.css';
import { FINALE } from '../config/rules';
import type { SimSnapshot } from '../contract/snapshot';
import type { ResultInfo } from '../game/game';
import type { GameStateOut, Screen } from '../game/state';
import type { DetectRecord } from '../sim/types';
import { STAGE_LIST } from '../stage';
import type { StageDef } from '../stage/types';
import { Radar } from './radar';
import { drawStageMap } from './stageMap';
import { onTap } from './tap';
import {
  AIM_HINT,
  AIM_HINT_TOUCH,
  ALERT_TIP,
  CONTROLS,
  CONTROLS_TOUCH,
  HUD_KEYS,
  MISSION_HELP,
  MISSION_HELP_TOUCH,
  PHASE_LABEL,
  PORTRAIT_NOTE,
  RANK_TEXT,
  TIER_LABEL,
  TOUCH_HINT_LINES,
  WATCH_LABEL,
  captureText,
  causeText,
  formatTime,
  hintText,
  promptText,
  touchWording,
} from './text';

export interface UiHandlers {
  start(): void;
  selectStage(id: string): void;
  begin(): void;
  resume(): void;
  restart(): void;
  toSelect(): void;
  toTitle(): void;
  /** 一時停止の「音」ボタン（タッチのときだけ出る）。 */
  toggleMute?(): void;
  muted?(): boolean;
  /** 一時停止に小さく出す画質の名前（タッチのときだけ出る）。 */
  qualityLabel?(): string;
}

/** 「クリックで視点をつかむ」を出しておく秒数（ゲーム内）。 */
const LOCK_HINT_SECONDS = 6;
/** 発見に入ったときの逃げ方の案内を出しておく秒数（実時間）。r02-fix-play 追加 */
const ALERT_TIP_SECONDS = 6;
/** 説明の画面の見取り図の大きさ（CSS の px）。ステージの外周（88m×76m）の縦横の比に合わせる */
const MAP_SIZE = { width: 232, height: 201 };
/** 遊び始めの操作のヒント（タッチ）を出しておく時間（ms）。最後の 1 秒で消える（CSS の移り変わり）ので、出てから 8 秒以内に消える。 */
const TOUCH_HINT_MS = 6800;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * 文を句ごとの箱（.kg-ph。タッチのとき inline-block）に分ける。狭い所で語の途中で折り返さないように。
 * 全角の空白で区切った所だけ、箱の間に空き（.kg-ph-gap）を入れる（「。」「、」「／」「・」の後と「（」の前は詰める）。
 */
function phraseSpans(text: string): HTMLElement[] {
  const out: HTMLElement[] = [];
  let gap = false;
  for (const part of text.split(/(　+)|(?<=[／。、・])|(?=（)/)) {
    if (part === undefined || part === '') continue;
    if (/^　+$/.test(part)) {
      gap = true;
      continue;
    }
    out.push(el('span', gap && out.length > 0 ? 'kg-ph kg-ph-gap' : 'kg-ph', part));
    gap = false;
  }
  return out;
}

function phraseLine(text: string, cls = ''): HTMLElement {
  const line = el('div', cls);
  line.append(...phraseSpans(text));
  return line;
}

function button(text: string, testId: string, onClick: () => void, cls = 'kg-btn'): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  b.dataset.testid = testId;
  onTap(b, (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

export class Ui {
  private readonly root: HTMLElement;
  private readonly screens = new Map<string, HTMLElement>();
  private readonly hud: HTMLElement;
  private readonly radar: Radar;
  private readonly hudTime: HTMLElement;
  private readonly hudMission: HTMLElement;
  private readonly hudMissionHint: HTMLElement;
  private readonly hudMissionMessage: HTMLElement;
  private readonly hudPhase: HTMLElement;
  private readonly hudPhaseName: HTMLElement;
  private readonly hudPhaseLeft: HTMLElement;
  private readonly hudStance: HTMLElement;
  private readonly hudMeterMark: HTMLElement;
  private readonly hudTier: HTMLElement;
  private readonly hudStones: HTMLElement;
  private readonly hudPrompt: HTMLElement;
  private readonly hudAim: HTMLElement;
  private readonly lockHint: HTMLElement;
  private readonly finale: HTMLElement;
  private readonly finaleSub: HTMLElement;
  private readonly finaleTitle: HTMLElement;
  private readonly gameoverBody: HTMLElement;
  private readonly resultBody: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly hudTarget: HTMLElement;
  private readonly alertTip: HTMLElement;
  private toastUntil = 0;
  private alertTipUntil = 0;
  /** この試み（R で始め直すまで）で、逃げ方の案内をもう出したか。 */
  private alertTipShown = false;
  private lastKey = '';
  private lastTargetM = -1;
  /** 明るさの目盛りの3つの欄（闇・薄明・灯り）。いまの段に kg-active を付ける（タッチのCSSが濃淡で示す。見た目の採点 第1周）。 */
  private readonly hudMeterSegs = new Map<string, HTMLElement>();
  private lastLightTier = '';
  // ---- タッチ（2026-11-03）
  private touch = false;
  /** キー名を含みうる文の要素と、元の（キーボードの）文。タッチに切り替えたら言い換える。 */
  private readonly keyed: { el: HTMLElement; text: string; touchText?: string; phrase: boolean }[] = [];
  private controlsDl: HTMLElement | null = null;
  private titleBox: HTMLElement | null = null;
  private selectScreen: HTMLElement | null = null;
  private briefBox: HTMLElement | null = null;
  private pausePanel: HTMLElement | null = null;
  private muteBtn: HTMLButtonElement | null = null;
  private qualityLine: HTMLElement | null = null;
  private readonly touchHint: HTMLElement;
  /** 遊び始めの操作のヒント：まだ出していない → 出している（until まで）→ 出し終えた（やり直しでは出さない）。 */
  private touchHintState: 'pending' | 'showing' | 'done' = 'pending';
  private touchHintUntil = 0;
  private lastAimKey = '';
  private lastPrompt = '';
  /** 描画の準備（シェーダーの先作り）が終わったか。操作のヒントは、絵が出てから数え始める。 */
  private viewReady = false;

  constructor(root: HTMLElement, stage: StageDef, private readonly h: UiHandlers) {
    this.root = root;
    root.classList.add('kg-ui');
    root.replaceChildren();
    this.screens.set('title', this.buildTitle(stage));
    this.screens.set('select', this.buildSelect());
    this.screens.set('briefing', this.buildBriefing(stage));
    this.screens.set('pause', this.buildPause());
    const go = this.buildGameover();
    this.screens.set('gameover', go.screen);
    this.gameoverBody = go.body;
    const rs = this.buildResult(stage);
    this.screens.set('result', rs.screen);
    this.resultBody = rs.body;

    // HUD（DESIGN.md の骨格どおり）
    this.hud = el('div', 'kg-hud');
    this.hud.dataset.testid = 'hud';
    const tl = el('div', 'kg-hud-tl');
    tl.append(el('div', 'kg-objective', stage.meta.objective ?? '敵将を討て'));
    tl.append(el('div', 'kg-objective-detail', `${stage.meta.mission.destination}へ。背後に近づいて E`), el('div', 'kg-objective-clear', MISSION_HELP.hudClear));
    // 遊び始めの操作のヒント（タッチのときだけ。touch.css で置き場所を決める）
    this.touchHint = el('div', 'kg-touchhint');
    this.touchHint.dataset.testid = 'touch-hint';
    for (const line of TOUCH_HINT_LINES) this.touchHint.append(phraseLine(line));
    this.hudTime = el('div', 'kg-time', '0:00');
    this.hudMission = el('div', 'kg-mission-stage');
    this.hudMission.dataset.testid = 'mission-stage';
    this.hudMissionHint = el('div', 'kg-mission-hint');
    this.hudMissionMessage = el('div', 'kg-mission-message');
    this.hudMissionMessage.dataset.testid = 'mission-message';
    tl.append(this.hudMission, this.hudMissionHint, this.hudMissionMessage);
    tl.append(this.hudTime);
    this.radar = new Radar(stage);
    const tr = el('div', 'kg-hud-tr');
    // レーダーの下の添え書き：朱の三角＝信長の方角、と距離
    this.hudTarget = el('div', 'kg-radar-cap');
    this.hudTarget.dataset.testid = 'radar-target';
    tr.append(this.radar.canvas, this.hudTarget);
    this.hudPhase = el('div', 'kg-hud-tc kg-phase');
    this.hudPhaseName = el('span', 'kg-phase-name');
    this.hudPhaseLeft = el('span', 'kg-phase-left');
    this.hudPhase.append(this.hudPhaseName, this.hudPhaseLeft);
    this.alertTip = el('div', 'kg-alert-tip', ALERT_TIP);
    this.alertTip.dataset.testid = 'alert-tip';
    const bl = el('div', 'kg-hud-bl');
    this.hudStance = el('div', 'kg-stance', '立つ');
    const meter = el('div', 'kg-meter');
    const bar = el('div', 'kg-meter-bar');
    for (const [cls, label] of [['dark', '闇'], ['dim', '薄明'], ['lit', '灯り']] as const) {
      const seg = el('div', `kg-meter-seg kg-${cls}`);
      seg.append(el('span', '', label));
      this.hudMeterSegs.set(cls, seg);
      bar.append(seg);
    }
    this.hudMeterMark = el('div', 'kg-meter-mark');
    bar.append(this.hudMeterMark);
    this.hudTier = el('div', 'kg-tier', '闇');
    meter.append(el('div', 'kg-meter-label', '明るさ'), bar);
    bl.append(this.hudStance, meter, this.hudTier);
    const br = el('div', 'kg-hud-br');
    this.hudStones = el('div', 'kg-stones');
    const keys = el('div', 'kg-keys');
    for (const [k, v] of HUD_KEYS) keys.append(el('span', 'kg-key', k), el('span', 'kg-keydesc', v));
    br.append(this.hudStones, keys);
    const bc = el('div', 'kg-hud-bc');
    this.hudPrompt = el('div', 'kg-prompt');
    this.hudAim = el('div', 'kg-aimhint', '離して投げる');
    bc.append(this.hudPrompt, this.hudAim);
    this.toast = el('div', 'kg-toast');
    this.lockHint = el('div', 'kg-lockhint', 'クリックで視点をつかむ（マウスで見回す）');
    this.hud.append(tl, tr, this.hudPhase, this.alertTip, bl, br, bc, this.toast, this.lockHint, this.touchHint);

    // 討ち取り演出の重ね
    this.finale = el('div', 'kg-finale');
    this.finale.dataset.testid = 'finale';
    this.finaleSub = el('div', 'kg-finale-sub', '……是非に及ばず');
    this.finaleTitle = el('div', 'kg-finale-title');
    this.finaleTitle.append(el('div', 'kg-finale-main', '本能寺の変'), el('div', 'kg-finale-date', '天正十年六月二日'));
    this.finale.append(el('div', 'kg-bar kg-bar-top'), el('div', 'kg-bar kg-bar-bottom'), this.finaleSub, this.finaleTitle);

    root.append(...this.screens.values(), this.hud, this.finale);
  }

  // ------------------------------------------------------------------ 画面を作る

  private screen(name: string, cls: string): HTMLElement {
    const s = el('div', `kg-screen ${cls}`);
    s.dataset.testid = `screen-${name}`;
    return s;
  }

  private buildTitle(stage: StageDef): HTMLElement {
    const s = this.screen('title', 'kg-title');
    const box = el('div', 'kg-title-box');
    box.append(
      this.ph(el('div', 'kg-title-sub', '歴史の転換点に忍び込み、名のある武将をひそかに討つ')),
      el('h1', 'kg-logo', '影討ち'),
      el('div', 'kg-title-en', 'KAGEUCHI'),
      this.ph(el('div', 'kg-title-goal', stage.meta.mission.goal)),
      button('はじめる', 'btn-start', () => this.h.start()),
      el('div', 'kg-hint kg-keyhint', 'Enter でも進める'),
    );
    this.titleBox = box;
    s.append(box);
    return s;
  }

  private buildSelect(): HTMLElement {
    const s = this.screen('select', 'kg-select');
    s.append(el('h2', 'kg-h2', '戦場を選ぶ'), el('div', 'kg-sub', '年表の順。いま遊べるのは本能寺の変'));
    const cards = el('div', 'kg-cards');
    for (const m of STAGE_LIST) {
      const c = el('button', `kg-card${m.playable ? '' : ' kg-soon'}`);
      c.type = 'button';
      c.dataset.testid = `stage-${m.id}`;
      c.disabled = !m.playable;
      const rule = el('div', 'kg-card-rule');
      rule.append(this.ph(el('div', 'kg-card-rulename', `隠れ方　${m.rule.name}`)), this.ph(el('div', 'kg-card-ruletext', m.rule.text)));
      const mission = el('div', 'kg-card-mission');
      mission.append(
        this.ph(el('div', 'kg-card-objective', m.objective)),
        this.ph(el('div', 'kg-card-role', `操作する人物　${m.mission.player}`)),
        this.ph(el('div', 'kg-card-route', `目指す場所　${m.mission.destination}`)),
        this.ph(el('div', 'kg-card-clear', `クリア条件${m.playable ? '' : '（予定）'}　${m.mission.clearCondition}`)),
      );
      c.append(el('div', 'kg-card-era', m.era), el('div', 'kg-card-name', m.title), el('div', 'kg-card-place', m.place), mission, rule);
      if (!m.playable) c.append(el('div', 'kg-card-badge', '準備中'));
      else c.append(el('div', 'kg-card-badge kg-go', '選ぶ'));
      onTap(c, (e) => {
        e.stopPropagation();
        if (m.playable) this.h.selectStage(m.id);
      });
      cards.append(c);
    }
    s.append(cards, button('タイトルへ', 'btn-to-title', () => this.h.toTitle(), 'kg-btn kg-btn-ghost'));
    this.selectScreen = s;
    return s;
  }

  private buildBriefing(stage: StageDef): HTMLElement {
    const s = this.screen('briefing', 'kg-briefing');
    const m = stage.meta;
    const box = el('div', 'kg-brief-box');
    box.append(el('div', 'kg-brief-date', `${m.dateText}　${m.place}`), el('h1', 'kg-brief-tagline', m.tagline ?? m.title), el('div', 'kg-brief-objective', `目的　${m.objective ?? ''}`));
    const body = el('div', 'kg-brief-body');
    body.append(this.ph(el('p', 'kg-brief-role', `あなたは${m.mission.player}。狙うのは、${m.mission.destination}にいる${m.mission.target}。`)));
    for (const p of m.briefing ?? []) body.append(this.ph(el('p', '', p)));
    const mission = el('section', 'kg-mission');
    mission.setAttribute('aria-label', 'クリアまでの流れ');
    mission.append(el('h3', '', 'クリアまでの流れ'));
    const steps = el('ol', 'kg-mission-steps');
    for (const [name, detail] of m.mission.steps) {
      const li = el('li');
      li.append(this.k(el('strong', '', name)), this.k(el('span', '', detail), undefined, true));
      steps.append(li);
    }
    mission.append(
      steps,
      this.k(el('p', 'kg-mission-clear', m.mission.clearCondition), undefined, true),
      this.k(el('p', 'kg-mission-note', MISSION_HELP.rating), undefined, true),
      this.k(el('p', 'kg-mission-note', MISSION_HELP.retry), MISSION_HELP_TOUCH.retry, true),
    );
    const cols = el('div', 'kg-brief-cols');
    const scout = el('section', 'kg-brief-scout');
    scout.append(el('h3', '', '物見の報告'));
    const row = el('div', 'kg-scout-row');
    const ul = el('ul');
    // 「場所　説明。説明。」を、場所（金。見取り図の名前と同じ）と一文ずつの行に組む（語の途中で折り返さないように）
    for (const r of m.scoutReport ?? []) {
      const li = el('li');
      const cut = r.indexOf('　');
      if (cut > 0) li.append(el('span', 'kg-scout-place', r.slice(0, cut)));
      for (const line of r.slice(cut + 1).split(/(?<=。)/)) if (line) li.append(this.k(el('span', 'kg-scout-line', line), undefined, true));
      ul.append(li);
    }
    // 見取り図（上が北）：塀・入り口・信長・開始地点をステージのデータから描く
    const fig = el('figure', 'kg-brief-map');
    const map = el('canvas');
    map.dataset.testid = 'brief-map';
    map.setAttribute('role', 'img');
    map.setAttribute('aria-label', '本能寺の見取り図。上が北。入り口は表門・裏門・水抜き穴、信長は奥の庭');
    drawStageMap(map, stage, MAP_SIZE.width, MAP_SIZE.height);
    fig.append(map, el('figcaption', '', '見取り図（上が北）'));
    row.append(ul, fig);
    scout.append(row);
    const ctl = el('section', 'kg-brief-controls');
    ctl.append(el('h3', '', '操作'));
    const dl = el('dl');
    for (const [k, v] of CONTROLS) dl.append(el('dt', 'kg-key', k), el('dd', '', v));
    ctl.append(dl);
    this.controlsDl = dl;
    cols.append(scout, ctl);
    box.append(body, mission, cols, this.k(button('出陣する（Enter）', 'btn-begin', () => this.h.begin()), '出陣する'));
    this.briefBox = box;
    s.append(box);
    return s;
  }

  private buildPause(): HTMLElement {
    const s = this.screen('pause', 'kg-pause');
    const box = el('div', 'kg-panel');
    box.append(
      el('h2', 'kg-h2', '一時停止'),
      this.k(button('再開する（Esc）', 'btn-resume', () => this.h.resume()), '再開する'),
      this.k(button('はじめからやり直す（R）', 'btn-restart', () => this.h.restart(), 'kg-btn kg-btn-ghost'), 'はじめからやり直す'),
      button('ステージ選択へ', 'btn-to-select', () => this.h.toSelect(), 'kg-btn kg-btn-ghost'),
    );
    this.pausePanel = box;
    s.append(box);
    return s;
  }

  private buildGameover(): { screen: HTMLElement; body: HTMLElement } {
    const s = this.screen('gameover', 'kg-gameover');
    const box = el('div', 'kg-panel kg-panel-wide');
    const body = el('div', 'kg-go-body');
    box.append(
      el('h1', 'kg-go-title', '討たれた'),
      body,
      this.k(button('やり直す（R）', 'btn-retry', () => this.h.restart()), 'やり直す'),
      button('ステージ選択へ', 'btn-go-select', () => this.h.toSelect(), 'kg-btn kg-btn-ghost'),
    );
    s.append(box);
    return { screen: s, body };
  }

  private buildResult(stage: StageDef): { screen: HTMLElement; body: HTMLElement } {
    const s = this.screen('result', 'kg-result');
    const box = el('div', 'kg-panel kg-panel-wide');
    const body = el('div', 'kg-rs-body');
    box.append(
      el('div', 'kg-rs-head', `${stage.meta.title}　${stage.meta.dateText}`),
      el('div', 'kg-mission-complete', `任務達成　${stage.meta.mission.completion}`),
      body,
      this.k(button('もう一度（R）', 'btn-again', () => this.h.restart()), 'もう一度'),
      button('ステージ選択へ', 'btn-rs-select', () => this.h.toSelect(), 'kg-btn kg-btn-ghost'),
    );
    s.append(box);
    return { screen: s, body };
  }

  /** キー名を含みうる文を覚える（タッチに切り替えたら、touchText か touchWording(元の文) に差し替える）。 */
  private k<T extends HTMLElement>(e: T, touchText?: string, phrase = false): T {
    this.keyed.push({ el: e, text: e.textContent ?? '', touchText, phrase });
    return e;
  }

  /** 長い文：タッチのとき句ごとの箱に分けて、狭い画面で語の途中で折り返さないようにする（キー名の言い換えもする）。 */
  private ph<T extends HTMLElement>(e: T): T {
    return this.k(e, undefined, true);
  }

  /**
   * タッチの文言と、タッチだけの部品（一時停止の音と画質・縦向きの注記）。一度入れたら戻さない（main.ts の方針と同じ）。
   * on が偽のときは何もしない（キーボードの文と DOM は変更前のまま）。
   */
  setTouchMode(on: boolean): void {
    if (!on || this.touch) return;
    this.touch = true;
    for (const k of this.keyed) {
      const t = k.touchText ?? touchWording(k.text);
      if (k.phrase) k.el.replaceChildren(...phraseSpans(t));
      else k.el.textContent = t;
    }
    // 逃げ方の案内も句に分ける
    this.alertTip.replaceChildren(...phraseSpans(ALERT_TIP));
    if (this.controlsDl) {
      this.controlsDl.replaceChildren();
      for (const [k, v] of CONTROLS_TOUCH) {
        const dd = el('dd');
        dd.append(...phraseSpans(v));
        this.controlsDl.append(el('dt', 'kg-key kg-touch-key', k), dd);
      }
    }
    // 縦向きのときだけ見える注記（touch.css の orientation で出し分ける）
    const note = (): HTMLElement => {
      const n = el('div', 'kg-portrait-note', PORTRAIT_NOTE);
      n.dataset.testid = 'portrait-note';
      return n;
    };
    this.titleBox?.append(note());
    this.selectScreen?.querySelector('.kg-h2')?.after(note());
    this.briefBox?.prepend(note());
    // 一時停止：音の入切と画質
    if (this.pausePanel) {
      this.muteBtn = button('', 'btn-mute', () => {
        this.h.toggleMute?.();
        this.refreshPause();
      }, 'kg-btn kg-btn-ghost kg-btn-mute');
      this.qualityLine = el('div', 'kg-quality');
      this.qualityLine.dataset.testid = 'quality-label';
      this.pausePanel.append(this.muteBtn, this.qualityLine);
      this.refreshPause();
    }
    this.lastAimKey = '';
  }

  isTouch(): boolean {
    return this.touch;
  }

  /** 一時停止の「音」と「画質」の文を今の状態に合わせる。 */
  private refreshPause(): void {
    if (this.muteBtn) {
      const muted = this.h.muted?.() ?? false;
      this.muteBtn.textContent = muted ? '音：切　（押すと入）' : '音：入　（押すと切）';
      this.muteBtn.setAttribute('aria-pressed', String(!muted));
    }
    if (this.qualityLine) this.qualityLine.textContent = `画質　${this.h.qualityLabel?.() ?? ''}`;
  }

  /** 描画の準備が終わった（main.ts が呼ぶ）。 */
  markViewReady(): void {
    this.viewReady = true;
  }

  /** 遊び始めの操作のヒントを、指で歩いて見回したら早めに消す。 */
  dismissTouchHint(now: number): void {
    if (this.touchHintState === 'showing') this.touchHintUntil = Math.min(this.touchHintUntil, now);
  }

  // ------------------------------------------------------------------ 切り替え

  /** 新しい試みを始めた（R・出陣）。逃げ方の案内をまた一度だけ出せるようにする。 */
  resetAttempt(): void {
    this.alertTipShown = false;
    this.alertTipUntil = 0;
    this.alertTip.classList.remove('kg-on');
  }

  /** 発見に入った：この試みでまだなら、帯の下に逃げ方の案内を一度だけ出す。 */
  showAlertTip(now: number): void {
    if (this.alertTipShown) return;
    this.alertTipShown = true;
    this.alertTipUntil = now + ALERT_TIP_SECONDS * 1000;
  }

  setScreen(screen: Screen): void {
    for (const [name, s] of this.screens) s.classList.toggle('kg-on', name === screen);
    const inPlay = screen === 'play' || screen === 'pause';
    this.hud.classList.toggle('kg-on', inPlay);
    this.finale.classList.toggle('kg-on', screen === 'finale');
    this.root.dataset.screen = screen;
    if (screen === 'pause') this.refreshPause();
    // タッチ：低い画面では遊べる札が下に隠れるので、選択に入ったら見える所までスクロールする
    if (screen === 'select' && this.touch) this.selectScreen?.querySelector('.kg-card:not(:disabled)')?.scrollIntoView({ block: 'nearest' });
  }

  showGameover(capture: DetectRecord | null, first: DetectRecord | null): void {
    const b = this.gameoverBody;
    b.replaceChildren();
    // タッチのときは句ごとの箱に分ける（568px の画面で「立ち止まっ／ていた」と語の途中で折り返さないように）。キーボードの文と DOM は今まで通り
    const line = (cls: string, text: string): HTMLElement => {
      const p = el('p', cls);
      if (this.touch) p.append(...phraseSpans(text));
      else p.textContent = text;
      return p;
    };
    if (first) b.append(line('kg-go-cause', causeText(first)));
    if (capture && capture.cause !== 'debug') b.append(line('kg-go-capture', captureText(capture)));
    else if (capture) b.append(line('kg-go-capture', causeText(capture)));
    b.append(line('kg-go-hint', hintText(first)));
  }

  showResult(r: ResultInfo): void {
    const b = this.resultBody;
    b.replaceChildren();
    const rank = el('div', 'kg-rank');
    const phrase = el('div', 'kg-rank-text');
    // 一言は「。」で行を分ける（語の途中で折り返さないように）
    // タッチのときは、さらに「、」で句に分ける（低い横画面で、長い一言が「、」の所で折り返せるように）
    for (const line of RANK_TEXT[r.rank].split(/(?<=。)/)) {
      if (!line) continue;
      const row = el('div');
      if (this.touch) row.append(...phraseSpans(line));
      else row.textContent = line;
      phrase.append(row);
    }
    rank.append(el('div', 'kg-rank-char', r.rank), phrase);
    const stats = el('dl', 'kg-rs-stats');
    const rows: [string, string][] = [
      ['時間', formatTime(r.time)],
      ['発見', `${r.discoveries} 回`],
      ['当て身', `${r.takedowns} 回`],
      ['小石', `${r.stonesUsed} 個`],
    ];
    for (const [k, v] of rows) stats.append(el('dt', '', k), el('dd', '', v));
    b.append(rank, stats);
  }

  /** 演出の進み 0→1：上下の黒帯、字幕「……是非に及ばず」、題字。 */
  updateFinale(f: number): void {
    const bars = Math.min(1, f / FINALE.barsIn);
    this.finale.style.setProperty('--bars', String(bars));
    const subIn = Math.min(1, Math.max(0, (f - FINALE.subtitleFrom) / 0.05));
    const subOut = Math.min(1, Math.max(0, (FINALE.subtitleTo - f) / 0.05));
    this.finaleSub.style.opacity = String(Math.min(subIn, subOut));
    const titleIn = Math.min(1, Math.max(0, (f - FINALE.titleFrom) / 0.12));
    this.finaleTitle.style.opacity = String(titleIn);
  }

  /** HUD を毎コマ合わせる。 */
  updateHud(st: GameStateOut, snap: SimSnapshot, camYaw: number, pointerLocked: boolean, now: number): void {
    this.hudMission.textContent = `${st.mission.step} / 4　${st.mission.label}`;
    this.hudMissionHint.textContent = this.touch ? touchWording(st.mission.hint) : st.mission.hint;
    this.hudMissionMessage.textContent = st.mission.message;
    this.hudTime.textContent = formatTime(st.t);
    const phaseName = PHASE_LABEL[st.phase];
    this.hudPhase.classList.toggle('kg-hidden', !phaseName);
    this.hudPhase.dataset.phase = st.phase;
    this.hudPhaseName.textContent = phaseName;
    // 発見中は、見られている間（残りの秒が止まる）と誰にも見られていない間（減る）で帯の色と添え書きを変える（r03-fix-play：体験の採点 1 位）
    const watch = st.phase === 'alert' ? (st.alertUnseen > 0 ? 'unseen' : 'seen') : '';
    if (watch) this.hudPhase.dataset.watch = watch;
    else delete this.hudPhase.dataset.watch;
    const left = `残り ${Math.ceil(st.phaseLeft)} 秒`;
    this.hudPhaseLeft.textContent = !phaseName ? '' : watch === 'seen' ? WATCH_LABEL.seen : watch === 'unseen' ? `${WATCH_LABEL.unseen}　${left}` : left;
    const stance = st.player.crouch ? 'しゃがむ' : st.player.stance === 'run' ? '走る' : '立つ';
    this.hudStance.textContent = stance;
    this.hudStance.dataset.stance = st.player.crouch ? 'crouch' : st.player.stance;
    this.hudMeterMark.style.left = `${Math.min(100, Math.max(0, st.player.light * 100))}%`;
    this.hudTier.textContent = TIER_LABEL[st.player.lightTier];
    this.hudTier.dataset.tier = st.player.lightTier;
    if (st.player.lightTier !== this.lastLightTier) {
      this.lastLightTier = st.player.lightTier;
      for (const [tier, seg] of this.hudMeterSegs) seg.classList.toggle('kg-active', tier === st.player.lightTier);
    }
    const key = `${st.player.stones}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.hudStones.replaceChildren(el('span', 'kg-stones-label', '小石'));
      for (let i = 0; i < 5; i++) this.hudStones.append(el('span', `kg-stone${i < st.player.stones ? ' kg-have' : ''}`));
    }
    const prompt = promptText(st, this.touch);
    if (!this.touch) this.hudPrompt.textContent = prompt;
    else if (prompt !== this.lastPrompt) {
      // タッチ：句ごとの箱に分ける（狭い帯で語の途中で折り返さない）。変わったときだけ組み直す
      this.lastPrompt = prompt;
      this.hudPrompt.replaceChildren(...phraseSpans(prompt));
    }
    this.hudPrompt.classList.toggle('kg-on', !!prompt);
    this.hudPrompt.classList.toggle('kg-kill', st.player.prompt === 'assassinate');
    this.hudAim.classList.toggle('kg-on', !!snap.aim);
    if (!this.touch) this.hudAim.textContent = snap.aim ? (snap.aim.valid ? AIM_HINT : 'そこへは投げられない') : '';
    else {
      // タッチ：2行（離して投げる／やめる・なぞる）。変わったときだけ組み直す
      const aimKey = snap.aim ? (snap.aim.valid ? 'ok' : 'ng') : '';
      if (aimKey !== this.lastAimKey) {
        this.lastAimKey = aimKey;
        if (aimKey === 'ok') this.hudAim.replaceChildren(phraseLine(AIM_HINT_TOUCH[0]), phraseLine(AIM_HINT_TOUCH[1]));
        else if (aimKey === 'ng') this.hudAim.replaceChildren(phraseLine('そこへは投げられない'), phraseLine(AIM_HINT_TOUCH[1]));
        else this.hudAim.replaceChildren();
      }
    }
    // 視点をつかむ案内は、遊び始めの数秒だけ（頭上の印と重ならないように）
    this.lockHint.classList.toggle('kg-on', st.screen === 'play' && !pointerLocked && st.t < LOCK_HINT_SECONDS && now >= this.alertTipUntil);
    this.toast.classList.toggle('kg-on', now < this.toastUntil);
    this.alertTip.classList.toggle('kg-on', now < this.alertTipUntil && st.phase === 'alert');
    // 遊び始めの操作のヒント（タッチ）：読み込み後の最初の遊びで一度だけ。やり直しでは出さない
    if (this.touch && this.touchHintState === 'pending' && st.screen === 'play' && this.viewReady) {
      this.touchHintState = 'showing';
      this.touchHintUntil = now + TOUCH_HINT_MS;
    }
    if (this.touchHintState === 'showing' && now >= this.touchHintUntil + 1200) this.touchHintState = 'done';
    this.touchHint.classList.toggle('kg-on', this.touchHintState === 'showing' && now < this.touchHintUntil);
    this.radar.draw(snap, camYaw);
    const dm = Radar.distanceToTarget(snap);
    const m = dm === null ? -1 : Math.round(dm);
    if (m !== this.lastTargetM) {
      this.lastTargetM = m;
      this.hudTarget.replaceChildren();
      if (m >= 0) this.hudTarget.append(el('span', 'kg-nb-ico'), el('span', '', `信長　${m}m`));
    }
  }

  /** 画面の中ほどに短い知らせ（例：「曲者じゃ！」）。 */
  flash(text: string, now: number, seconds = 1.6): void {
    this.toast.textContent = text;
    this.toastUntil = now + seconds * 1000;
  }
}
