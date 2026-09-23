import { SOUND_SPEED, passedCount } from './milestones.js';
import { MAX_SPEED, advanceSpeed, lorentzFactor } from './physics.js';
export function createRun() { return {phase:'playing',speed:0,peak:0,elapsed:0,earthSeconds:0,passed:0,boomed:false,boom:false}; }
export function tick(run,pressed,seconds) {
  if(run.phase!=='playing')return run;
  const dt=Math.max(0,Math.min(1/30,Number.isFinite(seconds)?seconds:0)),speed=advanceSpeed(run.speed,pressed,dt),peak=Math.max(run.peak,speed),boom=!run.boomed&&speed>=SOUND_SPEED;
  return {...run,speed,peak,elapsed:run.elapsed+dt,earthSeconds:run.earthSeconds+(lorentzFactor(run.speed)+lorentzFactor(speed))*.5*dt,passed:passedCount(peak),boomed:run.boomed||boom,boom,phase:speed>=MAX_SPEED?'result':'playing'};
}
