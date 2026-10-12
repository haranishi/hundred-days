// 食材・工程・料理名の表。料理は「食材:工程の並び」で引く。通る順番がそのままレシピになる。
// 表にない組み合わせは「なぞ料理」。ここに無い料理名を注文に使うと tests/levels.test.mjs が落ちる。

export const INGREDIENTS = {
  carrot: { icon: '🥕', label: 'にんじん' },
  beef: { icon: '🥩', label: '牛肉' },
  fish: { icon: '🐟', label: '魚' },
  egg: { icon: '🥚', label: '卵' },
};

export const STEPS = {
  cut: { icon: '🔪', label: '切る' },
  grill: { icon: '🔥', label: '焼く' },
  simmer: { icon: '🍲', label: '煮る' },
};

export const DISHES = {
  'carrot:grill': '焼きにんじん',
  'carrot:simmer': 'にんじんの煮物',
  'beef:grill': 'ステーキ',
  'beef:cut>grill': 'ひと口ステーキ',
  'beef:grill>cut': 'ローストビーフ',
  'beef:cut>simmer': '角煮',
  'fish:cut': 'お刺身',
  'fish:grill': '焼き魚',
  'egg:simmer': 'ゆで卵',
};

export const MYSTERY_DISH = 'なぞ料理';

export function recipeKey(ingredient, steps) {
  return `${ingredient}:${steps.join('>')}`;
}

export function dishName(ingredient, steps) {
  return DISHES[recipeKey(ingredient, steps)] ?? MYSTERY_DISH;
}

export function ingredientIcon(ingredient) {
  return INGREDIENTS[ingredient]?.icon ?? '❔';
}

// 工程アイコンの列（例：🔪→🔥）。工程が無ければ空文字
export function stepIcons(steps, joiner = '→') {
  return steps.map((s) => STEPS[s]?.icon ?? '❔').join(joiner);
}

// 読み上げ用（例：切る→焼く）
export function stepWords(steps, joiner = '→') {
  return steps.map((s) => STEPS[s]?.label ?? s).join(joiner);
}
