// render-promo.mjs — Day098「残火の鎌倉 — 隠れ谷の灯」の宣伝動画（縦1080×1920・30秒・30fps）と
// 100日一覧カード用の demo.mp4（縦540×960・16秒・30fps・無音）を、実アプリの3D描画から1コマずつ決定的に撮影・合成・検査する。
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ebur, parseEbur } from './promo-audio.mjs';
import {
  BEAT,
  CUTS,
  DEMO_SEGMENTS,
  DURATION,
  ENDCARD,
  FADE,
  FIRST_NO_FADE_IN,
  FPS,
  HEIGHT,
  SUBTITLES,
  TOTAL_FRAMES,
  WIDTH,
} from './timeline.mjs';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function startStaticServer(dir) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const file = path.resolve(dir, rel);
    if (!file.startsWith(path.resolve(dir) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve =>
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })),
  );
}

async function loadPointerLockGuard() {
  const harnessPath = path.join(os.homedir(), '.local/share/agent-harness/pointerlock-guard.mjs');
  if (fs.existsSync(harnessPath)) {
    const mod = await import(pathToFileURL(harnessPath).href);
    return mod.guardPointerLock;
  }
  return async page => {
    await page.addInitScript(() => {
      Element.prototype.requestPointerLock = function () {};
      Document.prototype.exitPointerLock = function () {};
    });
  };
}

const FONT = "'Hiragino Mincho ProN', 'ヒラギノ明朝 ProN', 'Yu Mincho', serif";
const SUB_CENTER_Y = 1480;

