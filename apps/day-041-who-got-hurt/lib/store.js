/* メッシュのファイルを1回だけ取って持っておく貯め場。
   半径や絞り込みを変えても取り直さない（同じ場所なら通信は最初の1回きり） */
import { readPack } from './pack.js';
import { fileUrl } from './mesh.js';

export function createPackStore(fetcher = fetch) {
  const held = new Map();
  /* 持っているぶんを並べて返す。取っていないメッシュを黙って0件にすると
     「記録がありません」という嘘の答えになるので、呼び忘れは例外にする */
  const records = (codes) => {
    const out = [];
    for (const code of codes) {
      const rows = held.get(code);
      if (!rows) throw new Error(`まだ読み込んでいないメッシュ: ${code}`);
      out.push(...rows);
    }
    return out;
  };
  return {
    has: (code) => held.has(code),
    get: (code) => held.get(code),
    records,
    async load(codes, options = {}) {
      const wanted = [...new Set(codes)].filter((code) => !held.has(code));
      await Promise.all(wanted.map(async (code) => {
        const response = await fetcher(fileUrl(code), { signal: options.signal });
        if (!response.ok) throw new Error('事故データのファイルを取得できません');
        held.set(code, readPack(await response.arrayBuffer(), code));
      }));
      return records(codes);
    },
  };
}
