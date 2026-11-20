import { BLOCK_SCHEMA, BLOCK_TYPES, EFFECT_LABEL, EFFECTS, MAX_BLOCKS } from './contract.js';
import { BLOCK_INFO } from './blocks.js';
import { stageMark } from './ui-goal.js';

export function insertionIndex(blocks, selectedId, index) {
  if (Number.isInteger(index)) return Math.max(0, Math.min(blocks.length, index));
  const selected = blocks.findIndex(block => block.id === selectedId);
  return selected < 0 ? undefined : selected + 1;
}

export function mountPalette(dialog, ctx) {
  const groups = dialog.querySelector('[data-groups]');
  const note = dialog.querySelector('[data-limit]');
  let requestedIndex;
  for (const effect of EFFECTS) {
    const section = document.createElement('section');
    const heading = document.createElement('h3');
    heading.className = 'ed-group-title';
    heading.textContent = EFFECT_LABEL[effect];
    section.append(heading);
    for (const type of BLOCK_TYPES.filter(type => BLOCK_SCHEMA[type].effect === effect)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.type = type;
      button.className = 'ed-palette-choice';
      const name = document.createElement('strong');
      name.textContent = BLOCK_SCHEMA[type].label;
      const detail = document.createElement('span');
      detail.className = 'ed-choice-role';
      detail.textContent = BLOCK_INFO[type].role;
      name.id = 'ed-choice-' + type;
      detail.id = 'ed-role-' + type;
      button.setAttribute('aria-labelledby', name.id);
      button.setAttribute('aria-describedby', detail.id);
      const text = document.createElement('span');
      text.append(name, detail);
      button.append(stageMark(BLOCK_SCHEMA[type].stage), text);
      section.append(button);
    }
    groups.append(section);
  }

  function update() {
    const full = ctx.getState().blocks.length >= MAX_BLOCKS;
    note.textContent = full ? '部品は' + MAX_BLOCKS + '個までです。追加するには、先にひとつ削除してください。'
      : 'お客さんに伝えたいことに合わせて選んでください。';
    for (const choice of groups.querySelectorAll('button')) choice.disabled = full;
  }

  function click(event) {
    const button = event.target.closest('button[data-type]');
    if (!button || button.disabled) return;
    const before = ctx.getState().blocks;
    const index = insertionIndex(before, ctx.getSelectedId(), requestedIndex);
    ctx.dispatch({ type: 'addBlock', blockType: button.dataset.type, index });
    const ids = new Set(before.map(block => block.id));
    const added = ctx.getState().blocks.find(block => !ids.has(block.id));
    if (added) {
      dialog.close();
      ctx.select(added.id, { tab: 'edit' });
      ctx.toast(BLOCK_SCHEMA[added.type].label + 'を足しました。');
    } else update();
  }

  groups.addEventListener('click', click);
  const unsubscribe = ctx.subscribe(() => { if (dialog.open) update(); });
  return {
    open(index) {
      requestedIndex = index;
      update();
      if (!dialog.open) dialog.showModal();
      dialog.scrollTop = 0;
    },
    destroy() { unsubscribe(); groups.removeEventListener('click', click); },
  };
}
