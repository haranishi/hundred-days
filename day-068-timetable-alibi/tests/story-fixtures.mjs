import {newEpisode,advanceEpisode as step} from '../lib/episode-state.js';
export function actOne(){
 let s=newEpisode();
 const events=[{type:'opening-choice',value:'promise'},{type:'begin'},{type:'read-message'},{type:'heard-witness'},{type:'inspect-camera'},{type:'inspect-board'},{type:'record-express'},{type:'present',selected:['photo','express'],reason:'no-stop'},{type:'trust-choice',value:'ticket'},{type:'receive-key'},{type:'enter-platform'},{type:'find-toru'},{type:'reunion-choice',value:'warm'},{type:'finish'}];
 for(const e of events)s=step(s,e);
 return s;
}
export function continuationSeed(photoChoice='keep',route='escort'){
 let s=actOne();for(const e of [{type:'continue-story'},{type:'photo-decision',value:photoChoice},{type:'choose-route',value:route}])s=step(s,e);return s;
}
