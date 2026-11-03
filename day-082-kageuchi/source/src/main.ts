// OWNER: core
// 起動と URL の引数。毎コマ：入力 → 固定刻みの sim（1/60 秒）→ カメラ → 重ね → 表示 → HUD → window.__state。
//   ?view=art（既定）|greybox（仮の表示）  ?autostart=1（説明を飛ばして遊ぶ）  ?seed=N  ?god=1（捕まらない）
//   ?debug=1（上から見た2Dの図）  ?speed=N（sim を N 倍で進める）  ?shade=0（人物の足元の暗さを切る。見比べ用）
//   ?perf=courtyard|garden|…（遊ぶ画面で、その構図のプレイヤーの位置に立って 360 コマの時間を測り window.__perfResult に。?autostart=1&god=1 と使う）
//   ?shot=title|start|gate|courtyard|bamboo|garden|nobunaga|finale|gameover|result（種と時刻を固定して撮る構図）
//   ?overlays=0（扇・印・物音の輪を出さない。重ねが地面の明るさを変えていないかの見比べ用。r02-fix-play 追加）
// 小石の狙い（Q 長押し）は、右クリックか Esc で投げずにやめられる（r03-fix-play）
// 自動操作の口：window.__input（down・up・tap・look・clear）／ デバッグの口：window.__game（teleport・win・lose ほか）
// 2026-11-03 スマホ対応：?touch=1|0（タッチ操作を強制的に入・切。無ければ指の端末で入、それ以外は最初のタッチで入）。
//   タッチの正本は <html> の kg-touch クラス。入のときだけ TouchControls（src/input/touch.ts）を作り、#game と #ui の間に置く。
//   遊びを止める経路（一時停止ボタン・縦向き・ページが隠れた・blur）は interruptPlay() を通す。Esc の経路は変えない。
//   試験の口：window.__touch（active・info・stickTo・press・release・lookBy）
// 描画の段階（A2・tasks 3.1）：?quality=high|mid|low|min（起動時の段階を決める。自動の引き下げは止まる）。
//   タッチのときは mid から始め、重ければ自動で1段ずつ下げる（QualityGovernor）。デスクトップ（タッチ切）では setQuality を呼ばない。
//   自動操作（navigator.webdriver）では引き下げない。?adaptive=1 なら自動操作でも引き下げる（試験・測定用。?quality=・?shot=・?perf= があれば働かない）。
//   試験の口：window.__quality（tier・id・label・pixelRatio・ao・explicit・adaptive・history・set）
import { CAMERA } from './config/camera';
import { TICK } from './config/rules';
import { getShot } from './contract/shots';
import { GameAudio } from './audio';
import { assassinateSlow, closeUpShot } from './camera/closeup';
import { CameraRig } from './camera/rig';
import { Autopilot } from './game/autopilot';
import { Game } from './game/game';
import { SHOT_PLANS, isShotName, type ShotPlan } from './game/shots';
import { buildState } from './game/state';
import { InputState } from './input/input';
import { QUALITY_TIERS, QualityGovernor, adaptiveAllowed, initialTier } from './art/render/quality';
import { TOUCH_CLASS, TouchControls, detectTouchMode, makeNotice, type TouchButtonName } from './input/touch';
import { meleeAssistYaw } from './input/touchAssist';
import { CAPTURE, FINALE, MELEE } from './config/rules';
import { VIEW } from './config/view';
import { idleInput, type SimInput } from './sim/types';
import { getStage } from './stage';
import { Ui } from './ui/ui';
import { DebugMap } from './view/debug2d';
import { createView } from './view';
import { Overlays } from './view/overlays';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seedParam = params.get('seed');
const seed = seedParam !== null && seedParam !== '' ? Number(seedParam) >>> 0 : shotName ? 1 : (Date.now() & 0x7fffffff) >>> 0;
const godMode = params.get('god') === '1';
const debugOn = params.get('debug') === '1';
let speed = Math.min(16, Math.max(0.1, Number(params.get('speed') ?? 1) || 1));
const autostart = params.get('autostart') === '1';
const perfSpot = params.get('perf');
/** 計測で数えるコマ数（先頭の 30 コマは捨てる）。 */
const PERF_FRAMES = 360;
const viewKind = params.get('view') ?? 'art';
const overlaysOff = params.get('overlays') === '0';
const qualityParam = params.get('quality');
const adaptiveParam = params.get('adaptive') === '1';

function gpuName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
}

