import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANS, jitterOf, mbps, median, runMeasurement } from '../lib/measure.js';

/* 実回線には繋がない。fetch と時計を差し替えて、段取り（助走→待機→下り→上り）と
   中断の扱いだけを見る。速度の当たり外れは実測の話なのでここでは扱わない。 */

/* 時計は fetch の中でだけ進む。1リクエストにかかる時間をこちらで決められるので、
   「どの区間を測っているか」を組み立てのレベルで検査できる。 */
const makeEnv = ({ downRate = 25e6, upRate = 100e6, probeMs = 200, ip = '2400:4053::1', fail = false } = {}) => {
  let clock = 0;
  const calls = [];
  const now = () => clock;
  const respond = (bytes) => ({
    headers: { get: (name) => (name === 'cf-meta-ip' ? ip : null) },
    arrayBuffer: async () => new ArrayBuffer(bytes)
  });
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET' });
    if (fail) throw new Error('network down');
    const parsed = new URL(url);
    if (parsed.pathname === '/__up') {
      clock += ((init.body?.length ?? 0) * 8) / upRate * 1000;
      return respond(0);
    }
    const bytes = Number(parsed.searchParams.get('bytes') ?? 0);
    clock += bytes === 0 ? probeMs : (bytes * 8) / downRate * 1000;
    return respond(bytes);
  };
  return { now, fetchImpl, calls, clock: () => 1787463861863 };
};

test('Mbpsはバイトと所要時間から出す', () => {
  assert.equal(Math.round(mbps(1_000_000, 1000)), 8);
  assert.equal(mbps(1_000_000, 0), 0);
});

test('中央値は偶数個なら真ん中2つの平均', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
  assert.equal(median([1, null, 3]), 2);
});

test('ジッターは連続する値の差の平均', () => {
  assert.equal(jitterOf([10, 20, 30]), 10);
  assert.equal(jitterOf([10]), null);
});

test('ひととおり測ると、段取りの順に進み具合が返る', async () => {
  const env = makeEnv();
  const phases = [];
  const result = await runMeasurement({ plan: PLANS.eco, ...env, onPhase: (p) => phases.push(p.phase) });
  assert.deepEqual(phases, ['warmup', 'idle', 'down', 'up']);
  assert.ok(result.dl > 0, '下りが出ていない');
  assert.ok(result.ul > 0, '上りが出ていない');
  assert.ok(Number.isFinite(result.li), '待機中の反応が出ていない');
  assert.equal(result.t, 1787463861863);
});

test('IPv6で繋がったことは分かるが、アドレスは結果に残さない', async () => {
  const env = makeEnv({ ip: '2400:4053::1' });
  const result = await runMeasurement({ plan: PLANS.eco, ...env });
  assert.equal(result.v6, true);
  assert.equal(JSON.stringify(result).includes('2400:4053'), false);
});

test('IPv4なら v6 は false', async () => {
  const env = makeEnv({ ip: '203.0.113.9' });
  assert.equal((await runMeasurement({ plan: PLANS.eco, ...env })).v6, false);
});

test('上りはPOSTで送る', async () => {
  const env = makeEnv();
  await runMeasurement({ plan: PLANS.eco, ...env });
  assert.ok(env.calls.some((c) => c.method === 'POST' && c.url.includes('/__up')));
});

test('節約モードは通常より使う量が少ない', async () => {
  const eco = await runMeasurement({ plan: PLANS.eco, ...makeEnv() });
  const normal = await runMeasurement({ plan: PLANS.normal, ...makeEnv() });
  assert.ok(eco.bytes < normal.bytes, `eco=${eco.bytes} normal=${normal.bytes}`);
  assert.ok(eco.bytes <= PLANS.eco.budget);
  assert.ok(normal.bytes <= PLANS.normal.budget);
  assert.equal(eco.eco, true);
  assert.equal(normal.eco, false);
});

test('背面に回ったら結果を返さず中断する', async () => {
  const env = makeEnv();
  await assert.rejects(
    () => runMeasurement({ plan: PLANS.eco, ...env, shouldAbort: () => 'background' }),
    (err) => err.reason === 'background'
  );
});

test('利用者が止めたときも中断として返る', async () => {
  const env = makeEnv();
  let started = false;
  await assert.rejects(
    () => runMeasurement({
      plan: PLANS.eco,
      ...env,
      onPhase: ({ phase }) => { if (phase === 'idle') started = true; },
      shouldAbort: () => (started ? 'user' : null)
    }),
    (err) => err.reason === 'user'
  );
});

test('通信が落ちていれば例外になる（0を返さない）', async () => {
  const env = makeEnv({ fail: true });
  await assert.rejects(() => runMeasurement({ plan: PLANS.eco, ...env }));
});

test('遅延の測定にかかった時間を、帯域の分母に混ぜない', async () => {
  /* 転送しながら往復時間も測るので、待ち方を間違えると「転送に何秒かかったか」に
     往復時間の測定ぶんが足されて、速度が実際より遅く出る。

     この試験では1本200msの往復測定を最大6本ぶん仕込んである。真の速さは25Mbps。
     ・転送が終わった時点で時刻を取る（正しい）→ 19Mbps前後
     ・往復測定が終わるまで待ってから時刻を取る（誤り）→ 13Mbps前後
     この模型は全部が同じ順番待ちに乗るので、正しく書いても数本ぶんは混ざる。
     実回線では往復測定は転送と同時に流れるので、この目減りは起きない。 */
  const env = makeEnv({ downRate: 25e6, probeMs: 200 });
  const result = await runMeasurement({ plan: { ...PLANS.normal, down: [1e6], up: [] }, ...env });
  assert.ok(result.dl > 16, `下りが ${result.dl.toFixed(1)}Mbps＝遅延の測定ぶんが分母に混ざっている`);
  assert.ok(result.dl <= 25.1, `下りが ${result.dl.toFixed(1)}Mbps＝速く出過ぎている`);
});

test('転送中の往復時間は、待機中とは別に集める', async () => {
  const env = makeEnv({ probeMs: 200 });
  const result = await runMeasurement({ plan: PLANS.eco, ...env });
  assert.ok(Number.isFinite(result.ld), '下り通信中の反応が取れていない');
  assert.ok(Number.isFinite(result.lu), '上り通信中の反応が取れていない');
});
