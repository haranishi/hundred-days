import test from 'node:test';
import assert from 'node:assert/strict';
import { createGardenMotion, planGardenMotion } from '../lib/motion.js';
import { createState, move } from '../lib/game.js';
import { LEVELS, SOLUTIONS } from '../lib/levels.js';

function advance(level, directions) {
  let state = createState(level);
  for (const direction of directions) state = move(level, state, direction).state;
  return state;
}
const coord = (x, y) => [92 + x * 76 + 38, 54 + y * 76 + 38];

test('walking and a dry cloud push never replay existing blossoms', () => {
  const level = LEVELS[1], before = createState(level);
  const walking = move(level, before, 'up').state;
  assert.deepEqual(planGardenMotion(before, walking, level).rain, []);
  assert.deepEqual(planGardenMotion(before, walking, level).actors.map((actor) => actor.key), ['gardener']);
  const dry = { ...before, clouds: before.clouds.map((cloud) => ({ ...cloud, drops: 0 })) };
  const pushing = move(level, dry, 'right').state;
  const plan = planGardenMotion(dry, pushing, level);
  assert.deepEqual(plan.rain, []);
  assert.deepEqual(plan.actors.map((actor) => actor.key), ['gardener', 'cloud-0']);
});

test('a new drop produces a sprout, bloom, or wilt from the actual water total', () => {
  const level = LEVELS[1], initial = createState(level);
  const first = move(level, initial, 'right').state;
  const firstPlan = planGardenMotion(initial, first, level);
  assert.equal(firstPlan.rain.length, 1);
  assert.equal(firstPlan.rain[0].stage, 'sprout');
  assert.equal(firstPlan.rain[0].from, 0);
  assert.equal(firstPlan.rain[0].to, 1);
  const beforeBloom = advance(level, SOLUTIONS[level.id].slice(0, -1));
  const bloom = move(level, beforeBloom, 'up').state;
  assert.equal(planGardenMotion(beforeBloom, bloom, level).rain[0].stage, 'bloom');
  const excessive = { ...bloom, water: [3], moves: bloom.moves + 1 };
  assert.equal(planGardenMotion(bloom, excessive, level).rain[0].stage, 'wilt');
});

test('redraw, undo, and another level cannot create rain or movement', () => {
  const level = LEVELS[0], before = advance(level, SOLUTIONS[level.id].slice(0, -1));
  const after = move(level, before, 'up').state;
  assert.deepEqual(planGardenMotion(after, after, level), { actors: [], rain: [] });
  assert.deepEqual(planGardenMotion(after, before, level), { actors: [], rain: [] });
  assert.deepEqual(planGardenMotion(before, after, LEVELS[1]), { actors: [], rain: [] });
  assert.deepEqual(planGardenMotion(null, after, level), { actors: [], rain: [] });
});

test('only the plot receiving a new drop grows', () => {
  const level = LEVELS[2];
  const before = { ...createState(level), water: [0, 1] };
  const after = { ...before, moves: 1, water: [1, 1] };
  assert.deepEqual(planGardenMotion(before, after, level).rain.map((plot) => plot.index), [0]);
});

