export const WORLDS = Object.freeze([
  {id:'farm',name:'牧場',limit:100,news:'県道を北上中、近隣住民は注意を'},
  {id:'city',name:'街',limit:1000,news:'猫の通過で信号機が二度見しています'},
  {id:'sky',name:'空',limit:10000,news:'自衛隊が出動。目標はどう見ても猫'},
  {id:'orbit',name:'軌道',limit:100000,news:'大気圏を離脱。帰宅の意思は不明'},
  {id:'solar',name:'太陽系',limit:1000000,news:'太陽系を北上中。「北」の定義を再検討'},
  {id:'interstellar',name:'星間',limit:Infinity,news:'宇宙の構造に影響との見解。猫は無言'}
]);
export function worldAt(speed) { return WORLDS.find(w=>speed<w.limit)||WORLDS.at(-1); }
export function bulletinAt(speed) { return speed>=692000&&speed<1000000?'観測史上、最速の猫。観測者は困惑':worldAt(speed).news; }
