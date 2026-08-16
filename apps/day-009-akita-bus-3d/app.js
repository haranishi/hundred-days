import { boundsSpanKm, isInsideAkita, toPlane } from "./lib/geo.js";
import { sampleTrack, updateTracks } from "./lib/interpolate.js";
import { buildNetwork, operatorLabel, OPERATOR_TABLE } from "./lib/network.js";
import {
  clampCamera,
  contentExtremes,
  createCamera,
  createViewport,
  fitContent,
  fitDistance,
  headingVector,
  projectPoint,
} from "./lib/projection.js";
import { dayTypeLabel, jstParts, serviceStatus } from "./lib/service.js";

const API_URL = "/api/day-009/vehicles";
const NETWORK_URL = "./data/network.json";
const POLL_MS = 20_000;
const RETRY_STEPS_MS = [5_000, 10_000, 20_000, 30_000];
// 中継APIが「幽霊バス」として捨てる閾値。画面の文言と実装をここでそろえる
const STALE_MINUTES = 10;
// 初期アングル。県の形は南北に長いので、横長の画面は大きく傾け、
// 縦長の画面は上から見下ろす角度にして、狭い幅でも路線網が潰れないようにする
const HOME_WIDE = { yaw: -20, pitch: 56 };
const HOME_NARROW = { yaw: -8, pitch: 38 };
// 依頼の要件は「選んだ県の地域全体が見れること」。既定は必ず県全体を映し、
// バス群へは寄せない。寄りたい人のためにボタンで秋田市周辺へ行けるようにする
const FIT_MARGIN = 0.96;
const CITY_ZOOM_RATIO = 0.26;
const AKITA_CITY = { lat: 39.7186, lon: 140.1024 };
// 地図に地名がないと「どこを見ているか」が分からない。県境は形状データを持っていないので描かない
const CITIES = [
  { name: "能代", lat: 40.2124, lon: 140.0272 },
  { name: "大館", lat: 40.2716, lon: 140.5645 },
  { name: "秋田市", lat: 39.7186, lon: 140.1024 },
  { name: "大仙", lat: 39.4534, lon: 140.4757 },
  { name: "由利本荘", lat: 39.3856, lon: 140.0500 },
  { name: "横手", lat: 39.3110, lon: 140.5533 },
];
const SCALE_STEPS_KM = [1, 2, 5, 10, 20, 50, 100];
const AUTO_ROTATE_DEG_PER_SEC = 1.6;
const MOTION_SETTLE_MS = 180;
const PICK_RADIUS_PX = 34;
const BUS_SCREEN_PX = 19;
const BUS_GLOW_PX = 26;
const CLUSTER_RADIUS_PX = 30;
const CLUSTER_MIN = 3;
const VISIBLE_ROWS = 4;

const COLORS = {
  routeLive: "#4cc2ff",
  routeShaped: "#5a6b86",
  routeApprox: "#4a5568",
  stop: "rgba(132,152,182,.5)",
  stopLive: "rgba(124,205,255,.7)",
  grid: "rgba(120,145,180,.07)",
  /* 地名は路線の線の上に載る。半透明のままだと線と混ざって読めなくなるので、
     不透明の明るい色＋黒い縁取りで背景から切り離す。全バスが集まる秋田市だけ一段強くする */
  place: "#cbdaf0",
  placeMain: "#f4f8ff",
  placeDot: "#aabdd8",
  placeHalo: "rgba(3,7,12,.92)",
  scale: "rgba(198,213,234,.72)",
  bus: [255, 181, 69],
  busSelected: [255, 240, 205],
};

const scene = document.querySelector("#scene");
const context = scene.getContext("2d");
// 路線網は動かないので、専用のキャンバスに描いて使い回す（毎フレーム描き直すのはバスだけ）
const networkCanvas = document.createElement("canvas");
const networkContext = networkCanvas.getContext("2d");

const statusPanel = document.querySelector("#status-panel");
const statusTitle = document.querySelector("#status-title");
const statusBody = document.querySelector("#status-body");
const statusService = document.querySelector("#status-service");
const statusHint = document.querySelector("#status-hint");
const statusActions = document.querySelector("#status-actions");
const retryNote = document.querySelector("#retry-note");
const retryButton = document.querySelector("#retry-button");
const runningCount = document.querySelector("#running-count");
const freshness = document.querySelector("#freshness");
const staleNote = document.querySelector("#stale-note");
const busList = document.querySelector("#bus-list");
const busListWrap = document.querySelector("#bus-list-wrap");
const busListFoot = document.querySelector("#bus-list-foot");
const busListNote = document.querySelector("#bus-list-note");
const busListHint = document.querySelector("#bus-list-hint");
const busListToggle = document.querySelector("#bus-list-toggle");
const busEmpty = document.querySelector("#bus-empty");
const busCount = document.querySelector("#bus-count");
const busDetail = document.querySelector("#bus-detail");
const detailOperator = document.querySelector("#detail-operator");
const detailId = document.querySelector("#detail-id");
const detailSpeed = document.querySelector("#detail-speed");
const detailAge = document.querySelector("#detail-age");
const detailClose = document.querySelector("#detail-close");
const nextService = document.querySelector("#next-service");
const nextServiceTime = document.querySelector("#next-service-time");
const nextServiceNote = document.querySelector("#next-service-note");
const networkSummary = document.querySelector("#network-summary");
const networkFacts = document.querySelector("#network-facts");
const factLive = document.querySelector("#fact-live");
const factShaped = document.querySelector("#fact-shaped");
const shapeNote = document.querySelector("#shape-note");
const resetButton = document.querySelector("#reset-view");
const zoomCityButton = document.querySelector("#zoom-city");
const autoRotateButton = document.querySelector("#autorotate");
const mapKeyHint = document.querySelector("#map-key-hint");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* 操作の案内は入力装置に合わせる。スマホにマウスホイールは無いし、マウスの画面では
   ピンチできない。どちらも実装してあるので（1本指=回転／2本指=ピンチ／ホイール=拡大）、
   その端末で本当に効く操作だけを書く。primary pointer が coarse＝指で触る端末 */
const coarsePointer = window.matchMedia("(pointer: coarse)");
const POINTER_HINT = {
  fine: "ドラッグで回転・ホイールで拡大。バスを選ぶと詳細が出ます。",
  coarse: "指1本で回転・2本でピンチ拡大。バスを選ぶと詳細が出ます。",
};

function syncPointerHint() {
  mapKeyHint.textContent = coarsePointer.matches ? POINTER_HINT.coarse : POINTER_HINT.fine;
}

syncPointerHint();
coarsePointer.addEventListener?.("change", syncPointerHint);

