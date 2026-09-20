/* 測定エンジン

   ライブラリ（@cloudflare/speedtest）を使わず自前で書いている理由は2つ。
   ① このリポジトリは npm 依存もバンドラも持たない構成
   ② あちらは測定結果を完了時に Cloudflare へ送信する。このアプリは「どこにも送らない」と
      画面に書くので、実装がその記述と食い違ってはいけない

   ネットワークに触るのはこのファイルだけ。速度の計算そのものは純粋関数に切り出してある
   （mbps / median / jitterOf）ので、テストは実回線なしで書ける。 */

export const ENDPOINT = 'https://speed.cloudflare.com';
const DOWN = `${ENDPOINT}/__down`;
const UP = `${ENDPOINT}/__up`;

/** 通常モードと節約モード。eco は携帯回線のギガを守るための縮小版で、精度は落ちる */
export const PLANS = {
  normal: { warmup: 100_000, down: [1e6, 5e6, 10e6], downStreams: 4, up: [1e6, 3e6, 5e6], upStreams: 2, budget: 50e6 },
  eco: { warmup: 100_000, down: [500e3, 1e6], downStreams: 2, up: [500e3, 1e6], upStreams: 1, budget: 6e6 }
};

export const mbps = (bytes, ms) => (ms > 0 ? (bytes * 8) / (ms / 1000) / 1e6 : 0);

export const median = (nums) => {
  const s = [...nums].filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** 連続する測定値の差の平均＝揺らぎ。値そのものの大小とは別に体感へ効く */
export const jitterOf = (nums) => {
  const s = nums.filter(Number.isFinite);
  if (s.length < 2) return null;
  let total = 0;
  for (let i = 1; i < s.length; i += 1) total += Math.abs(s[i] - s[i - 1]);
  return total / (s.length - 1);
};

const bust = () => Math.random().toString(36).slice(2);

class Aborted extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'Aborted';
    this.reason = reason;
  }
}

/** 中断の合図。タブが背面に回った場合と、利用者が止めた場合の両方で使う */
export const abortedError = (reason) => new Aborted(reason);

/**
 * 1往復の時間を測る。0バイトを取りに行くので、ほぼ往復時間だけが出る。
 * ついでに接続がIPv6かどうかを見る（ヘッダの値は判定に使うだけで、保存も表示もしない）。
 */
async function probe(fetchImpl, now, out) {
  const started = now();
  const res = await fetchImpl(`${DOWN}?bytes=0&r=${bust()}`, { cache: 'no-store' });
  await res.arrayBuffer();
  if (out && out.v6 === undefined) {
    const ip = res.headers?.get?.('cf-meta-ip');
    // コロンが入っていればIPv6。アドレスそのものはここで捨てる
    if (typeof ip === 'string' && ip) out.v6 = ip.includes(':');
  }
  return now() - started;
}

/** ヘッダ受信後から本文を読み終わるまでを測る＝接続確立とTTFBを含めない */
async function downloadOnce(fetchImpl, now, bytes, signal) {
  const res = await fetchImpl(`${DOWN}?bytes=${bytes}&r=${bust()}`, { cache: 'no-store', signal });
  const headersAt = now();
  const buf = await res.arrayBuffer();
  return { bytes: buf.byteLength, ms: now() - headersAt };
}

async function uploadOnce(fetchImpl, now, bytes, rtt, signal) {
  const body = new Uint8Array(bytes);
  const started = now();
  const res = await fetchImpl(`${UP}?r=${bust()}`, { method: 'POST', body, cache: 'no-store', signal });
  await res.arrayBuffer();
  // 送信は往復まるごとしか測れないので、先に測った往復時間ぶんを引いておく
  return { bytes, ms: Math.max(1, now() - started - (rtt || 0)) };
}

/**
 * 測定一式。fetch と時計を差し替えられるようにしてあるのでテストから駆動できる。
 * onPhase は画面へ進み具合を返すためのもの（30秒を無言で待たせない）。
 */
export async function runMeasurement({
  plan = PLANS.normal,
  fetchImpl = fetch,
  now = () => performance.now(),
  clock = () => Date.now(),
  onPhase = () => {},
  shouldAbort = () => null
} = {}) {
  const meta = {};
  let spent = 0;
  const guard = () => {
    const reason = shouldAbort();
    if (reason) throw abortedError(reason);
  };

  // ① 助走。TCPは立ち上がりが遅いので、最初の1本は捨てる
  onPhase({ phase: 'warmup', label: '準備しています' });
  guard();
  await downloadOnce(fetchImpl, now, plan.warmup).catch(() => null);

  // ② アイドル時の往復時間
  onPhase({ phase: 'idle', label: '待機中の反応を測っています' });
  const idle = [];
  for (let i = 0; i < 12; i += 1) {
    guard();
    idle.push(await probe(fetchImpl, now, meta));
  }
  const li = median(idle);

  /* 転送している最中の往復時間を測る係。転送が終わったら止める。
     ⚠️ 呼ぶ側は「転送が終わった時刻」を先に取ってから、この係の結果を待つこと。
     待ってから時刻を取ると、往復時間の測定にかかった時間が帯域の分母に混ざって
     速度が実際より遅く出る（実際に上りが62Mbpsと出て気付いた）。 */
  const watchLatency = (state) => (async () => {
    const out = [];
    do {
      out.push(await probe(fetchImpl, now, meta));
    } while (!state.done && out.length < 6);
    return out;
  })();

  // ③ 下り。サイズを上げながら、1秒を超えたところで止める
  onPhase({ phase: 'down', label: '下り（受信）を測っています' });
  const loadedDown = [];
  let dl = 0;
  for (const size of plan.down) {
    guard();
    if (spent + size * plan.downStreams > plan.budget) break;
    const state = { done: false };
    const started = now();
    const runs = Array.from({ length: plan.downStreams }, () => downloadOnce(fetchImpl, now, size));
    const watcher = watchLatency(state);
    const results = await Promise.all(runs);
    const elapsed = now() - started;
    state.done = true;
    loadedDown.push(...(await watcher.catch(() => [])));
    const bytes = results.reduce((a, r) => a + r.bytes, 0);
    spent += bytes;
    dl = Math.max(dl, mbps(bytes, elapsed));
    if (elapsed > 1000) break;
  }

  // ④ 上り
  onPhase({ phase: 'up', label: '上り（送信）を測っています' });
  const loadedUp = [];
  let ul = 0;
  for (const size of plan.up) {
    guard();
    if (spent + size * plan.upStreams > plan.budget) break;
    const state = { done: false };
    const started = now();
    const runs = Array.from({ length: plan.upStreams }, () => uploadOnce(fetchImpl, now, size, li));
    const watcher = watchLatency(state);
    const results = await Promise.all(runs);
    const elapsed = Math.max(1, now() - started - (li || 0));
    state.done = true;
    loadedUp.push(...(await watcher.catch(() => [])));
    const bytes = results.reduce((a, r) => a + r.bytes, 0);
    spent += bytes;
    ul = Math.max(ul, mbps(bytes, elapsed));
    if (elapsed > 1000) break;
  }

  return {
    t: clock(),
    dl,
    ul,
    li,
    ld: median(loadedDown),
    lu: median(loadedUp),
    jit: jitterOf(idle),
    v6: meta.v6 === true,
    eco: plan === PLANS.eco,
    bytes: spent
  };
}
