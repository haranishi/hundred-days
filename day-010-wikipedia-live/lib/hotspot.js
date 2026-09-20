/* 「いま世界でいちばん書き換わっている場所」を出す。

   地図に点が散っているだけでは、どこが多いのかは読み取れない。
   直近5分ぶんを国ごとに数えて、いちばん多い国を名指しする。 */

export const WINDOW_MS = 5 * 60 * 1000;

export function createHotspot(windowMs = WINDOW_MS) {
  const marks = [];

  return {
    /** ピン1本ぶんを記録する。国が分からない座標（海の上など）は数に入れない。 */
    add(country, at) {
      if (!country) return false;
      marks.push({ name: country.n, at });
      return true;
    },

    /**
     * いちばん多い国を返す。件数が同じなら、直近に書き換わったほうを選ぶ。
     * 1件も無ければ null。
     */
    top(now) {
      const limit = now - windowMs;
      while (marks.length && marks[0].at < limit) marks.shift();
      if (!marks.length) return null;

      const count = new Map();
      const last = new Map();
      for (const mark of marks) {
        count.set(mark.name, (count.get(mark.name) || 0) + 1);
        last.set(mark.name, mark.at);
      }

      let best = null;
      for (const [name, times] of count) {
        if (!best || times > best.count || (times === best.count && last.get(name) > best.at)) {
          best = { name, count: times, at: last.get(name) };
        }
      }
      return { ...best, total: marks.length, countries: count.size };
    },

    get size() {
      return marks.length;
    }
  };
}
