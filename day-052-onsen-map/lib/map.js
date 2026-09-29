// MapLibre の地図。県庁所在地の柱（fill-extrusion）と、お風呂の点（circle）を描く。
// スタイルが届く前に呼ばれた操作は溜めておき、届いた時点で順に反映する。
// スタイルが読めない（WebGLが無い・タイルが届かない）ときは onFail を呼び、画面は順位の表を主にする。

import { JAPAN_BOXES, JAPAN_VIEW } from './geo.js';
import { TYPE_COLORS, TYPE_LABELS, bathName } from './baths.js';
import { GROW_MS, PILLAR_RADIUS_KM, easeOut } from './pillars.js';
import { BASEMAP, japanArea, planLabels, planQuietLines } from './labels.js';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
const STYLE_TIMEOUT_MS = 15000;
// 最初の柱は下地のタイルが描けてから伸ばす。タイルが遅いときはこの時間で待つのをやめて伸ばす
const FIRST_GROW_WAIT_MS = 2500;
const EMPTY = { type: 'FeatureCollection', features: [] };
// 右上のボタンの列（拡大・縮小・方位と「近くを見る」）の幅。構図を決めるとき、点や柱をこの列の下に置かない
const CONTROL_COLUMN = 62;
// 縦の視野角（度）。MapLibre の既定は36.87°。狭めるほど透視が弱まり、画面の端の柱が斜めに倒れて見えなくなる
// （390px幅で端の柱の倒れ角 11.2°→7.4°、PC 1440×900 で 31.4°→10.7°）
export const FIELD_OF_VIEW = 15;
// 地図の幅がこれより狭い画面（スマホ）では、柱の当たりを広げ、根元のラベルを1位の1本だけにする
const NARROW = 600;
// 柱の当たり判定：押した位置のまわり。スマホは±22px（直径44px相当。390px幅では柱が約5pxしかない）、ほかは±12px
const PILLAR_REACH = { narrow: 22, wide: 12 };
const BATH_REACH = 14;
// 根元のラベルは、押せるもの（左下の「沖縄県 ↙」）からこれ以上離す
const LABEL_GAP = 8;

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
const duration = (animate, ms) => (animate && !reducedMotion() ? ms : 0);

const scaled = (factor) => ['*', ['get', 'h'], ['coalesce', ['feature-state', 'grow'], 0], factor];
// 全国の画面で柱が読める高さにする。倍率はズームで変えるだけで、県どうしの比は変わらない
const PILLAR_HEIGHT = ['interpolate', ['linear'], ['zoom'],
  3, scaled(1.2), 4, scaled(1), 5, scaled(0.85), 6, scaled(0.5), 7, scaled(0.22), 8, scaled(0.1), 10, scaled(0.025), 13, scaled(0.005)];

// 全国の構図。列島の向きに合わせて少し回す（横長の地図は列島が横に、縦長は縦に伸びる向き）。
// 値は 390×844・768×1024・1440×900 で、向き（bearing −30〜40°）・傾き（pitch 30〜55°）・視野角を投影して比べ、
// 本物のタイルで撮り比べて選んだ。傾きは40°に抑え（スマホの九州の柱の重なりが減る）、視野角を15°に狭めて倒れを消した。
// 大きく回すと（b−40 など）、ほぼ正方形の PC の地図ではかえって小さくなった
export const NATION_VIEWS = {
  portrait: { bearing: 5, pitch: 40 }, // 縦長（スマホ）
  landscape: { bearing: -10, pitch: 40 }, // 横長で縦横比1.3未満（PC 1440×900 の地図は 1040×871）
  wide: { bearing: -15, pitch: 40 }, // 縦横比1.3以上（タブレット 768×1024 の地図は 768×562）
};
/* 地図の右下の帰属表示（OpenFreeMap © OpenMapTiles Data from OpenStreetMap）は、開いた直後は出したままにする。
   OSMF の帰属ガイドラインで畳んでよいのは「利用者が地図を操作したとき」か「表示から5秒後」だけで、
   OpenMapTiles（CC BY 4.0）も見える形での表記を求めている。畳んだあとも（i）から開ける */
