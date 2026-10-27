import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAudio} from '../lib/audio.js';
function fixture(){
  const events=new Map();let created=0,notes=0;
  const context={state:'suspended',currentTime:0,destination:{},async resume(){this.state='running';},async suspend(){this.state='suspended';},
    createOscillator(){return {frequency:{value:0},connect(){},start(){notes++;},stop(){}};},
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}};
  const document={hidden:false,addEventListener(name,fn){events.set(name,fn);},removeEventListener(name){events.delete(name);}};
  const env={document,AudioContext:class{constructor(){created++;return context;}}};
  return {env,context,events,counts:()=>[created,notes]};
}
test('初期は無音・保存した音設定でも操作前に作らず、操作で再開し4種を鳴らす',()=>{
  const f=fixture(),audio=createAudio(f.env);
  audio.unlock();audio.play('human');assert.deepEqual(f.counts(),[0,0]);
  audio.setEnabled(true);assert.deepEqual(f.counts(),[0,0]);
  audio.unlock();for(const sound of ['human','cpu','win','lose'])audio.play(sound);
  assert.deepEqual(f.counts(),[1,7]);
});
test('非表示で休止し、素早い復帰でも最新の可視状態に追従',async()=>{
  const f=fixture(),audio=createAudio(f.env);audio.setEnabled(true);audio.unlock();
  f.env.document.hidden=true;f.events.get('visibilitychange')();
  await new Promise(resolve=>setImmediate(resolve));assert.equal(f.context.state,'suspended');
  audio.play('human');assert.deepEqual(f.counts(),[1,0]);
  f.env.document.hidden=false;f.events.get('visibilitychange')();
  await new Promise(resolve=>setImmediate(resolve));assert.equal(f.context.state,'running');
  audio.setEnabled(false);await new Promise(resolve=>setImmediate(resolve));assert.equal(f.context.state,'suspended');
  audio.dispose();assert.equal(f.events.size,0);
});
test('Web Audio非対応でも遊びを止めない',()=>{
  const f=fixture();delete f.env.AudioContext;const audio=createAudio(f.env);
  audio.setEnabled(true);assert.doesNotThrow(()=>{audio.unlock();audio.play('win');audio.dispose();});
});