const SUB_CSS = `
  html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; background: transparent; overflow: hidden; }
  body { font-family: ${FONT}; color: #f6eedd; -webkit-font-smoothing: antialiased; }
  .sub {
    position: absolute; left: 50%; top: ${SUB_CENTER_Y}px; transform: translate(-50%, -50%);
    text-align: center; padding: 24px 36px; border-radius: 18px;
    background: rgba(10, 14, 12, 0.72);
    border: 1.5px solid rgba(233, 201, 141, 0.48);
    box-shadow: 0 8px 34px rgba(0, 0, 0, 0.72);
    white-space: nowrap;
  }
  .sub div {
    font-size: 50px; font-weight: 600; letter-spacing: 0.05em; line-height: 1.48;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.95), 0 0 14px rgba(0, 0, 0, 0.9);
  }
  .end-shade {
    position: absolute; inset: 0;
    background: radial-gradient(ellipse at 50% 48%, rgba(8, 12, 10, 0.76) 0%, rgba(8, 12, 10, 0.64) 58%, rgba(8, 12, 10, 0.48) 100%);
  }
  .end {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
    text-align: center; white-space: nowrap;
  }
  .end .kicker {
    font-size: 38px; font-weight: 600; letter-spacing: 0.24em; color: #e9c98d;
    margin-bottom: 24px; text-shadow: 0 2px 6px rgba(0, 0, 0, 0.95);
  }
  .end .title {
    font-size: 146px; font-weight: 600; letter-spacing: 0.12em; margin-right: -0.12em;
    line-height: 1.15; color: #fbf3e2;
    text-shadow: 0 4px 8px rgba(0, 0, 0, 0.92), 0 0 40px rgba(0, 0, 0, 0.85);
  }
  .end .rule {
    width: 440px; height: 3px; margin: 36px auto 40px;
    background: #d7705a; box-shadow: 0 0 12px rgba(0, 0, 0, 0.85);
  }
  .end .line {
    font-size: 46px; font-weight: 600; letter-spacing: 0.06em; line-height: 1.65;
    color: #eee9dc; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.95), 0 0 14px rgba(0, 0, 0, 0.9);
  }
  .end .url {
    margin-top: 14px; font-size: 44px; font-weight: 600; letter-spacing: 0.08em;
    color: #e9c98d; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.95);
  }
  .end .note {
    margin-top: 38px; font-size: 28px; font-weight: 500; letter-spacing: 0.05em;
    color: #b6b9ac; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.95);
  }
`;

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function renderSubtitles(browser, subsDir) {
  fs.mkdirSync(subsDir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  const layout = {
    safe: { x0: WIDTH * 0.08, y0: HEIGHT * 0.08, x1: WIDTH * 0.92, y1: HEIGHT * 0.92 },
    items: [],
  };
  try {
    for (const s of SUBTITLES) {
      for (const l of s.lines) {
        if ([...l].length > 16) throw new Error(`Subtitle line exceeds 16 chars: ${l}`);
      }
      await page.setContent(
        `<style>${SUB_CSS}</style><div class="sub" id="box">${s.lines.map(l => `<div>${esc(l)}</div>`).join('')}</div>`,
      );
      await page.evaluate(() => document.fonts.ready);
      const r = await page.evaluate(() => {
        const b = document.getElementById('box').getBoundingClientRect();
        return { box: { x0: Math.round(b.left), y0: Math.round(b.top), x1: Math.round(b.right), y1: Math.round(b.bottom) } };
      });
      const insideSafe =
        r.box.x0 >= layout.safe.x0 &&
        r.box.x1 <= layout.safe.x1 &&
        r.box.y0 >= layout.safe.y0 &&
        r.box.y1 <= layout.safe.y1;
      assert.ok(insideSafe, `Subtitle ${s.id} outside safe area: ${JSON.stringify(r.box)}`);
      await page.screenshot({ path: path.join(subsDir, `${s.id}.png`), omitBackground: true });
      layout.items.push({ id: s.id, lines: s.lines, ...r, insideSafe });
    }

    await page.setContent(
      `<style>${SUB_CSS}</style><div class="end-shade"></div><div class="end" id="box">` +
        `<div class="kicker">${esc(ENDCARD.kicker)}</div>` +
        `<div class="title">${esc(ENDCARD.title)}</div>` +
        `<div class="rule"></div>` +
        `<div class="line">${esc(ENDCARD.lines[0])}</div>` +
        `<div class="line">${esc(ENDCARD.lines[1])}</div>` +
        `<div class="url">${esc(ENDCARD.lines[2])}</div>` +
        `<div class="note">${esc(ENDCARD.note)}</div>` +
        `</div>`,
    );
    await page.evaluate(() => document.fonts.ready);
    const r = await page.evaluate(() => {
      const b = document.getElementById('box').getBoundingClientRect();
      return { box: { x0: Math.round(b.left), y0: Math.round(b.top), x1: Math.round(b.right), y1: Math.round(b.bottom) } };
    });
    const insideSafe =
      r.box.x0 >= layout.safe.x0 &&
      r.box.x1 <= layout.safe.x1 &&
      r.box.y0 >= layout.safe.y0 &&
      r.box.y1 <= layout.safe.y1;
    assert.ok(insideSafe, `Endcard outside safe area: ${JSON.stringify(r.box)}`);
    await page.screenshot({ path: path.join(subsDir, `${ENDCARD.id}.png`), omitBackground: true });
    layout.items.push({ id: ENDCARD.id, ...r, insideSafe });
  } finally {
    await page.close();
  }
  fs.writeFileSync(path.join(subsDir, 'layout.json'), JSON.stringify(layout, null, 2));
  return layout;
}

async function captureFrames(browser, base, framesDir) {
  fs.mkdirSync(framesDir, { recursive: true });
  const guardPointerLock = await loadPointerLockGuard();
  const externalRequests = [];
  const errors = [];

  const saveFrame = async (page, frameIdx) => {
    const file = path.join(framesDir, `f${String(frameIdx).padStart(5, '0')}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
    if ((frameIdx + 1) % 100 === 0 || frameIdx === TOTAL_FRAMES - 1) {
      console.log(`  captured frame ${frameIdx + 1}/${TOTAL_FRAMES}`);
    }
  };

  let frameIdx = 0;

  const context = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await guardPointerLock(page);
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('request', req => {
    const u = req.url();
    if (!u.startsWith(base) && !u.startsWith('blob:') && !u.startsWith('data:')) externalRequests.push(u);
  });

  await page.goto(`${base}/?qa=1&autostart=new`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__valleyReady === true, null, { timeout: 60000 });
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl?.getParameter(gl.RENDERER));
  });
  console.log('WebGL renderer:', gpu);

  await page.addStyleTag({
    content: `#narration, #hint, #toast, .menu-btn, .kz-orient-banner { display: none !important; } html, body { cursor: none !important; }`,
  });

  // Cut 1 (0..119, 120 frames, 4.0s): Burning Kamakura Opening Stage A
  await page.evaluate(() => {
    window.__valley.freeze(true);
    window.__valley.step(204, 1 / 60);
  });
  for (let i = 0; i < 120; i++) {
    await page.evaluate(() => window.__valley.step(2, 1 / 60));
    await saveFrame(page, frameIdx++);
  }

  // Transition in-place from Opening Stage to Hidden Valley gameplay (zero reload!)
  await page.evaluate(() => {
    const g = window.__valley.game;
    g.skipIntro = true;
    g.startNew();
    g.hud.showHUD(false);
    window.__valley.step(4, 1 / 60);
  });

  // Cut 2A (120..164, 45 frames): Sweeping dusk vista over golden rice terraces & hidden valley
  for (let i = 0; i < 45; i++) {
    const k = i / 44;
    await page.evaluate(t => {
      const lerp = (a, b, u) => a + (b - a) * u;
      window.__valley.camera(
        [lerp(-6, -18, t), lerp(64, 52, t), lerp(152, 128, t)],
        [lerp(18, 6, t), lerp(4, 3, t), lerp(22, 8, t)],
        56,
      );
      window.__valley.step(2, 1 / 60);
    }, k);
    await saveFrame(page, frameIdx++);
  }

  // Cut 2B (165..239, 75 frames): Hero sprinting down the autumn forest trail
  await page.evaluate(() => {
    window.__valley.camera(null);
    window.__valley.game.hud.showHUD(true);
    window.__valley.teleport(-64, -56, 2.25);
    window.__valley.look(2.25, 0.16);
    window.__valley.key('KeyW', true);
    window.__valley.key('ShiftLeft', true);
    window.__valley.step(4, 1 / 60);
  });
  for (let i = 0; i < 75; i++) {
    await page.evaluate(() => window.__valley.step(2, 1 / 60));
    await saveFrame(page, frameIdx++);
  }
  await page.evaluate(() => {
    window.__valley.key('KeyW', false);
    window.__valley.key('ShiftLeft', false);
  });

  // Cut 3A (240..289, 50 frames): Viewpoint choice ("正面から入る / 脇道から回り込む")
  await page.evaluate(() => {
    const g = window.__valley.game;
    g.quest.beat = 'b3_viewpoint';
    g.buildWorld();
    window.__valley.teleport(-48.5, -33.5, 2.35);
    window.__valley.camera([-46, 2.4, -30], [18, 2, 6], 54);
    g.showChoice();
    window.__valley.step(2, 1 / 60);
  });
  for (let i = 0; i < 50; i++) {
    if (i === 24) {
      await page.evaluate(() => {
        const btn = document.getElementById('choice-flank');
        if (btn) btn.style.borderColor = '#d7705a';
      });
    }
    await page.evaluate(() => window.__valley.step(2, 1 / 60));
    await saveFrame(page, frameIdx++);
  }

  // Cut 3B (290..399, 110 frames): Crouching stealth approach -> Beat 16 (frame 320) E 闇討ち!
  await page.evaluate(() => {
    const g = window.__valley.game;
    g.hud.showChoice(false);
    g.flow = 'play';
    g.quest.beat = 'b2_road';
    g.buildWorld();
    window.__valley.camera(null);
    const scout = g.enemies[0];
    if (scout) {
      scout.place(-45.2, -44.0, 2.25);
      scout.patrol = null;
      scout.fighter.aware = false;
      scout.brain.state = 'unaware';
    }
    window.__valley.teleport(-47.1, -45.7, 2.25);
    g.hero.crouch = true;
    window.__valley.look(2.25, 0.18);
    window.__valley.key('KeyW', true);
    window.__valley.step(2, 1 / 60);
  });
  for (let i = 0; i < 110; i++) {
    if (i === 28) {
      await page.evaluate(() => window.__valley.key('KeyW', false));
    }
    if (i === 30) {
      // Frame 320 = 10.67s = Beat 16: Execute stealth strike!
      await page.evaluate(() => {
        const g = window.__valley.game;
        const scout = g.enemies[0];
        if (scout) {
          scout.fighter.aware = false;
          window.__valley.teleport(
            scout.pos.x - 1.35 * Math.sin(-scout.yaw),
            scout.pos.z - 1.35 * Math.cos(-scout.yaw),
            scout.yaw,
          );
        }
        window.__valley.tap('KeyE', 1);
      });
    }
    await page.evaluate(() => window.__valley.step(2, 1 / 60));
    await saveFrame(page, frameIdx++);
  }

  // Cut 4 (400..579, 180 frames): Mizuho Village Sword Combat — Parry, Counter, 3-Hit Combo, Finisher
  await page.evaluate(() => {
    const g = window.__valley.game;
    g.hud.hideDialogue?.();
    g.dialogue = null;
    g.pendingDialogue = null;
    g.quest.beat = 'b4_village';
    g.quest.flags.approach = 'front';
    g.buildWorld();
    window.__valley.god(true);
    g.hero.crouch = false;
    g.hero.drawSword({ fast: true });
    window.__valley.teleport(-22.2, 4.0, 1.35);
    window.__valley.look(1.35, 0.16);
    const off = g.enemies.find(e => e.kind === 'officer') || g.enemies[0];
    const sol = g.enemies.find(e => e.kind === 'soldier') || g.enemies[1];
    if (off) {
      off.dormant = false;
      off.brain.state = 'combat';
      off.fighter.aware = true;
      off.place(-19.8, 4.6, -1.78);
    }
    if (sol) {
      sol.dormant = false;
      sol.brain.state = 'combat';
      sol.fighter.aware = true;
      sol.place(-19.2, 2.8, -1.5);
    }
    g.lock = off || null;
    g.hero.lockTarget = off || null;
    window.__valley.click(2, true); // Hold guard first
    window.__valley.step(4, 1 / 60);
  });
  for (let i = 0; i < 180; i++) {
    if (i === 58) {
      await page.evaluate(() => {
        window.__valley.release(2);
        window.__valley.click(0, false);
      });
    } else if (i === 74 || i === 92) {
      await page.evaluate(() => window.__valley.click(0, false));
    } else if (i === 112) {
      await page.evaluate(() => {
        const g = window.__valley.game;
        const foe = g.lock || g.enemies[0];
        if (foe && foe.fighter.alive) {
          foe.place(
            g.hero.pos.x - 1.55 * Math.sin(g.hero.yaw),
            g.hero.pos.z - 1.55 * Math.cos(g.hero.yaw),
            g.hero.yaw + Math.PI,
          );
          foe.fighter.posture = 0;
          foe.fighter.state = 'stagger';
          foe.fighter.staggerT = 3.5;
        }
      });
    } else if (i === 120) {
      await page.evaluate(() => window.__valley.tap('KeyE', 1));
    }
    await page.evaluate(() => window.__valley.step(2, 1 / 60));
    await saveFrame(page, frameIdx++);
  }

  // Cut 5 (580..759, 180 frames): Co-op with Archer Ally Yajuro + Smartphone Touch UI active
  await page.evaluate(() => {
    const g = window.__valley.game;
    g.quest.beat = 'b6_escort';
    g.quest.flags.archerJoined = true;
    g.quest.flags.ambush = 'active';
    g.buildWorld();
    window.__valley.god(true);
    g.hero.crouch = false;
    g.hero.drawSword({ fast: true });
    window.__valley.teleport(-62.2, -27.2, 2.35);
    window.__valley.look(2.35, 0.16);
    if (g.ally) {
      g.ally.place(-63.4, -26.3, 2.35);
      g.ally.companion.mode = 'cover';
      g.hud.setParty(true, g.modeLabel('cover'));
    }
    for (const e of g.enemies) {
      e.dormant = false;
      e.brain.state = 'combat';
      e.fighter.aware = true;
    }
    if (window.__valleyTouch) {
      window.__valleyTouch.enable();
      window.__valleyTouch.sync(g, false);
    }
    window.__valley.key('KeyW', true);
    window.__valley.step(4, 1 / 60);
  });
  for (let i = 0; i < 180; i++) {
    if (i === 40) {
      await page.evaluate(() => {
        window.__valley.key('KeyW', false);
        window.__valley.click(0, false);
      });
    } else if (i === 62 || i === 86 || i === 120) {
      await page.evaluate(() => window.__valley.click(0, false));
    }
    await page.evaluate(() => {
      window.__valley.step(2, 1 / 60);
      window.__valleyTouch?.sync(window.__valley.game, false);
    });
    await saveFrame(page, frameIdx++);
  }

  // Cut 6 (760..899, 140 frames): Endcard background — Warm dusk temple bonfire
  await page.evaluate(() => {
    const g = window.__valley.game;
    window.__valley.key('KeyW', false);
    if (window.__valleyTouch) window.__valleyTouch.setActive(false);
    const banner = document.querySelector('.kz-orient-banner');
    if (banner) banner.classList.add('hidden');
    g.hud.showHUD(false);
    g.hud.clearTransient();
    window.__valley.camera([-83.5, 1.35, -73.5], [-104, 4.2, -93], 46);
    window.__valley.step(4, 1 / 60);
  });
  for (let i = 0; i < 140; i++) {
    const t = i / 30;
    await page.evaluate(sec => {
      window.__valley.camera(
        [-83.5 + Math.sin(sec * 0.25) * 0.45, 1.35, -73.5 + Math.cos(sec * 0.25) * 0.35],
        [-104, 4.2, -93],
        46,
      );
      window.__valley.step(2, 1 / 60);
    }, t);
    await saveFrame(page, frameIdx++);
  }

  await context.close();

  assert.equal(frameIdx, TOTAL_FRAMES, `Expected ${TOTAL_FRAMES} frames, captured ${frameIdx}`);
  assert.deepEqual(externalRequests, [], `External requests during capture: ${externalRequests.join(', ')}`);
  assert.deepEqual(errors, [], `Page errors during capture: ${errors.join('; ')}`);
}

function runFfmpeg(argv, stdinFeeder = null) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], {
      stdio: [stdinFeeder ? 'pipe' : 'ignore', 'inherit', 'inherit'],
    });
    p.on('error', reject);
    p.on('exit', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))));
    if (stdinFeeder) stdinFeeder(p.stdin).catch(reject);
  });
}