// A small WAAPI boundary double exercises interruption ownership without a DOM dependency.
class FakeElement {
  constructor(tag, document) {
    this.tag = tag; this.ownerDocument = document; this.attributes = {}; this.children = [];
    this.style = { getPropertyValue: () => '' };
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  append(element) { element.parent = this; this.children.push(element); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((element) => element !== this); }
  matches(selector) {
    if (selector[0] === '.') return (this.attributes.class || '').split(' ').includes(selector.slice(1));
    const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attribute) return attribute[2] === undefined ? Object.hasOwn(this.attributes, attribute[1]) : this.attributes[attribute[1]] === attribute[2];
    return this.tag === selector;
  }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  animate(frames, options) {
    let resolve, reject;
    const finished = new Promise((yes, no) => { resolve = yes; reject = no; });
    const animation = { element: this, frames, options, finished,
      cancel() { this.cancelled = true; reject(new Error('cancelled')); },
      finish() { resolve(); } };
    this.ownerDocument.animations.push(animation);
    return animation;
  }
}
function renderedGarden(after) {
  const document = { animations: [], createElementNS: (_namespace, tag) => new FakeElement(tag, document) };
  const svg = new FakeElement('svg', document);
  const add = (tag, attributes, parent = svg) => {
    const element = new FakeElement(tag, document);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    parent.append(element); return element;
  };
  const gardener = add('g', { 'data-actor': 'gardener', transform: 'translate(' + coord(after.player.x, after.player.y).join(' ') + ')' });
  add('g', { class: 'gardener-sprite' }, gardener);
  after.clouds.forEach((cloud, index) => {
    const [x, y] = coord(cloud.x, cloud.y);
    const actor = add('g', { 'data-actor': 'cloud-' + index, transform: 'translate(' + x + ' ' + (y - 14) + ')' });
    add('g', { class: 'cloud-sprite' }, actor);
    add('g', { 'data-actor-label': 'cloud-' + index, transform: 'translate(' + x + ' ' + (y - 14) + ')' });
  });
  const soil = add('g', { 'data-plot-index': '0' }); add('rect', {}, soil);
  const plants = add('g', { 'data-plant-plot': '0' });
  for (let i = 0; i < 3; i += 1) {
    const growth = add('g', { class: 'plant-growth' }, plants);
    const flower = add('g', { class: 'flower-head' }, growth);
    add('g', { class: 'flower-petals' }, flower);
  }
  add('rect', { class: 'garden-glow' });
  const layer = add('g', { 'data-fx-layer': '' });
  return { svg, document, layer };
}
function bloomingMove() {
  const level = LEVELS[0], before = advance(level, SOLUTIONS[level.id].slice(0, -1));
  return { level, before, after: move(level, before, 'up').state };
}

test('cancel clears effects and old finish callbacks cannot remove the next batch', async () => {
  const action = bloomingMove(), { svg, document, layer } = renderedGarden(action.after);
  const motion = createGardenMotion(svg, { coord });
  assert.equal(motion.play(action), 1100);
  const old = [...document.animations];
  assert.ok(motion.activeCount() > 0);
  assert.equal(layer.children.length, 1);
  motion.cancel();
  assert.equal(motion.activeCount(), 0);
  assert.equal(layer.children.length, 0);
  assert.ok(old.every((animation) => animation.cancelled));
  motion.play(action);
  const currentCount = motion.activeCount();
  old.forEach((animation) => animation.finish());
  await Promise.resolve(); await Promise.resolve();
  assert.equal(motion.activeCount(), currentCount);
  assert.equal(layer.children.length, 1);
  document.animations.slice(old.length).forEach((animation) => animation.finish());
  await Promise.resolve(); await Promise.resolve();
  assert.equal(motion.activeCount(), 0);
  assert.equal(layer.children.length, 0);
});

test('a cloud keeps its rendered height and a new move can start at captured visual coordinates', () => {
  const action = bloomingMove(), { svg, document } = renderedGarden(action.after);
  const motion = createGardenMotion(svg, { coord });
  const captured = { 'cloud-0': { x: 330, y: 220 } };
  motion.play({ ...action, positions: captured });
  const cloudMove = document.animations.find((animation) => animation.element.getAttribute('data-actor') === 'cloud-0');
  assert.equal(cloudMove.frames[0].transform, 'translate(330px, 220px)');
  const labelMove = document.animations.find((animation) => animation.element.getAttribute('data-actor-label') === 'cloud-0');
  assert.deepEqual(labelMove.frames, cloudMove.frames);
  assert.equal(labelMove.options.duration, cloudMove.options.duration);
  const [x, y] = coord(action.after.clouds[0].x, action.after.clouds[0].y);
  assert.equal(cloudMove.frames[1].transform, 'translate(' + x + 'px, ' + (y - 14) + 'px)');
  motion.cancel();
  motion.play(action);
  const defaultMove = document.animations.filter((animation) => animation.element.getAttribute('data-actor') === 'cloud-0').at(-1);
  const [fromX, fromY] = coord(action.before.clouds[0].x, action.before.clouds[0].y);
  assert.equal(defaultMove.frames[0].transform, 'translate(' + fromX + 'px, ' + (fromY - 14) + 'px)');
  motion.cancel();
});

