import { loadout } from './lib/upgrades.js';
import { mulberry32 } from './lib/rng.js';
import { createGame, step, snapshot, autoInput } from './lib/game.js';
import { review, clamp, readBand } from './lib/lanes.js';
import { heatFill } from './lib/heat-color.js';
import { load, saveBest, saveMute } from './lib/store.js';
import { createAudio } from './lib/audio.js';
import { loadSprites, fallback } from './lib/sprites.js';

export function boot() {
  const $ = id => document.getElementById(id), app = $('app'), canvas = $('game'), ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const rawSeed = new URLSearchParams(location.search).get('seed');
  const seed = rawSeed !== null && /^\d+$/.test(rawSeed) ? Number(rawSeed) : Date.now();
  let rng = mulberry32(seed), s = createGame(), input = {}, manual = false, auto = false, raf = 0, last = 0, accumulated = 0, pointer = null;
  let recording = false, recordedEvents = [];
  let storage; try { storage = localStorage; } catch { /* 保存拒否 */ }
  let { best, mute, available } = load(storage);
  const audio = createAudio(); audio.setMute(mute);
  let sprites = { draw: fallback }, ready = false, wantsStart = false;
  const timer = setTimeout(() => { if (!ready && s.status === 'empty') { s.status = 'loading'; sync(); } }, 200);
  loadSprites().then(loaded => {
    clearTimeout(timer); ready = true; sprites = loaded; app.dataset.art = loaded.fallback ? 'fallback' : 'images';
    $('art-note').hidden = !loaded.fallback;
    if (wantsStart) start(); else { if (s.status === 'loading') s.status = 'empty'; sync(); draw(); }
  });
  function clearInput() { input = {}; pointer = null; }
  // 公開URLはビルドが <link rel="canonical"> に入れる。手元で開いたときは今いるURL。
  const shareUrl = () => document.querySelector('link[rel="canonical"]')?.href || location.href;
  const shareText = () => `その撃ち方、読まれてる — ${s.score}点・ウェーブ${s.wave}・LV${s.level}まで到達。${review(s.shotHeat, s.positions)}`;
  function start() {
    if (!ready) { wantsStart = true; return; }
    wantsStart = false; s = createGame('playing'); rng = mulberry32(seed); clearInput(); accumulated = 0;
    $('result-said').hidden = true; $('result-said').textContent = '';
    auto = location.hash === '#auto'; sync();
    document.querySelector('.hud').scrollIntoView({ block: 'start', behavior: reduced.matches ? 'auto' : 'instant' }); canvas.focus({ preventScroll: true }); draw();
  }
  function sync() {
    app.dataset.state = s.status;
    for (const key of ['score', 'lives', 'wave', 'level', 'readLevel']) $(key === 'readLevel' ? 'read-level' : key).textContent = s[key];
    $('remaining').textContent = s.fleet.enemies.filter(e => e.alive).length;
    $('read-meter').value = s.readLevel;
    document.querySelector('.reading').dataset.level = readBand(s.readLevel);
    $('best').textContent = best?.score ?? '—';
    $('intro').hidden = !['empty', 'loading'].includes(s.status);
    $('start').textContent = s.status === 'loading' ? '読み込み中…' : 'はじめる';
    $('paused-panel').hidden = s.status !== 'paused'; $('result').hidden = s.status !== 'over';
    $('pause').disabled = !['playing', 'paused'].includes(s.status);
    $('pause').textContent = s.status === 'paused' ? '再開' : '一時停止';
    $('mute').textContent = mute ? '音：オフ' : '音：オン'; $('mute').setAttribute('aria-pressed', String(mute));
    $('save-note').hidden = available;
    if (s.status === 'over') {
      $('final-score').textContent = s.score; $('final-wave').textContent = s.wave; $('final-best').textContent = best?.score ?? s.score;
      $('final-level').textContent = s.level; $('final-kills').textContent = s.kills; $('final-bonus').textContent = s.bonusKills;
      $('review').textContent = review(s.shotHeat, s.positions); $('reason').textContent = s.reason;
      $('result-x').href = `https://x.com/intent/post?text=${encodeURIComponent(shareText())}&url=${encodeURIComponent(shareUrl())}`;
    }
  }
  function tick(dt) {
    const before = s.status;
    s = step(s, dt, auto ? autoInput(s) : input, rng);
    if (before === 'playing') for (const event of s.events) {
      if (recording) recordedEvents.push({ t: s.time, name: event });
      audio.play(event);
    }
    if (before === 'playing' && s.status === 'over') {
      const saved = saveBest(storage, best, s.score, s.wave); best = saved.best; available = saved.saved;
      clearInput(); $('status').textContent = `${s.reason}。${s.score}点。${review(s.shotHeat, s.positions)}`;
      sync(); $('retry').focus({ preventScroll: true });
    } else sync();
  }
  function draw() {
    const dpr = Math.min(devicePixelRatio || 1, 3);
    if (canvas.width !== Math.round(480 * dpr)) { canvas.width = Math.round(480 * dpr); canvas.height = Math.round(640 * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const font = size => `${Math.max(size, 14 * 480 / Math.max(1, canvas.getBoundingClientRect().width))}px system-ui`;
    ctx.fillStyle = '#091426'; ctx.fillRect(0, 0, 480, 640);
    if (sprites.background) {
      const img = sprites.background, scale = Math.max(480 / img.naturalWidth, 640 / img.naturalHeight);
      ctx.globalAlpha = 0.55; ctx.drawImage(img, (480 - img.naturalWidth * scale) / 2, (640 - img.naturalHeight * scale) / 2, img.naturalWidth * scale, img.naturalHeight * scale); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#7d92b4';
    for (let i = 0; i < 65; i++) ctx.fillRect((i * 137 + 21) % 480, (i * 89 + 31) % 640, i % 3 === 0 ? 2 : 1, 2);
    // オーバーレイが出ている間は帯もラベルも描かない（文字同士が重なって読めなくなる）。
    if (s.status === 'playing') {
      const hottest = s.heat.reduce((best, v, i) => (v > s.heat[best] ? i : best), 0);
      ctx.lineWidth = 1;
      for (let i = 0; i < 12; i++) {
        const left = i * 40 + 2;
        if (s.heat[i] > 0) { ctx.fillStyle = heatFill(s.heat[i]); ctx.fillRect(left, 8, 36, 44); }
        ctx.strokeStyle = 'rgba(255,165,143,0.5)'; ctx.strokeRect(left + 0.5, 8.5, 35, 43);
        // いちばん熱いレーンは色だけでなく形でも分かるようにする。
        if (i === hottest && s.heat[i] > 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(left, 8, 36, 1); }
      }
      ctx.font = font(14); ctx.textAlign = 'left'; ctx.fillStyle = '#e3eafa'; ctx.fillText('撃ち癖の熱', 14, 72);
    }
    ctx.strokeStyle = '#49617d'; ctx.setLineDash([5, 7]); ctx.beginPath(); ctx.moveTo(0, 560); ctx.lineTo(480, 560); ctx.stroke(); ctx.setLineDash([]);
    for (const e of s.fleet.enemies.filter(e => e.alive)) {
      const x = e.x + s.fleet.x, y = e.y + s.fleet.y;
      if (s.fleet.offset && !reduced.matches) { ctx.globalAlpha = 0.25; sprites.draw(ctx, e.type, x, y, e.w, e.h); ctx.globalAlpha = 1; }
      sprites.draw(ctx, e.type, x + s.fleet.offset, y, e.w, e.h);
    }
    for (const item of s.items) {
      ctx.save(); ctx.translate(item.x + item.w / 2, item.y + item.h / 2); ctx.rotate(reduced.matches ? 0 : s.time * 0.6);
      ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(10, 0); ctx.lineTo(0, 10); ctx.lineTo(-10, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    }
    ctx.fillStyle = '#9cffe1'; for (const b of s.bullets) ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#ffbd8f'; for (const b of s.enemyBullets) ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#ffcf9a'; ctx.textAlign = 'center'; ctx.font = font(20); ctx.fillText('▽', s.predictedX, 555);
    if (s.invincible > 0.9) {
      ctx.strokeStyle = '#ffbc90'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.player.x, s.player.y, 18 + (1.2 - s.invincible) * 60, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.globalAlpha = s.invincible > 0 ? 0.5 : 1; sprites.draw(ctx, 'player', s.player.x, s.player.y, 44, 36); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#31445d'; ctx.fillRect(s.player.x - 15, s.player.y + 23, 30, 3);
    ctx.fillStyle = '#9cffe1';
    const equipment = loadout(s.level);
    if (equipment.cooldown >= 0.16) {
      const reload = s.bullets.length + equipment.columns > equipment.volleys * equipment.columns || s.invincible > 0 || s.waveTransition > 0 ? 0 : 1 - s.shotCooldown / equipment.cooldown;
      ctx.fillRect(s.player.x - 15, s.player.y + 23, 30 * clamp(reload, 0, 1), 3);
    }
    if (s.waveTransition > 0) { ctx.font = `bold ${font(42)}`; ctx.fillStyle = '#9cffe1'; ctx.fillText(`WAVE ${s.wave}`, 240, 330); }
    ctx.font = `bold ${font(18)}`; ctx.fillStyle = '#fff1bd';
    for (const f of s.floats) { const half = ctx.measureText(f.text).width / 2 + 8; ctx.fillText(f.text, clamp(f.x, half, 480 - half), f.y); }
    // ウェーブ表示の最中は、同じ高さに別の文字を重ねない。
    if (s.fleet.offset && s.waveTransition <= 0) { ctx.font = font(16); ctx.fillText('読まれた → 艦隊が回避', 240, 340); }
  }
  function frame(now) {
    if (manual) return;
    accumulated += Math.min((now - (last || now)) / 1000, 0.1); last = now;
    while (accumulated >= 1 / 60) { tick(1 / 60); accumulated -= 1 / 60; }
    draw(); raf = requestAnimationFrame(frame);
  }
  function pause() {
    if (!['playing', 'paused'].includes(s.status)) return;
    s.status = s.status === 'playing' ? 'paused' : 'playing'; clearInput(); sync(); draw();
  }
  function toggleMute() { mute = !mute; audio.setMute(mute); available = saveMute(storage, mute); sync(); }
  $('start').onclick = $('retry').onclick = () => { audio.unlock(); start(); };
  $('pause').onclick = () => { audio.unlock(); pause(); };
  $('mute').onclick = () => { audio.unlock(); toggleMute(); };
  $('result-copy').onclick = async () => {
    const url = shareUrl(), said = $('result-said');
    let copied = false;
    try { await navigator.clipboard.writeText(url); copied = true; } catch { copied = false; }
    // コピーできない環境では、その場で選んで貼れるURLを出す。
    said.textContent = copied ? 'コピーしました' : url; said.hidden = false;
  };
  const keys = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right' };
  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (e.target.closest?.('button, a') && (key === 'Enter' || key === ' ')) return;
    if (keys[key]) { e.preventDefault(); input[keys[key]] = true; audio.unlock(); }
    else if (!e.repeat && ['Enter', ' ', 'p', 'Escape', 'm'].includes(key)) {
      e.preventDefault(); audio.unlock();
      if (['Enter', ' '].includes(key) && ['empty', 'over', 'loading'].includes(s.status)) start();
      if (key === 'p' || key === 'Escape') pause(); if (key === 'm') toggleMute();
    }
  });
  window.addEventListener('keyup', e => { const key = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (keys[key]) { e.preventDefault(); input[keys[key]] = false; } });
  const point = e => { const r = canvas.getBoundingClientRect(); input.targetX = (e.clientX - r.left) / r.width * 480; };
  canvas.addEventListener('pointerdown', e => { if (s.status !== 'playing' || pointer !== null) return; audio.unlock(); pointer = e.pointerId; canvas.setPointerCapture(pointer); canvas.focus({ preventScroll: true }); point(e); });
  canvas.addEventListener('pointermove', e => { if (e.pointerId === pointer) point(e); });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, e => { if (e.pointerId === pointer) clearInput(); });
  window.addEventListener('blur', () => { clearInput(); if (s.status === 'playing') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && s.status === 'playing') pause(); });
  window.__day045 = {
    debug: { dropItem: () => { if (manual && s.status === 'playing' && s.items.length < 6) { s.items.push({ x: s.player.x - 10, y: 574, w: 20, h: 20, vy: 120 }); draw(); } }, clearFleet: () => { if (manual && s.status === 'playing') { s.fleet.enemies.forEach(e => { e.alive = false; }); sync(); draw(); } } },
    recordEvents: on => { recording = Boolean(on); if (recording) recordedEvents = []; },
    events: () => recordedEvents.map(event => ({ ...event })), seconds: () => s.time,
    state: () => s.status, snapshot: () => snapshot(s), input: value => { input = { ...value }; },
    moveTo: x => { if (Number.isFinite(x)) s.player.x = clamp(x, 24, 456); draw(); },
    fire: () => { tick(1 / 60); draw(); },
    setManual: value => { manual = Boolean(value); cancelAnimationFrame(raf); last = 0; accumulated = 0; if (!manual) raf = requestAnimationFrame(frame); },
    advance: ms => { if (!manual || !Number.isFinite(ms) || ms < 0) return; accumulated += ms / 1000; while (accumulated + 1e-10 >= 1 / 60) { tick(1 / 60); accumulated -= 1 / 60; } draw(); },
    autopilot: value => { auto = Boolean(value); }, start, retry: start
  };
  sync(); draw(); raf = requestAnimationFrame(frame);
}
if (typeof document !== 'undefined') boot();
