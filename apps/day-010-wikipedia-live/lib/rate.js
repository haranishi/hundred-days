/* 「いま毎秒何回か」を出す。開いた直後は測る時間そのものが短いので、
   60秒で割らずに「実際に経過した長さ」で割る。そうしないと開いた瞬間だけ極端に低く出る。 */

export function createRate(windowMs = 60_000) {
  const stamps = [];
  let startedAt = null;

  return {
    push(ts) {
      if (startedAt === null) startedAt = ts;
      stamps.push(ts);
    },

    /** 直近windowMs（それ未満なら開いてからの時間）での毎秒あたりの件数。測れないうちは null。 */
    perSecond(now) {
      const limit = now - windowMs;
      while (stamps.length && stamps[0] < limit) stamps.shift();
      if (startedAt === null) return null;
      const span = Math.min(windowMs, Math.max(now - startedAt, 0));
      if (span < 1000) return null;
      return stamps.length / (span / 1000);
    },

    get size() {
      return stamps.length;
    },
  };
}
