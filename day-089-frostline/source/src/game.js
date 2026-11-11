import { createPlay } from './play/index.js';
import { createLoop } from './core/loop.js';
import { createSettings } from './core/settings.js';
import { selectQuality } from './core/quality.js';
import { debugEnabled, installDebugApi } from './core/debug-api.js';
import { createInput } from './input/index.js';
import { createTouch } from './input/touch.js';
import { createUI } from './ui/index.js';
/** 出発地点での押し出しの速さ（m/s）。人が板を押して滑り出すくらい */
export const START_PUSH = 3;
const noop = () => {};
/** 物理・世界・描画の実装を一切読まず、契約だけでつなぐ。 */
export function createGame({ root, world, ride, view = {}, audio = {}, settings = createSettings(),
  input, ui, play = createPlay({ world }), initialDrop, debug = {} }) {
  if (!ride) throw new TypeError('滑走の部品が必要です');
  const document = root?.ownerDocument ?? globalThis.document;
  const target = debug.target ?? document?.defaultView ?? globalThis.window;
  const touch = (target?.navigator?.maxTouchPoints ?? 0) > 0;
  const search = debug.search ?? target?.location?.search ?? '';
  // アドレスの ?gear=ski・?gear=board は、開いたときの道具を決める（設定を書き換える。そのあとは、画面のボタンで替えられる）。
  // 「設定より優先して、ずっと固定する」作りにしたら、ボタンの表示だけが替わり、実際の道具が替わらなかった（スキーの滑りの採点 1 周目）
  const linkedGear = ['board', 'ski'].find(g => g === new URLSearchParams(search).get('gear'));
  if (linkedGear && settings.get().gear !== linkedGear) settings.set({ gear: linkedGear });
  const canvasHost = root && document.createElement('div');
  if (canvasHost) { canvasHost.className = 'canvas-host'; root.append(canvasHost); }
  ui ??= createUI({ root, settings, touch });
  input ??= createInput({ target, touch: createTouch({ root: ui.controls }), lookElement: canvasHost, initialDevice: touch ? 'touch' : 'keyboard' });
  let stage = 'title', disposed = false, prepared = false, jumped = true, pendingEvents = [], lastEvents = [], simulatedDt = 0;
  const errors = [], state = ride.createState(), prev = ride.createState();
  const environment = () => ({ search, quality: settings.get().quality,
    webgpu: !!target?.navigator?.gpu && new URLSearchParams(search).get('webgl') !== '1', touch,
    width: root?.clientWidth || 1440, height: root?.clientHeight || 900, pixelRatio: target?.devicePixelRatio || 1 });
  copyCurrent();
  let mapFrom = 'title';
  // 景色を見る：山のデータが持つ視点。無ければ（古い山）、真上と南からの 2 つ
  const vistaViews = () => world?.meta?.views?.length ? world.meta.views : [
    { id: 'topdown', name: '真上から', pos: [0, (world?.meta?.heightRange?.[1] ?? 2000) + 7000, 1], target: [0, 0, 0], fov: 40 },
    { id: 'south', name: '南から', pos: [0, (world?.meta?.heightRange?.[1] ?? 2000) + 1500, (world?.half ?? 3000) + 2500], target: [0, world?.meta?.heightRange?.[0] ?? 600, 0], fov: 45 }];
  let vistaFrom = 'pause', vistaIndex = 0;
  let activeDrop = initialDrop ?? world?.drops?.find(d => Math.hypot(d.x-state.pos.x,d.z-state.pos.z)<1) ?? world?.drops?.[0];
  let tier = selectQuality(environment());
  const info = { backend: '未確認', tier, version: '0.0.1' };
  function copyCurrent() { ride.copyState(ride.state, state); ride.copyState(ride.state, prev); jumped = true; }
  function draw({ alpha, frameDt, time }) {
    if (!prepared || disposed) return;
    lastEvents = pendingEvents; pendingEvents = [];
    const options = { state, prev, alpha, events: lastEvents, frameDt, time, manual: loop.manual === true,
      look: input.consumeLook?.(frameDt) ?? { yaw: 0, pitch: 0, camera: 'third' }, settings: settings.get(), jumped,
      vista: stage === 'vista' ? vistaViews()[vistaIndex] : null };
    view.render?.(options);
    // 景色を見ている間は、滑走の音と表示を進めない（止まった状態の風の音が鳴り続けるのを防ぐ）
    if (stage === 'vista') { simulatedDt = 0; jumped = false; return; }
    audio.update?.({ state, events: lastEvents, frameDt, settings: options.settings });
    ui.update?.({ state, events: lastEvents, frameDt: simulatedDt, input: input.current?.(), device: input.device, play: play.snapshot() });
    simulatedDt = 0; jumped = false;
  }
  function perform(action) {
    if (action === 'map') { if (stage === 'map') game.closeMap(); else game.openMap(); }
    else if (action === 'finish' && stage === 'ride') game.finish();
    // 題字の画面は、Enter と空白キーでも滑り出せる（焦点がボタンに無いと、キーでは始まらなかった：体験の採点 2 周目）
    else if ((action === 'finish' || action === 'confirm') && stage === 'title') game.start().catch(noop);
    else if (action === 'pause') { if (stage === 'ride') game.pause(); else if (stage === 'pause') game.resume(); else if (stage === 'map') game.closeMap(); else if (stage === 'summary') game.resumeSummary(); else if (stage === 'vista') game.closeVista(); }
    else if (action === 'camera' && stage === 'ride') input.toggleCamera?.();
    else if ((action === 'drop' || action === 'safe') && (stage === 'ride' || stage === 'pause')) game.respawn(action);
  }
  const loop = createLoop({
    ...debug.clock,
    beforeFrame() { input.poll?.(); ui.setDevice?.(input.device); for (const action of input.drainActions?.() ?? []) perform(action); },
    step(dt) {
      if (stage !== 'ride') return;
      ride.copyState(state, prev);
      ride.step(input.sample(dt), dt); ride.copyState(ride.state, state);
      pendingEvents.push(...structuredClone(ride.events)); simulatedDt += dt;
      if (play.update(state, ride.events, dt)) showSummary();
    }, render: draw,
  });
  loop.setPaused(true);
  function resize() {
    if (!prepared || disposed) return;
    view.resize?.(root?.clientWidth || 1440, root?.clientHeight || 900, target?.devicePixelRatio || 1);
    const next = selectQuality(environment()); if (next !== tier) { tier = next; info.tier = tier; view.setTier?.(tier); }
  }
  function settingsChanged(value) {
    const next = selectQuality(environment()); if (next !== tier) { tier = next; info.tier = tier; if (prepared) view.setTier?.(tier); }
    // 利き足は状態の公開項目。描画・音へも同じ設定を渡す。
    ride.state.stance = value.stance; state.stance = value.stance; prev.stance = value.stance;
    // 滑る道具：物理の値を切り替え、描画へも同じ値を渡す
    const gear = value.gear ?? 'board';
    if (ride.state.gear !== gear) ride.setGear?.(gear);
    ride.state.gear = gear; state.gear = gear; prev.gear = gear;
  }
  const unsubscribe = settings.subscribe(settingsChanged); settingsChanged(settings.get());
  function collectJumpEvents() {
    pendingEvents = structuredClone(ride.events); lastEvents = []; simulatedDt = 0; copyCurrent(); loop.reset(); ui.reset?.(); input.clear?.();
    draw({ alpha: 0, frameDt: 0, time: loop.time });
  }
  function teleport(spawn) {
    const point = typeof spawn === 'string' ? (debug.spawns?.[spawn] ?? world?.drops?.find(point => point.id === spawn || point.name === spawn)) : spawn;
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) throw new Error('出発地点が見つかりません');
    // 出発地点では、軽く押し出して滑り出す（緩い新雪の地点で、静止からだと時速 14 km に 10 秒かかった）。速さを指定した移動はそのまま
    play.finish({ silent: true });
    ride.reset({ heading: 0, speed: START_PUSH, ...point });
    play.begin(point, ride.state); activeDrop = point; settingsChanged(settings.get()); collectJumpEvents();
  }
  function visibility() {
    loop.setHidden(!!document?.hidden);
    if (document?.hidden) { if (stage === 'ride') game.pause(); input.clear?.(); }
  }
  function showSummary() {
    stage = 'summary'; loop.setPaused(true); input.clear?.(); ui.setPlay?.(play.snapshot(), play.map()); ui.show?.('summary');
  }
  function showRide() { stage = 'ride'; input.clear?.(); loop.setPaused(false); ui.show?.('ride'); Promise.resolve(audio.resume?.()).catch(noop); }
  const game = {
    ready: null,
    async start() {
      await game.ready; if (disposed || stage !== 'title') return;
      if (activeDrop && !play.begin(activeDrop, state)) {
        const available = play.map().drops.find(d => !d.locked);
        if (available) teleport(available);
      }
      stage = 'ride'; ui.show?.('ride'); input.clear?.(); loop.setPaused(false);
      try { await audio.resume?.(); } catch { /* 音を利用できなくても滑走する */ }
    },
    openMap() {
      if (!prepared || disposed || stage === 'map') return;
      mapFrom = stage; stage = 'map'; loop.setPaused(true); input.clear?.(); ui.setPlay?.(play.snapshot(), play.map()); ui.show?.('map');
    },
    closeMap() {
      if (stage !== 'map') return;
      stage = mapFrom; ui.setPlay?.(play.snapshot(),play.map()); ui.show?.(stage); input.clear?.(); loop.setPaused(stage !== 'ride');
    },
    /** 景色を見る：決まった視点へカメラを移す。滑走は止めたまま、描画だけ続ける */
    openVista(index = vistaIndex) {
      if (!prepared || disposed) return;
      const list = vistaViews(); if (!list.length) return;
      if (stage !== 'vista') vistaFrom = stage === 'ride' ? 'pause' : stage;
      if (stage === 'ride') { play.snapshot(); }
      stage = 'vista'; vistaIndex = ((Math.round(index) % list.length) + list.length) % list.length;
      input.clear?.(); ui.setVista?.({ name: list[vistaIndex].name ?? list[vistaIndex].id, index: vistaIndex, count: list.length }); ui.show?.('vista'); loop.setPaused(false);
    },
    stepVista(delta = 1) { if (stage === 'vista') game.openVista(vistaIndex + delta); },
    closeVista() {
      if (stage !== 'vista') return;
      stage = vistaFrom; jumped = true; input.clear?.(); loop.setPaused(true); ui.setPlay?.(play.snapshot(), play.map()); ui.show?.(stage);
      draw({ alpha: 1, frameDt: 0, time: loop.time });
    },
    chooseDrop(id) {
      if (!prepared || disposed) return;
      const point = play.map().drops.find(d => d.id === id && !d.locked); if (!point) return;
      teleport(point); showRide();
    },
    finish() { if (!['ride','pause'].includes(stage) || !play.snapshot().canFinish) return; play.finish(); showSummary(); },
    resumeSummary() { if(stage !== 'summary') return; teleport(activeDrop); showRide(); },
    clearProgress() { play.clearProgress(); ui.setPlay?.(play.snapshot(),play.map()); },
    pause() { if (stage !== 'ride' || disposed) return; stage = 'pause'; loop.setPaused(true); input.clear?.(); ui.setPlay?.(play.snapshot(),play.map()); ui.show?.('pause'); },
    resume() {
      if (stage !== 'pause' || disposed || document?.hidden) return;
      stage = 'ride'; input.clear?.(); loop.setPaused(false); ui.show?.('ride');
      Promise.resolve(audio.resume?.()).catch(noop);
    },
    respawn(kind = 'safe') {
      if (disposed || !prepared) return;
      const retry = kind === 'drop' ? play.retryPoint() : null;
      if (retry) {
        const origin = activeDrop;
        play.finish({ silent: true });
        ride.reset({ heading: 0, speed: START_PUSH, ...retry });
        play.begin(origin ?? retry, ride.state, { keepRetry: true });
      } else {
        play.finish({ silent: true }); ride.respawn(kind);
        if (activeDrop) play.begin(activeDrop, ride.state, { keepRetry: true });
      }
      settingsChanged(settings.get()); collectJumpEvents(); if (stage === 'pause') game.resume();
    },
    restore(snapshot) { ride.restore(snapshot); settingsChanged(settings.get()); collectJumpEvents(); },
    dispose() {
      if (disposed) return; play.finish({ silent: true }); disposed = true; loop.stop(); unsubscribe(); debugHandle.dispose();
      document?.removeEventListener?.('visibilitychange', visibility); target?.removeEventListener?.('resize', resize);
      observer?.disconnect(); input.dispose?.(); ui.dispose?.(); view.dispose?.(); audio.dispose?.(); canvasHost?.remove();
    },
  };
  ui.setHandlers?.({ start: () => { game.start().catch(noop); }, resume: game.resume,
    vista: () => game.openVista(), vistaStep: delta => game.stepVista(delta), closeVista: game.closeVista,
    map: game.openMap, closeMap: game.closeMap, next: game.chooseDrop, again: game.chooseDrop, finish: game.finish, closeSummary: game.resumeSummary, clearProgress: game.clearProgress,
    pause: () => perform('pause'), safe: () => game.respawn('safe'), drop: () => game.respawn('drop'), camera: () => perform('camera') });
  ui.loading?.({ progress: 0 });
  const ready = Promise.resolve().then(async () => {
    await view.init?.({ canvasHost, world, tier }); if (disposed) return;
    prepared = true; view.setTier?.(tier); Object.assign(info, view.info ?? {}); info.tier = tier;
    resize(); ui.loading?.({ progress: 1, ready: true }); draw({ alpha: 0, frameDt: 0, time: 0 }); return info;
  }).catch(error => { errors.push(String(error?.message ?? error)); ui.loading?.({ failed: true }); throw error; });
  game.ready = ready; ready.catch(noop);
  const debugHandle = installDebugApi({ target, enabled: debugEnabled({ enabled: debug === true || debug.enabled,
    dev: debug.dev ?? import.meta.env?.DEV, search }), ready, info, errors,
    state: () => state, events: () => lastEvents, input, loop, teleport, restore: game.restore, play: () => ({ stage, ...play.snapshot(), map: play.map() }),
    vista: index => (index === null || index === undefined ? game.closeVista() : game.openVista(index)), views: () => structuredClone(vistaViews()) });
  target?.addEventListener?.('resize', resize); document?.addEventListener?.('visibilitychange', visibility);
  const observer = root && target?.ResizeObserver ? new target.ResizeObserver(resize) : null; observer?.observe(root);
  visibility(); loop.start(); return game;
}
