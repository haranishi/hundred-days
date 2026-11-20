import { BLOCK_SCHEMA, clampText, countChars, setPath } from './contract.js';
import { RECIPES } from './recipes.js';

function* fieldsIn(fields, props, parent) {
  for (const field of fields) {
    const value = props[field.key];
    const path = [...parent, field.key];
    if (field.kind === 'list') {
      for (const [index, row] of value.entries()) yield* fieldsIn(field.item, row, [...path, index]);
    } else if (field.kind === 'text' || field.kind === 'long') {
      yield { field, value, path };
    }
  }
}

// 診断と店名の置換で同じ欄を拾い、確認の印などの真偽値は文章から除く。
export function textFields(block) {
  return fieldsIn(BLOCK_SCHEMA[block.type].fields, block.props, []);
}

export function sampleSiteName(goal) {
  return typeof goal === 'string' && Object.hasOwn(RECIPES, goal) ? RECIPES[goal].siteName : '';
}

export function countNameUses(state, name) {
  if (typeof name !== 'string' || !name) return 0;
  let count = 0;
  for (const block of state.blocks) {
    for (const { value } of textFields(block)) count += value.split(name).length - 1;
  }
  return count;
}

function fitsText(field, value) {
  if (countChars(value) > field.max) return false;
  // 本文の改行や空行を保つため、字数と制御文字は別々に判定する。
  const singleLine = field.kind === 'long' ? value.replaceAll('\n', '') : value;
  return clampText(singleLine, field.max) === singleLine;
}

export function replaceNameUses(state, from, to) {
  if (typeof from !== 'string' || !from || typeof to !== 'string' || from === to) {
    return { state, replaced: 0, skipped: 0 };
  }
  let replaced = 0;
  let skipped = 0;
  const blocks = state.blocks.map(block => {
    let props = block.props;
    for (const { field, value, path } of textFields(block)) {
      const parts = value.split(from);
      if (parts.length === 1) continue;
      // 店名に含まれる「$&」などの記号にも、入力されたままの意味を持たせる。
      const next = parts.join(to);
      if (!fitsText(field, next)) {
        skipped++;
        continue;
      }
      props = setPath(props, path, next);
      replaced += parts.length - 1;
    }
    return props === block.props ? block : { ...block, props };
  });
  return { state: replaced ? { ...state, blocks } : state, replaced, skipped };
}

// 保存や共有を経て項目のキーの順が変わっても、値と各行の並びで見本と照合できる。
function sameValues(actual, expected) {
  if (actual === expected) return true;
  if (!actual || !expected || typeof actual !== 'object' || typeof expected !== 'object') return false;
  if (Array.isArray(actual) !== Array.isArray(expected)) return false;
  const keys = Object.keys(expected);
  return Object.keys(actual).length === keys.length
    && keys.every(key => Object.hasOwn(actual, key) && sameValues(actual[key], expected[key]));
}

export function isUntouched(state) {
  if (!state || !Object.hasOwn(RECIPES, state.goal)) return false;
  const recipe = RECIPES[state.goal];
  if (state.site?.name !== recipe.siteName || !sameValues(state.theme, recipe.theme)
      || state.blocks?.length !== recipe.blocks.length) return false;
  return state.blocks.every((block, index) => {
    const sample = recipe.blocks[index];
    return block.type === sample.type && block.variant === sample.variant && sameValues(block.props, sample.props);
  });
}
