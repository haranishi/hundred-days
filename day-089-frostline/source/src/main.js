// 本番の配線。山のデータ・滑走の物理・描画・画面の部品をつなぐ。ここだけが全部を知る。
import { loadWorld } from './world/index.js';
import { createRide } from './sim/index.js';
import { createGame, START_PUSH } from './game.js';
import { createView } from './view-entry.js';
import { createAudio } from './audio/engine.js';

const root = document.querySelector('#game');

// 共有の窓（index.html の dialog）。読み込み中の表示の「共有」からも開ける。中身（X・LINE・端末の共有・リンクのコピー）は、
// 100 日チャレンジの共通部品 shared/share.js が入れる
const shareDialog = document.querySelector('[data-share-dialog]');
document.querySelector('[data-boot] [data-share-open]')?.addEventListener('click', () => { if (shareDialog && !shareDialog.open) shareDialog.showModal(); });
document.querySelector('[data-share-close]')?.addEventListener('click', () => shareDialog?.close());

function showFailure(title, detail) {
  // 題字の画面を作る前に失敗したとき（山のデータが無いなど）の案内
  const box = document.createElement('div');
  box.className = 'boot-failure';
  box.setAttribute('role', 'alert');
  const h = document.createElement('p');
  h.className = 'boot-failure__title';
  h.textContent = title;
  const d = document.createElement('p');
  d.className = 'boot-failure__detail';
  d.textContent = detail;
  box.append(h, d);
  root.replaceChildren(box);
}

async function main() {
  const search = location.search;
  let world;
  try {
    // 開発のときだけ、別の置き場の山を読める（?world=wip → /world-wip/）。山を作り直している最中に、描画を固定のデータで確かめるため
    const alt = import.meta.env?.DEV ? new URLSearchParams(search).get('world') : null;
    // 住所は相対（ページの置き場所の下）。100 日チャレンジでは /100days/day-089-frostline/ の下に置くので、/world/ と書くと読めない
    world = await loadWorld(alt && /^[a-z0-9-]+$/.test(alt) ? `world-${alt}/` : 'world/');
  } catch (error) {
    showFailure('山のデータを読み込めませんでした。', `${error?.message || error}`);
    throw error;
  }
  const ride = createRide(world);
  const q = new URLSearchParams(search);
  const first = world.drops.find((d) => d.id === q.get('drop')) || world.drops[0];
  // 出発地点が持つ押し出しの速さを使う（森の道は秒速 6 m）。決め打ちの値だと、題字から始めた最初の一本だけ、遅く始まった（体験の採点 3 周目）
  ride.reset({ x: first.x, z: first.z, heading: first.heading, speed: first.speed ?? START_PUSH });
  const { view } = createView({ world, search });
  // 音は、最初の操作（開始のボタン）で器が resume() を呼ぶまで鳴らない
  const audio = createAudio();
  const game = createGame({ root, world, ride, view, audio, initialDrop: first, debug: { enabled: q.get('debug') === '1' } });
  // 題字の画面ができたら、読み込み中の表示（index.html）を消す
  root.querySelector('[data-boot]')?.remove();
  window.addEventListener('pagehide', () => game.dispose(), { once: true });
  try {
    await game.ready;
  } catch (error) {
    // 描画の準備の失敗は、器が題字の画面に案内を出す。ここでは記録だけ
    console.error(error);
  }
}

main();
