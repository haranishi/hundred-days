// OWNER: core
// 本物のタッチで自動操作を動かす（tasks 4.3。2026-11-03 スマホ対応）。
// ページの自動操作（src/game/autopilot.ts の Autopilot）は BotIO（down・up・tap・look）で話す。ここでは、その命令を
// page.exposeFunction('__touchBotCmd') で受け、Chromium の CDP の Input.dispatchTouchEvent で本物のタッチに変える
// （ブラウザが pointerType=touch の pointer イベントを作る。マウス・キー注入（window.__input）は使わない）。
// 複数の指は、触れる・動かすときは触れている全部の点を送り、離すときは離す指だけを送る（下の lift。e2e/touch-helper.ts の Fingers と同じ）。
// 命令は到着順に直列で処理する。
//
// 対応づけ：
//   down('KeyW')         スティック領域に指1を置き、前（画面の上）へ R だけ倒す（歩きの最高速）。ShiftLeft も押していれば 1.5R（走り）
//   down/up('ShiftLeft') 指1が触れていれば、1.5R ⇔ R へ動かす
//   up('KeyW')           指1を離す
//   tap('KeyC'|'KeyE'|'KeyF')  しゃがむ・当て身（使う）・攻撃のボタンの真ん中を、指3で触れてすぐ離す
//   look(dx, dy)         視点領域で指2を短くなぞる（touchStart → touchMove → touchEnd）。下の「視点」を参照
//
// 視点：自動操作は「いまの向き（前のコマの __state）から、行きたい向きまでの差」を毎コマ look で送る（__input なら次のコマに効く）。
// 本物のタッチは届くまでに数コマかかるので、差をそのまま足すと、同じ差を何度も足して行き過ぎる。そこでページ側では
// look の差を「狙う向き（yaw）」に直して覚え、なぞりが1つも飛んでいない時にだけ、今の向きとの残りを指の px（÷ lookGain）にして送る。
// 残りが 5px 以下なら送らずに持ち越す（視点のタップ無視 tapSlop＝4px より小さいなぞりは効かないため）。上下（dy）は足し合わせて同じく 5px 超で送る。
// 1回のなぞりは画面の中に収める（長い回転は数回に分ける。残りは次のなぞりで送る）。
// なぞり始めの点は、document.elementFromPoint が視点領域（touch-look-zone）を返す点から選ぶ（ボタン・スティック領域の上では始めない）。

const BUTTON_OF = { KeyC: 'touch-btn-crouch', KeyE: 'touch-btn-action', KeyF: 'touch-btn-attack' };
const STICK = 1;
const LOOK = 2;
const TAP = 3;
/** これ以下の残り（指の CSS px）は送らずに持ち越す。 */
const LOOK_MIN_PX = 5;
/** 画面の縁から、なぞりの点を離す（CSS px）。 */
const EDGE = 6;

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ viewport: { width: number; height: number } }} opts
 */