export const ATTRIBUTION_VISIBLE_MS = 5000;
// 畳んだ（i）の枠の高さ（app.css の 44px＋上下2px）に、MapLibre の上下の余白10pxずつを足したもの。E2E で実測と突き合わせる
export const COLLAPSED_ATTRIBUTION_HEIGHT = 68;
const collapseAttribution = (container) => {
  const box = container.querySelector('.maplibregl-ctrl-attrib.maplibregl-compact');
  if (!box) return false;
  box.classList.remove('maplibregl-compact-show');
  box.removeAttribute('open');
  return true;
};
export function nationViewFor(width, height) {
  const aspect = width / Math.max(1, height);
  if (aspect < 1) return NATION_VIEWS.portrait;
  return aspect < 1.3 ? NATION_VIEWS.landscape : NATION_VIEWS.wide;
}

// 「近くを見る」のボタンを、右上の拡大・縮小の下に並べる（地図の上の点と重ならない列に置く）。
// 地図が消えたとき（onRemove）は元の場所へ戻す。地図が出ない画面では、順位の表の上にそのまま出る
class NearControl {
  constructor(button) { this.button = button; }

  onAdd() {
    this.home = this.button.parentElement;
    this.box = document.createElement('div');
    this.box.className = 'maplibregl-ctrl maplibregl-ctrl-group near-control';
    this.box.append(this.button);
    return this.box;
  }

  onRemove() {
    this.home?.append(this.button);
    this.box?.remove();
  }
}

