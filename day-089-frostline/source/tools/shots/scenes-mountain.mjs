/** 本物の山での固定の場面。出発地点は名前で指す（山を作り直しても、名前と役割は変えない決まり）。 */
export default [
  { name: 'm-start', spawn: 'first-snow', camera: 'third', steps: [{ seconds: 0.5, input: {} }] },
  { name: 'm-straight', spawn: 'east-piste', camera: 'third', steps: [{ seconds: 4, input: {} }] },
  { name: 'm-carve-left', spawn: 'east-piste', camera: 'third', steps: [{ seconds: 3.5, input: {} }, { seconds: 1.2, input: { steer: -0.8 } }] },
  { name: 'm-carve-right', spawn: 'east-piste', camera: 'third', steps: [{ seconds: 3.5, input: {} }, { seconds: 1.2, input: { steer: 0.8 } }] },
  { name: 'm-brake', spawn: 'east-piste', camera: 'third', steps: [{ seconds: 3.5, input: {} }, { seconds: 0.7, input: { brake: 1 } }] },
  { name: 'm-air', spawn: 'east-piste', camera: 'third', steps: [{ seconds: 3, input: {} }, { seconds: 0.45, input: { jump: true } }, { seconds: 0.35, input: {} }] },
  { name: 'm-shade', spawn: 'jump-valley', camera: 'third', steps: [{ seconds: 3, input: {} }, { seconds: 1, input: { steer: 0.7 } }] },
  { name: 'm-plateau', spawn: 'upper-bowl', camera: 'third', steps: [{ seconds: 4, input: { tuck: 1 } }] },
  { name: 'm-first-person', spawn: 'east-piste', camera: 'first', steps: [{ seconds: 3.5, input: {} }, { seconds: 1, input: { steer: 0.7 } }] },
];
