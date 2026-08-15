import { compass8, formatDistance, nearestN, pickRange, typeLabel } from "./logic.js";

const STATIONS = [
  ["札幌駅", 43.0687, 141.3508], ["仙台駅", 38.2601, 140.8824],
  ["秋田駅", 39.7166, 140.1325], ["東京駅", 35.6812, 139.7671],
  ["新宿駅", 35.6896, 139.7006], ["名古屋駅", 35.1709, 136.8816],
  ["京都駅", 34.9858, 135.7588], ["大阪駅", 34.7025, 135.4959],
  ["広島駅", 34.3977, 132.4754], ["博多駅", 33.5902, 130.4207],
];
const MAX_DISTANCE = 20_000;
const TOTAL_VENDING_MACHINES = 3_881_700;

// OSMのtag値をそのまま出すと意味が伝わらないものだけ、表示のときに言い換える。
// data/vending.json と logic.js の値は変えない。
const TYPE_DISPLAY = { "きっぷ": "券売機", "不明": "種類不明" };

const introCard = document.querySelector(".intro-card");
const introCondition = document.querySelector("#intro-condition");
const locateButton = document.querySelector("#locate-button");
const muteButton = document.querySelector("#mute-button");
const showStationsButton = document.querySelector("#show-stations-button");
const emptyStationsButton = document.querySelector("#empty-stations-button");
const stationPanel = document.querySelector("#station-panel");
const stationList = document.querySelector("#station-list");
const statusPanel = document.querySelector("#status-panel");
const statusMessage = document.querySelector("#status-message");
const retryButton = document.querySelector("#retry-button");
const results = document.querySelector("#results");
const researchButton = document.querySelector("#research-button");
const resultList = document.querySelector("#result-list");
const listHead = document.querySelector("#list-head");
const listCount = document.querySelector("#list-count");
const emptyState = document.querySelector("#empty-state");
const resultSummary = document.querySelector("#result-summary");
const locationLabel = document.querySelector("#location-label");
const rangeLabel = document.querySelector("#range-label");
const coverage = document.querySelector("#coverage");
const coverageShare = document.querySelector("#coverage-share");
const canvas = document.querySelector("#radar");
const context = canvas.getContext("2d");

let dataset = null;
let dataPromise = null;
let audioContext = null;
let muted = false;
let radarPoints = [];
let selectedIndex = null;
let radarRange = 300;
let animationFrame = null;
let animationStartedAt = 0;
let repeatSearch = () => void searchCurrentLocation();
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function setStatus(message, { error = false, retry = false } = {}) {
  statusMessage.textContent = message;
  statusPanel.hidden = !message;
  statusPanel.classList.toggle("is-error", error);
  retryButton.hidden = !retry;
}

function showStations() {
  stationPanel.hidden = false;
  showStationsButton.setAttribute("aria-expanded", "true");
  stationPanel.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "nearest" });
}

function updateCoverage(data) {
  const percentage = (data.count / TOTAL_VENDING_MACHINES * 100).toFixed(1);
  coverage.textContent = `収録 ${data.count.toLocaleString("ja-JP")}台（${data.generatedAt}時点のOSM登録分）`;
  // 固有名詞が途中で改行されないよう nobr で保護する（差し込むのは数値のみ）
  coverageShare.innerHTML = `日本の自販機 約388万台のうち約${percentage}%（<span class="nobr">日本自動販売システム機械工業会</span>・2025年末）`;
}

function typeText(typeCode) {
  const label = typeLabel(typeCode, dataset.types);
  return TYPE_DISPLAY[label] ?? label;
}

async function loadData({ force = false } = {}) {
  if (dataset && !force) return dataset;
  if (dataPromise && !force) return dataPromise;
  setStatus("全国データを読み込み中…（約1MB）");
  dataPromise = fetch("./data/vending.json", { cache: force ? "reload" : "default" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      if (!Array.isArray(data.points) || !Array.isArray(data.types)) throw new Error("データ形式が不正です");
      dataset = data;
      updateCoverage(data);
      setStatus("");
      return data;
    })
    .catch((error) => {
      dataPromise = null;
      setStatus("全国データを読み込めませんでした。通信状態を確認して、もう一度お試しください。", { error: true, retry: true });
      throw error;
    });
  return dataPromise;
}

