// OWNER: core
// 遊びのモード（?shot などが無いとき）。街の上空の竜に「クリックで始める」を重ね、クリックで3分の遊びが始まる。
// 1コマの順序：入力 →（自動プレイ）→ 遊びを固定刻みで進める → 竜・カメラ・効果を合わせる → 描く → HUD と __state を書く。
// Esc で一時停止、R でやり直し（遊んでいる途中は0.8秒の長押し、結果の画面では1回）、P で撮影モード（時間を止め、HUD を消し、自由視点、Enter で PNG を保存）。
// r03-roster：始める前と結果の画面で、数字キー 1〜3 か札のクリックで怪獣を選ぶ（CHARACTERS.md の UX5）。選んだ怪獣は保存し、次に開いたときも続ける。
// 遊んでいる途中（と一時停止）は選び直せない。残りの怪獣は遊べるようになってから裏で読んでおき、結果の画面から2秒以内に別の怪獣で始める。
import type { App } from './app';
import { GameAudio } from './audio/gameAudio';
import { PhotoCamera } from './camera/photoCam';
import { KEYS, RESTART_HOLD_SECONDS } from './config/controls';
import { CREATURE_CONFIG, CREATURE_IDS, type CreatureId } from './config/creatures';
import type { QualityName } from './config/quality';
import { InputState } from './core/input';
import { FixedStepLoop } from './core/loop';
import { loadPrefs, savePrefs } from './core/prefs';
import { readControls } from './gameplay/controls';
import './harness/globals';
import { InputBridge } from './harness/inputApi';
import { BasicPlaytest, ScriptPlaytest, type Playtest } from './harness/playtest';
import { probeState } from './harness/stateProbe';
import { Stage } from './stage';
import { formatYen } from './ui/format';
import { Hud } from './ui/hud';
import { Overlays, type OverlayKind } from './ui/overlays';
import { loadRecords, recordRun } from './ui/records';

const pressedAny = (input: InputState, codes: readonly string[]): boolean => codes.some((c) => input.wasPressed(c));

/** 数字キー 1〜3 で選ぶ怪獣（押されていなければ null）。 */
function pressedCreature(input: InputState): CreatureId | null {
  const keys = [KEYS.creature1, KEYS.creature2, KEYS.creature3];
  for (let i = 0; i < keys.length; i++) if (pressedAny(input, keys[i])) return CREATURE_IDS[i];
  return null;
}

function createPlaytest(kind: 'basic' | 'script' | null): Playtest | null {
  if (kind === 'basic') return new BasicPlaytest();
  if (kind === 'script') return new ScriptPlaytest(window.__playtestScript ?? []);
  return null;
}

/** 札の下に出す、怪獣ごとの自己ベスト（被害総額）。 */
function bestsText(): Partial<Record<CreatureId, string>> {
  const file = loadRecords();
  const out: Partial<Record<CreatureId, string>> = {};
  for (const id of CREATURE_IDS) {
    const best = file.monsters[CREATURE_CONFIG[id].recordKey]?.best;
    if (best) out[id] = formatYen(best.yen);
  }
  return out;
}

