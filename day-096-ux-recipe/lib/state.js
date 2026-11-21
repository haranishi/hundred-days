import {
  ACCENTS, ACTION_TYPES, BLOCK_SCHEMA, BLOCK_TYPES, GOALS, MAX_BLOCKS, SITE_NAME_MAX, THEMES,
  clampText, getPath, nextBlockId, resolveField, sanitizeState, setPath, validateState,
} from './contract.js';
import { makeBlock } from './blocks.js';
import { RECIPES, buildFromRecipe } from './recipes.js';

export function createState(goal = GOALS[0]) {
  return buildFromRecipe(GOALS.includes(goal) ? goal : GOALS[0]);
}

function validState(state) {
  if (!Array.isArray(state?.blocks) || state.blocks.length > MAX_BLOCKS) return false;
  for (const block of state.blocks) {
    if (!BLOCK_TYPES.includes(block?.type)) return false;
    // JavaScriptから渡された配列の空きは、項目表のforEachによる検証をすり抜ける。
    if (Object.values(block.props ?? {}).some(value => Array.isArray(value) && value.includes(undefined))) return false;
  }
  return validateState(state).length === 0;
}

// 共有・保存・置換は同じ入口を通し、項目表で扱えない値を編集画面へ渡さない。
export function restoreState(raw) {
  try {
    const state = sanitizeState(raw);
    return state && validState(state) ? state : null;
  } catch {
    return null;
  }
}

const inRange = (index, length) => Number.isInteger(index) && index >= 0 && index < length;
const isTextInput = value => typeof value === 'string' || typeof value === 'boolean' || Number.isFinite(value);
const within = (index, last) => Math.max(0, Math.min(index, last));

function availableId(blocks) {
  const id = nextBlockId(blocks);
  if (id.length <= 12) return id;
  // 外から来た最大桁の番号に1を足すと、契約の12文字を超える。
  const used = new Set(blocks.map(block => block.id));
  let number = 1;
  while (used.has('b' + number)) number += 1;
  return 'b' + number;
}

