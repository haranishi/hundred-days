import { localDateString } from './lib/days.js';
import { decide, wateredMessage } from './lib/decide.js';
import { drawDrop, drawRipple, drawScene } from './lib/draw.js';
import { generatePlant } from './lib/plant.js';
import { imageFilename, renderShareImage } from './lib/share-image.js';
import { initialRecord, load, makeSeed, save } from './lib/store.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const canvas = $('plant');
const bed = document.querySelector('.canvas-bed');
const ctx = canvas.getContext('2d');
const SHARE_URL = 'hundred-days.pages.dev/day-028-one-drop-tree';
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let storage = null;
try { storage = window.localStorage; } catch { /* 保存不可でもその場では育てる */ }
const loaded = load(storage, makeSeed);
let record = loaded.record;
let canSave = loaded.canSave;
let view = decide(record, localDateString(new Date()));
let plant = generatePlant(record.seed, view.steps);
let canvasSize = 1;
let busy = false;
let replayRun = 0;
let cropPlant = plant;

function say(message = '') { $('message').textContent = message; }
function ariaLabel() {
  if (!view.steps) return '鉢に植えた種';
  return `水やり${view.steps}日目の木。枝が${plant.stats.branches}本、葉が${plant.stats.leaves}枚、花が${plant.stats.flowers}つ`;
}
function paint(options = {}) {
  drawScene(ctx, { plant, size: canvasSize, wilt: view.wilt, progress: 1, newborn: null, ...options });
}
function cropFor(scene) {
  const minY = scene.segments.length
    ? Math.min(...scene.segments.flatMap((segment) => [segment.y1, segment.y2])) - 0.06
    : 1;
  const floor = matchMedia('(min-width: 900px)').matches ? 0.72 : 0.42;
  return Math.min(1, Math.max(floor, 1.28 - minY));
}
function applyBedCrop(scene) {
  cropPlant = scene;
  const width = bed.getBoundingClientRect().width;
  if (!width) return;
  const height = `${Math.round(width * cropFor(scene))}px`;
  if (bed.style.height !== height) bed.style.height = height;
}
function controls() {
  const ready = view.steps > 0;
  const replaying = app.dataset.replaying === 'true';
  $('water').disabled = busy || !view.canWater;
  $('water').dataset.done = String(view.wateredToday);
  $('water').textContent = view.wateredToday ? '今日はあげました' : '水をあげる';
  $('replay').disabled = !replaying && (busy || !ready);
  $('replay').textContent = replaying ? 'スキップ' : '成長を見る';
  $('save').disabled = busy || !ready;
  $('reset').disabled = busy;
}
function numericStatus() {
  $('status').textContent = view.status;
  $('age').textContent = view.steps ? `芽が出て ${view.ageDays}日目` : '';
}
function updatePresentation() {
  app.dataset.state = view.steps ? 'ready' : 'seed';
  app.dataset.canWater = String(view.canWater);
  numericStatus();
  canvas.setAttribute('aria-label', ariaLabel());
  applyBedCrop(plant);
  controls();
}
function renderState() {
  updatePresentation();
  paint();
}
function setBusy(kind, value) {
  busy = value;
  app.dataset.growing = String(kind === 'growing' && value);
  app.dataset.replaying = String(kind === 'replaying' && value);
  controls();
}
function persist() {
  if (!canSave) return;
  if (!save(storage, record).saved) {
    canSave = false;
    $('storage-error').hidden = false;
  }
}
function refresh() {
  view = decide(record, localDateString(new Date()));
  plant = generatePlant(record.seed, view.steps);
  renderState();
  say(view.note);
}