/** 今の画面を PNG で保存する（HUD は DOM なので写らない）。 */
function savePhoto(app: App): void {
  app.renderFrame(0);
  const name = `dragon-rampage-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  app.renderer.domElement.toBlob((blob) => {
    if (!blob) return;
    window.__lastPhoto = { name, bytes: blob.size };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
}

export async function runPlay(app: App): Promise<FixedStepLoop> {
  const canvas = app.renderer.domElement;
  const input = new InputState();
  input.attach(canvas);
  const stage = new Stage(app);
  await stage.warmUp();
  const game = stage.game;
  const prefs = loadPrefs();
  // r02-controls：一時停止の画面で選んだ感度と上下反転（本物のマウスの動きにだけ効く）
  input.setLookPrefs({ scale: prefs.lookScale, invertY: prefs.invertY });
  // r00d：音。出来事を購読するので、遊びが始まる（session.start を出す）より前に作る。怪獣ごとの音（r03-roster）は、その怪獣の名前で引く
  const audio = GameAudio.create(game, prefs, CREATURE_CONFIG[game.creature.id].sound);
  const bot = createPlaytest(app.settings.playtest);
  const hud = app.settings.hud ? new Hud(document.body) : null;
  const photoCam = new PhotoCamera(app.camera, input);
  let photo = false;
  let frozen = false;
  let saveRequested = false;
  let waterTime = 0;
  let lastUnlock = -1e9;
  let shownOverlay: OverlayKind = 'none';
  /** 怪獣を差し替えている最中（読み込みを待つ間）。その間は始める・選び直す操作を受けない */
  let switching = false;

  const click = (target: string): void => game.bus.emit('ui.click', { t: game.clock, target });
  const lockPointer = (): void => {
    if (bot || document.pointerLockElement === canvas) return;
    try {
      const r = canvas.requestPointerLock() as unknown;
      if (r instanceof Promise) r.catch(() => undefined);
    } catch {
      // ポインタロックが使えない環境では、ドラッグで視点を動かす
    }
  };
  const unlockPointer = (): void => {
    if (document.pointerLockElement) document.exitPointerLock();
  };
  const start = (): void => {
    if (game.session.phase !== 'ready' || switching) return;
    audio?.wake();
    click('start');
    game.start();
    lockPointer();
  };
  const pause = (): void => {
    if (game.session.phase !== 'playing') return;
    game.pause();
    input.releaseAll();
    unlockPointer();
  };
  const resume = (): void => {
    if (game.session.phase !== 'paused') return;
    click('resume');
    game.resume();
    lockPointer();
  };
  const restart = (): void => {
    if (switching) return;
    click('restart');
    input.releaseAll();
    photo = false;
    stage.restart();
    lockPointer();
  };
  let overlays: Overlays | null = null;
  /**
   * 怪獣を選ぶ（始める前と結果の画面だけ）。then は差し替えの後にすること：
   * 'start' は始める前ならすぐ始める、'restart' は結果の画面ならその怪獣でやり直す、'none' は選ぶだけ。
   */
  const choose = (id: CreatureId, then: 'start' | 'restart' | 'none'): void => {
    const phase = game.session.phase;
    if (switching || (phase !== 'ready' && phase !== 'result')) return;
    audio?.wake();
    click(`creature.${id}`);
    prefs.creature = id;
    savePrefs(prefs);
    overlays?.setCreature(id);
    const done = (): void => {
      switching = false;
      if (then === 'start' && game.session.phase === 'ready') start();
      else if (then === 'restart' && game.session.phase === 'result') restart();
    };
    if (game.creature.id === id) return done();
    switching = true;
    stage.setCreature(id).then(done, (e: unknown) => {
      switching = false;
      window.__appError = `怪獣を替えられませんでした: ${e instanceof Error ? e.message : String(e)}`;
      console.error(window.__appError);
    });
  };
  overlays = new Overlays(
    document.body,
    {
      start,
      resume,
      restart,
      quality: (q: QualityName) => {
        click(`quality.${q}`);
        const url = new URL(window.location.href);
        url.searchParams.set('q', q);
        window.location.href = url.toString();
      },
      volume: (kind, v) => {
        prefs[kind] = v;
        savePrefs(prefs);
        audio?.setVolumes(prefs);
        click('volume');
      },
      look: (p) => {
        prefs.lookScale = p.scale;
        prefs.invertY = p.invertY;
        savePrefs(prefs);
        input.setLookPrefs(p);
        click('look');
      },
      // 札を押した：始まる前ならその怪獣ですぐ始め、結果の画面ならその怪獣でやり直す
      choose: (id) => choose(id, game.session.phase === 'result' ? 'restart' : 'start'),
    },
    app.settings.quality,
    prefs,
    { scale: prefs.lookScale, invertY: prefs.invertY },
    game.creature.id,
  );
  overlays.setBests(bestsText());
  const bridge = new InputBridge(input, () => (game.session.phase === 'ready' ? start() : resume()));
  window.__input = bridge.api;
  // r03-roster：freezeOn は、出来事がその回数だけ出てから after 秒（ゲーム内時刻）たった刻みで止める（技の瞬間を撮る。tools/play.mjs の --shot-on）
  let freezeWatch: { type: string; left: number; after: number } | null = null;
  let freezeAt: number | null = null;
  game.bus.onAny((e) => {
    if (!freezeWatch || e.type !== freezeWatch.type) return;
    freezeWatch.left--;
    if (freezeWatch.left > 0) return;
    freezeAt = e.t + freezeWatch.after;
    freezeWatch = null;
    if (freezeAt <= game.clock) {
      freezeAt = null;
      frozen = true;
    }
  });
  window.__play = {
    freeze: (on: boolean) => (frozen = on),
    freezeOn: (type: string, n: number, after = 0) => (freezeWatch = { type, left: Math.max(1, Math.round(n)), after: Math.max(0, after) }),
    get frozen() {
      return frozen;
    },
  };
  document.addEventListener('pointerlockchange', () => {
    // Esc でポインタロックが外れたら一時停止（ブラウザはこの Esc をページへ届けないことがある）
    if (document.pointerLockElement) return;
    lastUnlock = performance.now();
    if (game.session.phase === 'playing' && !photo) pause();
  });
  if (bot) game.start();
  // 残りの怪獣を裏で読んでおく（札で選び直した瞬間に止まらないように）。読めなくても遊べる
  void app.preloadCreatures().catch((e: unknown) => console.warn('怪獣を先に読めませんでした:', e));

  const togglePhoto = (): void => {
    if (game.session.phase === 'ready') return;
    photo = !photo;
    input.releaseAll();
    if (photo) photoCam.begin();
    else stage.follow.reset();
    overlays?.showPhotoHint(photo);
  };

  const handleKeys = (): void => {
    if (pressedAny(input, KEYS.photo)) togglePhoto();
    if (photo) {
      if (pressedAny(input, KEYS.photoSave)) saveRequested = true;
      if (pressedAny(input, KEYS.pause)) togglePhoto();
      return;
    }
    // r02-controls：遊んでいる途中の R は長押し（render で数える）。結果と一時停止の画面では1回で始める
    const phaseNow = game.session.phase;
    // r03-roster：始める前の数字キーは選ぶだけ（クリックで始める）。結果の画面の数字キーは、その怪獣ですぐやり直す
    const picked = pressedCreature(input);
    if (picked && phaseNow === 'ready') choose(picked, 'none');
    else if (picked && phaseNow === 'result') choose(picked, 'restart');
    else if (pressedAny(input, KEYS.restart) && (phaseNow === 'result' || phaseNow === 'paused')) restart();
    else if (pressedAny(input, KEYS.pause) && performance.now() - lastUnlock > 400) {
      if (game.session.phase === 'playing') pause();
      else if (game.session.phase === 'paused') resume();
    }
  };

  /** 遊んでいる途中に R を押し続けている実時間（秒） */
  let restartHeld = 0;
  let frame = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsStart = performance.now();
  const loop = new FixedStepLoop(
    {
      update: (dt) => {
        if (photo || frozen || switching) return;
        bridge.tick(dt);
        bot?.update(dt, game, input);
        const wasPlaying = game.session.phase === 'playing';
        game.step(dt, readControls(input));
        if (freezeAt !== null && game.clock >= freezeAt) {
          freezeAt = null;
          frozen = true;
        }
        if (wasPlaying && game.session.phase === 'result') unlockPointer();
      },
      render: (_alpha, frameDt) => {
        handleKeys();
        if (!photo && game.session.phase === 'playing' && KEYS.restart.some((c) => input.isDown(c))) {
          restartHeld += frameDt;
          if (restartHeld >= RESTART_HOLD_SECONDS) {
            restartHeld = 0;
            restart();
          }
        } else restartHeld = 0;
        const phase = game.session.phase;
        const still = photo || phase === 'paused' || frozen;
        stage.frame(frameDt, { follow: !photo, frozen: still });
        if (photo) photoCam.update(frameDt);
        if (!still) waterTime += frameDt * app.settings.speed;
        app.simTime = 12 + waterTime;
        app.renderFrame(frameDt);
        audio?.frame(app.camera.matrixWorld.elements, photo || frozen);
        if (saveRequested) {
          saveRequested = false;
          overlays?.hidePhotoHintNow();
          savePhoto(app);
        }
        const kind: OverlayKind = photo ? 'none' : phase === 'ready' ? 'ready' : phase === 'paused' ? 'paused' : phase === 'result' ? 'result' : 'none';
        if (kind !== shownOverlay) {
          const s = game.score;
          // r02-controls：結果が出た瞬間に自己ベストを記録し、前回との差を出す（鍵は怪獣の名前。r03-roster：怪獣ごとに分ける）
          const records = kind === 'result' ? recordRun(game.creature.recordKey, { yen: s.yen, destruction: s.destruction, maxCombo: s.maxCombo }) : undefined;
          if (kind === 'result' || kind === 'ready') overlays?.setBests(bestsText());
          overlays?.show(kind, { yen: s.yen, destruction: s.destruction, maxCombo: s.maxCombo, collapsed: game.damage.tally().collapsed, records, creature: game.creature.id });
          shownOverlay = kind;
        }
        hud?.setVisible(!photo);
        hud?.update(
          {
            timeLeft: game.session.timeLeft,
            yen: game.score.yen,
            destruction: game.score.destruction,
            combo: phase === 'playing' ? game.score.combo : 0,
            multiplier: game.score.multiplier,
            rage: game.score.rage,
            rageFull: game.score.rageFull,
            reach: game.aim.reach,
            cues: game.cues,
            coach: phase === 'playing' ? game.coach.visible(game.score.rageFull) : null,
            grounded: game.body.grounded,
            restartHold: restartHeld / RESTART_HOLD_SECONDS,
            creature: game.creature.id,
          },
          frameDt,
        );
        fpsFrames++;
        const now = performance.now();
        if (now - fpsStart >= 500) {
          fps = Math.round((fpsFrames * 1000) / (now - fpsStart));
          fpsFrames = 0;
          fpsStart = now;
        }
        window.__state = probeState(game, { photo, fps, frame: ++frame, bot: bot?.doing ?? null });
        input.endFrame();
      },
    },
    // r02-controls：遅いコマ（約8fps まで）でも実時間に追いつけるよう、1コマの刻みの上限を 5→8（×速さ）にした
    { step: 1 / 60, maxSubSteps: 8 * app.settings.speed, timeScale: app.settings.speed },
  );
  loop.start();
  return loop;
}
