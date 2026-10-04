export const FRUITS = [
  {n:'ブルーベリー',r:15,c:'#636FCB',l:'#A6B8F5',d:'#303B82',k:'blueberry'},
  {n:'さくらんぼ',r:20,c:'#D94058',l:'#FF96A4',d:'#882238',k:'cherry'},
  {n:'すもも',r:27,c:'#A54378',l:'#ED95BC',d:'#662750',k:'plum'},
  {n:'みかん',r:34,c:'#F49B30',l:'#FFD383',d:'#AF611A',k:'mandarin'},
  {n:'キウイ',r:41,c:'#96B857',l:'#DBE99B',d:'#586D31',k:'kiwi'},
  {n:'りんご',r:48,c:'#D94A3D',l:'#FFAA89',d:'#852B25',k:'apple'},
  {n:'もも',r:56,c:'#E8A3B2',l:'#FFE0D9',d:'#B76A87',k:'peach'},
  {n:'パイナップル',r:64,c:'#EBC34D',l:'#FFF0A6',d:'#A5832C',k:'pineapple'},
  {n:'メロン',r:71,c:'#94BD73',l:'#D4E9A7',d:'#557D4C',k:'melon'},
  {n:'スイカ',r:79,c:'#388460',l:'#83BD82',d:'#225B43',k:'watermelon'}
];
export const SCORES = [0,4,9,18,32,55,90,140,215,320];
export const TOP = FRUITS.length - 1;
export function clampAim(x, radius, left = 14, right = 406) {
  return Math.min(right - radius - 1, Math.max(left + radius + 1, x));
}
export function canConsumePair(a, b) {
  return Number.isInteger(a?.lv) && a.lv >= 0 && a.lv <= TOP &&
    a.lv === b?.lv && !a.dead && !b.dead;
}
export function mergeOutcome(level) {
  if (!Number.isInteger(level) || level < 0 || level > TOP) throw new RangeError('unknown fruit');
  return level === TOP ? {level:null,score:SCORES[TOP]*2} : {level:level+1,score:SCORES[level+1]};
}
export function advanceDanger({landed,age,top,previous}, dt) {
  return landed && age > 420 && top < 132 ? previous + dt : Math.max(0, previous - dt*2.2);
}