function animate(duration, frame, stopped = () => false) {
  return new Promise((resolve) => {
    const started = performance.now();
    const tick = (now) => {
      if (stopped()) {
        resolve();
        return;
      }
      const t = Math.min(1, (now - started) / duration);
      frame(t);
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

async function water() {
  if (busy) return;
  const today = localDateString(new Date());
  const before = decide(record, today);
  if (!before.canWater) {
    say('今日はもうあげました。また明日');
    return;
  }
  const first = before.steps === 0;
  const oldWilt = before.wilt;
  record = {
    ...record,
    plantedOn: first ? today : record.plantedOn,
    wateredDays: [...record.wateredDays, today].slice(-4000)
  };
  persist();
  view = decide(record, today);
  plant = generatePlant(record.seed, view.steps);
  say();
  if (!reducedMotion()) {
    setBusy('growing', true);
    updatePresentation();
    await animate(1400, (t) => {
      const growth = Math.max(0, Math.min(1, (t - 0.357) / 0.643));
      const eased = 1 - (1 - growth) ** 3;
      drawScene(ctx, { plant, size: canvasSize, wilt: oldWilt * (1 - eased), progress: eased, newborn: view.steps });
      if (t <= 0.357) drawDrop(ctx, canvasSize, t / 0.357);
      if (t >= 0.321 && t <= 0.571) drawRipple(ctx, canvasSize, (t - 0.321) / 0.25);
    });
    setBusy('growing', false);
  } else {
    renderState();
  }
  renderState();
  say(wateredMessage(view.steps));
  canvas.focus();
}

const pause = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

async function replay() {
  if (app.dataset.replaying === 'true') {
    replayRun += 1;
    applyBedCrop(plant);
    paint();
    setBusy('replaying', false);
    numericStatus();
    say(`${view.steps}日ぶんの成長です`);
    return;
  }
  if (busy || !view.steps) return;
  const run = ++replayRun;
  const total = view.steps;
  setBusy('replaying', true);
  $('status').textContent = '再生中 · 1日目';
  say();
  if (reducedMotion()) {
    const milestones = [...new Set([1, 2, 3, 4].map((part) => Math.max(1, Math.ceil(total * part / 4))))];
    for (const step of milestones) {
      if (run !== replayRun) return;
      const scene = generatePlant(record.seed, step);
      applyBedCrop(scene);
      $('status').textContent = `再生中 · ${step}日目`;
      drawScene(ctx, { plant: scene, size: canvasSize, wilt: step === total ? view.wilt : 0, progress: 1, newborn: null });
      await pause(600);
    }
  } else {
    const duration = Math.min(1.2 + 0.12 * total, 6) * 1000;
    await animate(duration, (t) => {
      const position = t * total;
      const step = Math.min(total, Math.max(1, Math.ceil(position)));
      const progress = step === 1 && position === 0 ? 0 : position - Math.floor(position) || 1;
      const scene = generatePlant(record.seed, step);
      applyBedCrop(scene);
      $('status').textContent = `再生中 · ${step}日目`;
      drawScene(ctx, { plant: scene, size: canvasSize, wilt: t === 1 ? view.wilt : 0, progress, newborn: step });
    }, () => run !== replayRun);
  }
  if (run !== replayRun) return;
  applyBedCrop(plant);
  paint();
  setBusy('replaying', false);
  numericStatus();
  say(`${total}日ぶんの成長です`);
}

function canvasBlob(canvasNode) {
  return new Promise((resolve) => canvasNode.toBlob(resolve, 'image/png'));
}

async function downloadImage() {
  if (busy || !view.steps) return;
  const output = document.createElement('canvas');
  const today = localDateString(new Date());
  renderShareImage(output, plant, view.wilt, {
    label: `水をあげた日 ${view.steps}日`,
    date: today.replaceAll('-', '.'),
    url: SHARE_URL
  });
  const blob = await canvasBlob(output);
  if (!blob) {
    say('この環境では画像を書き出せませんでした');
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = imageFilename(today);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  say('保存しました');
}

function openReset() {
  if (busy) return;
  $('reset-confirm').hidden = false;
  $('reset-no').focus();
}
function closeReset() { $('reset-confirm').hidden = true; }
function resetTree() {
  replayRun += 1;
  record = initialRecord(makeSeed());
  persist();
  closeReset();
  refresh();
  say('新しい種を用意しました');
  $('water').focus();
}

$('water').addEventListener('click', water);
$('replay').addEventListener('click', replay);
$('save').addEventListener('click', downloadImage);
$('reset').addEventListener('click', openReset);
$('reset-no').addEventListener('click', closeReset);
$('reset-yes').addEventListener('click', resetTree);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('reset-confirm').hidden) closeReset();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !busy) refresh();
});

$('storage-error').hidden = canSave;
$('data-notice').hidden = !loaded.recovered;
const resize = () => {
  applyBedCrop(cropPlant);
  const size = Math.max(1, Math.round(canvas.getBoundingClientRect().width));
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  if (size === canvasSize && canvas.width === Math.round(size * dpr)) return;
  canvasSize = size;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paint();
};
new ResizeObserver(resize).observe(bed);
window.addEventListener('resize', resize);
refresh();
resize();