test('capture prefers current visual CTM and falls back safely to the rendered position', () => {
  const action = bloomingMove(), { svg } = renderedGarden(action.after);
  const motion = createGardenMotion(svg, { coord });
  const [x, y] = coord(action.after.player.x, action.after.player.y);
  assert.deepEqual(motion.capture().gardener, { x, y });
  svg.getCTM = () => ({ inverse: () => ({ multiply: () => ({ e: 312.5, f: 245 }) }) });
  svg.querySelector('[data-actor="gardener"]').getCTM = () => ({});
  assert.deepEqual(motion.capture().gardener, { x: 312.5, y: 245 });
});

test('reduced motion shows static results immediately and clears pending effects', () => {
  const action = bloomingMove(), { svg, layer } = renderedGarden(action.after);
  let reduce = false;
  const motion = createGardenMotion(svg, { coord, reducedMotion: () => reduce });
  motion.play(action);
  assert.ok(motion.activeCount() > 0);
  reduce = true;
  assert.equal(motion.play(action), 0);
  assert.equal(motion.activeCount(), 0);
  assert.equal(layer.children.length, 0);
});

test('walking has a short finite duration and no rain FX', () => {
  const level = LEVELS[1], before = createState(level), after = move(level, before, 'up').state;
  const { svg, layer } = renderedGarden(after), motion = createGardenMotion(svg, { coord });
  assert.equal(motion.play({ before, after, level }), 160);
  assert.equal(layer.children.length, 0);
  assert.equal(motion.play({ before: after, after, level }), 0);
  assert.equal(motion.activeCount(), 0);
});


function featureMove(feature) {
  const level={id:'motion-feature',grid:['######','#....#','#....#','#....#','#....#','######'],
    player:{x:1,y:2},clouds:[{x:2,y:2,drops:0}],plots:[{x:4,y:4,need:1}],...feature};
  const before=createState(level),after=move(level,before,'right').state;
  return {level,before,after};
}
test('warp fades in at the exit and cancels both portal ripples without crossing the board',()=>{
  const action=featureMove({portals:[{x:3,y:2},{x:3,y:3}]});
  assert.equal(planGardenMotion(action.before,action.after,action.level).actors.find(a=>a.key==='cloud-0').warp,true);
  const {svg,layer,document}=renderedGarden(action.after),motion=createGardenMotion(svg,{coord});
  assert.equal(motion.play(action),650);
  assert.equal(svg.querySelectorAll('[data-warp-fx]').length,2);
  const animation=document.animations.find(a=>a.element.getAttribute('data-actor')==='cloud-0');
  const [x,y]=coord(3,3);
  assert.match(animation.frames[0].transform,new RegExp('translate\\('+x+'px, '+(y-14)+'px\\)'));
  assert.equal(animation.frames[0].opacity,0);
  motion.cancel();
  assert.equal(layer.children.length,0);
  assert.equal(motion.activeCount(),0);
});
test('rain pickup +1 is finite, cancelled on redraw and omitted for reduced motion',()=>{
  const action=featureMove({dew:[{x:3,y:2}]});
  const {svg,layer}=renderedGarden(action.after);
  let reduce=false;
  const motion=createGardenMotion(svg,{coord,reducedMotion:()=>reduce});
  assert.equal(motion.play(action),650);
  assert.equal(svg.querySelectorAll('[data-pickup-fx]').length,1);
  assert.equal(motion.play({...action,before:action.after}),0);
  assert.equal(layer.children.length,0);
  reduce=true;
  assert.equal(motion.play(action),0);
  assert.equal(motion.activeCount(),0);
});
