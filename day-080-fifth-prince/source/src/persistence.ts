import { STORY_FLAGS, validateStoryState } from './story';
import { DISCOVERIES } from './exploration';
import { BROTHERS } from './content';
import { freshState } from './state';
import type { Ally, GameState, Item, Zone } from './types';
export const SAVE_KEY='fifth-prince.save.v1';
const BACKUP=SAVE_KEY+'.backup';
export interface StorageLike { getItem(key:string):string|null; setItem(key:string,value:string):void }
export interface LoadResult { state:GameState|null; warning:string; status:'empty'|'ok'|'recovered'|'invalid'|'unavailable' }
const integer=(v:unknown,max=1e8):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
const listOf=(v:unknown,check:(x:unknown)=>boolean):v is string[]=>Array.isArray(v)&&v.length<100&&new Set(v).size===v.length&&v.every(check);
export function validateSave(raw:unknown):GameState|null {
 if(typeof raw!=='object'||raw===null)return null;
 const d=raw as Record<string,unknown>;
 if(d.version!==1||!['town','forest','palace','abyss'].includes(String(d.zone)))return null;
 if(!['gold','xp','trust','profit','playSeconds'].every(k=>integer(d[k])))return null;
 if(typeof d.weapon!=='boolean'||d.battle!==null)return null;
 const i=d.inventory as Record<string,unknown>|null;const p=d.position as Record<string,unknown>|null;
 if(!i||!p||!['wheat','herb','crystal','potion'].every(k=>integer(i[k],99999)))return null;
 if(!['x','y'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k])&&(p[k] as number)>=0&&(p[k] as number)<768))return null;
 const flags=[...STORY_FLAGS,'intro','bread','medicine','bramble','promoted','awakened','ended','ending:seen',...Array.from({length:6},(_,n)=>'gather:herb'+(n+1)),...Object.keys(DISCOVERIES).map(id=>'found:'+id)];
 if(!listOf(d.flags,x=>typeof x==='string'&&flags.includes(x)))return null;
 if(!listOf(d.party,x=>['nora','mira','toma'].includes(String(x)))||!listOf(d.brothers,x=>BROTHERS.includes(x as typeof BROTHERS[number])))return null;
 const f=d.flags as string[],party=d.party as string[],brothers=d.brothers as string[];
 if((f.includes('bread')!==party.includes('nora'))||(f.includes('medicine')!==party.includes('mira'))||(f.includes('bramble')!==party.includes('toma')))return null;
 if(f.includes('promoted')&&(!f.includes('bramble')||(d.trust as number)<30||(d.profit as number)<24))return null;
 if(brothers.length&&!f.includes('promoted'))return null;
 if(f.includes('awakened')&&brothers.length!==4)return null;
 if(f.includes('ended')&&!f.includes('awakened'))return null;
 if(f.includes('ending:seen')&&!f.includes('ended'))return null;
 if(d.zone==='abyss'&&!f.includes('awakened'))return null;
 if(!validateStoryState(d as unknown as GameState))return null;
 return {...freshState(),version:1,zone:d.zone as Zone,position:{x:p.x as number,y:p.y as number},gold:d.gold as number,xp:d.xp as number,trust:d.trust as number,profit:d.profit as number,playSeconds:d.playSeconds as number,inventory:i as Record<Item,number>,flags:f,party:party as Ally[],brothers:brothers as GameState['brothers'],weapon:d.weapon,battle:null};
}
export function saveGame(storage:StorageLike,state:GameState):{ok:boolean;message:string}{
 // A final victory resumes at the ending, while the live battle remains on screen.
 const finalVictory=state.battle?.enemy==='demon'&&state.battle.result==='won'&&state.flags.includes('ended');
 const snapshot=finalVictory?{...state,battle:null}:state;
 if(snapshot.battle)return {ok:false,message:'戦闘が終わると自動保存します。'};
 try{
 const data=JSON.stringify(snapshot);if(!validateSave(JSON.parse(data)))return {ok:false,message:'保存データの検査に失敗しました。以前の記録は残っています。'};
 const old=storage.getItem(SAVE_KEY);if(old){try{if(validateSave(JSON.parse(old)))storage.setItem(BACKUP,old);}catch{/* Keep the prior good backup. */}}
 storage.setItem(SAVE_KEY,data);return {ok:true,message:'冒険を記録しました。'};
 }catch{return {ok:false,message:'このブラウザでは保存できません。保存設定・空き容量を確認してください。プレイは続けられます。'};}
}
export function loadGame(storage:StorageLike):LoadResult{
 try{
 const raw=storage.getItem(SAVE_KEY);if(raw===null)return {state:null,status:'empty',warning:''};
 try{const state=validateSave(JSON.parse(raw));if(state)return {state,status:'ok',warning:''};}catch{/* Try backup below. */}
 const backup=storage.getItem(BACKUP);if(backup){try{const state=validateSave(JSON.parse(backup));if(state)return {state,status:'recovered',warning:'直前の記録を読み込めなかったため、バックアップから復元しました。'};}catch{/* Invalid backup. */}}
 return {state:null,status:'invalid',warning:'冒険の記録を読み込めませんでした。「はじめから」で新しい冒険を開始できます。元の記録は上書きしていません。'};
 }catch{return {state:null,status:'unavailable',warning:'保存機能を利用できません。セーブなしで遊べます。'};}
}
