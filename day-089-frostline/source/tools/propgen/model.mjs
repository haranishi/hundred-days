import {building} from './buildings.mjs';
import {bridge,fence,tower,chair,station} from './structures.mjs';
import {fir,boulder} from './nature.mjs';
export function buildProps({revision=4,buildingRound=5}={}){
 return [...['lodge','chalet-a','chalet-b','chalet-c'].map(n=>building(n,buildingRound)),bridge(revision),tower(revision),chair(revision),station(revision),fence(),...[0,1,2].flatMap(v=>['near','mid','far'].map(l=>fir(v,l,revision))),boulder(0,revision),boulder(1,revision)];
}
