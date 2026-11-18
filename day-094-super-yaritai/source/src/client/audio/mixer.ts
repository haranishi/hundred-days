// 音の通り道：効果音・鳴らし続ける音・BGM の3本を混ぜ、圧縮器（大きすぎる音を抑える）を通して出す。
// 本番（createAudio）と書き出しの試験（offline.ts）が同じ通り道を使う。

export interface Mixer {
  sfx: GainNode;
  loops: GainNode;
  bgm: GainNode;
  /** 消音はここを0にする */
  master: GainNode;
}

export const BUS_LEVEL = { sfx: 0.8, loops: 0.7, bgm: 0.42 } as const;

export function buildMixer(ctx: BaseAudioContext): Mixer {
  const sfx = ctx.createGain();
  sfx.gain.value = BUS_LEVEL.sfx;
  const loops = ctx.createGain();
  loops.gain.value = BUS_LEVEL.loops;
  const bgm = ctx.createGain();
  bgm.gain.value = BUS_LEVEL.bgm;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value = 6;
  comp.ratio.value = 8;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  const master = ctx.createGain();
  master.gain.value = 1;
  sfx.connect(comp);
  loops.connect(comp);
  bgm.connect(comp);
  comp.connect(master).connect(ctx.destination);
  return { sfx, loops, bgm, master };
}