const feedFiles = files => async stdin => {
  for (const f of files) {
    const buf = fs.readFileSync(f);
    if (!stdin.write(buf)) await new Promise(r => stdin.once('drain', r));
  }
  stdin.end();
};

const X264 = [
  '-c:v',
  'libx264',
  '-preset',
  'slow',
  '-crf',
  '19',
  '-maxrate',
  '4200k',
  '-bufsize',
  '8400k',
  '-pix_fmt',
  'yuv420p',
  '-colorspace',
  'bt709',
  '-color_primaries',
  'bt709',
  '-color_trc',
  'bt709',
  '-color_range',
  'tv',
  '-r',
  String(FPS),
  '-g',
  '60',
  '-map_metadata',
  '-1',
  '-movflags',
  '+faststart',
];

const GRADE = "curves=all='0/0 0.05/0.075 0.15/0.20 0.35/0.41 0.65/0.69 1/1'";
const TO709 = `scale=${WIDTH}:${HEIGHT}:in_range=pc:out_range=tv:out_color_matrix=bt709:flags=bicubic+accurate_rnd+full_chroma_int,format=yuv420p`;

function buildSubtitleFilter(subsDir) {
  const inputs = [];
  const chain = [];
  let last = '[base]';
  const items = [
    ...SUBTITLES.map((s, k) => ({ ...s, file: `${s.id}.png`, k })),
    { ...ENDCARD, file: `${ENDCARD.id}.png`, k: SUBTITLES.length, end: true },
  ];
  items.forEach((s, k) => {
    inputs.push('-loop', '1', '-framerate', String(FPS), '-t', String(DURATION), '-i', path.join(subsDir, s.file));
    const fades = [];
    if (!(k === 0 && FIRST_NO_FADE_IN)) fades.push(`fade=t=in:st=${s.in.toFixed(3)}:d=${FADE}:alpha=1`);
    if (!s.end) fades.push(`fade=t=out:st=${(s.out - FADE).toFixed(3)}:d=${FADE}:alpha=1`);
    chain.push(`[${k + 1}:v]format=rgba,${fades.join(',')}[s${k}]`);
    const next = k === items.length - 1 ? '[comp]' : `[o${k}]`;
    chain.push(`${last}[s${k}]overlay=0:0:format=rgb:shortest=1${next}`);
    last = next;
  });
  return {
    inputs,
    graph: [`[0:v]format=gbrp,${GRADE}[base]`, ...chain, `[comp]${TO709}[v]`].join(';'),
  };
}