function ensureAudio() {
  if (audioContext) {
    if (audioContext.state === "suspended") void audioContext.resume();
    return;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (AudioContextClass) audioContext = new AudioContextClass();
}

function playPing() {
  if (muted || !audioContext) return;
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(1200, now);
  oscillator.frequency.exponentialRampToValueAtTime(500, now + .4);
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(.2, now + .012);
  gain.gain.exponentialRampToValueAtTime(.0001, now + .4);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + .42);
}

function renderList(nearest) {
  resultList.replaceChildren();
  nearest.slice(0, 10).forEach((point, index) => {
    const item = document.createElement("li");
    const select = document.createElement("button");
    const link = document.createElement("a");
    item.className = "result-item";
    item.dataset.index = String(index);
    select.type = "button";
    select.className = "result-select";
    select.setAttribute("aria-label", `${index + 1}件目、${compass8(point.bearing)}、${formatDistance(point.distance)}、${typeText(point.typeCode)}をレーダーで強調`);
    select.innerHTML = `<span><span class="result-main"><strong class="result-direction">${compass8(point.bearing)}</strong><span class="result-distance">${formatDistance(point.distance)}</span></span><span class="result-type">${typeText(point.typeCode)}</span></span>`;
    select.addEventListener("click", () => selectPoint(index, true));
    link.className = "map-link";
    link.href = `https://www.google.com/maps?q=${point.lat},${point.lon}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "地図で開く";
    item.append(select, link);
    resultList.append(item);
  });
}

function selectPoint(index, focusList = false) {
  selectedIndex = index;
  document.querySelectorAll(".result-item").forEach((item) => item.classList.toggle("is-selected", Number(item.dataset.index) === index));
  if (focusList) document.querySelector(`.result-item[data-index="${index}"]`)?.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "nearest" });
  drawRadar(performance.now());
}

function pointPosition(point, size, padding) {
  const radius = (point.distance / radarRange) * (size / 2 - padding);
  const angle = point.bearing * Math.PI / 180;
  return { x: size / 2 + Math.sin(angle) * radius, y: size / 2 - Math.cos(angle) * radius };
}

const RADAR_PADDING = 28;
const BADGE_RADIUS = 9;
const BADGE_GAP = 2.5;
const RING_LABEL_FONT = "600 11px system-ui";
const RING_LABEL_INSET = 12;

function overlapsBox(box, x, y, radius) {
  const nearestX = Math.min(Math.max(x, box.x), box.x + box.width);
  const nearestY = Math.min(Math.max(y, box.y), box.y + box.height);
  return Math.hypot(x - nearestX, y - nearestY) < radius;
}

// 距離リングのラベルは、縦軸の左右・南北・リング線の内外の8通りから
// 「番号バッジと重ならない配置」を選び、4目盛すべて同じ配置で描く。
// 目盛ごとに散らすと読み取る順序が崩れるので、ずらすなら全部いっしょにずらす。
function ringLabelBoxes(center, radius, badges) {
  context.font = RING_LABEL_FONT;
  const labels = [];
  for (let ring = 1; ring <= 4; ring += 1) {
    const meters = radarRange * ring / 4;
    const text = meters >= 1000 ? `${Number((meters / 1000).toFixed(1))}km` : `${Math.round(meters)}m`;
    labels.push({ text, ringRadius: radius * ring / 4, width: context.measureText(text).width });
  }
  const placements = [];
  for (const north of [true, false]) {
    for (const inside of [true, false]) {
      for (const side of [1, -1]) placements.push({ north, inside, side });
    }
  }
  let best = null;
  for (const placement of placements) {
    const boxes = labels.map((label) => {
      const textX = placement.side === 1 ? center + RING_LABEL_INSET : center - RING_LABEL_INSET - label.width;
      const textY = placement.north
        ? center - label.ringRadius + (placement.inside ? 16 : -7)
        : center + label.ringRadius + (placement.inside ? -6 : 17);
      return { text: label.text, textX, textY, x: textX - 4, y: textY - 11, width: label.width + 8, height: 15 };
    });
    const hits = boxes.reduce(
      (total, box) => total + badges.filter((badge) => overlapsBox(box, badge.x, badge.y, BADGE_RADIUS + 2)).length,
      0,
    );
    if (!best || hits < best.hits) best = { hits, boxes };
    if (hits === 0) break;
  }
  return best.boxes;
}

// 濃紺のチップを敷いてから描く。掃引が通っても背景と同化しない。
function drawRingLabels(boxes, green) {
  context.font = RING_LABEL_FONT;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  for (const box of boxes) {
    context.globalAlpha = .88;
    context.fillStyle = "#07131d";
    context.fillRect(box.x, box.y, box.width, box.height);
    context.globalAlpha = .95;
    context.fillStyle = green;
    context.fillText(box.text, box.textX, box.textY);
  }
  context.globalAlpha = 1;
}

// 方位はNだけでなくE・S・Wも出し、リストの「北西 約110m」を図の上で照合できるようにする。
function drawCompassLabels(center, cssSize, green) {
  const inset = RADAR_PADDING / 2 + 2;
  context.fillStyle = green;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "bold 12px system-ui";
  context.globalAlpha = 1;
  context.fillText("N", center, inset);
  context.globalAlpha = .78;
  context.font = "bold 11px system-ui";
  context.fillText("S", center, cssSize - inset);
  context.fillText("E", cssSize - inset, center);
  context.fillText("W", inset, center);
  context.globalAlpha = 1;
}

// 番号バッジが重なると読めなくなるので、重なりが解消するまで押し出す。
// 押し出した分は元の位置の小点と引き出し線で追えるようにする。
function layoutBadges(cssSize) {
  const count = Math.min(10, radarPoints.length);
  const placed = [];
  const margin = BADGE_RADIUS + 3;
  for (let index = 0; index < count; index += 1) {
    const base = pointPosition(radarPoints[index], cssSize, RADAR_PADDING);
    let x = base.x;
    let y = base.y;
    for (let pass = 0; pass < 16; pass += 1) {
      let pushed = false;
      for (const other of placed) {
        let dx = x - other.x;
        let dy = y - other.y;
        let distance = Math.hypot(dx, dy);
        if (distance < .01) {
          const angle = index * 2.4;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }
        const overlap = BADGE_RADIUS * 2 + BADGE_GAP - distance;
        if (overlap > .05) {
          x += dx / distance * overlap;
          y += dy / distance * overlap;
          pushed = true;
        }
      }
      if (!pushed) break;
    }
    const driftX = x - base.x;
    const driftY = y - base.y;
    const drift = Math.hypot(driftX, driftY);
    const maxDrift = BADGE_RADIUS * 3.4;
    if (drift > maxDrift) {
      x = base.x + driftX / drift * maxDrift;
      y = base.y + driftY / drift * maxDrift;
    }
    x = Math.min(Math.max(x, margin), cssSize - margin);
    y = Math.min(Math.max(y, margin), cssSize - margin);
    placed.push({ x, y, base, moved: Math.hypot(x - base.x, y - base.y) > 3 });
  }
  return placed;
}

// 上位10件はリスト行の01〜10と同じ番号バッジで描く（選択中はアンバー）。
function drawBadges(badges, green, amber, sweepDegrees) {
  context.strokeStyle = green;
  context.lineWidth = 1;
  context.globalAlpha = .5;
  for (const badge of badges) {
    if (!badge.moved) continue;
    context.beginPath();
    context.moveTo(badge.base.x, badge.base.y);
    context.lineTo(badge.x, badge.y);
    context.stroke();
  }
  context.globalAlpha = .9;
  context.fillStyle = green;
  for (const badge of badges) {
    if (!badge.moved) continue;
    context.beginPath();
    context.arc(badge.base.x, badge.base.y, 2.5, 0, Math.PI * 2);
    context.fill();
  }
  for (let index = badges.length - 1; index >= 0; index -= 1) {
    const point = radarPoints[index];
    const { x, y } = badges[index];
    const selected = index === selectedIndex;
    const angleDifference = sweepDegrees === null ? 180 : Math.abs(((point.bearing - sweepDegrees + 540) % 360) - 180);
    const illuminated = angleDifference < 14;
    context.beginPath();
    context.arc(x, y, BADGE_RADIUS, 0, Math.PI * 2);
    context.globalAlpha = 1;
    context.fillStyle = selected ? amber : "#0a1c27";
    context.shadowColor = selected ? amber : green;
    context.shadowBlur = selected ? 18 : illuminated ? 14 : 6;
    context.fill();
    context.shadowBlur = 0;
    context.lineWidth = selected ? 2 : 1.2;
    context.strokeStyle = selected ? amber : green;
    context.globalAlpha = selected || illuminated ? 1 : .7;
    context.stroke();
    context.globalAlpha = 1;
    context.fillStyle = selected ? "#07131d" : green;
    context.font = "bold 10px system-ui";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(index + 1), x, y + .5);
  }
}

function drawRadar(timestamp = 0) {
  const rect = canvas.getBoundingClientRect();
  const cssSize = Math.max(1, Math.floor(rect.width));
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== cssSize * pixelRatio || canvas.height !== cssSize * pixelRatio) {
    canvas.width = cssSize * pixelRatio;
    canvas.height = cssSize * pixelRatio;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, cssSize, cssSize);
  const center = cssSize / 2;
  const padding = RADAR_PADDING;
  const radius = center - padding;
  const styles = getComputedStyle(document.documentElement);
  const green = styles.getPropertyValue("--green").trim();
  const amber = styles.getPropertyValue("--amber").trim();

  context.strokeStyle = green;
  context.fillStyle = green;
  context.lineWidth = 1;
  context.globalAlpha = .24;
  for (let ring = 1; ring <= 4; ring += 1) {
    context.beginPath();
    context.arc(center, center, radius * ring / 4, 0, Math.PI * 2);
    context.stroke();
  }
  context.beginPath();
  context.moveTo(center, padding);
  context.lineTo(center, cssSize - padding);
  context.moveTo(padding, center);
  context.lineTo(cssSize - padding, center);
  context.stroke();
  context.globalAlpha = 1;

  const sweepDegrees = reduceMotion.matches ? null : ((timestamp - animationStartedAt) / 22) % 360;
  if (sweepDegrees !== null) {
    const sweep = sweepDegrees * Math.PI / 180 - Math.PI / 2;
    const gradient = context.createRadialGradient(center, center, 0, center, center, radius);
    gradient.addColorStop(0, "rgb(83 245 165 / 0)");
    gradient.addColorStop(1, green);
    context.save();
    context.globalAlpha = .16;
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(center, center);
    context.arc(center, center, radius, sweep - .5, sweep);
    context.closePath();
    context.fill();
    context.restore();
  }

  const badges = layoutBadges(cssSize);
  drawRingLabels(ringLabelBoxes(center, radius, badges), green);
  drawCompassLabels(center, cssSize, green);

  radarPoints.forEach((point, index) => {
    if (index < 10) return;
    const { x, y } = pointPosition(point, cssSize, padding);
    const angleDifference = sweepDegrees === null ? 180 : Math.abs(((point.bearing - sweepDegrees + 540) % 360) - 180);
    const illuminated = angleDifference < 14;
    context.beginPath();
    context.fillStyle = green;
    context.globalAlpha = illuminated ? 1 : .58;
    context.shadowColor = green;
    context.shadowBlur = illuminated ? 14 : 7;
    context.arc(x, y, illuminated ? 4.5 : 3, 0, Math.PI * 2);
    context.fill();
  });
  context.shadowBlur = 0;
  context.globalAlpha = 1;

  drawBadges(badges, green, amber, sweepDegrees);

  // 現在地（凡例の「● 現在地」と対応するアンバーの点）
  context.beginPath();
  context.fillStyle = amber;
  context.shadowColor = amber;
  context.shadowBlur = 12;
  context.arc(center, center, 5, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;
  context.globalAlpha = 1;
}

function startRadar() {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationStartedAt = performance.now();
  const animate = (timestamp) => {
    drawRadar(timestamp);
    if (!reduceMotion.matches && !results.hidden) animationFrame = requestAnimationFrame(animate);
  };
  animate(animationStartedAt);
}

async function searchAt(lat, lon, label) {
  ensureAudio();
  try {
    const data = await loadData();
    setStatus("");
    const nearest = nearestN(data.points, lat, lon, 300).filter((point) => point.distance <= MAX_DISTANCE);
    const distances = nearest.map((point) => point.distance);
    const range = pickRange(distances);
    radarRange = range ?? MAX_DISTANCE;
    radarPoints = range ? nearest.filter((point) => point.distance <= range).slice(0, 300) : [];
    selectedIndex = null;
    locationLabel.textContent = label;
    rangeLabel.textContent = range ? (range >= 1000 ? `${range / 1000} km` : `${range} m`) : "20 km";
    renderList(nearest);
    emptyState.hidden = nearest.length !== 0;
    resultList.hidden = nearest.length === 0;
    listHead.hidden = nearest.length === 0;
    // レーダーの光点の数とリストの行数が食い違って見えるので、内訳を明示する。
    // 小画面用の短縮版も同時に持たせ、表示の出し分けはCSSに任せる（差し込むのは件数だけ）。
    const shown = Math.min(nearest.length, 10);
    listCount.innerHTML = nearest.length
      ? `<span class="count-long">レーダー範囲内 ${radarPoints.length}件／近い${shown}件を表示</span>`
        + `<span class="count-short">範囲内${radarPoints.length}件中 近い${shown}件</span>`
      : "";
    resultSummary.textContent = nearest.length
      ? `${label}から20キロメートル以内に${nearest.length >= 300 ? "300件以上" : `${nearest.length}件`}見つかりました。最も近い自販機は${compass8(nearest[0].bearing)}へ${formatDistance(nearest[0].distance)}です。`
      : `${label}から20キロメートル以内に登録された自販機は見つかりませんでした。`;
    results.hidden = false;
    // 検索後はヒーローを1行バーに畳んで、主役と色の重みを結果側へ渡す。
    // ボタンはDOMに残したまま、見え方だけ変える。
    introCard.classList.add("is-compact");
    introCondition.textContent = label;
    introCondition.hidden = false;
    startRadar();
    playPing();
    requestAnimationFrame(() => {
      results.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
    });
  } catch {
    // loadDataが具体的なエラー状態を表示する。
  }
}

async function searchCurrentLocation() {
  ensureAudio();
  try {
    await loadData();
  } catch {
    return;
  }
  if (!("geolocation" in navigator)) {
    setStatus("この端末では現在地を取得できません。主要駅から場所を選んでください。", { error: true });
    showStations();
    return;
  }
  setStatus("現在地を取得中…");
  navigator.geolocation.getCurrentPosition(
    (position) => void searchAt(position.coords.latitude, position.coords.longitude, "現在地から検索"),
    () => {
      setStatus("位置情報を取得できませんでした。主要駅から場所を選んでください。", { error: true });
      showStations();
    },
    { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
  );
}

for (const [name, lat, lon] of STATIONS) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "station-chip";
  button.textContent = name;
  button.addEventListener("click", () => {
    repeatSearch = () => void searchAt(lat, lon, `${name}を基準に検索`);
    repeatSearch();
  });
  stationList.append(button);
}

locateButton.addEventListener("click", () => {
  repeatSearch = () => void searchCurrentLocation();
  repeatSearch();
});
// 結果セクション内から同じ条件で引き直せるようにする。
researchButton.addEventListener("click", () => repeatSearch());
showStationsButton.addEventListener("click", showStations);
emptyStationsButton.addEventListener("click", showStations);
retryButton.addEventListener("click", () => void loadData({ force: true }).catch(() => {}));
muteButton.addEventListener("click", () => {
  ensureAudio();
  muted = !muted;
  muteButton.setAttribute("aria-pressed", String(muted));
  muteButton.setAttribute("aria-label", muted ? "音をオンにする" : "音をミュートする");
  muteButton.querySelector(".mute-label").textContent = muted ? "音オフ" : "音オン";
});
canvas.addEventListener("click", (event) => {
  if (radarPoints.length === 0) return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  // 押し出し後のバッジ位置で当たり判定する（見えている丸をタップして選べる）
  let closest = { index: -1, distance: Infinity };
  layoutBadges(rect.width).forEach((badge, index) => {
    const distance = Math.hypot(badge.x - x, badge.y - y);
    if (distance < closest.distance) closest = { index, distance };
  });
  if (closest.index >= 0 && closest.distance <= 28) selectPoint(closest.index, false);
});
window.addEventListener("resize", () => drawRadar(performance.now()));
reduceMotion.addEventListener?.("change", startRadar);
