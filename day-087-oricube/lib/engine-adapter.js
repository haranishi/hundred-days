// 折りエンジンとの唯一の接点。ほかのファイルはここからだけ作品を受け取る。
// 作品データの不備（FoldError）は隠さず、呼び出し側が画面に理由を出す。
import { buildModel } from './model.js';
import { MODELS } from './models/index.js';

export async function loadModels() {
  const models = MODELS.map((def) => buildModel(def));
  models.source = 'engine';
  return models;
}