function moved(array, from, to) {
  const copy = array.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

function editList(items, field, action) {
  switch (action.type) {
    case 'addItem': {
      if (items.length >= field.max || (action.index !== undefined && !Number.isInteger(action.index))) return items;
      const last = items.at(-1);
      // 文言は雛形に使える。おすすめ等のチェックは、追加した人が決める。
      const item = Object.fromEntries(field.item.map(f => [f.key, f.kind === 'check' ? false : last?.[f.key] ?? '']));
      const copy = items.slice();
      copy.splice(within(action.index ?? items.length, items.length), 0, item);
      return copy;
    }
    case 'removeItem': {
      if (items.length <= field.min || !inRange(action.index, items.length)) return items;
      return items.filter((_, i) => i !== action.index);
    }
    case 'moveItem':
      if (!inRange(action.from, items.length) || !inRange(action.to, items.length) || action.from === action.to) return items;
      return moved(items, action.from, action.to);
    default:
      return items;
  }
}

function editBlock(block, action) {
  if (action.type === 'setVariant') {
    const variant = action.variant;
    if (!inRange(variant, BLOCK_SCHEMA[block.type].variants.length) || variant === block.variant) return block;
    return { ...block, variant };
  }
  const path = action.path;
  if (!Array.isArray(path)) return block;
  const field = resolveField(block.type, path);
  if (!field || field.kind === 'listItem') return block;
  const before = getPath(block.props, path);
  // 項目表にはあるが、まだ追加していない行への入力で空の行を作らない。
  if (before === undefined) return block;
  let after;
  if (action.type === 'setProp') {
    if (field.kind === 'list' || !isTextInput(action.value)) return block;
    after = field.kind === 'check' ? action.value === true : clampText(action.value, field.max, field.kind === 'long');
  } else {
    if (field.kind !== 'list') return block;
    after = editList(before, field, action);
  }
  return before === after ? block : { ...block, props: setPath(block.props, path, after) };
}

function applyAction(state, action) {
  const { blocks } = state;
  switch (action.type) {
    case 'replace':
      return restoreState(action.state) ?? state;
    case 'setGoal': {
      if (!GOALS.includes(action.goal) || action.goal === state.goal) return state;
      const next = createState(action.goal);
      const name = state.site.name;
      const site = name.trim() && name !== RECIPES[state.goal].siteName ? state.site : next.site;
      return { ...next, site, theme: state.theme };
    }
    case 'setSite': {
      if (!isTextInput(action.name)) return state;
      const name = clampText(action.name, SITE_NAME_MAX);
      return name === state.site.name ? state : { ...state, site: { name } };
    }
    case 'setTheme': {
      const { preset = state.theme.preset, accent = state.theme.accent } = action;
      if (!THEMES.includes(preset) || !inRange(accent, ACCENTS.length)) return state;
      if (preset === state.theme.preset && accent === state.theme.accent) return state;
      return { ...state, theme: { preset, accent } };
    }
    case 'addBlock': {
      if (blocks.length >= MAX_BLOCKS || !BLOCK_TYPES.includes(action.blockType)) return state;
      let at = action.index;
      if (at === undefined) {
        const footer = blocks.findIndex(block => block.type === 'footer');
        at = footer < 0 ? blocks.length : footer;
      } else if (!Number.isInteger(at)) return state;
      const copy = blocks.slice();
      copy.splice(within(at, blocks.length), 0, makeBlock(state.goal, action.blockType, availableId(blocks)));
      return { ...state, blocks: copy };
    }
  }

  const index = blocks.findIndex(block => block.id === action.id);
  if (index < 0) return state;
  const block = blocks[index];
  switch (action.type) {
    case 'removeBlock':
      return { ...state, blocks: blocks.filter((_, i) => i !== index) };
    case 'duplicateBlock': {
      if (blocks.length >= MAX_BLOCKS) return state;
      const copy = blocks.slice();
      copy.splice(index + 1, 0, { ...structuredClone(block), id: availableId(blocks) });
      return { ...state, blocks: copy };
    }
    case 'moveBlock': {
      if (!Number.isInteger(action.to)) return state;
      const to = within(action.to, blocks.length - 1);
      return to === index ? state : { ...state, blocks: moved(blocks, index, to) };
    }
    default: {
      const edited = editBlock(block, action);
      if (edited === block) return state;
      const copy = blocks.slice();
      copy[index] = edited;
      return { ...state, blocks: copy };
    }
  }
}

export function reduce(state, action) {
  try {
    if (!action || typeof action !== 'object' || Array.isArray(action) || !ACTION_TYPES.includes(action.type)) return state;
    if (!validState(state)) return state;
    return applyAction(state, action);
  } catch {
    // 不正な入力は、途中まで適用したり履歴に1段追加したりしない。
    return state;
  }
}

export function createHistory(state, limit = 60) {
  return { past: [], present: state, future: [], limit: Number.isInteger(limit) && limit >= 0 ? limit : 60, key: null, at: 0 };
}

export function commit(h, state, coalesceKey = null, now = Date.now()) {
  if (state === h.present) return h;
  const elapsed = now - h.at;
  const merge = coalesceKey !== null && coalesceKey === h.key && elapsed >= 0 && elapsed <= 1200;
  let past = h.past;
  if (!merge && h.limit > 0) past = [...past, h.present].slice(-h.limit);
  return { ...h, past, present: state, future: [], key: coalesceKey, at: now };
}

export const present = h => h.present;
export const canUndo = h => h.past.length > 0;
export const canRedo = h => h.future.length > 0;

export function undo(h) {
  if (!canUndo(h)) return h;
  return { ...h, past: h.past.slice(0, -1), present: h.past.at(-1), future: [h.present, ...h.future], key: null, at: 0 };
}

export function redo(h) {
  if (!canRedo(h)) return h;
  return { ...h, past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), key: null, at: 0 };
}
