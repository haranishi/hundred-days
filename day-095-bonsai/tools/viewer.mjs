// 開発用の確認ページ。配信されない。URL の引数で樹種・日・光・視点を固定して createView3D を描く。
// 描き終えたら window.__ready を立てる（shots.mjs はこれを待つ）。
import * as THREE from '../vendor/three.js';
import { validateSkeleton } from '../lib/contract.js';
import { seasonLook } from '../lib/look.js';
import { createView3D } from '../lib/view3d.js';
import { makeSampleSkeleton } from '../tests/fixtures/sample-skeleton.mjs';

const q = new URLSearchParams(location.search);
const species = q.get('species') || 'maple';
const doy = clampInt(q.get('doy'), 0, 364, 273);
const light = q.get('light') || 'noon';
const gfx = q.get('gfx') || 'high';
const seed = Number(q.get('seed') ?? 11) || 11;
const pot = q.get('pot') || 'oval-brown';
const cam = (q.get('cam') || '20,72,8.5').split(',').map(Number);

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

async function loadSkeleton() {
  if (q.get('model') !== 'real') return makeSampleSkeleton({ seed });
  const text = await fetch('../lib/tree.js').then((res) => res.text());
  if (text.startsWith('// TEMP-PLACEHOLDER')) return makeSampleSkeleton({ seed });
  const { createTree } = await import('../lib/tree.js');
  const day = (doy - 273 + 365) % 365;
  const snap = createTree({ species, style: q.get('style') || 'moyogi', seed, day }).snapshot();
  if (validateSkeleton(snap).length) return makeSampleSkeleton({ seed });
  return snap;
}

const canvas = document.getElementById('view');
const view = createView3D(THREE, canvas, { gfx, seed });

function fit() {
  view.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
}

try {
  const skel = await loadSkeleton();
  view.setSpecies(species);
  view.setPot(pot);
  view.setLight(light);
  view.setLook(seasonLook(species, doy, { moisture: Number(q.get('moisture') ?? 0.6) }), { animate: false });
  view.setSkeleton(skel, { animate: false });
  view.camera.set({
    az: Number.isFinite(cam[0]) ? cam[0] : 20,
    pol: Number.isFinite(cam[1]) ? cam[1] : 72,
    dist: Number.isFinite(cam[2]) ? cam[2] : 8.5,
  }, { animate: false });
  fit();
  view.requestRender();
  window.__view = view;
  window.__ready = true;
} catch (error) {
  window.__error = String(error && error.stack || error);
  document.body.textContent = window.__error;
  throw error;
}

window.addEventListener('resize', fit);
