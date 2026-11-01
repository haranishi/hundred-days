// OWNER: core
// HTML と CSS の重ね：タイトル・ステージ選択・説明・HUD・一時停止・討たれた・結果・討ち取り演出の重ね。
// 文字はヒラギノ明朝。小さいキーの表記（W A S D・Shift・E など）だけヒラギノ角ゴ（外のフォントは読み込まない）。色は墨黒・朱・金・生成り。
// r02-fix-play: レーダーの下に信長までの距離、説明の画面に見取り図、発見に入ったとき一度だけの逃げ方の案内を足した。
// r03-fix-play: 発見中に誰にも見られていない間は、帯を墨と金に変えて「見られていない　残り N 秒」と出す。
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
import { AIM_HINT, ALERT_TIP, CONTROLS, HUD_KEYS, MISSION_HELP, PHASE_LABEL, RANK_TEXT, TIER_LABEL, WATCH_LABEL, captureText, causeText, formatTime, hintText } from './text';

export interface UiHandlers {
  start(): void;
  selectStage(id: string): void;
  begin(): void;
  resume(): void;
  restart(): void;
  toSelect(): void;
  toTitle(): void;
}

/** 「クリックで視点をつかむ」を出しておく秒数（ゲーム内）。 */
const LOCK_HINT_SECONDS = 6;
/** 発見に入ったときの逃げ方の案内を出しておく秒数（実時間）。r02-fix-play 追加 */
const ALERT_TIP_SECONDS = 6;
/** 説明の画面の見取り図の大きさ（CSS の px）。ステージの外周（88m×76m）の縦横の比に合わせる */
const MAP_SIZE = { width: 232, height: 201 };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(text: string, testId: string, onClick: () => void, cls = 'kg-btn'): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  b.dataset.testid = testId;
  b.addEventListener('click', (e) => {
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
    this.hud.append(tl, tr, this.hudPhase, this.alertTip, bl, br, bc, this.toast, this.lockHint);

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
      el('div', 'kg-title-sub', '歴史の転換点に忍び込み、名のある武将をひそかに討つ'),
      el('h1', 'kg-logo', '影討ち'),
      el('div', 'kg-title-en', 'KAGEUCHI'),
      el('div', 'kg-title-goal', stage.meta.mission.goal),
      button('はじめる', 'btn-start', () => this.h.start()),
      el('div', 'kg-hint', 'Enter でも進める'),
    );
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
      rule.append(el('div', 'kg-card-rulename', `隠れ方　${m.rule.name}`), el('div', 'kg-card-ruletext', m.rule.text));
      const mission = el('div', 'kg-card-mission');
      mission.append(
        el('div', 'kg-card-objective', m.objective),
        el('div', 'kg-card-role', `操作する人物　${m.mission.player}`),
        el('div', 'kg-card-route', `目指す場所　${m.mission.destination}`),
        el('div', 'kg-card-clear', `クリア条件${m.playable ? '' : '（予定）'}　${m.mission.clearCondition}`),
      );
      c.append(el('div', 'kg-card-era', m.era), el('div', 'kg-card-name', m.title), el('div', 'kg-card-place', m.place), mission, rule);
      if (!m.playable) c.append(el('div', 'kg-card-badge', '準備中'));
      else c.append(el('div', 'kg-card-badge kg-go', '選ぶ'));
      c.addEventListener('click', (e) => {
        e.stopPropagation();
        if (m.playable) this.h.selectStage(m.id);
      });
      cards.append(c);
    }
    s.append(cards, button('タイトルへ', 'btn-to-title', () => this.h.toTitle(), 'kg-btn kg-btn-ghost'));
    return s;
  }

  private buildBriefing(stage: StageDef): HTMLElement {
    const s = this.screen('briefing', 'kg-briefing');
    const m = stage.meta;
    const box = el('div', 'kg-brief-box');
    box.append(el('div', 'kg-brief-date', `${m.dateText}　${m.place}`), el('h1', 'kg-brief-tagline', m.tagline ?? m.title), el('div', 'kg-brief-objective', `目的　${m.objective ?? ''}`));
    const body = el('div', 'kg-brief-body');
    body.append(el('p', 'kg-brief-role', `あなたは${m.mission.player}。狙うのは、${m.mission.destination}にいる${m.mission.target}。`));
    for (const p of m.briefing ?? []) body.append(el('p', '', p));
    const mission = el('section', 'kg-mission');
    mission.setAttribute('aria-label', 'クリアまでの流れ');
    mission.append(el('h3', '', 'クリアまでの流れ'));
    const steps = el('ol', 'kg-mission-steps');
    for (const [name, detail] of m.mission.steps) {
      const li = el('li');
      li.append(el('strong', '', name), el('span', '', detail));
      steps.append(li);
    }
    mission.append(steps, el('p', 'kg-mission-clear', m.mission.clearCondition), el('p', 'kg-mission-note', MISSION_HELP.rating), el('p', 'kg-mission-note', MISSION_HELP.retry));
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
      for (const line of r.slice(cut + 1).split(/(?<=。)/)) if (line) li.append(el('span', 'kg-scout-line', line));
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
    cols.append(scout, ctl);
    box.append(body, mission, cols, button('出陣する（Enter）', 'btn-begin', () => this.h.begin()));
    s.append(box);
    return s;
  }

  private buildPause(): HTMLElement {
    const s = this.screen('pause', 'kg-pause');
    const box = el('div', 'kg-panel');
    box.append(
      el('h2', 'kg-h2', '一時停止'),
      button('再開する（Esc）', 'btn-resume', () => this.h.resume()),
      button('はじめからやり直す（R）', 'btn-restart', () => this.h.restart(), 'kg-btn kg-btn-ghost'),
      button('ステージ選択へ', 'btn-to-select', () => this.h.toSelect(), 'kg-btn kg-btn-ghost'),
    );
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
      button('やり直す（R）', 'btn-retry', () => this.h.restart()),
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
      button('もう一度（R）', 'btn-again', () => this.h.restart()),
      button('ステージ選択へ', 'btn-rs-select', () => this.h.toSelect(), 'kg-btn kg-btn-ghost'),
    );
    s.append(box);
    return { screen: s, body };
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
  }

  showGameover(capture: DetectRecord | null, first: DetectRecord | null): void {
    const b = this.gameoverBody;
    b.replaceChildren();
    if (first) b.append(el('p', 'kg-go-cause', causeText(first)));
    if (capture && capture.cause !== 'debug') b.append(el('p', 'kg-go-capture', captureText(capture)));
    else if (capture) b.append(el('p', 'kg-go-capture', causeText(capture)));
    b.append(el('p', 'kg-go-hint', hintText(first)));
  }

  showResult(r: ResultInfo): void {
    const b = this.resultBody;
    b.replaceChildren();
    const rank = el('div', 'kg-rank');
    const phrase = el('div', 'kg-rank-text');
    // 一言は「。」で行を分ける（語の途中で折り返さないように）
    for (const line of RANK_TEXT[r.rank].split(/(?<=。)/)) if (line) phrase.append(el('div', '', line));
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
    this.hudMissionHint.textContent = st.mission.hint;
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
    const key = `${st.player.stones}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.hudStones.replaceChildren(el('span', 'kg-stones-label', '小石'));
      for (let i = 0; i < 5; i++) this.hudStones.append(el('span', `kg-stone${i < st.player.stones ? ' kg-have' : ''}`));
    }
    const guardNear = st.guards.some((g) => !g.down && g.id !== 'nobunaga' && Math.hypot(st.player.x - g.x, st.player.z - g.z) < 2.5);
    const prompt = st.player.prompt === 'assassinate' ? 'E　討ち取る' : st.player.prompt === 'takedown' ? 'E　背後から制圧　／　F　近接攻撃'
      : st.mission.interaction ? (st.mission.progress > 0 ? `${st.mission.interaction}　${Math.floor(st.mission.progress * 100)}%（移動で中断）` : `E　${st.mission.interaction}`)
      : guardNear ? 'F　近接攻撃　／　背後へ回ると E で制圧' : '';
    this.hudPrompt.textContent = prompt;
    this.hudPrompt.classList.toggle('kg-on', !!prompt);
    this.hudPrompt.classList.toggle('kg-kill', st.player.prompt === 'assassinate');
    this.hudAim.classList.toggle('kg-on', !!snap.aim);
    this.hudAim.textContent = snap.aim ? (snap.aim.valid ? AIM_HINT : 'そこへは投げられない') : '';
    // 視点をつかむ案内は、遊び始めの数秒だけ（頭上の印と重ならないように）
    this.lockHint.classList.toggle('kg-on', st.screen === 'play' && !pointerLocked && st.t < LOCK_HINT_SECONDS && now >= this.alertTipUntil);
    this.toast.classList.toggle('kg-on', now < this.toastUntil);
    this.alertTip.classList.toggle('kg-on', now < this.alertTipUntil && st.phase === 'alert');
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