let network = buildNetwork(null);
// フィット計算用の代表点。数万点をそのまま投影すると画面サイズが変わるたびに重い
let fitPoints = new Float64Array(0);
let viewport = createViewport(1, 1);
let camera = createCamera(HOME_WIDE);
let homeView = { distance: 200, offsetX: 0, offsetY: 0 };
let homeDistance = 200;
let viewMode = "home";
let fitted = false;
let pixelRatio = 1;

let tracks = new Map();
let selectedKey = null;
let listExpanded = false;
let busScreen = [];
let feed = { state: "loading", vehicles: [], sources: [], updatedAt: null, receivedAt: 0, staleDropped: 0, error: "" };
let failures = 0;
let pollTimer = null;
let nextAttemptAt = 0;
let lastFreshnessText = "";
let lastFreshnessTick = -1;

let networkDirty = true;
let motionUntil = 0;
let settleTimer = null;
let autoRotate = !reduceMotion.matches;
let animationFrame = null;
let lastFrameAt = 0;

// 計測用。UIには出さない（撮影スクリプトが描画コストを、E2Eが視点の変化を読む）
const stats = { fps: 0, frameMs: 0, networkMs: 0, networkDetail: "full", buses: 0, yaw: 0, pitch: 0, distance: 0 };
window.__day009 = { stats };

// ---------------------------------------------------------------- 表示の整形

function formatSpeed(speed) {
  if (!Number.isFinite(speed)) return "送信なし";
  // 0は「送られていない」ではなく「止まっている」。元の値も残して両方分かるようにする
  return Math.round(speed) === 0 ? "停車中（0 km/h）" : `${Math.round(speed)} km/h`;
}