function auditVideo(videoFile) {
  const probe = JSON.parse(
    spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', videoFile], {
      encoding: 'utf8',
    }).stdout,
  );
  const v = probe.streams.find(s => s.codec_type === 'video');
  const a = probe.streams.find(s => s.codec_type === 'audio');
  const dur = Number(probe.format.duration);
  assert.ok(Math.abs(dur - DURATION) <= 0.08, `Duration mismatch: ${dur}`);
  assert.equal(v.width, WIDTH);
  assert.equal(v.height, HEIGHT);
  assert.equal(v.codec_name, 'h264');
  assert.equal(v.pix_fmt, 'yuv420p');
  assert.equal(v.r_frame_rate, `${FPS}/1`);
  assert.ok(a && a.codec_name === 'aac', 'Missing AAC audio stream');
  const loud = parseEbur(ebur(videoFile));
  assert.ok(loud.I >= -18 && loud.I <= -15, `Muxed LUFS out of range: ${loud.I}`);
  assert.ok(loud.tp <= -1.0, `Muxed true peak too high: ${loud.tp}`);
  return { duration: dur, width: v.width, height: v.height, sizeBytes: fs.statSync(videoFile).size, loudness: loud };
}

async function main() {
  const args = process.argv.slice(2);
  const pick = flag => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const siteDir = path.resolve(pick('--site-dir') || process.env.PROMO_SITE_DIR || path.resolve(THIS_DIR, '../../../../kamakura-no-zanka/.pages-dist'));
  const framesDir = path.resolve(pick('--frames-dir') || process.env.PROMO_FRAMES_DIR || '/tmp/day98-promo-frames');
  const outDir = path.resolve(pick('--out-dir') || process.env.PROMO_OUT_DIR || '/tmp/day98-promo-out');
  const composeOnly = args.includes('--compose-only');

  fs.mkdirSync(framesDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  const subsDir = path.join(framesDir, 'subs');

  const pwPath =
    process.env.PLAYWRIGHT_MODULE || path.resolve(THIS_DIR, '../../../node_modules/playwright/index.mjs');
  const pw = await import(pathToFileURL(pwPath).href);
  const chromium = pw.chromium || pw.default?.chromium;

  if (!composeOnly) {
    const { server, base } = await startStaticServer(siteDir);
    const browser = await chromium.launch({
      headless: true,
      args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
    });
    try {
      console.log('1/4 Rendering subtitles and endcard PNGs...');
      await renderSubtitles(browser, subsDir);
      console.log('2/4 Capturing 900 real 3D gameplay frames (1080x1920 @ 30fps)...');
      await captureFrames(browser, base, framesDir);
    } finally {
      await browser.close();
      server.closeAllConnections?.();
      await new Promise(resolve => server.close(resolve));
    }
  }

  console.log('3/4 Encoding vertical promo videos (silent, A, B) and 16s card demo.mp4...');
  const frameFiles = [];
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const f = path.join(framesDir, `f${String(i).padStart(5, '0')}.jpg`);
    assert.ok(fs.existsSync(f), `Missing captured frame: ${f}`);
    frameFiles.push(f);
  }

  const imgIn = ['-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', 'pipe:0'];
  const { inputs, graph } = buildSubtitleFilter(subsDir);
  const silentMp4 = path.join(outDir, 'Day098_zanka-no-kamakura_promo_silent.mp4');
  await runFfmpeg(
    [...imgIn, ...inputs, '-filter_complex', graph, '-map', '[v]', ...X264, '-an', '-t', String(DURATION), silentMp4],
    feedFiles(frameFiles),
  );

  const AAC = ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'];
  const auditResults = {};
  for (const v of ['a', 'b']) {
    const bgmWav = path.join(outDir, `bgm_${v}.wav`);
    assert.ok(fs.existsSync(bgmWav), `Missing ${bgmWav} — run promo-audio.mjs first`);
    const outMp4 = path.join(outDir, `Day098_zanka-no-kamakura_promo_${v}.mp4`);
    await runFfmpeg([
      '-i',
      silentMp4,
      '-i',
      bgmWav,
      '-map',
      '0:v',
      '-map',
      '1:a',
      '-c:v',
      'copy',
      ...AAC,
      '-t',
      String(DURATION),
      '-map_metadata',
      '-1',
      '-movflags',
      '+faststart',
      outMp4,
    ]);
    auditResults[v] = auditVideo(outMp4);
  }

  // 16s card demo.mp4 (540x960, 30fps, silent, no subtitle burn-in so card thumbnail play is clean)
  const demoFrames = [];
  for (const seg of DEMO_SEGMENTS) {
    for (let i = 0; i < seg.count; i++) {
      demoFrames.push(frameFiles[seg.from + i]);
    }
  }
  assert.equal(demoFrames.length, 16 * FPS, `Demo frame count must be 480, got ${demoFrames.length}`);
  const demoMp4 = path.join(outDir, 'Day098_demo_card_16s.mp4');
  await runFfmpeg(
    [
      ...imgIn,
      '-vf',
      `format=gbrp,${GRADE},scale=540:960:in_range=pc:out_range=tv:out_color_matrix=bt709:flags=bicubic,format=yuv420p`,
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '23',
      '-maxrate',
      '1400k',
      '-bufsize',
      '2800k',
      '-pix_fmt',
      'yuv420p',
      '-r',
      String(FPS),
      '-g',
      '60',
      '-an',
      '-t',
      '16',
      '-map_metadata',
      '-1',
      '-movflags',
      '+faststart',
      demoMp4,
    ],
    feedFiles(demoFrames),
  );

  // First frame & contact sheet (6x5 = 30 seconds)
  const promoBMp4 = path.join(outDir, 'Day098_zanka-no-kamakura_promo_b.mp4');
  await runFfmpeg(['-i', promoBMp4, '-frames:v', '1', path.join(outDir, 'first-frame.png')]);
  await runFfmpeg([
    '-i',
    promoBMp4,
    '-vf',
    'fps=1,scale=216:384,tile=6x5:padding=4:color=black',
    '-frames:v',
    '1',
    '-q:v',
    '3',
    path.join(outDir, 'contact-sheet.jpg'),
  ]);

  const report = {
    generatedAt: new Date().toISOString(),
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    duration: DURATION,
    cuts: CUTS,
    videos: auditResults,
    demoSizeBytes: fs.statSync(demoMp4).size,
  };
  fs.writeFileSync(path.join(outDir, 'audit-report.json'), JSON.stringify(report, null, 2));
  console.log('4/4 Promo rendering & audit PASSED:', JSON.stringify(report, null, 2));
}

main().catch(err => {
  console.error('Promo render FAILED:', err);
  process.exit(1);
});
