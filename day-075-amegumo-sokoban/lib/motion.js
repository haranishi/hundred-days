import {campaignEvents} from './campaign-view.js';
const SVG_NS = 'http://www.w3.org/2000/svg';
const samePosition = (a, b) => a && b && a.x === b.x && a.y === b.y;
const point = (value) => Array.isArray(value) ? { x: value[0], y: value[1] } : value;
const validPoint = (value) => value && Number.isFinite(value.x) && Number.isFinite(value.y);
const attributePosition = (element) => {
  const values = element.getAttribute('transform')?.match(/translate\(\s*([-+.\deE]+)[ ,]+([-+.\deE]+)/);
  return values ? { x: Number(values[1]), y: Number(values[2]) } : null;
};

/** Only a new forward move may create rain or growth; redraws and undo are silent. */
export function planGardenMotion(before, after, level) {
  const empty = { actors: [], rain: [] };
  if (!before || !after || !level || before.levelId !== level.id ||
      after.levelId !== level.id || after.moves <= before.moves) return empty;
  const actors = [];
  const events=campaignEvents(before,after,level);
  if (!samePosition(before.player, after.player)) {
    actors.push({ key: 'gardener', from: before.player, to: after.player });
  }
  after.clouds.forEach((cloud, index) => {
    if (!samePosition(before.clouds[index], cloud)) {
      actors.push({ key: 'cloud-' + index, from: before.clouds[index], to: cloud,
        ...(events.warped.some(event=>event.index===index)?{warp:true}:{}), });
    }
  });
  const rain = level.plots.flatMap((plot, index) => {
    const from = before.water[index], to = after.water[index];
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return [];
    return [{ index, x: plot.x, y: plot.y, from, to, need: plot.need,
      stage: to > plot.need ? 'wilt' : to === plot.need ? 'bloom' : 'sprout' }];
  });
  return { actors, rain };
}

/** Finite effects live separately from the SVG's authoritative final state. */
export function createGardenMotion(svg, { coord, reducedMotion = () => false }) {
  let generation = 0;
  const animations = new Set();
  const effects = new Set();
  const at = (value) => point(coord(value.x, value.y));
  const transform = (p) => 'translate(' + p.x + 'px, ' + p.y + 'px)';

  function animate(element, frames, options, onFinish) {
    if (!element || typeof element.animate !== 'function') return;
    const current = generation;
    let animation;
    try {
      animation = element.animate(frames, { fill: 'both', easing: 'ease-out', ...options });
    } catch { return; }
    animations.add(animation);
    // Every callback owns its animation and generation, never a newer effect batch.
    animation.finished.then(() => {
      animations.delete(animation);
      if (current !== generation) return;
      animation.cancel();
      if (onFinish) onFinish();
    }, () => { animations.delete(animation); });
  }

  function cancel() {
    generation += 1;
    for (const animation of animations) animation.cancel();
    animations.clear();
    for (const element of effects) element.remove();
    effects.clear();
  }

  function capture() {
    const positions = {};
    for (const actor of svg.querySelectorAll('[data-actor]')) {
      let position;
      try {
        const matrix = actor.getCTM();
        const root = svg.getCTM();
        const relative = matrix && root ? root.inverse().multiply(matrix) : matrix;
        if (relative) position = { x: relative.e, y: relative.f };
      } catch { /* An unrendered or detached SVG may not have a CTM. */ }
      if (!validPoint(position)) {
        position = attributePosition(actor);
      }
      if (validPoint(position)) positions[actor.getAttribute('data-actor')] = position;
    }
    return positions;
  }

  function node(tag, attributes, parent) {
    const element = svg.ownerDocument.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    parent.append(element);
    return element;
  }

  function effectLayer(duration) {
    const layer = svg.querySelector('[data-fx-layer]');
    if (!layer) return null;
    const batch = node('g', { 'data-motion-fx': '', 'pointer-events': 'none' }, layer);
    effects.add(batch);
    animate(batch, [{ opacity: 1 }, { opacity: 1 }], { duration }, () => {
      effects.delete(batch);
      batch.remove();
    });
    return batch;
  }

  function flowerColor(level, plot) {
    const plant = svg.querySelector('[data-plant-plot="' + plot.index + '"]') || svg;
    let color = plant.style?.getPropertyValue('--flower-color').trim() || svg.getAttribute('data-flower-color');
    try { color ||= svg.ownerDocument.defaultView.getComputedStyle(plant).getPropertyValue('--flower-color').trim(); }
    catch { /* The palette fallback also works before the SVG is attached. */ }
    return color || ({ 'first-rain': '#e8b967', 'return-rain': '#9bafcc', 'two-clouds': '#d69291' }[level.id]) || '#e8b967';
  }

  function rainOnPlot(plot, layer) {
    if (!layer) return;
    const p = at(plot);
    [-23, -10, 9, 24, -18, 4].forEach((dx, index) => {
      const drop = node('path', { d: 'M0 -4 Q-5 2 0 5 Q5 2 0 -4Z',
        class: 'garden-rain-drop', fill: '#6e9fa9' }, layer);
      const x = p.x + dx, y = p.y - 17 + (index % 2) * 3;
      animate(drop, [
        { transform: transform({ x, y }), opacity: 0 },
        { transform: transform({ x, y: y + 5 }), opacity: .95, offset: .2 },
        { transform: transform({ x: x - 2, y: p.y + 7 }), opacity: .85, offset: .8 },
        { transform: transform({ x: x - 3, y: p.y + 10 }), opacity: 0 },
      ], { duration: 210, delay: 150 + index * 24, easing: 'cubic-bezier(.3,0,.7,1)' });
    });
    [-16, 15].forEach((dx, index) => {
      const location = node('g', { transform: 'translate(' + (p.x + dx) + ' ' + (p.y + 5) + ')' }, layer);
      const ripple = node('ellipse', { rx: 10, ry: 3, class: 'garden-rain-ripple' }, location);
      animate(ripple, [
        { transform: 'scale(.2)', opacity: .6 },
        { transform: 'scale(1.5)', opacity: 0 },
      ], { duration: 270, delay: 285 + index * 45 });
    });
  }

  function petalsOnPlot(plot, layer, color) {
    if (!layer) return;
    const p = at(plot);
    // A few petals rise above the plot; the water badge below stays unobscured.
    [-1, 1, -1, 1, 0].forEach((side, index) => {
      const petal = node('ellipse', { rx: 3.5, ry: 2, fill: color,
        class: 'garden-floating-petal' }, layer);
      const x = p.x + (index - 2) * 10, y = p.y - 17;
      animate(petal, [
        { transform: transform({ x, y }) + ' rotate(-20deg) scale(.2)', opacity: 0 },
        { transform: transform({ x: x + side * 9, y: y - 15 }) + ' rotate(30deg)', opacity: .9, offset: .25 },
        { transform: transform({ x: x + side * 23, y: y - 30 + index * 2 }) + ' rotate(105deg) scale(.7)', opacity: 0 },
      ], { duration: 390, delay: 625 + index * 12, easing: 'cubic-bezier(.2,.6,.35,1)' });
    });
  }

  function growPlot(plot) {
    const plant = svg.querySelector('[data-plant-plot="' + plot.index + '"]');
    if (!plant) return;
    plant.querySelectorAll('.plant-growth').forEach((growth, index) => {
      if (plot.stage === 'wilt') {
        animate(growth, [
          { transform: 'rotate(-4deg)', opacity: 1 },
          { transform: 'rotate(6deg)', opacity: .75, offset: .45 },
          { transform: 'rotate(0deg)', opacity: 1 },
        ], { duration: 340, delay: 350 + index * 35 });
        return;
      }
      animate(growth, [
        { transform: plot.from ? 'scale(.85,.64)' : 'scale(.3,.07)' },
        { transform: 'scale(.95,1.1)', offset: .7 },
        { transform: 'scale(1)' },
      ], { duration: 320, delay: 350 + index * 35, easing: 'cubic-bezier(.2,.65,.35,1)' });
      if (plot.stage !== 'bloom') return;
      for (const flower of growth.querySelectorAll('.flower-petals')) {
        animate(flower, [
          { transform: 'scale(.02) rotate(-28deg)', opacity: 0 },
          { transform: 'scale(1.24) rotate(8deg)', opacity: 1, offset: .46 },
          { transform: 'scale(.95) rotate(-3deg)', opacity: 1, offset: .73 },
          { transform: 'scale(1) rotate(0deg)', opacity: 1 },
        ], { duration: 410, delay: 520 + index * 35, easing: 'cubic-bezier(.2,.65,.35,1)' });
      }
    });
  }

  function play({ before, after, level, positions = {} }) {
    cancel();
    if (reducedMotion() || typeof svg.animate !== 'function') return 0;
    const plan = planGardenMotion(before, after, level);
    if (!plan.actors.length && !plan.rain.length) return 0;
    for (const actor of plan.actors) {
      const element = svg.querySelector('[data-actor="' + actor.key + '"]');
      if (!element || !validPoint(actor.from) || !validPoint(actor.to)) continue;
      const captured = point(positions instanceof Map ? positions.get(actor.key) : positions[actor.key]);
      // Static actor offsets (for example a floating cloud) belong to the view.
      const destination = at(actor.to), source = at(actor.from);
      const rendered = attributePosition(element);
      const to = validPoint(rendered) ? rendered : destination;
      const from = validPoint(captured) ? captured : {
        x: source.x + to.x - destination.x, y: source.y + to.y - destination.y,
      };
      const frames=actor.warp?[
        {transform:transform(to)+' scale(.45)',opacity:0},
        {transform:transform(to)+' scale(1.07)',opacity:.8,offset:.65},
        {transform:transform(to)+' scale(1)',opacity:1},
      ]:[{transform:transform(from)},{transform:transform(to)}];
      animate(element, frames,
        { duration: actor.warp?330:160, easing: 'cubic-bezier(.2,.65,.3,1)' });
      const gardener = actor.key === 'gardener';
      if (!gardener) {
        animate(svg.querySelector('[data-actor-label="' + actor.key + '"]'),
          actor.warp?[{transform:transform(to),opacity:0},{transform:transform(to),opacity:1}]:[{ transform: transform(from) }, { transform: transform(to) }],
          { duration: actor.warp?330:160, easing: 'cubic-bezier(.2,.65,.3,1)' });
      }
      animate(element.querySelector(gardener ? '.gardener-sprite' : '.cloud-sprite'), gardener ? [
        { transform: 'translateY(0px)' },
        { transform: 'translateY(-4px)', offset: .45 },
        { transform: 'translateY(0px)' },
      ] : [
        { transform: 'scale(1)' },
        { transform: 'scale(1.07,.93)', offset: .4 },
        { transform: 'scale(1)' },
      ], { duration: 160 });
    }
    const extra=campaignEvents(before,after,level);
    if(extra.collected.length||extra.warped.length){
      const layer=effectLayer(650);
      if(layer){
        for(const index of extra.collected){
          const p=at(level.dew[index]);
          const label=node('text',{x:0,y:0,'text-anchor':'middle',fill:'#376f65','font-size':27,'font-weight':700,'data-pickup-fx':''},layer);
          label.textContent='+1';
          animate(label,[{transform:transform({x:p.x,y:p.y-8}),opacity:0},{transform:transform({x:p.x,y:p.y-24}),opacity:1,offset:.3},{transform:transform({x:p.x,y:p.y-42}),opacity:0}],{duration:600});
        }
        for(const event of extra.warped)for(const point of [event.entry,event.exit]){
          const p=at(point),location=node('g',{transform:'translate('+p.x+' '+p.y+')','data-warp-fx':''},layer);
          const ring=node('ellipse',{rx:24,ry:15,fill:'none',stroke:'#7388a2','stroke-width':3},location);
          animate(ring,[{transform:'scale(.4)',opacity:.8},{transform:'scale(1.8)',opacity:0}],{duration:480});
        }
      }
    }
    if (!plan.rain.length) return extra.collected.length||extra.warped.length?650:160;
    const layer = effectLayer(1100);
    for (const plot of plan.rain) {
      rainOnPlot(plot, layer);
      growPlot(plot);
      const soil = svg.querySelector('[data-plot-index="' + plot.index + '"]')?.querySelector('rect');
      animate(soil, [{ opacity: .75 }, { opacity: 1 }], { duration: 280, delay: 240 });
      if (plot.stage === 'bloom') petalsOnPlot(plot, layer, flowerColor(level, plot));
    }
    if (plan.rain.some((plot) => plot.stage === 'bloom')) {
      animate(svg.querySelector('.garden-glow'), [
        { opacity: 0 }, { opacity: .24, offset: .4 }, { opacity: 0 },
      ], { duration: 750, delay: 330 });
    }
    return 1100;
  }

  return { capture, cancel, play, activeCount: () => animations.size };
}
