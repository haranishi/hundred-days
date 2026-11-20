import { BLOCK_SCHEMA, GOALS, GOAL_LABEL, GOAL_NOTE, STAGES, STAGE_COLORS, STAGE_LABEL } from './contract.js';
import { RECIPES } from './recipes.js';

export function recipeStages(blocks) {
  return blocks.map(block => BLOCK_SCHEMA[block.type].stage);
}

export function toolIcon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'ed-icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', '#i-' + name);
  svg.append(use);
  return svg;
}

export function stageMark(key) {
  const mark = document.createElement('span');
  const { soft, ink, solid, glyph } = STAGE_COLORS[key];
  mark.className = 'ed-stage';
  mark.style.setProperty('--stage-soft', soft);
  mark.style.setProperty('--stage-ink', ink);
  mark.style.setProperty('--stage-solid', solid);
  mark.textContent = glyph;
  mark.title = STAGE_LABEL[key];
  mark.setAttribute('role', 'img');
  mark.setAttribute('aria-label', STAGE_LABEL[key]);
  return mark;
}

function goalCard(goal) {
  const card = document.createElement('button');
  card.className = 'app-goal-card';
  card.type = 'button';
  card.dataset.goal = goal;
  const name = document.createElement('strong');
  name.id = 'goal-name-' + goal;
  name.className = 'app-card-title';
  name.textContent = GOAL_LABEL[goal];
  const note = document.createElement('span');
  note.id = 'goal-note-' + goal;
  note.className = 'app-card-note';
  note.textContent = GOAL_NOTE[goal];
  const top = document.createElement('span');
  top.className = 'app-card-icons';
  top.append(toolIcon(goal), toolIcon('right'));
  const stages = recipeStages(RECIPES[goal].blocks);
  const band = document.createElement('span');
  band.id = 'goal-flow-' + goal;
  band.className = 'app-band';
  band.setAttribute('role', 'img');
  band.setAttribute('aria-label', '部品の順番　' + stages.map(key => STAGE_LABEL[key]).join('、'));
  band.append(...stages.map(stageMark));
  card.setAttribute('aria-labelledby', name.id);
  card.setAttribute('aria-describedby', note.id + ' ' + band.id);
  card.append(top, name, note, band);
  return card;
}

export function mountGoal(root, ctx) {
  const cards = root.querySelector('[data-goals]');
  cards.replaceChildren(...GOALS.map(goalCard));
  const legend = STAGES.map(key => {
    const item = document.createElement('span');
    const mark = stageMark(key);
    mark.setAttribute('aria-hidden', 'true');
    item.append(mark, STAGE_LABEL[key]);
    return item;
  });
  root.querySelector('[data-legend]').replaceChildren(...legend);
  const resume = root.querySelector('[data-resume]');
  const name = root.querySelector('[data-draft-name]');
  function click(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.goal) ctx.chooseGoal(button.dataset.goal, button);
    else if (button === resume) ctx.resume();
    else if (button.hasAttribute('data-slots')) ctx.openSlots(button);
    else if (button.hasAttribute('data-app-send')) ctx.openAppShare(button);
  }
  root.addEventListener('click', click);
  return {
    setDraft(state) {
      resume.hidden = !state;
      name.hidden = !state;
      name.textContent = state ? state.site.name || GOAL_LABEL[state.goal] : '';
    },
    destroy() { root.removeEventListener('click', click); },
  };
}
