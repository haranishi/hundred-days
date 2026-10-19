export const SPECS = [
  { id: 'c1', name: '玄関の紳士', distance: 260, lampX: 150, ly: 99, lampStart: 150,
    props: [ { id: 'rack', shape: 'coatRack', k: 1.6, ss: 0.9, target: { x: 120, y: 86 } } ] },
  { id: 'c2', name: '宙に浮く帽子', distance: 240, lampX: 110, ly: 96, lampStart: 45,
    props: [
      { id: 'coat', shape: 'coat', k: 1.5, ss: 0.8, target: { x: 120, y: 86 } },
      { id: 'hat', shape: 'hat', k: 2.3, ss: 0.95, target: { x: 120, y: 138 } } ] },
  { id: 'c3', name: '鞄を提げた男', distance: 280, lampX: 120, ly: 102, lampStart: 150,
    props: [
      { id: 'hat', shape: 'hat', k: 2.2, ss: 1.0, target: { x: 120, y: 158 }, movable: true, startX: 30 },
      { id: 'coat', shape: 'coat', k: 1.7, ss: 0.82, target: { x: 120, y: 108 }, movable: true, startX: 205 },
      { id: 'bag', shape: 'bag', k: 1.3, ss: 1.15, target: { x: 84, y: 72 }, movable: true, startX: 70 } ] },
  { id: 'c4', name: '座る影', distance: 250, lampX: 140, ly: 125, lampStart: 60,
    props: [
      { id: 'chair', shape: 'armchair', k: 1.4, ss: 0.8, target: { x: 118, y: 55 }, movable: true, startX: 195 },
      { id: 'coat', shape: 'coat', k: 1.7, ss: 0.7, target: { x: 116, y: 100 }, movable: true, startX: 40 },
      { id: 'hat', shape: 'hat', k: 2.2, ss: 0.9, target: { x: 116, y: 145 }, movable: true, startX: 215 } ] },
  { id: 'c5', name: '傘の人', distance: 300, lampX: 120, ly: 108, lampStart: 50, threshold: { union: 0.84, part: 0.6, decoyArea: 0.05, near: 0.7, warm: 0.5 },
    props: [
      { id: 'umbrella', shape: 'umbrellaOpen', k: 1.9, ss: 0.9, target: { x: 120, y: 146 }, movable: true, startX: 40 },
      { id: 'coat', shape: 'longCoat', k: 1.5, ss: 0.78, target: { x: 120, y: 85 }, movable: true, startX: 200 },
      { id: 'boots', shape: 'boots', k: 1.25, ss: 0.8, target: { x: 120, y: 16 }, movable: true, startX: 80 },
      { id: 'bowler', shape: 'bowler', k: 2.0, ss: 0.9, y: 118, park: 10, decoy: true, startX: 140 },
      { id: 'globe', shape: 'globe', k: 1.6, ss: 0.85, y: 78, park: 230, decoy: true, startX: 100 } ] },
];
