// 効果音。録音素材を使わず Web Audio でその場で合成する（docs/VISUAL.md「音」）。
// AudioContext は最初の操作（unlock）で作る・再開する。鳴らせない環境では何もしない。

const MASTER = 0.5;
// 都節の音階（E を主音に：E F A B C E'）。半音の数
const MIYAKO = [0, 1, 5, 7, 8, 12, 13, 17];
const BASE_HZ = 329.63; // E4

export function createAudio({ isOn = () => true } = {}) {
  let ac = null;
  let master = null;
  let noiseBuf = null;
  const plucks = new Map();
  let lastPair = -1;

  function ctx() {
    if (!isOn()) return null;
    try {
      if (!ac) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) return null;
        ac = new AC();
        master = ac.createGain();
        master.gain.value = MASTER;
        master.connect(ac.destination);
      }
      if (ac.state === 'suspended') ac.resume().catch(() => {});
      return ac;
    } catch {
      return null;
    }
  }

  function noise() {
    if (!noiseBuf) {
      const len = Math.floor(ac.sampleRate * 0.6);
      noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  function env(t, peak, len, attack = 0.002) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    return g;
  }

  // 木と木を打ち合わせる音：帯域を絞った雑音の短い破裂＋高めの正弦波を速く減衰
  function clap(t, { freq = 2600, q = 9, tone = 1900, gain = 0.8, len = 0.07, ring = 1.4 } = {}) {
    const src = ac.createBufferSource();
    src.buffer = noise();
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    src.connect(bp).connect(env(t, gain, len)).connect(master);
    src.start(t, Math.random() * 0.4, len + 0.03);
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(tone, t);
    o.frequency.exponentialRampToValueAtTime(tone * 0.97, t + len * ring);
    o.connect(env(t, gain * 0.45, len * ring)).connect(master);
    o.start(t);
    o.stop(t + len * ring + 0.05);
  }

  // Karplus-Strong の撥弦。音高ごとに一度だけ作って使い回す
  function pluckBuffer(freq) {
    const key = Math.round(freq * 10);
    let buf = plucks.get(key);
    if (buf) return buf;
    const sr = ac.sampleRate;
    const n = Math.floor(sr * 1.3);
    buf = ac.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    const period = Math.max(2, Math.round(sr / freq));
    const line = new Float32Array(period);
    for (let i = 0; i < period; i++) line[i] = Math.random() * 2 - 1;
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const next = (idx + 1) % period;
      const v = line[idx];
      // 平均の重みを少し前に寄せて、三味線らしい明るい減衰にする
      line[idx] = 0.994 * (0.62 * line[idx] + 0.38 * line[next]);
      d[i] = v;
      idx = next;
    }
    plucks.set(key, buf);
    return buf;
  }

  function pluck(freq, t, gain = 0.55) {
    const src = ac.createBufferSource();
    src.buffer = pluckBuffer(freq);
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 180;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    src.connect(hp).connect(g).connect(master);
    src.start(t);
  }

  function drum(t, { from, to, len, gain, drop = 0.12, type = 'sine' }) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + drop);
    o.connect(env(t, gain, len, 0.004)).connect(master);
    o.start(t);
    o.stop(t + len + 0.05);
  }

  const safe = (fn) => (...args) => {
    const a = ctx();
    if (!a) return;
    try {
      fn(a.currentTime + 0.005, ...args);
    } catch {
      /* 音が鳴らなくても遊べる */
    }
  };

  return {
    unlock() {
      ctx();
    },
    // 拍子木（チョン、チョン）：開幕と対局開始
    hyoshigi: safe((t) => {
      clap(t);
      clap(t + 0.18, { tone: 2050 });
    }),
    // 木の打鍵音：キーを押すたび。ごく小さく短く
    key: safe((t) => {
      clap(t, { freq: 1400, q: 3, tone: 1150, gain: 0.1, len: 0.028, ring: 1 });
    }),
    // 三味線：言葉が解けたとき、都節の音階で2音
    shamisen: safe((t) => {
      const pairs = [[3, 5], [4, 5], [2, 3], [5, 7], [3, 6]];
      let i = Math.floor(Math.random() * pairs.length);
      if (i === lastPair) i = (i + 1) % pairs.length;
      lastPair = i;
      const [a, b] = pairs[i].map((k) => BASE_HZ * 2 ** (MIYAKO[k] / 12));
      pluck(a, t);
      pluck(b, t + 0.14, 0.5);
    }),
    // 鼓（ぽん）：埋まったが違うとき。音程が下がる正弦波
    tsuzumi: safe((t) => {
      drum(t, { from: 380, to: 170, len: 0.32, gain: 0.55, drop: 0.16 });
    }),
    // 太鼓（どん）＋柝（チョーン）：完了
    taiko: safe((t) => {
      drum(t, { from: 120, to: 52, len: 0.9, gain: 0.95, drop: 0.3 });
      const src = ac.createBufferSource();
      src.buffer = noise();
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      src.connect(lp).connect(env(t, 0.5, 0.18)).connect(master);
      src.start(t, 0, 0.2);
      clap(t + 0.42, { freq: 3000, q: 12, tone: 2350, gain: 0.8, len: 0.12, ring: 3 });
    }),
  };
}
