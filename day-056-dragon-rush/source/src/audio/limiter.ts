// OWNER: audio
// 全体の制限器。AudioWorklet の先読みリミッター（4ms 先を見て、ピークが来る前に滑らかに下げる）。上限を超えた残りは最後に止める。
// 作れない環境（AudioWorklet が無い・読み込みに失敗）では DynamicsCompressorNode で代わりをする。
// DynamicsCompressorNode は仕様どおり自動で持ち上げ（makeup）を掛けるので、その分だけ後ろで下げる。

// Workletは同一オリジンの静的ファイル。CSPをblob:へ緩めない。
export interface Limiter {
  input: AudioNode;
  output: AudioNode;
  kind: 'worklet' | 'compressor';
  /** これまでの最大の下げ幅（dB、正の値） */
  maxGrDb(): number;
}

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

export async function createLimiter(ctx: BaseAudioContext, opts: { ceilingDb: number; lookaheadMs: number; releaseMs: number }): Promise<Limiter> {
  const ceil = 10 ** (opts.ceilingDb / 20);
  try {
    if (!ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') throw new Error('no worklet');
    let p = loaded.get(ctx);
    if (!p) {
      const url = new URL('./limiter.worklet.js', import.meta.url);
      p = ctx.audioWorklet.addModule(url.href);
      loaded.set(ctx, p);
    }
    await p;
    const node = new AudioWorkletNode(ctx, 'dr-limiter', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: 'explicit',
      processorOptions: { ceil, lookahead: Math.max(8, Math.round((opts.lookaheadMs / 1000) * ctx.sampleRate)), release: (opts.releaseMs / 1000) * ctx.sampleRate },
    });
    let minG = 1;
    node.port.onmessage = (e: MessageEvent<number>) => (minG = Math.min(minG, e.data));
    return { input: node, output: node, kind: 'worklet', maxGrDb: () => -20 * Math.log10(minG) };
  } catch {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = opts.ceilingDb - 2;
    comp.knee.value = 0;
    comp.ratio.value = 20;
    comp.attack.value = 0.002;
    comp.release.value = opts.releaseMs / 1000;
    const trim = ctx.createGain();
    trim.gain.value = 10 ** (-3 / 20);
    comp.connect(trim);
    return { input: comp, output: trim, kind: 'compressor', maxGrDb: () => -comp.reduction };
  }
}