function boot(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui') as HTMLElement;
  const stage = getStage('honnoji');
  const rig = new CameraRig(window.innerWidth / Math.max(1, window.innerHeight));
  const view = createView(viewKind, canvas, stage, rig.camera);
  const overlays = new Overlays(view.overlayRoot);
  const input = new InputState();
  input.attach(canvas);
  window.__input = input.automation();
  const game = new Game({ stage, seed, god: godMode });
  // 音：最初の操作（クリック・キー）で始める（ブラウザは操作なしに音を出させない）。M で消す・戻す
  const audio = new GameAudio(stage);
  window.__audio = audio.debug();
  const startAudio = (): void => audio.start();
  window.addEventListener('pointerdown', startAudio, { capture: true });
  window.addEventListener('keydown', startAudio, { capture: true });
  // iOS の Safari は pointerdown の中では音を始めさせないことがあるので、離した瞬間とクリックでも呼ぶ（何度呼んでも安全）
  for (const type of ['pointerup', 'touchend', 'click'] as const) window.addEventListener(type, startAudio, { capture: true });
  const titleShot = getShot('title')!;
  const fireShot = getShot('fire')!;
  rig.setOrbit(titleShot);

  let frozen = false;
  let acc = 0;
  let wantLock = false;
  let debugMap: DebugMap | null = null;
  /** 討ち取りの演出のカメラ：まだ寄っていない → 二人に寄った → 全景へ引いた。r02-fix-play 追加 */
  let finaleCam: 'none' | 'close' | 'wide' = 'none';
  /** 狙いをやめる（右クリック・Esc・窓を離れた）。次の刻みで sim へ渡す。r03-fix-play 追加 */
  let cancelAimReq = false;
  /** タッチ操作が入っているか（正本は <html> の kg-touch クラス。入れたら戻さない）。 */
  let touchOn = false;
  let touch: TouchControls | null = null;

  // ---- 描画の段階（tasks 3.1）。タッチの判定より前に作る（enableTouch から呼ぶため）
  const qualityInit = initialTier({ touch: detectTouchMode(params) === 'on', param: qualityParam });
  const automation = navigator.webdriver === true && !adaptiveParam;
  const shotOrPerf = shotName !== null || !!perfSpot;
  const governor = new QualityGovernor();
  /** 自動の引き下げが働いているか（governor.start 済み）。 */
  let governing = false;
  let viewReady = false;
  const qualityHistory: { at: number; from: number; to: number }[] = [];
  /** いまの段階。表示が段階を持たない（仮の表示）なら、起動時に決めた段階か 0。 */
  let tierFallback = 0;
  const qualityNow = (): number => view.qualityTier?.() ?? tierFallback;
  const setTier = (to: number, now: number): void => {
    const from = qualityNow();
    if (!QUALITY_TIERS[to]) return;
    view.setQuality?.(to);
    tierFallback = to;
    if (from !== to) qualityHistory.push({ at: Math.round(now), from, to });
  };
  const adaptiveNow = (): boolean => adaptiveAllowed({ touch: touchOn, explicit: qualityInit.explicit, automation, shotOrPerf });
  const startGovernor = (): void => {
    if (governing || !viewReady || !adaptiveNow()) return;
    governing = true;
    governor.start(qualityNow(), performance.now());
  };
  /** 止まった・戻った・向きや大きさが変わった：その前後のコマの間隔を、重さの判定に入れない。 */
  const qualityGap = (): void => {
    if (governing) governor.discontinuity(performance.now());
  };
  const qualityOnTouch = (): void => {
    if (!viewReady) return; // 起動中なら、下の whenReady のあとで決める
    if (!qualityInit.explicit && qualityNow() === 0) setTier(QUALITY_TIERS.findIndex((q) => q.id === 'mid'), performance.now());
    startGovernor();
  };
  window.__quality = {
    tier: () => qualityNow(),
    id: () => QUALITY_TIERS[qualityNow()]?.id ?? '',
    label: () => QUALITY_TIERS[qualityNow()]?.label ?? '',
    pixelRatio: () => view.renderer.getPixelRatio(),
    ao: () => view.aoEnabled?.() ?? QUALITY_TIERS[qualityNow()]?.ao ?? false,
    explicit: () => qualityInit.explicit,
    adaptive: () => governing,
    history: () => qualityHistory.map((h) => ({ ...h })),
    set: (i: number) => {
      if (!Number.isInteger(i) || !QUALITY_TIERS[i]) return;
      setTier(i, performance.now());
      if (governing) governor.start(i, performance.now());
    },
  };

  const requestLock = (): void => {
    // タッチ操作では視点をなぞって動かすので、ポインタロックは使わない（マウスでも視点の領域をなぞれる）
    if (touchOn) return;
    if (game.screen !== 'play' || document.pointerLockElement === canvas) return;
    wantLock = true;
    try {
      const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    } catch {
      // ポインタロックが使えない環境（自動操作）では、何もしない
    }
  };
  const releaseLock = (): void => {
    wantLock = false;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  };

  const startPlay = (): void => {
    game.startPlay();
    const p = game.sim.player;
    rig.resetFollow(p.x, p.z, p.yaw);
    input.clearPresses();
    // 物理キーの R などでやり直すとき、タッチの押下（押しっぱなしのスティック・ねらい）を持ち越さない。ねらいの取り消しはこの直後に false へ戻す
    touch?.releaseAll();
    acc = 0;
    finaleCam = 'none';
    cancelAimReq = false;
    ui.resetAttempt();
  };

  const ui = new Ui(uiRoot, stage, {
    start: () => game.toSelect(),
    selectStage: (id) => {
      if (id === stage.meta.id) game.toBriefing();
    },
    begin: () => {
      startPlay();
      requestLock();
    },
    resume: () => {
      game.resume();
      requestLock();
    },
    restart: () => {
      startPlay();
      requestLock();
    },
    toSelect: () => game.toSelect(),
    toTitle: () => game.toTitle(),
    toggleMute: () => audio.toggleMute(),
    muted: () => audio.debug().muted,
    qualityLabel: () => QUALITY_TIERS[qualityNow()]?.label ?? '',
  });

  game.onScreen((to) => {
    // 止まる・戻る前後のコマの間隔は、重さの判定に入れない
    qualityGap();
    ui.setScreen(to);
    input.clearPresses();
    touch?.setActive(to === 'play');
    if (to === 'title' || to === 'select' || to === 'briefing') rig.setOrbit(titleShot, rig.mode === 'orbit' ? undefined : 0);
    if (to !== 'play') releaseLock();
    if (to === 'gameover') ui.showGameover(game.sim.capture, game.sim.firstDetect);
    if (to === 'result') ui.showResult(game.result());
  });
  game.onEvent((e) => {
    if (e.type === 'shout') ui.flash(e.text, performance.now());
    // 発見に入った：この試みで一度だけ、逃げ方の案内を出す（体験の採点 4 位）
    if (e.type === 'phase' && e.to === 'alert') ui.showAlertTip(performance.now());
    audio.onEvent(e);
  });
  ui.setScreen(game.screen);

  canvas.addEventListener('click', () => requestLock());
  document.addEventListener('pointerlockchange', () => {
    // Esc でロックが外れたときは、ブラウザがキーを渡さないので、ここで一時停止にする。狙いの最中なら、投げずにやめる
    if (document.pointerLockElement !== canvas && wantLock && game.screen === 'play') {
      wantLock = false;
      if (game.sim.player.aiming) cancelAimReq = true;
      game.pause();
    }
  });
  // 狙いの最中の右クリックで、投げずにやめる（r03-fix-play：体験の採点「Q を離すと必ず投げ、取り消しがない」）
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 2 && game.screen === 'play' && game.sim.player.aiming) cancelAimReq = true;
  });
  /**
   * 遊びを止める共通の経路（一時停止ボタン・縦向き・ページが隠れた・blur）。2026-11-03 スマホ対応。
   * 狙っていれば投げずにやめる要求を立て → タッチと物理の押下を全部離し → pause なら一時停止にする。
   */
  const interruptPlay = (o: { pause: boolean }): void => {
    if (game.screen === 'play' && game.sim.player.aiming) cancelAimReq = true;
    touch?.releaseAll();
    input.releaseAll();
    if (o.pause && game.screen === 'play') {
      releaseLock();
      game.pause();
    }
  };
  // 窓を離れると押していたキーが全部離される。そのまま投げないよう、狙いをやめる（止めはしない）
  window.addEventListener('blur', () => interruptPlay({ pause: false }));
  // タッチ操作のとき、ページが隠れたら（アプリの切り替え・画面を消す）止める
  document.addEventListener('visibilitychange', () => {
    qualityGap();
    if (document.hidden && touchOn) interruptPlay({ pause: true });
  });

  // 縦向きの案内（タッチ操作のときだけ）。縦向きで遊ぶ画面になったら止め、遊ぶ・一時停止の間は案内を出す。
  // 横に戻すと案内が消え、一時停止の画面から「再開する」で続ける（自動では再開しない）。見た目の仕上げは A2
  let rotateNotice: HTMLElement | null = null;
  const guardOrientation = (): void => {
    if (!touchOn) return;
    const portrait = window.innerHeight > window.innerWidth;
    if (portrait && game.screen === 'play') interruptPlay({ pause: true });
    const show = portrait && (game.screen === 'play' || game.screen === 'pause');
    if (show && !rotateNotice) {
      rotateNotice = makeNotice('kg-rotate', 'rotate-prompt', ['スマホを横向きにしてください', '横にすると、続きから遊べます']);
      // スマホの輪郭が横へ回る絵（CSS だけで描く。動きを減らす設定では止める）
      const phone = document.createElement('div');
      phone.className = 'kg-rotate-phone';
      phone.setAttribute('aria-hidden', 'true');
      rotateNotice.firstElementChild?.prepend(phone);
      // 見出しは句の箱に分けて、狭い縦の画面では「横向きに／してください」で折り返す（語の途中で切らない）
      const head = rotateNotice.querySelector('.kg-notice-main');
      if (head) {
        head.replaceChildren();
        for (const t of ['スマホを横向きに', 'してください']) {
          const sp = document.createElement('span');
          sp.className = 'kg-ph';
          sp.textContent = t;
          head.append(sp);
        }
      }
      document.body.append(rotateNotice);
    }
    rotateNotice?.classList.toggle('kg-on', show);
  };

  const enableTouch = (): void => {
    if (touchOn) return;
    touchOn = true;
    document.documentElement.classList.add(TOUCH_CLASS);
    releaseLock();
    touch = new TouchControls(input, {
      cancelAim: () => {
        cancelAimReq = true;
      },
      pause: () => interruptPlay({ pause: true }),
      stones: () => game.sim.player.stones,
    });
    uiRoot.before(touch.layer);
    touch.setActive(game.screen === 'play');
    ui.setTouchMode(true);
    guardOrientation();
    // 最初のタッチで入ったとき：明示の ?quality= が無ければ、触れる端末の段階（やや軽い）へ下げ、自動の引き下げを始める
    qualityOnTouch();
  };
  const touchMode = detectTouchMode(params);
  if (touchMode === 'on') enableTouch();
  // 起動時の段階：先に画素比を決めてから、表示の準備（シェーダーの先作り）を待つ
  if (qualityInit.explicit || touchOn) {
    view.setQuality?.(qualityInit.tier);
    tierFallback = qualityInit.tier;
  }
  else if (touchMode === 'auto') {
    // 指の端末と判定できなかったときは、最初のタッチ（またはペン）で入れる（読み込み直さない・以後は戻さない）
    const onFirstPointer = (e: PointerEvent): void => {
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      window.removeEventListener('pointerdown', onFirstPointer, { capture: true });
      enableTouch();
    };
    window.addEventListener('pointerdown', onFirstPointer, { capture: true });
  }
  const touchButtons: readonly TouchButtonName[] = ['action', 'attack', 'crouch', 'stone', 'cancel', 'pause'];
  const asButton = (name: string): TouchButtonName | null => (touchButtons as readonly string[]).includes(name) ? (name as TouchButtonName) : null;
  window.__touch = {
    active: () => touchOn && !!touch && touch.isActive(),
    info: () => (touch ? touch.info() : null),
    stickTo: (x, y, run) => input.injectStick(x, y, run),
    press: (name) => {
      const b = asButton(name);
      if (b && touch) touch.press(b);
    },
    release: (name) => {
      const b = asButton(name);
      if (b && touch) touch.release(b);
    },
    lookBy: (dx, dy) => touch?.lookBy(dx, dy),
  };

  // 描画の文脈を失ったら（GPU の都合）、案内と読み込み直しのボタンを出す。自動での復帰は試みない
  let ctxNotice: HTMLElement | null = null;
  canvas.addEventListener('webglcontextlost', () => {
    interruptPlay({ pause: true });
    if (ctxNotice) return; // 何度失っても案内は1つだけ
    const n = makeNotice('kg-ctxlost', 'ctx-lost', ['描画が止まりました。読み込み直してください'], { text: '読み込み直す', testId: 'btn-reload', onClick: () => location.reload() });
    n.classList.add('kg-on');
    document.body.append(n);
    ctxNotice = n;
  });

  const onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    view.resize(w, h);
    rig.setAspect(w / Math.max(1, h));
    qualityGap();
  };
  window.addEventListener('resize', onResize);
  onResize();
  // 縦横の切り替えとブラウザの帯の出入り（スマホ対応）
  const onViewport = (): void => {
    onResize();
    guardOrientation();
  };
  window.addEventListener('orientationchange', onViewport);
  // PC のトラックパッドでの拡大でも visualViewport は変わるので、タッチのときだけ扱う（タッチがオフなら今と同じ）
  window.visualViewport?.addEventListener('resize', () => {
    if (touchOn) onViewport();
  });
  window.addEventListener('resize', guardOrientation);

  /** Q を押している（小石が残っている）。sim へ渡す狙いの入力。 */
  const aimHeld = (): boolean => game.screen === 'play' && input.held('aim') && game.sim.player.stones > 0;
  /** いま狙っている（sim の状態）。カメラの狙いの構図とマウスの上下の働きに使う。やめた後は Q を押していても狙わない。r03-fix-play */
  const aiming = (): boolean => game.screen === 'play' && game.sim.player.aiming;

  const makeInput = (): SimInput => {
    if (game.screen !== 'play') return idleInput(rig.yaw);
    const k = (a: 'forward' | 'back' | 'left' | 'right'): number => (input.held(a) ? 1 : 0);
    const aim = aimHeld();
    const cancelAim = cancelAimReq;
    cancelAimReq = false;
    // キーとスティックを足して -1〜1 に切る（スティックの長さがそのまま速さの割合。走りは held('run') がスティックの外側の輪も含む）
    const stick = input.stick();
    const clamp1 = (v: number): number => Math.min(1, Math.max(-1, v));
    const attack = input.consumeTickPress('attack');
    // タッチの攻撃：カメラの向きでなく、間合いの中の最も近い番兵へ向ける（視点を回す指と攻撃の指が同じ右手で、向けるのが難しいため）。
    // 間合いの外は今まで通り（カメラの向き）。規則（sim）は変えず、攻撃の刻みの camYaw だけを差し替える（src/input/touchAssist.ts）
    let camYaw = rig.yaw;
    if (attack && touchOn) {
      const a = meleeAssistYaw(game.sim.player, game.sim.guards, MELEE.range, (x0, z0, x1, z1) => game.sim.q.blocked(x0, z0, x1, z1));
      if (a !== null) camYaw = a;
    }
    return {
      moveX: clamp1(k('right') - k('left') + stick.x),
      moveY: clamp1(k('forward') - k('back') + stick.y),
      camYaw,
      run: input.held('run'),
      crouchToggle: input.consumeTickPress('crouch'),
      interact: input.consumeTickPress('interact'),
      attack,
      aim,
      aimPoint: aim && !game.sim.player.aimCancelled ? rig.groundAim() : null,
      cancelAim,
    };
  };

  const handleFlowKeys = (): void => {
    const press = (a: 'confirm' | 'pause' | 'restart'): boolean => input.consumeFramePress(a);
    if (input.consumeFramePress('mute')) audio.toggleMute();
    switch (game.screen) {
      case 'title':
        if (press('confirm')) game.toSelect();
        break;
      case 'select':
        if (press('confirm')) game.toBriefing();
        else if (press('pause')) game.toTitle();
        break;
      case 'briefing':
        if (press('confirm')) {
          startPlay();
          requestLock();
        } else if (press('pause')) game.toSelect();
        break;
      case 'play':
        if (press('pause')) {
          // 狙いの最中の Esc は、投げずに狙いをやめるだけ（止めない）。r03-fix-play
          if (game.sim.player.aiming) cancelAimReq = true;
          else {
            releaseLock();
            game.pause();
          }
        } else if (press('restart')) startPlay();
        break;
      case 'pause':
        if (press('pause')) {
          game.resume();
          requestLock();
        } else if (press('restart')) startPlay();
        break;
      case 'gameover':
      case 'result':
        if (press('restart') || press('confirm')) startPlay();
        break;
      default:
        break;
    }
  };

  const tickOnce = (): void => game.tick(makeInput());

  /** 討ち取りの一閃の間だけのスロー（sim の速さに掛ける）。r02-fix-play 追加 */
  const finaleSlow = (): number => {
    const s = game.sim;
    if (game.screen !== 'finale' || s.outcome !== 'win') return 1;
    return assassinateSlow(s.t - s.outcomeT);
  };

  /** 討ち取りの瞬間：光秀と信長に寄る構図（駆け寄る蘭丸を奥に）。 */
  const finaleCloseUp = (): ReturnType<typeof closeUpShot> => {
    const s = game.sim;
    const nb = s.nobunaga;
    const rm = s.guards.find((g) => g.mode === 'rush') ?? null;
    const p = s.player;
    return closeUpShot(stage, s.q, { player: { x: p.x, z: p.z }, target: nb ? { x: nb.x, z: nb.z } : { x: p.x, z: p.z }, watcher: rm ? { x: rm.x, z: rm.z } : null });
  };

  /** 捕まった瞬間のスロー（sim の速さに掛ける）。突かれる一瞬をゆっくり見せ、討たれた画面までに元へ戻す。 */
  const caughtSlow = (): number => {
    const s = game.sim;
    if (game.screen !== 'play' || s.outcome !== 'caught') return 1;
    const C = VIEW.caught;
    const tc = s.t - s.outcomeT;
    if (tc <= C.slowFor) return C.slow;
    const u = Math.min(1, (tc - C.slowFor) / Math.max(1e-3, Math.min(C.rampTo, CAPTURE.toScreen) - C.slowFor));
    return C.slow + (1 - C.slow) * u * u * (3 - 2 * u);
  };

  window.__game = {
    teleport: (x, z, yawDeg) => game.sim.teleport(x, z, yawDeg),
    win: () => game.sim.forceWin(),
    lose: () => game.sim.forceLose(),
    freeze: (on) => {
      frozen = on;
      acc = 0;
    },
    step: (n) => {
      for (let i = 0; i < n; i++) tickOnce();
    },
    setCrouch: (on) => game.sim.setCrouch(on),
    setSpeed: (n) => {
      speed = Math.min(16, Math.max(0.1, n));
    },
    goto: (screen) => {
      if (screen === 'select') game.toSelect();
      else if (screen === 'briefing') game.toBriefing();
      else startPlay();
    },
    viewStats: () => view.stats(),
    programList: () => (view.renderer.info.programs ?? []).map((p) => `${p.name}|${String((p as unknown as { cacheKey?: string }).cacheKey ?? '').slice(0, 160)}`),
    look: (shot) => {
      if (!shot) {
        const p = game.sim.player;
        rig.resetFollow(p.x, p.z, p.yaw);
        return;
      }
      rig.setFixed({ name: 'debug', target: shot.target, yawDeg: shot.yawDeg, pitchDeg: shot.pitchDeg, distance: shot.distance, fov: shot.fov ?? 45, t: 0, note: '' });
    },
  };

  let pilot: Autopilot | null = null;
  window.__autopilot = {
    // io を渡せばそれで操作する（tools/lib/touchBot.mjs が本物のタッチで動かすため）。無ければ __input
    start: (route, io) => {
      pilot = new Autopilot(route, io ?? window.__input!, CAMERA.lookSensitivity);
    },
    stop: () => {
      pilot?.releaseAll();
      pilot = null;
    },
    status: () => (pilot ? { status: pilot.status, step: pilot.stepIdx, failReason: pilot.failReason, log: pilot.log } : null),
  };

  const gl = view.renderer.getContext();
  const gpu = gpuName(gl);
  let last = performance.now();
  let frames = 0;
  view.whenReady().then(
    () => {
      window.__viewReady = true;
      viewReady = true;
      ui.markViewReady();
      // 起動の後に最初のタッチで入っていた（auto）なら、ここで段階を決める
      if (touchOn && !qualityInit.explicit && qualityNow() === 0) setTier(QUALITY_TIERS.findIndex((q) => q.id === 'mid'), performance.now());
      startGovernor();
    },
    (e: unknown) => {
      window.__appError = String(e instanceof Error ? `${e.message}\n${e.stack}` : e);
    },
  );
  // 計測（?perf=）：表示の準備ができてから、コマの間隔と1コマの CPU 時間を数える
  let perf: { intervals: number[]; cpu: number[]; prev: number } | null = null;
  if (perfSpot) {
    void view.whenReady().then(() => {
      perf = { intervals: [], cpu: [], prev: 0 };
    });
  }
  const finishPerf = (p: { intervals: number[]; cpu: number[] }): void => {
    const pct = (a: number[], q: number): number => {
      const s = a.slice(30).sort((x, y) => x - y);
      return Number(s[Math.min(s.length - 1, Math.floor((q / 100) * s.length))].toFixed(2));
    };
    const st = view.stats();
    window.__perfResult = {
      spot: perfSpot,
      frames: p.intervals.length - 30,
      p50: pct(p.intervals, 50),
      p95: pct(p.intervals, 95),
      p99: pct(p.intervals, 99),
      cpuP50: pct(p.cpu, 50),
      cpuP95: pct(p.cpu, 95),
      calls: st.calls,
      triangles: st.triangles,
      programs: st.programs,
      characters: game.sim.guards.length + 1,
      cones: game.sim.guards.filter((g) => g.coneCount > 0).length,
      width: view.renderer.domElement.width,
      height: view.renderer.domElement.height,
      gpu,
    };
  };

  const frame = (now: number): void => {
    // 重さの判定には、切り詰める前の実際の間隔を渡す（250ms 超の外れ値を見分けるため）
    const rawMs = now - last;
    const rdt = Math.min(0.1, Math.max(0, rawMs / 1000));
    last = now;
    if (governing && !document.hidden && game.screen !== 'pause') {
      // 時計は performance.now() に揃える（start・discontinuity と同じ。rAF の時刻は少し早く、巻き戻りの分岐に入ることがある）
      const tNow = performance.now();
      const next = governor.sample(rawMs, tNow);
      if (next !== null) setTier(next, tNow);
    }
    const cpu0 = performance.now();
    try {
      // 自動操作は、前のコマの __state を見て、このコマの入力を決める（人と同じ遅れ）
      if (pilot && window.__state && pilot.status === 'running') pilot.update(window.__state);
      guardOrientation();
      if (!frozen) handleFlowKeys();
      const m = input.consumeMotion();
      if (game.screen === 'play' && !frozen) {
        rig.look(m.dx, m.dy, aiming());
        if (m.wheel) rig.zoom(m.wheel);
      }
      const simRate = game.running && !frozen ? speed * caughtSlow() * finaleSlow() : 0;
      if (simRate > 0) {
        acc += rdt * simRate;
        let n = 0;
        const maxSteps = Math.ceil(6 * speed);
        while (acc >= TICK && n < maxSteps) {
          tickOnce();
          acc -= TICK;
          n++;
        }
        if (n >= maxSteps) acc = 0;
      }
      const s = game.sim;
      const snap = s.snapshot(frozen ? 1 : acc / TICK);
      // 討ち取り：まず二人に寄り（一閃の間はスロー）、炎上が始まる所で全景へ引く
      if (game.screen === 'finale' && !frozen) {
        if (finaleCam === 'none') {
          // 少し引いた位置へ切り替えてから、一閃の間に同じ線の上を押し込む（追従の位置から寄せると屋根の中を通る）
          const close = finaleCloseUp();
          rig.setFixed({ ...close, distance: VIEW.assassinate.cam.cutDistance });
          rig.setCinematic(close, VIEW.assassinate.cam.smooth);
          finaleCam = 'close';
        }
        if (finaleCam === 'close' && (s.finale ?? 0) >= FINALE.cameraFrom) {
          // 先に真上へ上がってから全景へ引く（庭の低い所や屋根の中を通らない。r03-fix-play）
          rig.pullBack(fireShot);
          finaleCam = 'wide';
        }
      }
      if (!frozen) {
        const pl = snap.characters.find((c) => c.kind === 'player');
        rig.update(rdt, pl ? { x: pl.x, z: pl.z } : null, aiming());
      }
      const showOverlays = !overlaysOff && (game.screen === 'play' || game.screen === 'pause' || game.screen === 'gameover');
      overlays.setVisible(showOverlays);
      overlays.update(rdt, snap, rig.camera);
      view.update(rdt, snap, rig.camera, rdt * simRate);
      audio.update(snap, rig.yaw, rig.camera.position.x, rig.camera.position.z, game.screen === 'pause');
      view.render(rdt);
      const st = buildState(s, { screen: game.screen, seed: game.seed, camera: rig.info() });
      window.__state = st;
      touch?.sync(st);
      if (touch && game.screen === 'play') {
        const u = touch.usage();
        if (u.stick && u.look) ui.dismissTouchHint(now);
      }
      if (game.screen === 'play' || game.screen === 'pause') ui.updateHud(st, snap, rig.yaw, document.pointerLockElement === canvas, now);
      if (game.screen === 'finale') ui.updateFinale(s.finale ?? 0);
      if (debugMap && frames % 3 === 0) debugMap.draw(s, snap);
      input.endFrame();
      frames++;
      if (frames === 2) window.__appReady = true;
      if (perf) {
        if (perf.prev > 0) {
          perf.intervals.push(now - perf.prev);
          perf.cpu.push(performance.now() - cpu0);
        }
        perf.prev = now;
        if (perf.intervals.length >= PERF_FRAMES + 30) {
          finishPerf(perf);
          perf = null;
        }
      }
    } catch (e) {
      window.__appError = String(e instanceof Error ? `${e.message}\n${e.stack}` : e);
      console.error(e);
      return;
    }
    requestAnimationFrame(frame);
  };

  if (debugOn) {
    debugMap = new DebugMap(game.sim);
    document.body.append(debugMap.canvas);
  }

  if (shotName !== null) {
    if (!isShotName(shotName)) throw new Error(`未知のショット名: ${shotName}`);
    frozen = true;
    const settle = view.setShotMode(true);
    runShot(SHOT_PLANS[shotName]);
    // 表示の準備（シェーダーの先作り）が終わってから、決まったコマ数を描いて準備完了にする（AO の積算・重ねと HUD の更新）
    const t0 = performance.now();
    view
      .whenReady()
      .then(() => {
        const warmMs = Math.round(performance.now() - t0);
        let waited = 0;
        const ready = (): void => {
          if (++waited < settle) {
            requestAnimationFrame(ready);
            return;
          }
          const st = view.stats();
          window.__shotInfo = { name: shotName, calls: st.calls, triangles: st.triangles, programs: st.programs, gpu, t: game.sim.t, view: viewKind, warmMs };
          window.__shotReady = true;
        };
        requestAnimationFrame(ready);
      })
      .catch((e: unknown) => {
        window.__appError = String(e instanceof Error ? `${e.message}\n${e.stack}` : e);
      });
  } else if (autostart) {
    startPlay();
    // 計測：その構図のプレイヤーの位置に立ち、追従カメラを置き直す
    const spot = perfSpot && isShotName(perfSpot) ? SHOT_PLANS[perfSpot].player : undefined;
    if (spot) {
      game.sim.teleport(spot.x, spot.z, spot.yawDeg);
      game.sim.setCrouch(spot.crouch);
      rig.resetFollow(spot.x, spot.z, (spot.yawDeg * Math.PI) / 180);
    }
  }
  requestAnimationFrame(frame);

  /** 撮影：種と時刻を固定し、決まった刻みだけ進める。カメラは構図に固定する。 */
  function runShot(plan: ShotPlan): void {
    const stepUntil = (cond: () => boolean, maxTicks: number): void => {
      for (let i = 0; i < maxTicks && !cond(); i++) game.tick(idleInput(game.sim.player.yaw));
    };
    const toT = (t: number): void => stepUntil(() => game.sim.t >= t - 1e-9, Math.ceil(t / TICK) + 2);
    const place = (): void => {
      if (!plan.player) return;
      game.sim.teleport(plan.player.x, plan.player.z, plan.player.yawDeg);
      game.sim.setCrouch(plan.player.crouch);
    };
    switch (plan.special) {
      case 'finale': {
        game.god = true;
        startPlay();
        toT(plan.t - 0.1);
        place();
        toT(plan.t);
        game.sim.forceWin();
        stepUntil(() => (game.sim.finale ?? 0) >= (plan.finaleAt ?? 0.6), Math.ceil(FINALE.duration / TICK) + 10);
        rig.setFixed(fireShot);
        break;
      }
      case 'gameover': {
        game.god = false;
        startPlay();
        place();
        stepUntil(() => game.screen === 'gameover', 60 * 30);
        const p = game.sim.player;
        rig.resetFollow(p.x, p.z, p.yaw);
        break;
      }
      case 'result': {
        game.god = true;
        startPlay();
        toT(plan.t);
        game.sim.forceWin();
        stepUntil(() => game.screen === 'result', Math.ceil(FINALE.duration / TICK) + 30);
        // 遊んで討ったときと同じく、結果の背景は燃える寺の全景
        rig.setFixed(fireShot);
        break;
      }
      default: {
        if (plan.screen === 'title') {
          game.toTitle();
          toT(plan.t);
          rig.setFixed(titleShot);
        } else {
          game.god = true;
          startPlay();
          toT(plan.t - 0.1);
          place();
          toT(plan.t);
          const comp = getShot(plan.composition);
          if (!comp) throw new Error(`構図 ${plan.composition} が無い`);
          rig.setFixed(comp);
        }
      }
    }
  }
}

try {
  boot();
} catch (e) {
  window.__appError = String(e instanceof Error ? e.message : e);
  console.error(e);
}
