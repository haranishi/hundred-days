const phase = (id, colors, cloud, window, pole, stars, night) => Object.freeze({
  id, colors: Object.freeze(colors), cloud, window, pole, stars, night,
});

export const SKY_PHASES = Object.freeze([
  phase('evening', ['#3b3576', '#7a5ea6', '#c77aa0', '#f3a07e', '#fcd39a'], '#ffd6de', '#ffd27a', '#ecdcbc', 0, 0),
  phase('night', ['#25254f', '#464574', '#70658c', '#9b829e', '#c1a4b3'], '#adb9df', '#ffe8a0', '#f7e8cd', 0.25, 1),
  phase('starry', ['#1e244b', '#3e4774', '#66678d', '#8982a5', '#b3a3bb'], '#b8c5e5', '#fff0b8', '#f7e8cd', 1, 1),
  phase('dawn', ['#55528d', '#8c80b4', '#c59dbb', '#efb9ac', '#ffe0b0'], '#ffe4e4', '#d9b38e', '#ecdcbc', 0.12, 0),
]);

export function skyForScore(score) {
  return SKY_PHASES[Math.floor(Math.max(0, score) / 10) % SKY_PHASES.length];
}
