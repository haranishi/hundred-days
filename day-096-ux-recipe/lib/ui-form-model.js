import { BLOCK_SCHEMA, countChars } from './contract.js';
import { suggestionsFor } from './recipes.js';

export function counter(value, max) {
  const count = countChars(String(value ?? ''));
  return { count, max, over: count > max };
}

export function listControls(length, min, max, index) {
  const hasItem = Number.isInteger(index) && index >= 0 && index < length;
  return {
    canAdd: length < max,
    canRemove: hasItem && length > min,
    canMoveUp: hasItem && index > 0,
    canMoveDown: hasItem && index < length - 1,
  };
}

export function formModel(block, goal) {
  if (!block) return [];

  function describe(field, props, prefix) {
    const path = [...prefix, field.key];
    const value = props[field.key];
    const model = { path, kind: field.kind, label: field.label, value };
    if (field.kind === 'list') {
      return {
        ...model, min: field.min, max: field.max,
        items: value.map((row, index) => field.item.map((child) => describe(child, row, [...path, index]))),
      };
    }
    if (field.kind === 'check') return model;
    return {
      ...model, max: field.max, role: field.role,
      suggestions: prefix.length ? [] : suggestionsFor(goal, block.type, field.key),
    };
  }

  return BLOCK_SCHEMA[block.type].fields.map((field) => describe(field, block.props, []));
}
