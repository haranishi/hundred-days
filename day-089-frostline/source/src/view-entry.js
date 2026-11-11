// 描画の入口。器（game.js）へ渡す view を作る。山の描画に、滑走者・カメラなどの系を足す。
import { createMountainView } from './render/index.js';
import { createRideFeedback } from './render/ride/index.js';
import { createMarkers } from './render/objects/markers.js';

/**
 * @param {{world:object, search?:string}} deps
 */
export function createView({ world, search = '' }) {
  const q = new URLSearchParams(search);
  // 確認用：?sun=方位,高さ（度。方位は北から時計回り）で、太陽の向きだけ差し替える。山が落とす影の地図は使わない
  const tune = {};
  if (q.get('sun')) {
    const [az, el] = q.get('sun').split(',').map(v => Number(v) * Math.PI / 180);
    if (Number.isFinite(az) && Number.isFinite(el)) { tune.sunDir = [Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)]; tune.sunVis = false; }
  }
  const view = createMountainView({ forceWebGL: q.get('webgl') === '1', tune });
  const feedback = createRideFeedback({ view, world });
  createMarkers({ view, world });
  // 器が読む info（方式）を、準備のあとで埋める
  const init = view.init;
  view.init = async (args) => {
    const r = await init(args);
    view.info = { backend: view.context.backend };
    return r;
  };
  // 確認用の窓口（撮影スクリプトから、滑走者を決まった向きで眺める）
  if (q.get('debug') === '1') globalThis.__ginreiDev = { view, feedback };
  return { view, feedback };
}
