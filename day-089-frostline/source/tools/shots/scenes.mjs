/** 出発地点の名前は開発用の仮滑走に合わせた既定値。--scenes で実際の山の定義を渡せる。 */
export default [
  { name: 'start', spawn: 'summit', camera: 'third', steps: [{ seconds: 0, input: {} }] },
  { name: 'turn', spawn: 'summit', camera: 'third', steps: [
    { seconds: 3, input: { tuck: 1 } }, { seconds: 1, input: { steer: .65, tuck: 1 } },
  ] },
  { name: 'jump', spawn: 'summit', camera: 'third', steps: [
    { seconds: 3, input: { tuck: 1 } }, { seconds: .25, input: { jump: true } },
  ] },
];