export async function createTouchBot(page, { viewport }) {
  const browserName = page.context().browser()?.browserType().name();
  if (browserName !== 'chromium') throw new Error(`タッチの自動操作は Chromium（CDP）だけで動く（いま ${browserName}）`);
  const cdp = await page.context().newCDPSession(page);
  /** 触れている指（id → 点）。 */
  const pts = new Map();
  const st = { w: false, shift: false, origin: null, R: 0 };
  const stats = { cmds: 0, touchEvents: 0, swipes: 0, taps: 0, stickDowns: 0, lookPx: { x: 0, y: 0 }, maxMs: 0, sumMs: 0, errors: [], unsupported: [] };
  let lookStarts = null;
  let lookStartsAge = 0;
  let chain = Promise.resolve();

  const point = (id, p) => ({ x: p.x, y: p.y, id, radiusX: 4, radiusY: 4, force: 1 });
  /** touchStart・touchMove：触れている全部の点を送る。 */
  const send = async (type) => {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...pts].map(([id, p]) => point(id, p)) });
    stats.touchEvents++;
  };
  /**
   * 指 id を離す。この Chromium（Playwright 1.63 同梱）の touchEnd は「載せた点を離す」動きをする
   * （残る指を載せると、そちらが離れる。空なら全部離れる。2026-11-03 に2本指の実験で確かめた）。なので離す指だけを載せる。
   */
  const lift = async (id) => {
    const p = pts.get(id);
    if (!p) return;
    pts.delete(id);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [point(id, p)] });
    stats.touchEvents++;
  };

  const stickPoint = () => {
    const o = st.origin;
    // R ちょうどだと座標の丸めで 1 にわずかに届かないことがあるので 1px 足す（走りの入り 1.4R より十分内側）
    const d = st.shift ? 1.5 * st.R : st.R + 1;
    return { x: o.x, y: o.y - d };
  };

  async function stickDown() {
    const g = await page.evaluate(() => {
      const info = window.__touch?.info();
      if (!info) return null;
      const z = info.zones.stick;
      const R = info.stickRadius;
      const m = R + 8 + 2; // touchMath の clampOrigin（R＋edgeMargin）より内側に置き、原点を動かさない
      const x = Math.max(m, Math.min(innerWidth - m, z.x + z.width * 0.4));
      const y = Math.max(m + 1.5 * R, Math.min(innerHeight - m, z.y + z.height * 0.65));
      const hit = document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid') ?? null;
      return { x, y, R, hit };
    });
    if (!g) throw new Error('タッチ層が無い（__touch.info() が null）');
    if (g.hit !== 'touch-stick-zone' && g.hit !== 'touch-stick') throw new Error(`スティックを置く点がスティック領域でない（${g.hit}）`);
    st.origin = { x: g.x, y: g.y };
    st.R = g.R;
    pts.set(STICK, { ...st.origin });
    await send('touchStart');
    pts.set(STICK, stickPoint());
    await send('touchMove');
    stats.stickDowns++;
  }

  async function stickMove() {
    if (!pts.has(STICK)) return;
    pts.set(STICK, stickPoint());
    await send('touchMove');
  }

  async function stickUp() {
    await lift(STICK);
  }

  async function tap(code) {
    const testId = BUTTON_OF[code];
    if (!testId) {
      stats.unsupported.push(`tap ${code}`);
      return;
    }
    const c = await page.evaluate((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const x = r.x + r.width / 2;
      const y = r.y + r.height / 2;
      const top = document.elementFromPoint(x, y);
      return { x, y, ok: !!top && (top === el || el.contains(top)) };
    }, testId);
    if (!c) throw new Error(`${testId} が無い`);
    if (!c.ok) throw new Error(`${testId} の真ん中が他の部品に覆われている`);
    pts.set(TAP, { x: c.x, y: c.y });
    await send('touchStart');
    await lift(TAP);
    stats.taps++;
  }

  /** 視点領域で、なぞり始めてよい点の一覧（16px おき）。 */
  async function findLookStarts() {
    return page.evaluate(() => {
      const out = [];
      for (let y = 8; y < innerHeight - 8; y += 16) {
        for (let x = 8; x < innerWidth - 8; x += 16) {
          const t = document.elementFromPoint(x, y);
          if (t && t.getAttribute('data-testid') === 'touch-look-zone') out.push({ x, y });
        }
      }
      return out;
    });
  }

  /** 指2で (fx, fy) だけなぞる。画面に収まる分だけ動かし、実際に動かした量を返す。 */
  async function swipe(fx, fy) {
    if (!lookStarts || lookStartsAge++ > 30) {
      lookStarts = await findLookStarts();
      lookStartsAge = 0;
    }
    if (!lookStarts.length) throw new Error('視点領域に、なぞり始められる点が無い');
    const W = viewport.width;
    const H = viewport.height;
    // 収まる割合 s（0〜1）が一番大きい点を選ぶ
    let best = null;
    let bestS = -1;
    for (const p of lookStarts) {
      const sx = fx > 0 ? (W - EDGE - p.x) / fx : fx < 0 ? (EDGE - p.x) / fx : Infinity;
      const sy = fy > 0 ? (H - EDGE - p.y) / fy : fy < 0 ? (EDGE - p.y) / fy : Infinity;
      const s = Math.min(1, sx, sy);
      if (s > bestS + 1e-6) {
        bestS = s;
        best = p;
      }
    }
    const mx = fx * bestS;
    const my = fy * bestS;
    // 指を動かす回数（1回 120px まで。最初の1回で tapSlop を越える）
    const steps = Math.max(2, Math.ceil(Math.hypot(mx, my) / 120));
    pts.set(LOOK, { x: best.x, y: best.y });
    await send('touchStart');
    for (let i = 1; i <= steps; i++) {
      pts.set(LOOK, { x: best.x + (mx * i) / steps, y: best.y + (my * i) / steps });
      await send('touchMove');
    }
    await lift(LOOK);
    stats.swipes++;
    stats.lookPx.x += Math.abs(mx);
    stats.lookPx.y += Math.abs(my);
    return { fx: mx, fy: my };
  }

  async function handle(cmd) {
    const t0 = Date.now();
    stats.cmds++;
    let ret = null;
    switch (cmd.k) {
      case 'down':
        if (cmd.c === 'KeyW') {
          if (!st.w) {
            st.w = true;
            await stickDown();
          }
        } else if (cmd.c === 'ShiftLeft') {
          st.shift = true;
          await stickMove();
        } else stats.unsupported.push(`down ${cmd.c}`);
        break;
      case 'up':
        if (cmd.c === 'KeyW') {
          st.w = false;
          await stickUp();
        } else if (cmd.c === 'ShiftLeft') {
          st.shift = false;
          await stickMove();
        } else stats.unsupported.push(`up ${cmd.c}`);
        break;
      case 'tap':
        await tap(cmd.c);
        break;
      case 'look':
        ret = await swipe(cmd.fx, cmd.fy);
        break;
      case 'releaseAll':
        st.w = false;
        st.shift = false;
        for (const id of [...pts.keys()]) await lift(id);
        break;
      default:
        stats.unsupported.push(String(cmd.k));
    }
    const ms = Date.now() - t0;
    stats.sumMs += ms;
    stats.maxMs = Math.max(stats.maxMs, ms);
    return ret;
  }

  await page.exposeFunction('__touchBotCmd', (cmd) => {
    const p = chain.then(() => handle(cmd));
    chain = p.catch((e) => {
      stats.errors.push(`${JSON.stringify(cmd)}: ${e instanceof Error ? e.message : String(e)}`);
    });
    return p.catch((e) => ({ error: String(e) }));
  });

  return {
    stats,
    /** ページに BotIO（window.__touchBotIO）と、視点のなぞりを送る見張り（毎コマ）を入れる。 */
    async install() {
      await page.evaluate(
        ({ minPx }) => {
          const D2R = Math.PI / 180;
          const wrap = (a) => {
            let x = a % (2 * Math.PI);
            if (x <= -Math.PI) x += 2 * Math.PI;
            else if (x > Math.PI) x -= 2 * Math.PI;
            return x;
          };
          const cmd = (c) => window.__touchBotCmd(c);
          /** 狙う向き（ラジアン。null は狙わない）・上下の持ち越し（マウスの px）・なぞりが飛んでいるか・届いてから待つコマ数。 */
          const look = { target: null, pitch: 0, busy: false, settle: 0, sent: 0 };
          window.__touchBotLook = look;
          const pump = () => {
            if (look.busy) return;
            if (look.settle > 0) {
              look.settle--;
              return;
            }
            const s = window.__state;
            const info = window.__touch?.info();
            if (!s || !info || !info.active) return;
            const sens = s.camera.lookSens;
            const gain = info.lookGain;
            let fx = look.target === null ? 0 : wrap(look.target - s.camera.yaw * D2R) / sens / gain;
            let fy = look.pitch / gain;
            if (Math.abs(fx) <= minPx) fx = 0;
            if (Math.abs(fy) <= minPx) fy = 0;
            if (!fx && !fy) return;
            look.busy = true;
            look.sent++;
            void cmd({ k: 'look', fx, fy }).then((r) => {
              if (r && typeof r.fy === 'number') look.pitch -= r.fy * gain;
              look.busy = false;
              // 指の動きは次のコマで視点に入り、その次のコマの __state に出る
              look.settle = 2;
            });
          };
          const loop = () => {
            try {
              pump();
            } finally {
              requestAnimationFrame(loop);
            }
          };
          requestAnimationFrame(loop);
          window.__touchBotIO = {
            down: (c) => void cmd({ k: 'down', c }),
            up: (c) => void cmd({ k: 'up', c }),
            tap: (c) => void cmd({ k: 'tap', c }),
            look: (dx, dy) => {
              // 自動操作は前のコマの __state を見て差を出す。その同じ __state の向きに足して、狙う向きにする
              const s = window.__state;
              if (s && dx) look.target = s.camera.yaw * D2R + dx * s.camera.lookSens;
              if (dy) look.pitch += dy;
            },
          };
        },
        { minPx: LOOK_MIN_PX },
      );
    },
    /** 台本を流し始める（window.__autopilot.start(route, io)）。 */
    async start(route) {
      await page.evaluate((r) => window.__autopilot.start(r, window.__touchBotIO), route);
    },
    /** 触れている指を全部離す（終わりに）。 */
    async releaseAll() {
      await page.evaluate(() => window.__touchBotCmd({ k: 'releaseAll' })).catch(() => undefined);
    },
  };
}
