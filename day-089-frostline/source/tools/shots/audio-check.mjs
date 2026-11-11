import { options, session, fail } from './common.mjs';

try {
  const config = options(process.argv.length > 2 ? process.argv.slice(2) : ['http://127.0.0.1:5183/dev/shell.html']);
  const rows = await session(config, { width: 768, height: 1024 }, async ({ page }) => page.evaluate(async () => {
    const { buildGraph, applyParams } = await import('/src/audio/engine.js');
    const { computeAudioParams, createAudioMemory } = await import('/src/audio/params.js');
    const sampleRate = 48000, duration = 1.5;
    // 物理や描画の準備に依存させず、同じ音の入力で帯域と釣り合いを比較する。
    const scenarios = [
      { id: 'still', name: '静止', speed: 0 },
      { id: 'straight', name: '圧雪・直進15m/s', speed: 15 },
      { id: 'carve', name: '圧雪・カービング15m/s', speed: 15, edgeForce: 2600 },
      { id: 'skid', name: '横滑り15m/s', speed: 15, skidPower: 9000 },
      { id: 'powder', name: '新雪12m/s', speed: 12, powder: 1 },
      { id: 'air', name: '空中20m/s', speed: 20, mode: 'air' },
      { id: 'ice', name: '氷・カービング15m/s', speed: 15, edgeForce: 2600, ice: 1 },
      { id: 'land', name: '着地efh1.5', speed: 15, events: [{ type: 'land', efh: 1.5 }] },
    ];
    const rows = [];
    for (const scene of scenarios) {
      const state = { mode: scene.mode ?? 'ground', speed: scene.speed, load: 1, yawRate: 0,
        snow: { ice: scene.ice ?? 0, powder: scene.powder ?? 0 },
        tele: { edgeForce: scene.edgeForce ?? 0, skidPower: scene.skidPower ?? 0, lastImpact: 0 } };
      const memory = createAudioMemory(), params = {};
      for (let i = 0; i < 240; i++) computeAudioParams(state, [], 1 / 60, memory, params);
      computeAudioParams(state, scene.events ?? [], 0, memory, params);
      const ctx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);
      applyParams(buildGraph(ctx), params, 0);
      const rendered = await ctx.startRendering();
      let energy = 0, count = 0, peak = 0, fullPeak = 0, initialPeak = 0, finite = true;
      for (let channel = 0; channel < rendered.numberOfChannels; channel++) {
        const samples = rendered.getChannelData(channel);
        for (let i = 0; i < samples.length; i++) {
          const value = samples[i], absolute = Math.abs(value);
          if (!Number.isFinite(value)) finite = false;
          fullPeak = Math.max(fullPeak, absolute);
          if (i < sampleRate * 0.2) initialPeak = Math.max(initialPeak, absolute);
          if (i >= sampleRate * 0.5) { energy += value * value; count++; peak = Math.max(peak, absolute); }
        }
      }
      rows.push({ id: scene.id, name: scene.name, rms: Math.sqrt(energy / count), peak, fullPeak, initialPeak, finite });
    }
    return rows;
  }));
  console.table(rows.map(row => ({ 場面: row.name, RMS: row.rms?.toFixed(6), 最大値: row.peak?.toFixed(6),
    全区間最大値: row.fullPeak?.toFixed(6), 着地直後最大値: row.id === 'land' ? row.initialPeak?.toFixed(6) : '' })));
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  for (const row of rows) {
    check(row.finite && [row.rms, row.peak, row.fullPeak, row.initialPeak].every(Number.isFinite), `${row.name}: 非数がある`);
    // 着地は後半1秒から消えるため、クリップの検査は開始直後を含む全区間に掛ける。
    check(row.fullPeak < 0.98, `${row.name}: 最大値が0.98以上`);
  }
  const byId = Object.fromEntries(rows.map(row => [row.id, row]));
  check(byId.still.rms < 0.02, '静止のRMSが0.02以上');
  check(byId.straight.rms > byId.still.rms, '直進が静止より大きくない');
  check(byId.skid.rms > byId.straight.rms, '横滑りが直進より大きくない');
  // 同程度の許容幅を5%と決め、後から結果に合わせて判定を緩めない。
  check(byId.air.rms > 0 && byId.air.rms <= byId.straight.rms * 1.05, '空中が無音か、直進より大きすぎる');
  check(byId.land.initialPeak >= 0.1, '着地直後0.2秒の最大値が0.1未満');
  if (errors.length) throw Error(errors.join('\n'));
  console.log('音の8場面の検査に合格しました。聞こえ方は別途試聴してください。');
} catch (error) { fail(error); }
