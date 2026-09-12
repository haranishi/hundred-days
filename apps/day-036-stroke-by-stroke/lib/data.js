/* 筆順データの取り出し。

   ファイルは符号位置の上位バイトごとに分かれている。名前のような2〜4字なら取りに
   行くファイルは多くて4つで、索引はいらない（ファイル名が計算で決まるため）。 */

export function shardName(codePoint) {
  return (codePoint >> 8).toString(16).padStart(2, '0');
}

/* 同じファイルを何度も取りに行かないよう、必要なファイル名だけを重複なく返す。 */
export function shardsFor(codePoints) {
  return [...new Set(codePoints.map(shardName))];
}

export function createLoader({ fetchJson, base = 'data/kvg' }) {
  const cache = new Map();
  /* 索引（どのファイルが在るか）。持っていない字のために404を取りに行かない。 */
  let indexPromise = null;
  const knownShards = () => {
    if (!indexPromise) {
      indexPromise = fetchJson(`${base}/index.json`)
        .then((data) => new Set(Array.isArray(data.shards) ? data.shards : []))
        .catch((err) => {
          indexPromise = null;
          throw err;
        });
    }
    return indexPromise;
  };
  const load = (name) => {
    if (!cache.has(name)) {
      cache.set(
        name,
        fetchJson(`${base}/${name}.json`).catch((err) => {
          cache.delete(name);
          throw err;
        })
      );
    }
    return cache.get(name);
  };
  return {
    /* 文字の配列を、そのまま描ける形（画の種別とパス）にして返す。データが無い字は
       strokes を null にして、ほかの字はそのまま書く。 */
    async strokesFor(chars) {
      const codePoints = chars.map((c) => c.codePointAt(0));
      const available = await knownShards();
      const loaded = new Map();
      await Promise.all(
        shardsFor(codePoints)
          .filter((name) => available.has(name))
          .map(async (name) => {
            loaded.set(name, await load(name));
          })
      );
      return chars.map((char, index) => {
        const cp = codePoints[index];
        const shard = loaded.get(shardName(cp)) || {};
        const raw = shard[cp.toString(16)];
        return { char, strokes: Array.isArray(raw) ? raw : null };
      });
    },
  };
}