function formatAge(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.floor(seconds)}秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分前`;
  return `${Math.floor(seconds / 3600)}時間前`;
}

const clockText = (date) =>
  date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Tokyo" });

// ---------------------------------------------------------------- 画面サイズ

function resize() {
  const rect = scene.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  for (const canvas of [scene, networkCanvas]) {
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  networkContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  viewport = createViewport(width, height);
  refitCamera();
  networkDirty = true;
}

// 路線網が画面に収まる距離を基準に、ズームの上下限を決める。
// カメラを回すたびに基準が動くと操作感が変わるので、基準は初期アングルで計算する。
// 画面サイズが変わったときは、利用者のズーム倍率（基準距離との比）を保ったまま作り直す
const homeAngles = () => (viewport.width < 700 ? HOME_NARROW : HOME_WIDE);

/* bbox を長方形として収めると、角が空いている秋田県では上下に大きな余白が残る。
   実際の路線の点を投影して外接矩形を測り、画面いっぱいになるまで距離を詰める。
   県全体は保ったまま、余白だけを削るのが狙い（バス群には寄せない）。 */
function refitCamera() {
  const angles = homeAngles();
  const base = { ...camera, ...angles, targetX: 0, targetY: 0, offsetX: 0, offsetY: 0 };
  const rough = fitDistance(boundsSpanKm(network.bbox, network.origin), base, viewport);
  const zoomRatio = fitted ? camera.distance / homeDistance : 1;

  homeView = fitPoints.length >= 2
    ? fitContent(fitPoints, base, viewport, { start: rough, margin: FIT_MARGIN })
    : { distance: rough, offsetX: 0, offsetY: 0 };
  homeDistance = homeView.distance;

  camera = clampCamera({
    ...(fitted ? camera : base),
    minDistance: homeDistance * 0.1,
    maxDistance: homeDistance * 1.8,
    distance: homeDistance * (fitted ? zoomRatio : 1),
  });
  // 秋田市へ寄っているときは、そちらの構図を壊さない
  if (viewMode === "home") camera = clampCamera({ ...camera, offsetX: homeView.offsetX, offsetY: homeView.offsetY });
  fitted = true;
}

function resetView() {
  viewMode = "home";
  camera = clampCamera({
    ...camera,
    ...homeAngles(),
    distance: homeDistance,
    targetX: 0,
    targetY: 0,
    offsetX: homeView.offsetX,
    offsetY: homeView.offsetY,
  });
  syncViewButtons();
  markCameraChanged();
}

function zoomToCity() {
  viewMode = "city";
  const target = toPlane(AKITA_CITY.lon, AKITA_CITY.lat, network.origin);
  camera = clampCamera({
    ...camera,
    ...homeAngles(),
    distance: homeDistance * CITY_ZOOM_RATIO,
    targetX: target.x,
    targetY: target.y,
    offsetX: 0,
    offsetY: 0,
  });
  syncViewButtons();
  markCameraChanged();
}

function syncViewButtons() {
  zoomCityButton.setAttribute("aria-pressed", String(viewMode === "city"));
}

// ---------------------------------------------------------------- 路線網の描画

function projectLinePoints() {
  const { xy } = network.lines;
  const total = xy.length / 2;
  const screen = new Float32Array(total * 2);
  for (let index = 0; index < total; index += 1) {
    const point = projectPoint(xy[index * 2], xy[index * 2 + 1], 0, camera, viewport);
    // 手前クリップに掛かった点は NaN にして、線をそこで切る
    screen[index * 2] = point.visible ? point.x : NaN;
    screen[index * 2 + 1] = point.visible ? point.y : NaN;
  }
  return screen;
}

// 同じ見た目の線をひとつのパスにまとめて1回で描く。618本を1本ずつstrokeすると目に見えて遅い
function strokeLines(screen, pick, style) {
  const { starts, count } = network.lines;
  networkContext.beginPath();
  let drew = false;
  for (let line = 0; line < count; line += 1) {
    if (!pick(line)) continue;
    let pending = true;
    for (let index = starts[line]; index < starts[line + 1]; index += 1) {
      const x = screen[index * 2];
      const y = screen[index * 2 + 1];
      if (Number.isNaN(x)) {
        pending = true;
        continue;
      }
      if (pending) networkContext.moveTo(x, y);
      else networkContext.lineTo(x, y);
      pending = false;
      drew = true;
    }
  }
  if (!drew) return;
  networkContext.strokeStyle = style.color;
  networkContext.lineWidth = style.width;
  networkContext.globalAlpha = style.alpha;
  networkContext.setLineDash(style.dash ?? []);
  networkContext.stroke();
  networkContext.setLineDash([]);
  networkContext.globalAlpha = 1;
}

// 20kmごとの補助線。地図タイルの代わりに、傾いた地面がどこにあるかを示すためだけの線
function drawGrid() {
  const span = boundsSpanKm(network.bbox, network.origin);
  const halfWidth = Math.ceil((span.width / 2 + 20) / 20) * 20;
  const halfHeight = Math.ceil((span.height / 2 + 20) / 20) * 20;
  networkContext.strokeStyle = COLORS.grid;
  networkContext.lineWidth = 1;
  networkContext.beginPath();
  for (let x = -halfWidth; x <= halfWidth; x += 20) {
    const from = projectPoint(x, -halfHeight, 0, camera, viewport);
    const to = projectPoint(x, halfHeight, 0, camera, viewport);
    if (!from.visible || !to.visible) continue;
    networkContext.moveTo(from.x, from.y);
    networkContext.lineTo(to.x, to.y);
  }
  for (let y = -halfHeight; y <= halfHeight; y += 20) {
    const from = projectPoint(-halfWidth, y, 0, camera, viewport);
    const to = projectPoint(halfWidth, y, 0, camera, viewport);
    if (!from.visible || !to.visible) continue;
    networkContext.moveTo(from.x, from.y);
    networkContext.lineTo(to.x, to.y);
  }
  networkContext.stroke();
}

// 停留所は5,900点あり、線より数が多い。引きの絵では潰れて読めないので間引く
function drawStops(detail) {
  const zoom = camera.distance / (homeDistance || 1);
  const stride = detail === "motion" ? (zoom > 0.5 ? 6 : 3) : zoom > 0.75 ? 4 : zoom > 0.45 ? 2 : 1;
  const { xy, live, count } = network.stops;
  const size = zoom < 0.45 ? 2 : 1.5;
  networkContext.fillStyle = COLORS.stop;
  for (let index = 0; index < count; index += stride) {
    if (live[index]) continue;
    const point = projectPoint(xy[index * 2], xy[index * 2 + 1], 0, camera, viewport);
    if (point.visible) networkContext.fillRect(point.x - size / 2, point.y - size / 2, size, size);
  }
  networkContext.fillStyle = COLORS.stopLive;
  for (let index = 0; index < count; index += 1) {
    if (!live[index]) continue;
    if (stride > 2 && index % 2 === 1) continue;
    const point = projectPoint(xy[index * 2], xy[index * 2 + 1], 0, camera, viewport);
    if (point.visible) networkContext.fillRect(point.x - size / 2, point.y - size / 2, size, size);
  }
}

/* 地名。県境の形は持っていないので線は引かない（いい加減な輪郭を「県境です」と
   出さないため）。代わりに公知の市役所位置に点と名前だけを置く。

   路線より後に描いて必ず前面に出す。それでも秋田市は路線が密集する場所なので、
   線と同系色の半透明では読めない＝黒い縁取り（ハロー）で背景から切り離す。 */
function drawPlaces() {
  networkContext.save();
  networkContext.textBaseline = "middle";
  networkContext.lineJoin = "round";
  networkContext.miterLimit = 2;
  for (const city of CITIES) {
    const plane = toPlane(city.lon, city.lat, network.origin);
    const point = projectPoint(plane.x, plane.y, 0, camera, viewport);
    if (!point.visible) continue;
    // 全バスが集まる場所の名前が読めないと地図の意味が半減するので、秋田市だけ大きく明るく
    const main = city.name === "秋田市";
    networkContext.font = main ? "700 13px system-ui, sans-serif" : "600 11px system-ui, sans-serif";
    const width = networkContext.measureText(city.name).width;
    if (point.x < 6 || point.x + width + 12 > viewport.width || point.y < 14 || point.y > viewport.height - 6) continue;

    networkContext.strokeStyle = COLORS.placeHalo;
    networkContext.lineWidth = 3;
    networkContext.beginPath();
    networkContext.arc(point.x, point.y, main ? 3.2 : 2.6, 0, Math.PI * 2);
    networkContext.stroke();
    networkContext.fillStyle = main ? COLORS.placeMain : COLORS.placeDot;
    networkContext.fill();

    networkContext.lineWidth = main ? 4 : 3.2;
    networkContext.strokeText(city.name, point.x + 8, point.y - 8);
    networkContext.fillStyle = main ? COLORS.placeMain : COLORS.place;
    networkContext.fillText(city.name, point.x + 8, point.y - 8);
  }
  networkContext.restore();
}

/* スケールバー。透視投影なので縮尺は場所ごとに違う。注視点（画面中央）での
   長さを出す。ヨー方向に動かすと奥行きが変わらないので、そこで測れば正確。 */
function drawScaleBar() {
  const pxPerKm = viewport.focal / camera.distance;
  const target = Math.min(170, viewport.width * 0.26);
  let km = SCALE_STEPS_KM[0];
  for (const step of SCALE_STEPS_KM) if (step * pxPerKm <= target) km = step;
  const length = Math.round(km * pxPerKm);
  const right = viewport.width - 14;
  const bottom = viewport.height - 16;
  const label = `${km}km`;

  networkContext.save();
  networkContext.font = "600 10px system-ui, sans-serif";
  networkContext.textBaseline = "alphabetic";
  networkContext.fillStyle = "rgba(11,16,22,.7)";
  networkContext.fillRect(right - length - 12, bottom - 26, length + 24, 32);
  networkContext.strokeStyle = COLORS.scale;
  networkContext.lineWidth = 1.4;
  networkContext.beginPath();
  networkContext.moveTo(right - length, bottom - 6);
  networkContext.lineTo(right, bottom - 6);
  networkContext.moveTo(right - length, bottom - 11);
  networkContext.lineTo(right - length, bottom - 1);
  networkContext.moveTo(right, bottom - 11);
  networkContext.lineTo(right, bottom - 1);
  networkContext.stroke();
  networkContext.fillStyle = COLORS.scale;
  networkContext.fillText(label, right - length, bottom - 14);
  networkContext.restore();
}

function drawNetworkLayer(detail) {
  const startedAt = performance.now();
  const { width, height } = viewport;
  networkContext.clearRect(0, 0, width, height);

  const sky = networkContext.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#0b1016");
  sky.addColorStop(0.55, "#0e1520");
  sky.addColorStop(1, "#101a26");
  networkContext.fillStyle = sky;
  networkContext.fillRect(0, 0, width, height);

  drawGrid();

  if (network.lines.count > 0) {
    const screen = projectLinePoints();
    const { live, shaped } = network.lines;
    // 近似 → 実形状 → 実測ありの順に重ねる。手前に来てほしいものを後に描く。
    // 停留所を直線でつないだ近似の路線は、細い破線にして実形状と区別する
    strokeLines(screen, (line) => !live[line] && !shaped[line], {
      color: COLORS.routeApprox, width: 0.8, alpha: 0.7, dash: [3, 4],
    });
    strokeLines(screen, (line) => !live[line] && shaped[line], {
      color: COLORS.routeShaped, width: 1, alpha: 0.9,
    });
    strokeLines(screen, (line) => live[line], {
      color: COLORS.routeLive, width: 1.5, alpha: 0.95,
    });
  }

  drawStops(detail);
  drawPlaces();
  drawScaleBar();
  stats.networkMs = performance.now() - startedAt;
  stats.networkDetail = detail;
}

// ---------------------------------------------------------------- バスの描画

const shade = (rgb, brightness) =>
  `rgb(${Math.round(rgb[0] * brightness)} ${Math.round(rgb[1] * brightness)} ${Math.round(rgb[2] * brightness)})`;

const LIGHT = { x: -0.38, y: 0.42, z: 0.82 };

function drawBusBox(item, unit, dimmed) {
  const { plane, sample } = item;
  const forward = headingVector(sample.heading);
  const right = { x: forward.y, y: -forward.x };
  const halfLength = unit / 2;
  const halfWidth = unit * 0.23;
  const height = unit * 0.42;
  const corner = (front, side, up) =>
    projectPoint(
      plane.x + forward.x * front + right.x * side,
      plane.y + forward.y * front + right.y * side,
      up,
      camera,
      viewport,
    );

  const ground = [
    corner(halfLength, -halfWidth, 0),
    corner(halfLength, halfWidth, 0),
    corner(-halfLength, halfWidth, 0),
    corner(-halfLength, -halfWidth, 0),
  ];
  const roof = [
    corner(halfLength, -halfWidth, height),
    corner(halfLength, halfWidth, height),
    corner(-halfLength, halfWidth, height),
    corner(-halfLength, -halfWidth, height),
  ];
  if ([...ground, ...roof].some((point) => !point.visible)) return;

  const base = item.selected ? COLORS.busSelected : COLORS.bus;
  const faces = [
    { points: roof, normal: { x: 0, y: 0, z: 1 } },
    { points: [ground[0], ground[1], roof[1], roof[0]], normal: { ...forward, z: 0 } },
    { points: [ground[1], ground[2], roof[2], roof[1]], normal: { ...right, z: 0 } },
    { points: [ground[2], ground[3], roof[3], roof[2]], normal: { x: -forward.x, y: -forward.y, z: 0 } },
    { points: [ground[3], ground[0], roof[0], roof[3]], normal: { x: -right.x, y: -right.y, z: 0 } },
  ];

  // 箱は凸なので、奥の面から順に塗れば正しく重なる
  for (const face of faces) face.depth = face.points.reduce((sum, point) => sum + point.depth, 0) / face.points.length;
  faces.sort((a, b) => b.depth - a.depth);

  // 面ごとに縁を付ける。混み合った市街地で隣の車体と溶け合わないようにする。
  // 選択中だけ明るい縁にして、色相以外でも1台だけ見分けられるようにする
  context.save();
  if (dimmed) context.globalAlpha = 0.38;
  context.lineWidth = item.selected ? 1.6 : 0.7;
  context.strokeStyle = item.selected ? "rgba(255,255,255,.92)" : "rgba(10,14,20,.6)";
  for (const face of faces) {
    const diffuse = Math.max(0, face.normal.x * LIGHT.x + face.normal.y * LIGHT.y + face.normal.z * LIGHT.z);
    context.fillStyle = shade(base, 0.42 + diffuse * 0.58);
    context.beginPath();
    context.moveTo(face.points[0].x, face.points[0].y);
    for (const point of face.points.slice(1)) context.lineTo(point.x, point.y);
    context.closePath();
    context.fill();
    context.stroke();
  }
  // 進行方向の目印。屋根に三角を1つ置くだけで、どちらを向いているかが読める
  const nose = corner(halfLength * 0.92, 0, height * 1.02);
  const leftTail = corner(halfLength * 0.1, -halfWidth * 0.7, height * 1.02);
  const rightTail = corner(halfLength * 0.1, halfWidth * 0.7, height * 1.02);
  if (nose.visible && leftTail.visible && rightTail.visible) {
    context.fillStyle = item.selected ? "#2b1b06" : "rgba(24,16,6,.72)";
    context.beginPath();
    context.moveTo(nose.x, nose.y);
    context.lineTo(leftTail.x, leftTail.y);
    context.lineTo(rightTail.x, rightTail.y);
    context.closePath();
    context.fill();
  }
  context.restore();
}

/* 県全体の縮尺では1台20pxでも小さい。車体の下に淡い光を敷いて、
   まず「どこに固まっているか」が引きの絵でも見えるようにする。 */
function drawBusGlow(items) {
  context.save();
  context.globalCompositeOperation = "lighter";
  for (const item of items) {
    const radius = BUS_GLOW_PX * (item.selected ? 1.5 : 1);
    const alpha = selectedKey && !item.selected ? 0.12 : 0.26;
    const gradient = context.createRadialGradient(item.ground.x, item.ground.y, 0, item.ground.x, item.ground.y, radius);
    gradient.addColorStop(0, `rgba(255,181,69,${alpha})`);
    gradient.addColorStop(1, "rgba(255,181,69,0)");
    context.fillStyle = gradient;
    context.fillRect(item.ground.x - radius, item.ground.y - radius, radius * 2, radius * 2);
  }
  context.restore();
}

/* 密集のまとめ表示。県全体だと市街地の十数台が1つの塊に潰れて、25台でも43台でも
   同じ絵に見える。塊の輪と台数を出して、混み具合を数で伝える。 */
function buildClusters(points) {
  const clusters = [];
  for (const point of points) {
    const found = clusters.find((cluster) => Math.hypot(cluster.x - point.x, cluster.y - point.y) <= CLUSTER_RADIUS_PX);
    const cluster = found ?? { count: 0, sumX: 0, sumY: 0, x: point.x, y: point.y, minX: point.x, maxX: point.x, minY: point.y, maxY: point.y };
    cluster.count += 1;
    cluster.sumX += point.x;
    cluster.sumY += point.y;
    cluster.x = cluster.sumX / cluster.count;
    cluster.y = cluster.sumY / cluster.count;
    cluster.minX = Math.min(cluster.minX, point.x);
    cluster.maxX = Math.max(cluster.maxX, point.x);
    cluster.minY = Math.min(cluster.minY, point.y);
    cluster.maxY = Math.max(cluster.maxY, point.y);
    if (!found) clusters.push(cluster);
  }
  return clusters.filter((cluster) => cluster.count >= CLUSTER_MIN);
}

function drawClusterBadges(clusters) {
  context.save();
  context.font = "700 11px system-ui, sans-serif";
  context.textBaseline = "middle";
  // 大きい塊から置き、重なったら上へ逃がす（数字が数字に重なると読めない）
  const placed = [];
  for (const cluster of [...clusters].sort((a, b) => b.count - a.count)) {
    const radius = Math.max(20, Math.hypot(cluster.maxX - cluster.minX, cluster.maxY - cluster.minY) / 2 + 14);
    context.strokeStyle = "rgba(255,181,69,.34)";
    context.lineWidth = 1.2;
    context.setLineDash([4, 4]);
    context.beginPath();
    context.arc(cluster.x, cluster.y, radius, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);

    // 単独で走っているバスにはバッジを出さない。合計と一致しない数字を「台数」と
    // 名乗ると数え落としに見えるので、あくまで密集の数だと分かる文字にする
    const label = `密集 ${cluster.count}台`;
    const width = context.measureText(label).width + 14;
    const x = Math.min(Math.max(cluster.x - width / 2, 4), viewport.width - width - 4);
    let y = Math.max(2, cluster.y - radius - 20);
    while (placed.some((box) => Math.abs(box.y - y) < 20 && x < box.x + box.width + 6 && box.x < x + width + 6)) {
      y = Math.max(2, y - 22);
      if (y <= 2) break;
    }
    placed.push({ x, y, width });

    // 重なりを避けて逃がしたぶんだけ、どの塊の数字なのかが分からなくなる。
    // 円の縁まで線を1本引いて対応を戻す（逃げていないときは線が出ない）
    const anchorX = x + width / 2;
    const anchorY = y + 18;
    const gapX = anchorX - cluster.x;
    const gapY = anchorY - cluster.y;
    const gap = Math.hypot(gapX, gapY);
    if (gap > radius + 5) {
      context.strokeStyle = "rgba(255,181,69,.45)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(anchorX, anchorY);
      context.lineTo(cluster.x + (gapX / gap) * radius, cluster.y + (gapY / gap) * radius);
      context.stroke();
    }

    context.fillStyle = "rgba(8,13,20,.86)";
    context.fillRect(x, y, width, 18);
    context.strokeStyle = "rgba(255,181,69,.5)";
    context.lineWidth = 1;
    context.strokeRect(x + 0.5, y + 0.5, width - 1, 17);
    context.fillStyle = "#ffb545";
    context.fillText(label, x + 7, y + 10);
  }
  context.restore();
}

/* 選択中の1台。ラベルを車体の真上に重ねるだけだと他の24台に埋もれるので、
   少し離した位置に置いて引き出し線でつなぐ。 */
function drawSelectedLabel(item, unit) {
  const label = `${operatorLabel(item.track.op)} ${item.track.id}`;
  context.save();
  context.font = "700 12px system-ui, sans-serif";
  context.textBaseline = "middle";
  const width = context.measureText(label).width + 18;
  const anchorY = item.ground.y - unit * 0.5 * item.ground.scale;
  const boxY = Math.max(4, anchorY - 54);
  const boxX = Math.min(Math.max(item.ground.x - width / 2, 6), Math.max(6, viewport.width - width - 6));

  context.strokeStyle = "rgba(255,240,205,.75)";
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(item.ground.x, anchorY);
  context.lineTo(boxX + width / 2, boxY + 22);
  context.stroke();
  context.beginPath();
  context.arc(item.ground.x, anchorY, 2.6, 0, Math.PI * 2);
  context.fillStyle = "rgba(255,240,205,.95)";
  context.fill();

  context.fillStyle = "rgba(8,13,20,.92)";
  context.fillRect(boxX, boxY, width, 22);
  context.strokeStyle = "rgba(255,240,205,.85)";
  context.lineWidth = 1.4;
  context.strokeRect(boxX + 0.7, boxY + 0.7, width - 1.4, 20.6);
  context.fillStyle = "#fff0cd";
  context.fillText(label, boxX + 9, boxY + 11);
  context.restore();
}

function drawBuses(now) {
  // 車体は目印なので実寸ではない。画面上で常に約20pxになる大きさに直す
  // （実寸の12mだと県全体の俯瞰では1px未満になり、拡大すると今度は画面を埋め尽くす）
  const unit = (BUS_SCREEN_PX * camera.distance) / viewport.focal;
  const items = [];
  for (const track of tracks.values()) {
    const sample = sampleTrack(track, now);
    const plane = toPlane(sample.lon, sample.lat, network.origin);
    const ground = projectPoint(plane.x, plane.y, 0, camera, viewport);
    if (!ground.visible) continue;
    items.push({ track, sample, plane, ground, selected: track.key === selectedKey });
  }
  items.sort((a, b) => b.ground.depth - a.ground.depth);
  busScreen = items.map((item) => ({ key: item.track.key, x: item.ground.x, y: item.ground.y }));
  stats.buses = items.length;
  if (items.length === 0) return;

  drawBusGlow(items);
  const clusters = buildClusters(busScreen);

  for (const item of items) {
    const dimmed = Boolean(selectedKey) && !item.selected;
    // 影。地面のどこにいるかが分かるだけで、浮いて見えなくなる
    const radius = Math.max(2, unit * 0.42 * item.ground.scale);
    context.save();
    context.globalAlpha = dimmed ? 0.38 : 1;
    context.translate(item.ground.x, item.ground.y);
    context.scale(1, Math.max(0.25, Math.cos((camera.pitch * Math.PI) / 180)));
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fillStyle = "rgba(3,7,12,.45)";
    context.fill();
    context.restore();

    if (item.selected) {
      const pulse = reduceMotion.matches ? 1 : 1 + 0.18 * Math.sin(now / 260);
      context.save();
      context.translate(item.ground.x, item.ground.y);
      context.scale(1, Math.max(0.25, Math.cos((camera.pitch * Math.PI) / 180)));
      for (const [ringScale, lineWidth, color] of [[2.6, 3, "rgba(255,240,205,.95)"], [3.4 * pulse, 1.2, "rgba(255,240,205,.5)"]]) {
        context.beginPath();
        context.arc(0, 0, radius * ringScale, 0, Math.PI * 2);
        context.strokeStyle = color;
        context.lineWidth = lineWidth;
        context.stroke();
      }
      context.restore();
    }

    drawBusBox(item, unit, dimmed);
  }

  drawClusterBadges(clusters);
  const selected = items.find((item) => item.selected);
  if (selected) drawSelectedLabel(selected, unit);
}

// ---------------------------------------------------------------- ループ

function frame(timestamp) {
  animationFrame = requestAnimationFrame(frame);
  const elapsed = lastFrameAt ? timestamp - lastFrameAt : 16;
  lastFrameAt = timestamp;

  if (autoRotate && !reduceMotion.matches) {
    camera = clampCamera({ ...camera, yaw: camera.yaw + (AUTO_ROTATE_DEG_PER_SEC * elapsed) / 1000 });
    networkDirty = true;
    motionUntil = timestamp + MOTION_SETTLE_MS;
  }

  if (networkDirty) {
    drawNetworkLayer(timestamp < motionUntil ? "motion" : "full");
    networkDirty = false;
  }

  context.clearRect(0, 0, viewport.width, viewport.height);
  context.drawImage(networkCanvas, 0, 0, viewport.width, viewport.height);
  drawBuses(Date.now());
  updateFreshness();

  stats.yaw = camera.yaw;
  stats.pitch = camera.pitch;
  stats.distance = camera.distance;
  stats.frameMs = performance.now() - timestamp;
  stats.fps = elapsed > 0 ? Math.round((stats.fps * 0.9 + (1000 / elapsed) * 0.1) * 10) / 10 : stats.fps;
}

function startLoop() {
  if (animationFrame === null) {
    lastFrameAt = 0;
    animationFrame = requestAnimationFrame(frame);
  }
}

function stopLoop() {
  if (animationFrame !== null) cancelAnimationFrame(animationFrame);
  animationFrame = null;
}

function markCameraChanged() {
  networkDirty = true;
  motionUntil = performance.now() + MOTION_SETTLE_MS;
  clearTimeout(settleTimer);
  // 動きが止まったら一度だけ精細に描き直す（間引いたままの絵を残さない）
  settleTimer = setTimeout(() => {
    networkDirty = true;
  }, MOTION_SETTLE_MS + 20);
}

function setAutoRotate(enabled) {
  autoRotate = enabled && !reduceMotion.matches;
  autoRotateButton.setAttribute("aria-pressed", String(autoRotate));
  autoRotateButton.disabled = reduceMotion.matches;
}

// ---------------------------------------------------------------- データ取得

async function loadNetwork() {
  try {
    const response = await fetch(NETWORK_URL, { cache: "default" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    network = buildNetwork(await response.json());
    if (network.lines.count === 0) throw new Error("路線データが空です");
    fitPoints = contentExtremes(network.lines.xy);
    const { totals } = network;
    setRich(networkSummary, [
      { text: `路線 ${totals.lines.toLocaleString("ja-JP")}本` },
      "・",
      { text: `停留所 ${totals.stops.toLocaleString("ja-JP")}件` },
      "・",
      { text: `${totals.operators}事業者` },
      "（",
      { text: `${network.generatedAt}取得` },
      "）",
    ]);
    networkFacts.hidden = false;
    factLive.textContent = `${totals.live}事業者`;
    factShaped.textContent = `${totals.shaped} / ${totals.operators - totals.shaped}事業者`;
    shapeNote.textContent =
      `道なりの形状を公開しているのは${totals.operators}事業者中${totals.shaped}事業者です。`
      + "残りは停留所を直線でつないだ近似なので、線が角ばって見えます。";
  } catch (error) {
    networkSummary.textContent = `路線データを読み込めませんでした（${error.message}）。バスの位置だけを表示します。`;
  }
  fitted = false;
  refitCamera();
  networkDirty = true;
}

function schedulePoll(delay) {
  clearTimeout(pollTimer);
  nextAttemptAt = Date.now() + delay;
  pollTimer = setTimeout(() => void poll(), delay);
}

async function poll() {
  try {
    const response = await fetch(API_URL, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || !Array.isArray(payload.vehicles)) {
      throw new Error(payload?.error || `取得に失敗しました（HTTP ${response.status}）`);
    }
    applyFeed(payload);
    failures = 0;
    schedulePoll(POLL_MS);
  } catch (error) {
    failures += 1;
    feed = { ...feed, state: "error", error: error.message || String(error) };
    renderStatus();
    schedulePoll(RETRY_STEPS_MS[Math.min(failures - 1, RETRY_STEPS_MS.length - 1)]);
  }
}

function applyFeed(payload) {
  const now = Date.now();
  const vehicles = payload.vehicles.filter((vehicle) => isInsideAkita(vehicle.lat, vehicle.lon));
  const sources = Array.isArray(payload.sources) ? payload.sources : [];
  // 実際の受信間隔で補間する。タブが止まっていた後などに、一気に飛ばさないため
  const gap = feed.receivedAt ? now - feed.receivedAt : POLL_MS;
  tracks = updateTracks(tracks, vehicles, now, {
    duration: Math.min(Math.max(gap, 5_000), 40_000),
    instant: reduceMotion.matches,
  });

  const failedSources = sources.filter((source) => source.ok === false);
  feed = {
    state: failedSources.length === sources.length && sources.length > 0
      ? "error"
      : failedSources.length > 0
        ? "partial"
        : vehicles.length > 0
          ? "running"
          : "empty",
    vehicles,
    sources,
    updatedAt: payload.updatedAt ? new Date(payload.updatedAt) : new Date(now),
    receivedAt: now,
    staleDropped: sources.reduce((total, source) => total + (Number(source.staleDropped) || 0), 0),
    error: failedSources.map((source) => `${operatorLabel(source.op)}: ${source.error}`).join(" / "),
  };

  renderBusList();
  // 選んでいたバスが消えたら、詳細も一緒に閉じる（前の車両の速度が残らないように）
  if (selectedKey && !tracks.has(selectedKey)) selectBus(null);
  renderStatus();
}

// ---------------------------------------------------------------- 画面の更新

/* 文字列をそのまま textContent に入れると、事業者名や日付が行の途中で折れる。
   折りたくないところだけ span で包んで組み立てる。 */
function setRich(element, parts) {
  element.replaceChildren();
  for (const part of parts) {
    if (typeof part === "string") {
      element.append(part);
      continue;
    }
    const span = document.createElement("span");
    span.className = part.className ?? "nobr";
    span.textContent = part.text;
    element.append(span);
  }
}

/* 「秋田市（ぐるる・マイタウン・バス） 7台」の全角括弧のあとに半角空白を入れると
   間延びして見えるので、閉じ括弧で終わる名前のときだけ空白を落とす。 */
function operatorCountText(op, count) {
  const label = operatorLabel(op);
  return `${label}${/[）」]$/.test(label) ? "" : " "}${count}台`;
}

function operatorParts(sources, vehicles) {
  const alive = sources.filter((source) => source.ok !== false);
  if (alive.length === 0) return [{ text: `合計 ${vehicles.length}台` }];
  const parts = [];
  alive.forEach((source, index) => {
    if (index > 0) parts.push("／");
    parts.push({ text: operatorCountText(source.op, vehicles.filter((vehicle) => vehicle.op === source.op).length) });
  });
  return parts;
}

function renderStatus() {
  const { state, vehicles, sources } = feed;
  statusPanel.dataset.state = state;
  // 選択中は詳細と差し替える。ただし取得失敗だけは、再試行ボタンごと隠すわけにいかない
  statusPanel.hidden = Boolean(selectedKey) && state !== "error";
  runningCount.textContent = state === "loading" || (state === "error" && !feed.receivedAt) ? "—" : String(vehicles.length);

  if (state === "loading") {
    statusTitle.textContent = "読み込み中…";
    statusBody.textContent = "秋田県の路線網といまのバスの位置を読み込んでいます。";
  } else if (state === "error") {
    statusTitle.textContent = "バスの位置を取得できませんでした";
    statusBody.textContent = `${feed.error || "通信に失敗しました。"}${feed.receivedAt ? "画面のバスは最後に取得できたときの位置です。" : "路線網はそのまま表示しています。"}`;
  } else if (state === "partial") {
    statusTitle.textContent = "一部の事業者の位置を取得できていません";
    setRich(statusBody, [
      `${feed.error}。取得できた事業者だけを表示しています`,
      ...(vehicles.length === 0 ? ["が、走行中のバスはいません"] : ["（", ...operatorParts(sources, vehicles), "）"]),
      "。",
    ]);
  } else if (state === "empty") {
    statusTitle.textContent = "いま走っているバスはいません";
    // 「深夜・早朝」は中黒で切れると別の時間帯の話に読めるので、ひとまとまりで折り返す
    setRich(statusBody, [
      "路線網はそのまま表示しています。",
      { text: "深夜・早朝" },
      "は運行がないため0台になります。障害ではありません。",
    ]);
  } else {
    statusTitle.textContent = `${vehicles.length}台が走行中です`;
    setRich(statusBody, [
      ...operatorParts(sources, vehicles),
      "。20秒ごとに取り直し、その間は補間しています。",
    ]);
  }

  renderServiceNote(state, vehicles.length);

  // 走っているバスがあるときだけ、選べることを一言添える
  statusHint.hidden = vehicles.length === 0;
  retryButton.hidden = state !== "error";
  retryNote.hidden = state !== "error";
  // 中身が全部隠れている行を残すと、カードの下だけ12px広がって上下の余白が揃わない
  statusActions.hidden = state !== "error";
  staleNote.hidden = feed.staleDropped === 0;
  // 「除外」だけだと何が起きたのか伝わらない。何分ぶん古いのかまで書く。
  // 前半・後半をそれぞれ塊にして、「バス」と「1台」の間で折り返さないようにする
  if (feed.staleDropped > 0) {
    setRich(staleNote, [
      { text: `位置が${STALE_MINUTES}分以上古いバス${feed.staleDropped}台は` },
      { text: "数に入れていません" },
    ]);
  }
  updateFreshness(true);
}

// 0台のときだけ、時刻表側の本数と突き合わせて理由を分ける
function renderServiceNote(state, runningVehicles) {
  const showable = (state === "empty" || state === "partial") && runningVehicles === 0;
  const parts = jstParts(new Date());
  const status = showable ? serviceStatus(network.service, parts) : { known: false };
  if (!status.known) {
    statusService.hidden = true;
    nextService.hidden = true;
    return;
  }
  statusService.hidden = false;
  if (status.expected > 0) {
    setRich(statusService, [
      "この時間（",
      { text: `${dayTypeLabel(parts.day)}${parts.hour}時台` },
      `）は時刻表上${status.expected}便が走っているはずですが、`,
      "位置を送信している車両がありません。アプリの故障ではなく、事業者側の送信が止まっています。",
    ]);
    nextService.hidden = true;
    return;
  }

  const when = status.next ? `${status.next.dayOffset > 0 ? "明日の" : ""}${status.next.label}頃` : null;
  setRich(statusService, [
    "いまは時刻表上も運行時間外です（",
    { text: `${dayTypeLabel(parts.day)}ダイヤ` },
    "）。",
    ...(when ? [`次に動き出すのは${when}です。`] : []),
  ]);

  // 0台は1日9時間続く通常の状態。待つ時間を主役にして、空白のまま放置しない
  nextService.hidden = !when;
  if (!when) return;
  nextServiceTime.textContent = `${status.next.dayOffset > 0 ? "明日 " : ""}${status.next.label}`;
  setRich(nextServiceNote, [
    "時刻表上の初便です（",
    { text: `${dayTypeLabel(parts.day)}ダイヤ` },
    "）。実測位置を送っている",
    { text: "2事業者" },
    "の運行が始まると、この画面にバスが現れます。",
  ]);
}

// 経過秒の表示。毎フレームDOMを書き換えても意味がないので、0.5秒ごとにだけ見に行く
function updateFreshness(force = false) {
  const now = Date.now();
  const tick = Math.floor(now / 500);
  if (!force && tick === lastFreshnessTick) return;
  lastFreshnessTick = tick;
  let text;
  if (!feed.receivedAt) {
    text = feed.state === "error" ? "まだ一度も取得できていません" : "読み込み中…";
  } else {
    const seconds = (now - feed.receivedAt) / 1000;
    text = `最終更新 ${formatAge(seconds)}（${clockText(feed.updatedAt ?? new Date(feed.receivedAt))}）`;
  }
  if (force || text !== lastFreshnessText) {
    freshness.textContent = text;
    lastFreshnessText = text;
  }

  if (!retryNote.hidden) {
    const remaining = Math.max(0, Math.ceil((nextAttemptAt - now) / 1000));
    retryNote.textContent = `自動で再試行します（次の再試行まで ${remaining}秒）`;
  }
  if (!busDetail.hidden && selectedKey) {
    const track = tracks.get(selectedKey);
    if (track) detailAge.textContent = track.ts ? `${formatAge(now / 1000 - track.ts)}（${clockText(new Date(track.ts * 1000))}）` : "送信時刻なし";
  }
}

/* 速度は「0 km/h」と書くより「停車中」のほうが状態として読める。
   数字を強調するのは実際に動いている車両だけにする。 */
function speedElement(speed) {
  const span = document.createElement("span");
  span.className = "bus-item__speed";
  if (!Number.isFinite(speed)) {
    span.classList.add("bus-item__speed--none");
    span.textContent = "速度なし";
  } else if (Math.round(speed) === 0) {
    span.classList.add("bus-item__speed--idle");
    span.textContent = "停車中";
  } else {
    span.textContent = `${Math.round(speed)} km/h`;
  }
  return span;
}

function renderBusList() {
  // 並びは対応表の順（秋田中央交通→秋田市）。文字コード順にすると小さいほうの事業者が先に来る
  const order = OPERATOR_TABLE.map((entry) => entry.op);
  const rank = (op) => (order.indexOf(op) === -1 ? order.length : order.indexOf(op));
  const items = [...tracks.values()].sort((a, b) => rank(a.op) - rank(b.op) || a.id.localeCompare(b.id, "ja"));
  // 0台でもバッジは出す。数字が消えると「読み込めていない」ように見える
  busCount.textContent = `${items.length}台`;
  busEmpty.hidden = items.length > 0;
  busListHint.hidden = items.length === 0;
  busListWrap.hidden = items.length === 0;
  busList.replaceChildren();
  for (const track of items) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bus-item";
    button.dataset.key = track.key;
    button.setAttribute("aria-pressed", String(track.key === selectedKey));

    const operator = document.createElement("span");
    operator.className = "bus-item__op";
    operator.textContent = operatorLabel(track.op);
    const id = document.createElement("span");
    id.className = "bus-item__id";
    id.textContent = `車両 ${track.id}`;
    button.append(operator, id, speedElement(track.speed));
    button.addEventListener("click", () => selectBus(track.key));
    item.append(button);
    busList.append(item);
  }
  renderListControls(items.length);
}

/* 一覧は5行ぶんちょうどで切る。切れた行を見せないぶん、
   「何台のうち何台を出しているのか」と全部見る手段をカードの下に置く。 */
function renderListControls(total) {
  if (total <= VISIBLE_ROWS) listExpanded = false;
  busList.dataset.expanded = String(listExpanded);
  // たたんだ状態は行の途中で切れないので、フェードは開いてスクロールできるときだけ出す
  busListWrap.dataset.overflow = String(listExpanded && total > 10);
  busListFoot.hidden = total <= VISIBLE_ROWS;
  busListNote.textContent = listExpanded
    ? `${total}台すべてを表示しています（スクロールできます）`
    : `${total}台中 ${VISIBLE_ROWS}台を表示`;
  busListToggle.textContent = listExpanded ? `${VISIBLE_ROWS}台だけ表示` : "すべて見る";
  busListToggle.setAttribute("aria-expanded", String(listExpanded));
}

function selectBus(key) {
  selectedKey = tracks.has(key) ? key : null;
  for (const button of busList.querySelectorAll(".bus-item")) {
    button.setAttribute("aria-pressed", String(button.dataset.key === selectedKey));
  }
  const track = selectedKey ? tracks.get(selectedKey) : null;
  // 詳細は一覧の下に積まず、レール最上部の状態カードと差し替える。
  // こうしておくと、バスを選んでも右レールの高さが変わらない
  busDetail.hidden = !track;
  statusPanel.hidden = Boolean(track) && feed.state !== "error";
  if (!track) return;
  detailOperator.textContent = operatorLabel(track.op);
  detailId.textContent = track.id;
  detailSpeed.textContent = formatSpeed(track.speed);
  updateFreshness(true);
}

// ---------------------------------------------------------------- 操作

const pointers = new Map();
let drag = null;
let pinch = null;

function pointerCenterDistance() {
  const [first, second] = [...pointers.values()];
  return Math.hypot(first.x - second.x, first.y - second.y);
}

scene.addEventListener("pointerdown", (event) => {
  scene.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 1) drag = { moved: 0 };
  if (pointers.size === 2) pinch = { distance: pointerCenterDistance(), cameraDistance: camera.distance };
  setAutoRotate(false);
});

scene.addEventListener("pointermove", (event) => {
  const previous = pointers.get(event.pointerId);
  if (!previous) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (pointers.size >= 2 && pinch) {
    const distance = pointerCenterDistance();
    if (distance > 0) {
      camera = clampCamera({ ...camera, distance: (pinch.cameraDistance * pinch.distance) / distance });
      markCameraChanged();
    }
    return;
  }
  const dx = event.clientX - previous.x;
  const dy = event.clientY - previous.y;
  if (drag) drag.moved += Math.abs(dx) + Math.abs(dy);
  camera = clampCamera({ ...camera, yaw: camera.yaw + dx * 0.25, pitch: camera.pitch - dy * 0.2 });
  markCameraChanged();
});

function endPointer(event) {
  if (pointers.size < 2) pinch = null;
  pointers.delete(event.pointerId);
  if (pointers.size === 0 && drag) {
    // ほとんど動いていないならタップ＝バスの選択として扱う
    if (drag.moved < 8) pickBus(event);
    drag = null;
  }
}

scene.addEventListener("pointerup", endPointer);
scene.addEventListener("pointercancel", endPointer);

function pickBus(event) {
  const rect = scene.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  let closest = { key: null, distance: Infinity };
  for (const bus of busScreen) {
    const distance = Math.hypot(bus.x - x, bus.y - y);
    if (distance < closest.distance) closest = { key: bus.key, distance };
  }
  if (closest.key && closest.distance <= PICK_RADIUS_PX) selectBus(closest.key);
}

scene.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    setAutoRotate(false);
    camera = clampCamera({ ...camera, distance: camera.distance * Math.exp(event.deltaY * 0.0012) });
    markCameraChanged();
  },
  { passive: false },
);

scene.addEventListener("keydown", (event) => {
  const step = event.shiftKey ? 3 : 1;
  let next = { ...camera };
  switch (event.key) {
    case "ArrowLeft": next.yaw -= 6 * step; break;
    case "ArrowRight": next.yaw += 6 * step; break;
    case "ArrowUp": next.pitch += 4 * step; break;
    case "ArrowDown": next.pitch -= 4 * step; break;
    case "+": case "=": next.distance *= 0.85; break;
    case "-": case "_": next.distance /= 0.85; break;
    case "r": case "R": resetView(); event.preventDefault(); return;
    default: return;
  }
  event.preventDefault();
  setAutoRotate(false);
  camera = clampCamera(next);
  markCameraChanged();
});

resetButton.addEventListener("click", resetView);
zoomCityButton.addEventListener("click", () => (viewMode === "city" ? resetView() : zoomToCity()));
autoRotateButton.addEventListener("click", () => setAutoRotate(!autoRotate));
detailClose.addEventListener("click", () => selectBus(null));
busListToggle.addEventListener("click", () => {
  listExpanded = !listExpanded;
  renderListControls(tracks.size);
});
retryButton.addEventListener("click", () => {
  failures = 0;
  void poll();
});

new ResizeObserver(() => resize()).observe(scene);
window.addEventListener("resize", resize);

reduceMotion.addEventListener?.("change", () => {
  setAutoRotate(autoRotate);
  networkDirty = true;
});

// タブが見えていない間は描画も取得も止める（提供元への無駄なアクセスを増やさない）
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopLoop();
    clearTimeout(pollTimer);
  } else {
    startLoop();
    schedulePoll(0);
  }
});

// ---------------------------------------------------------------- 起動

setAutoRotate(autoRotate);
syncViewButtons();
resize();
renderStatus();
startLoop();
void loadNetwork().then(() => poll());
