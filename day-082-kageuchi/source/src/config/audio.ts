// OWNER: integrate
// 音の調整値。音量は 0..1 の倍率、周波数は Hz、時間は秒、距離は m。外の音源は使わず、すべて src/audio で合成する。

export const AUDIO = {
  /** 全体・効果音・環境音の音量。一時停止中は全体を pauseDuck 倍 */
  master: 0.8,
  sfx: 1.0,
  ambience: 0.55,
  pauseDuck: 0.3,
  /** 残響（夜の境内の広がり）：長さと、効果音・環境音から送る量 */
  reverb: { seconds: 2.4, decay: 3.2, sfxSend: 0.18, ambSend: 0.3 },
  /** 位置のある音の距離の減り方：gain ＝ 1 ÷ (1 ＋ (d ÷ ref)²)。これより遠い音は鳴らさない */
  spatial: { ref: 9, maxDistance: 45 },
  /** 夜の環境音：かすかな風・虫（鈴虫のような高い震え）・蛙（池のほうから） */
  wind: { level: 0.16, cutoff: 420, swayHz: 0.06, swayDepth: 0.55 },
  insects: { voices: 4, level: 0.045, freqLo: 3900, freqHi: 4900, trillLo: 28, trillHi: 46 },
  frogs: { level: 0.09, gapLo: 0.9, gapHi: 3.6, nearPond: 18 },
  /** 篝火のはぜる音：近い篝火ほど大きく、多く鳴る（radius m の内） */
  crackle: { radius: 14, ratePerSec: 9, level: 0.22, breath: 0.09 },
  /** 足音：地面ごとの音色は sfx.ts、構えごとの大きさはここ */
  footstep: { crouch: 0.32, walk: 0.62, run: 1.0 },
  /** 討ち取りの後の炎のうなり（炎上の進み 0→1 で上げる） */
  fireRoar: { level: 0.42, cutoffLo: 260, cutoffHi: 1100 },
} as const;
