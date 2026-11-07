// 折りエンジンとの唯一の接点。ほかのファイルはここからだけ作品を受け取る。
// 作品データの不備（FoldError）は隠さず、呼び出し側が画面に理由を出す。
// 作品は、使われるとき（手順や形を読むとき）に初めて組み立てる。鶴のように連動折りの手順を持つ作品は
// 組み立てに時間がかかるので、起動時に全部は作らない。一覧に要る名前・難しさ・時間は組み立て前から読める。
import { buildModel } from './model.js';
import { MODELS } from './models/index.js';

function lazyModel(def) {
  let built = null;
  const build = () => (built ??= buildModel(def));
  const meta = { id: def.id, name: def.name, reading: def.reading, level: def.level, minutes: def.minutes };
  return new Proxy(meta, {
    get: (target, prop) => (prop in target ? target[prop] : build()[prop]),
    has: (target, prop) => prop in target || prop in build(),
  });
}

export async function loadModels() {
  const models = MODELS.map(lazyModel);
  models.source = 'engine';
  return models;
}
