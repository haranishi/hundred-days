import { LIGHT_SPEED } from './milestones.js';
export const FINISH_RATIO = .99999, MAX_SPEED = LIGHT_SPEED * FINISH_RATIO;
const finite = n => Number.isFinite(n) ? n : 0;
export function lorentzFactor(speed) {
  const ratio = Math.min(FINISH_RATIO,Math.max(0,finite(speed)/LIGHT_SPEED));
  return 1 / Math.sqrt((1-ratio)*(1+ratio));
}
export function advanceSpeed(speed,pressed,seconds) {
  const v=Math.min(MAX_SPEED,Math.max(0,finite(speed))),dt=Math.max(0,finite(seconds));
  if(dt===0)return v;
  if(!pressed)return Math.max(0,(v+.05)*Math.exp(-.7*dt)-.05);
  const transition=LIGHT_SPEED*.9, until=v<transition?Math.log((transition+.05)/(v+.05))/.32:0;
  if(dt<until)return Math.min(MAX_SPEED,(v+.05)*Math.exp(.32*dt)-.05);
  const base=Math.max(v,transition);
  return Math.min(MAX_SPEED,LIGHT_SPEED-(LIGHT_SPEED-base)*Math.exp(-.55*(dt-until)));
}