export function createOnsenMap(container, handlers = {}, { nearButton = null } = {}) {
  const maplibregl = globalThis.maplibregl;
  if (!maplibregl) throw new Error('MapLibre unavailable');

  const map = new maplibregl.Map({
    container,
    style: STYLE_URL,
    center: [137.5, 37.2],
    zoom: 4,
    pitch: 45,
    maxPitch: 60,
    attributionControl: false,
    fadeDuration: 0,
    locale: {
      'NavigationControl.ZoomIn': '拡大',
      'NavigationControl.ZoomOut': '縮小',
      'NavigationControl.ResetBearing': '北を上にして傾きを戻す',
      'AttributionControl.ToggleAttribution': '地図の出典を開く・閉じる',
      'Map.Title': '温泉と銭湯の地図',
    },
  });
  // 視野角を狭めて透視を弱める（既定の36.87°だと、画面の端の柱が消失点へ向かって大きく斜めに倒れて見える）
  map.setVerticalFieldOfView(FIELD_OF_VIEW);
  /* 帰属の文は、タイルの TileJSON が持つ「OpenFreeMap © OpenMapTiles Data from OpenStreetMap」をそのまま出す
     （OpenMapTiles は openmaptiles.org、OpenStreetMap は /copyright へのリンク付き）。customAttribution で
     OpenStreetMap を足すと同じ出典が2つ並び、スマホでは4行になって地図を覆う（Day 040 と同じ判断） */
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  if (nearButton) map.addControl(new NearControl(nearButton), 'top-right');
  // 方位のボタン（北を上にして傾きを戻す）にも読み上げの名前と見出しを付ける
  const compass = container.querySelector('.maplibregl-ctrl-compass');
  if (compass) {
    compass.setAttribute('aria-label', '北を上にして傾きを戻す');
    compass.title = '北を上にして傾きを戻す';
  }
  /* 帰属表示は、全国の地図のタイルが描けて柱が伸び始めたところから5秒出してから畳む。最初の idle はタイルを
     描く前に来るので、そこから数えると地図の見えている間に出典がほとんど映らない（デモの撮り直しで気づいた）。
     それより前に利用者が地図を動かす・押す・拡大縮小したら、その時点で畳む（アプリが自分で動かすカメラでは畳まない）。
     畳むのは1回だけで、あとで利用者が（i）から開いたら、そのまま開いておく */
  let attributionCollapsed = false;
  let attributionTimer = 0;
  const collapseOnce = () => {
    if (attributionCollapsed) return;
    attributionCollapsed = collapseAttribution(container);
    if (attributionCollapsed) clearTimeout(attributionTimer);
  };
  const startAttributionClock = () => {
    if (attributionTimer || attributionCollapsed || !tilesShown) return;
    const text = container.querySelector('.maplibregl-ctrl-attrib-inner')?.textContent ?? '';
    if (!text.includes('OpenStreetMap')) return;
    attributionTimer = setTimeout(collapseOnce, ATTRIBUTION_VISIBLE_MS);
  };
  const collapseOnUserMove = (event) => { if (event?.originalEvent) collapseOnce(); };
  map.on('idle', startAttributionClock);
  for (const type of ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart']) map.on(type, collapseOnUserMove);
  map.on('click', collapseOnce);

  let styleReady = false;
  let failed = false;
  let level = 'nation';
  let pillarIds = [];
  let growFrame = 0;
  let lastGrow = 0;
  let growToken = 0;
  const pending = {};

  // 先に伸びきると、日本の形が出る前に動きが終わってしまう（デモの1コマ目で気づいた）。
  // いま映している範囲のタイルが全部届いてから伸ばす。待ち始めるのは全国の構図へ移る直前（style.load の中）なので、
  // その後の idle は新しい範囲の描画が済んだ合図になる。sourcedata で確かめると、新しい範囲のタイルを
  // まだ頼んでいない瞬間に「未着なし」と判定して早く伸びてしまう（撮り直しで確かめた）
  let tilesShown = false;
  let tilesShownWait = null;
  // 待ちは1本にまとめる（柱を伸ばすときと、帰属表示の5秒を数え始めるときの両方が使う）
  const whenTilesShown = () => tilesShownWait ??= new Promise((resolve) => {
    if (tilesShown) { resolve(); return; }
    const finish = () => {
      tilesShown = true;
      clearTimeout(limit);
      map.off('idle', check);
      startAttributionClock();
      resolve();
    };
    const check = () => { if (map.areTilesLoaded()) finish(); };
    const limit = setTimeout(finish, FIRST_GROW_WAIT_MS);
    map.on('idle', check);
  });

  const fail = (reason) => {
    if (failed) return;
    failed = true;
    clearTimeout(timer);
    clearTimeout(attributionTimer);
    cancelAnimationFrame(growFrame);
    try { map.remove(); } catch { /* 途中まで作った地図の片付けに失敗しても、画面は順位の表で続ける */ }
    handlers.onFail?.(reason);
  };
  const timer = setTimeout(() => { if (!styleReady) fail('timeout'); }, STYLE_TIMEOUT_MS);
  // スタイルが届く前の error は「地図が出ない」。届いた後のタイル1枚の失敗は地図を止めない
  map.on('error', () => { if (!styleReady) fail('style'); });

  const paint = (id, property, value) => { if (map.getLayer(id)) map.setPaintProperty(id, property, value); };

  function tuneLabels() {
    for (const step of planLabels(map.getStyle()?.layers, japanArea(JAPAN_BOXES))) {
      if (step.visibility) {
        map.setLayoutProperty(step.id, 'visibility', step.visibility);
        continue;
      }
      map.setLayoutProperty(step.id, 'text-field', step.textField);
      map.setLayerZoomRange(step.id, step.minzoom, step.maxzoom);
      if (step.filter) map.setFilter(step.id, step.filter);
      map.setPaintProperty(step.id, 'text-color', step.textColor);
      map.setPaintProperty(step.id, 'text-halo-color', step.haloColor);
      map.setPaintProperty(step.id, 'text-halo-width', 1.2);
    }
  }

  // 陸と海の差を上げ（コントラスト比1.3以上）、海岸線を一段明るく、県境を見える太さ・明るさにする
  function tuneBase() {
    for (const step of planQuietLines(map.getStyle()?.layers)) {
      if (step.maxzoom > step.minzoom) map.setLayerZoomRange(step.id, step.minzoom, step.maxzoom);
      else map.setLayoutProperty(step.id, 'visibility', 'none');
    }
    paint('background', 'background-color', BASEMAP.land);
    paint('water', 'fill-color', BASEMAP.water);
    paint('waterway', 'line-color', BASEMAP.water);
    for (const id of ['landcover_wood', 'landuse_park', 'landuse_residential', 'landcover_ice_shelf', 'landcover_glacier']) paint(id, 'fill-color', BASEMAP.land);
    if (map.getLayer('boundary_state')) {
      paint('boundary_state', 'line-color', BASEMAP.stateBorder);
      paint('boundary_state', 'line-dasharray', [3, 1.5]);
      paint('boundary_state', 'line-width', ['interpolate', ['linear'], ['zoom'], 4, 0.4, 6, 1, 8, 1.6, 12, 2.2]);
      paint('boundary_state', 'line-opacity', ['interpolate', ['linear'], ['zoom'], 4, 0.35, 6, 0.9]);
    }
    // 海岸線は水の面の縁を線で描く（タイルの切れ目は描画範囲の外になるので線が出ない）
    if (map.getSource('openmaptiles') && map.getLayer('water') && !map.getLayer('coastline')) {
      map.addLayer({
        id: 'coastline',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: { 'line-color': BASEMAP.coast, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 8, 1.2, 12, 1.6] },
      }, map.getLayer('waterway') ? 'waterway' : undefined);
    }
  }

  map.on('style.load', () => {
    if (failed || styleReady) return;
    styleReady = true;
    clearTimeout(timer);
    // dark スタイルは陸が海より暗い。陸を明るく、海を紺にして、列島の形が柱の下で読めるようにする
    tuneBase();
    tuneLabels();

    map.addSource('pillars', { type: 'geojson', data: EMPTY });
    map.addLayer({
      id: 'pillars',
      type: 'fill-extrusion',
      source: 'pillars',
      paint: {
        'fill-extrusion-color': ['get', 'color'],
        'fill-extrusion-height': PILLAR_HEIGHT,
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.95,
        'fill-extrusion-vertical-gradient': true,
      },
    });
    map.addSource('baths', { type: 'geojson', data: EMPTY });
    map.addLayer({
      id: 'baths',
      type: 'circle',
      source: 'baths',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3.4, 9, 5.2, 13, 7.5],
        'circle-color': ['match', ['get', 't'],
          'onsen', TYPE_COLORS.onsen, 'sento', TYPE_COLORS.sento, 'super', TYPE_COLORS.super, 'foot', TYPE_COLORS.foot, TYPE_COLORS.other],
        'circle-stroke-color': ['case', ['==', ['get', 'v'], 1], '#ffffff', '#0b0e14'],
        'circle-stroke-width': ['case', ['==', ['get', 'v'], 1], 2.4, 1.2],
      },
    });
    map.addLayer({
      id: 'bath-selected',
      type: 'circle',
      source: 'baths',
      filter: ['==', ['get', 'id'], ''],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 8, 13, 13],
        'circle-color': 'rgba(0, 0, 0, 0)',
        'circle-stroke-color': '#fff3cf',
        'circle-stroke-width': 3,
      },
    });

    // 溜めておいた操作を、柱→段階→点→選択→カメラの順に反映する
    if (pending.pillars) api.setPillars(...pending.pillars);
    api.setLevel(level);
    if (pending.baths) api.setBaths(...pending.baths);
    if (pending.selected) api.selectBath(...pending.selected);
    if (pending.top) api.setTopLabels(...pending.top);
    if (pending.here) api.showHere(...pending.here);
    // 動きを減らす設定などで柱を伸ばさないときも、タイルが描けたら帰属表示の5秒を数え始める（カメラを動かす直前に待ち始める）
    whenTilesShown();
    if (pending.camera) {
      const [kind, ...args] = pending.camera;
      ({ nation: api.flyNation, pref: api.flyPref, bath: api.flyBath, near: api.flyNear })[kind](...args);
    }
    handlers.onReady?.();
  });

  function setGrow(value) {
    lastGrow = value;
    for (const id of pillarIds) map.setFeatureState({ source: 'pillars', id }, { grow: value });
  }

  function padding(kind) {
    const width = container.clientWidth || 390;
    const height = container.clientHeight || 400;
    const side = Math.round(Math.min(40, width * 0.05));
    const right = Math.max(side, CONTROL_COLUMN);
    /* 右下の帰属表示の上に収める。帰属表示は隠さない。開いた直後に広がっている間（数秒で（i）に畳む）は、
       畳んだ（i）の高さで測る。広がった高さで測ると、スタイルの帰属が届いたかどうかで全国の構図が変わってしまう */
    const corner = container.querySelector('.maplibregl-ctrl-bottom-right');
    const attribution = attributionCollapsed ? corner?.offsetHeight ?? 0 : COLLAPSED_ATTRIBUTION_HEIGHT;
    // 全国：柱は上へ伸びるので上を広く空ける。下は、根元の少し下に置く上位3県の文字と、左下の「沖縄県 ↙」の分を空ける
    if (kind === 'nation') return { top: Math.round(height * 0.2), bottom: Math.max(Math.round(height * 0.04), attribution + 6, 60), left: side, right };
    return { top: Math.round(height * 0.12), bottom: Math.max(Math.round(height * 0.1), attribution + 6), left: side + 6, right };
  }

  // 傾け・回した地図に点の群れを収めるカメラ。cameraForBounds は傾きを考えない（奥が縮み手前が膨らむ）ので、
  // 実際に傾けた状態で点を画面へ投影し、枠に収まるいちばん大きいズームを二分探索で求める。
  // 途中の jumpTo は同じ処理の中で元に戻すので、画面には映らない
  function pitchedCamera(points, { pitch, bearing = 0, pad, minZoom, maxZoom }) {
    const width = container.clientWidth;
    const height = container.clientHeight;
    const coordinates = points.map((point) => [point.lng, point.lat]);
    if (!coordinates.length || width < 40 || height < 40) return null;
    const saved = { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
    const frame = { left: pad.left, right: width - pad.right, top: pad.top, bottom: height - pad.bottom };
    const aim = [(frame.left + frame.right) / 2, (frame.top + frame.bottom) / 2];
    let center = [
      coordinates.reduce((sum, point) => sum + point[0], 0) / coordinates.length,
      coordinates.reduce((sum, point) => sum + point[1], 0) / coordinates.length,
    ];
    const settle = (zoom) => {
      // 投影した点の外接四角の中心を、枠の中心に合わせる（傾きで投影がゆがむので3回くり返す）
      for (let round = 0; round < 3; round += 1) {
        map.jumpTo({ center, zoom, pitch, bearing });
        const projected = coordinates.map((point) => map.project(point));
        const xs = projected.map((point) => point.x);
        const ys = projected.map((point) => point.y);
        const middle = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
        const moved = map.unproject([width / 2 + middle[0] - aim[0], height / 2 + middle[1] - aim[1]]);
        center = [moved.lng, moved.lat];
      }
      map.jumpTo({ center, zoom, pitch, bearing });
      return coordinates.every((point) => {
        const at = map.project(point);
        return at.x >= frame.left && at.x <= frame.right && at.y >= frame.top && at.y <= frame.bottom;
      });
    };
    let low = minZoom;
    let high = maxZoom;
    for (let step = 0; step < 14; step += 1) {
      const middle = (low + high) / 2;
      if (settle(middle)) low = middle;
      else high = middle;
    }
    settle(low);
    const camera = { center, zoom: low, pitch, bearing };
    map.jumpTo(saved);
    return camera;
  }

  function nationCamera(points, view = nationViewFor(container.clientWidth, container.clientHeight)) {
    return pitchedCamera(points, { ...view, pad: padding('nation'), minZoom: 2, maxZoom: 7 });
  }

  // 柱の画面上の形：根元（県庁所在地）から頭までの縦の帯で、幅は柱の太さ。頭の高さは、柱の軸に沿って
  // その柱に当たるかを二分探索で確かめて求める（傾けた地図では、手前の柱の頭が奥の柱の根元の近くまで伸びる）
  function pillarShape(hit) {
    const { cx, cy, code } = hit.properties;
    const base = map.project([cx, cy]);
    const side = map.project([cx + PILLAR_RADIUS_KM / (111.32 * Math.cos((cy * Math.PI) / 180)), cy]);
    const half = Math.hypot(side.x - base.x, side.y - base.y);
    const covers = (y) => map.queryRenderedFeatures([base.x, y], { layers: ['pillars'] }).some((one) => one.properties.code === code);
    let inside = base.y;
    let outside = base.y - container.clientHeight;
    if (!covers(inside)) return { base, top: base.y, half };
    for (let step = 0; step < 9; step += 1) {
      const middle = (inside + outside) / 2;
      if (covers(middle)) inside = middle;
      else outside = middle;
    }
    return { base, top: inside, half };
  }

  // 押した位置から柱の形までの距離（形の中なら0）
  function distanceToPillar(point, { base, top, half }) {
    const across = Math.max(0, Math.abs(point.x - base.x) - half);
    const along = point.y > base.y ? point.y - base.y : point.y < top ? top - point.y : 0;
    return Math.hypot(across, along);
  }

  const narrow = () => container.clientWidth < NARROW;

  // 押した位置のまわり（スマホ±22px・ほか±12px）にある柱のうち、形がいちばん近いもの。
  // 形が重なっていて、押した位置がどちらの形の中でもあるときは、柱の軸（根元の真上の線）が指に近い方にする
  function nearestPillar(point) {
    const reach = narrow() ? PILLAR_REACH.narrow : PILLAR_REACH.wide;
    const hits = map.queryRenderedFeatures([[point.x - reach, point.y - reach], [point.x + reach, point.y + reach]], { layers: ['pillars'] });
    const unique = [...new Map(hits.map((hit) => [hit.properties.code, hit])).values()];
    let best = null;
    let bestScore = [Infinity, Infinity];
    for (const hit of unique) {
      const shape = pillarShape(hit);
      const score = [distanceToPillar(point, shape), Math.abs(point.x - shape.base.x)];
      const closer = score[0] < bestScore[0] - 0.01 || (Math.abs(score[0] - bestScore[0]) <= 0.01 && score[1] < bestScore[1]);
      if (closer) [best, bestScore] = [hit, score];
    }
    return best;
  }

  function nearestBath(point) {
    const hits = map.queryRenderedFeatures([[point.x - BATH_REACH, point.y - BATH_REACH], [point.x + BATH_REACH, point.y + BATH_REACH]], { layers: ['baths'] });
    let best = null;
    let bestDistance = Infinity;
    for (const hit of hits) {
      const at = map.project(hit.geometry.coordinates);
      const distance = Math.hypot(at.x - point.x, at.y - point.y);
      if (distance < bestDistance) [best, bestDistance] = [hit, distance];
    }
    return best;
  }

  // 全国では柱、それ以外ではお風呂の点だけを拾う（県に寄ったら柱は隠している）
  function hitAt(point) {
    if (!styleReady) return null;
    if (level === 'nation') {
      const pillar = nearestPillar(point);
      return pillar ? { kind: 'pref', code: pillar.properties.code, label: pillar.properties.label } : null;
    }
    const bath = nearestBath(point);
    return bath ? { kind: 'bath', id: bath.properties.id, label: bath.properties.label } : null;
  }

  map.on('click', (event) => {
    const hit = hitAt(event.point);
    if (hit?.kind === 'bath') handlers.onBath?.(hit.id);
    else if (hit?.kind === 'pref') handlers.onPref?.(hit.code);
  });
  map.on('mousemove', (event) => {
    const hit = hitAt(event.point);
    map.getCanvas().style.cursor = hit ? 'pointer' : '';
    handlers.onHover?.(hit ? hit.label : '', event.point);
  });
  map.on('mouseout', () => handlers.onHover?.('', null));
  map.on('moveend', () => {
    handlers.onMoveEnd?.();
    nudgeLabels();
    placeBathLabel();
  });
  map.on('resize', () => {
    drawTopLabels();
    placeBathLabel();
  });

  let hereMarker = null;
  let selectedMarker = null;
  let selectedBath = null;
  let selectedSide = 'right';
  let topItems = [];
  let topMarkers = [];

  // 上位県の柱の根元に「大分県 5,094」。柱の陰に隠れないよう根元の少し下に置き、全国の画面でだけ出す。
  // スマホは1位の1本だけ（上位3本だと九州で重なる）、それより広い画面は上位3本
  function drawTopLabels() {
    for (const marker of topMarkers) marker.remove();
    topMarkers = [];
    if (level !== 'nation') return;
    for (const item of topItems.slice(0, narrow() ? 1 : 3)) {
      const node = document.createElement('div');
      node.className = 'top-label';
      node.dataset.code = item.code;
      node.textContent = item.text;
      topMarkers.push(new maplibregl.Marker({ element: node, anchor: 'top', offset: [0, 9] }).setLngLat([item.lng, item.lat]).addTo(map));
    }
    nudgeLabels();
  }

  // ラベルを、地図の上の押せるもの（左下の「沖縄県 ↙」）から8px以上離す。近ければ右へずらす（柱は縦に立つので横へ逃がす）
  function nudgeLabels() {
    const zones = (handlers.keepClear?.() ?? []).filter(Boolean);
    for (const marker of topMarkers) {
      marker.setOffset([0, 9]);
      const node = marker.getElement();
      for (const zone of zones) {
        const rect = node.getBoundingClientRect();
        const near = rect.left < zone.right + LABEL_GAP && rect.right > zone.left - LABEL_GAP
          && rect.top < zone.bottom + LABEL_GAP && rect.bottom > zone.top - LABEL_GAP;
        if (near) marker.setOffset([marker.getOffset().x + zone.right + LABEL_GAP - rect.left, 9]);
      }
    }
  }

  // 選んだお風呂の横の名前。右のボタンの列にかかるなら点の左に出し、長い名前は空いている幅で「…」にする
  function makeBathLabel(side) {
    selectedMarker?.remove();
    const node = document.createElement('div');
    node.className = 'bath-label';
    node.textContent = bathName(selectedBath);
    selectedSide = side;
    selectedMarker = new maplibregl.Marker({ element: node, anchor: side === 'right' ? 'left' : 'right', offset: [side === 'right' ? 14 : -14, 0] })
      .setLngLat([selectedBath.lng, selectedBath.lat]).addTo(map);
  }

  // 右上のボタンの列（拡大・縮小・方位・「近く」）の左端。地図の左端から測る
  function columnLeft() {
    const column = container.querySelector('.maplibregl-ctrl-top-right');
    if (!column) return container.clientWidth - CONTROL_COLUMN;
    return column.getBoundingClientRect().left - container.getBoundingClientRect().left;
  }

  function placeBathLabel() {
    if (!selectedBath || !selectedMarker || failed || !styleReady) return;
    const node = selectedMarker.getElement();
    node.style.maxWidth = '';
    const natural = node.scrollWidth;
    const at = map.project([selectedBath.lng, selectedBath.lat]);
    const right = columnLeft() - 6 - (at.x + 14);
    const left = at.x - 14 - 6;
    const side = natural <= right || right >= left ? 'right' : 'left';
    if (side !== selectedSide) makeBathLabel(side);
    selectedMarker.getElement().style.maxWidth = `${Math.max(60, Math.floor(side === 'right' ? right : left))}px`;
  }

  const api = {
    map,
    get ready() { return styleReady; },
    get failed() { return failed; },

    setPillars(collection, options = {}) {
      if (failed) return;
      if (!styleReady) { pending.pillars = [collection, options]; return; }
      cancelAnimationFrame(growFrame);
      growFrame = 0;
      const ids = collection.features.map((feature) => feature.id);
      for (const id of new Set([...pillarIds, ...ids])) map.setFeatureState({ source: 'pillars', id }, { grow: 0 });
      pillarIds = ids;
      map.getSource('pillars').setData(collection);
      const token = ++growToken;
      if (options.animate === false || reducedMotion()) { setGrow(1); return; }
      const run = () => {
        if (token !== growToken || failed) return;
        const start = performance.now();
        const tick = (now) => {
          const t = (now - start) / GROW_MS;
          setGrow(easeOut(t));
          growFrame = t < 1 ? requestAnimationFrame(tick) : 0;
        };
        growFrame = requestAnimationFrame(tick);
      };
      if (tilesShown) run();
      else whenTilesShown().then(run);
    },

    // level: nation（全国）/ pref（県）/ near（近く）。柱を見せるのは全国だけで、県や近くでは隠して点だけにする
    setLevel(next) {
      const changed = level !== next;
      level = next;
      if (failed || !styleReady) return;
      map.setLayoutProperty('pillars', 'visibility', next === 'nation' ? 'visible' : 'none');
      if (changed || !topMarkers.length) drawTopLabels();
    },

    setTopLabels(items) {
      topItems = items;
      if (failed) return;
      if (!styleReady) { pending.top = [items]; return; }
      drawTopLabels();
    },

    // 画面（地図の枠）の中に見えているか。沖縄が外にあるときに案内を出すのに使う
    isOnScreen(point) {
      if (failed || !styleReady) return true;
      const at = map.project([point.lng, point.lat]);
      return at.x >= 0 && at.y >= 0 && at.x <= container.clientWidth && at.y <= container.clientHeight;
    },

    setBaths(baths, visitedIds = new Set()) {
      if (failed) return;
      if (!styleReady) { pending.baths = [baths, visitedIds]; return; }
      map.getSource('baths').setData({
        type: 'FeatureCollection',
        features: baths.map((bath) => ({
          type: 'Feature',
          properties: { id: bath.id, t: bath.t, v: visitedIds.has(bath.id) ? 1 : 0, label: `${bathName(bath)}（${TYPE_LABELS[bath.t]}）` },
          geometry: { type: 'Point', coordinates: [bath.lng, bath.lat] },
        })),
      });
    },

    // 選んだお風呂の点を輪で囲み、横に施設名を出す（bath が null なら外す）
    selectBath(bath) {
      if (failed) return;
      if (!styleReady) { pending.selected = [bath]; return; }
      map.setFilter('bath-selected', ['==', ['get', 'id'], bath?.id ?? '']);
      selectedMarker?.remove();
      selectedMarker = null;
      selectedBath = bath ?? null;
      if (!bath) return;
      makeBathLabel('right');
      placeBathLabel();
    },

    // points は全国を収める点（主な4島の外形と県庁所在地。沖縄は入れない）
    flyNation({ animate = true, points = [] } = {}) {
      if (failed) return;
      if (!styleReady) { pending.camera = ['nation', { animate: false, points }]; return; }
      // シートの背が変わった直後でも、いまの地図の大きさで計算する
      map.resize();
      const camera = nationCamera(points)
        ?? { ...(map.cameraForBounds(JAPAN_VIEW) ?? { center: [137.5, 37.2], zoom: 4 }), pitch: 45, bearing: 0 };
      map.easeTo({ ...camera, duration: duration(animate, 1300) });
    },

    // target は { points }（その県のお風呂。離島などの外れを除いたもの）か { center }（点が無い・読み込み前は県庁所在地へズーム7）
    flyPref(target, { animate = true } = {}) {
      if (failed) return;
      if (!styleReady) { pending.camera = ['pref', target, { animate: false }]; return; }
      map.resize();
      const camera = target.points ? pitchedCamera(target.points, { pitch: 40, bearing: 0, pad: padding('pref'), minZoom: 4, maxZoom: 11 }) : null;
      if (camera) map.easeTo({ ...camera, duration: duration(animate, 1200) });
      else map.easeTo({ center: [target.center.lng, target.center.lat], zoom: 7, pitch: 40, bearing: 0, duration: duration(animate, 1200) });
    },

    flyBath(bath, { animate = true } = {}) {
      if (failed) return;
      if (!styleReady) { pending.camera = ['bath', bath, { animate: false }]; return; }
      map.resize();
      // 近くの点や道も見えるよう、寄りすぎない（ズーム10.5）。点は、右のボタンの列を除いた範囲の中央に置く
      map.easeTo({
        center: [bath.lng, bath.lat], zoom: Math.max(map.getZoom(), 10.5), pitch: 40, bearing: 0,
        offset: [columnLeft() / 2 - container.clientWidth / 2, 0], duration: duration(animate, 900),
      });
    },

    flyNear(point, { animate = true } = {}) {
      if (failed) return;
      if (!styleReady) { pending.camera = ['near', point, { animate: false }]; return; }
      map.resize();
      map.easeTo({ center: [point.lng, point.lat], zoom: 11, pitch: 40, bearing: 0, duration: duration(animate, 1200) });
    },

    showHere(point) {
      if (failed) return;
      if (!styleReady) { pending.here = [point]; return; }
      hereMarker?.remove();
      hereMarker = null;
      if (!point) return;
      const dot = document.createElement('div');
      dot.className = 'here-marker';
      dot.setAttribute('role', 'img');
      dot.setAttribute('aria-label', '現在地');
      hereMarker = new maplibregl.Marker({ element: dot }).setLngLat([point.lng, point.lat]).addTo(map);
    },
  };

  if (globalThis.__E2E__) {
    globalThis.__day052 = {
      map,
      pillarCount: () => pillarIds.length,
      grow: () => lastGrow,
      growing: () => growFrame !== 0,
      level: () => level,
      // 構図の撮り比べ用：地図を動かさずに、その向き・傾きで収まるズームを返す
      fitNation: (points, view) => nationCamera(points, view),
    };
  }
  return api;
}
