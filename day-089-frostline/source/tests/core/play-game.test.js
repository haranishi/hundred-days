import { it, expect } from 'vitest';
import { createGame } from '../../src/game.js';
import { createFakeRide } from '../../src/dev/fake-ride.js';
import { createInput } from '../../src/input/index.js';
import { createSettings } from '../../src/core/settings.js';
import { createPlay } from '../../src/play/index.js';
import { mountain } from '../play/fixture.js';
async function fixture({start=true,legacy=false}={}) {
  const world=legacy?{drops:mountain().drops.slice(0,2)}:mountain(), ride=createFakeRide();
  ride.reset({...world.drops[0],speed:3});
  let steps=0, mode='rest',speed=0,position={x:0,y:500,z:0};
  ride.step=()=>{steps++;ride.events.length=0;Object.assign(ride.state,{mode,speed});Object.assign(ride.state.pos,position);};
  const target=new EventTarget(),input=createInput({target,getGamepads:()=>[]}),screens=[];let handlers;
  const game=createGame({world,ride,input,play:createPlay({world,storage:null}),settings:createSettings({storage:null}),
    ui:{show:s=>screens.push(s),setHandlers:h=>{handlers=h;}},debug:{enabled:true,target}});
  await game.ready;const api=target.__ginrei;api.setManual(true);if(start)await game.start();
  return {game,api,ride,handlers,screens,target,get steps(){return steps;},place(p,v=0,m='rest'){position=p;speed=v;mode=m;}};
}
it('要件1 駅→記録→おすすめ1操作→次の一本。記録中の残り刻みは物理を進めない',async()=>{
  const f=await fixture();f.place({x:0,y:300,z:500},5);f.api.advance(1);
  expect(f.api.play().stage).toBe('summary');expect(f.steps).toBe(1);expect(f.screens.at(-1)).toBe('summary');
  const next=f.api.play().summary.next;f.handlers.next(next.id);expect(f.api.play()).toMatchObject({stage:'ride',current:{id:next.id},summary:null});
  expect(f.api.state().pos.x).toBe(next.x);expect(f.api.state().speed).toBe(3);f.game.dispose();
});
it('要件4 題字・一時停止・滑走・記録から地図へ開き、それぞれへ戻る',async()=>{
  const f=await fixture({start:false});
  const roundtrip=stage=>{f.handlers.map();expect(f.api.play().stage).toBe('map');const n=f.steps;f.api.advance(1);expect(f.steps).toBe(n);f.handlers.closeMap();expect(f.api.play().stage).toBe(stage);};
  roundtrip('title');await f.game.start();roundtrip('ride');f.game.pause();roundtrip('pause');f.game.resume();
  f.place({x:0,y:300,z:500},5);f.api.advance(.1);roundtrip('summary');f.game.dispose();
});
it('要件1/4 地図から移動は累計だけ残す。鍵・非表示地点は選べない',async()=>{
  const f=await fixture();f.place({x:0,y:450,z:100},10);f.api.advance(1);f.handlers.map();
  f.handlers.next('d13');expect(f.api.play().stage).toBe('map');f.handlers.next('d9');expect(f.api.play().stage).toBe('map');
  f.handlers.next('d1');expect(f.api.play()).toMatchObject({stage:'ride',summary:null,run:{distance:0},progress:{totals:{runs:1}}});f.game.dispose();
});
it('要件5 Rで仕掛け手前へ速さ付きで戻る。Eは物理のsafeを使う',async()=>{
  const f=await fixture();f.place({x:50,y:490,z:50},12);f.api.advance(.1);f.game.respawn('drop');
  expect(f.api.state().pos).toMatchObject({x:50,z:90});expect(f.api.state().speed).toBe(12);expect(f.api.play().current.id).toBe('d0');
  const original=f.ride.respawn;let called;f.ride.respawn=k=>{called=k;original(k);};f.game.respawn('safe');expect(called).toBe('safe');f.game.dispose();
});
it('要件1/6 旧山では停止→Enterで区切る、空中や転倒では区切らない',async()=>{
  const f=await fixture({legacy:true});const key=code=>{const e=new Event('keydown',{cancelable:true});Object.assign(e,{code});f.target.dispatchEvent(e);const up=new Event('keyup');Object.assign(up,{code});f.target.dispatchEvent(up);};
  f.place({x:0,y:400,z:100},0,'air');f.api.advance(4);key('Enter');f.api.advance(0);expect(f.api.play().stage).toBe('ride');
  f.place({x:0,y:400,z:100});f.api.advance(3);key('Enter');f.api.advance(0);expect(f.api.play().stage).toBe('summary');
  f.handlers.again('d0');expect(f.api.play().stage).toBe('ride');const c=f.api.play();c.map.drops.length=0;expect(f.api.play().map.drops.length).toBeGreaterThan(0);f.game.dispose();
});
it('Mは地図の開閉で一度だけ働く',async()=>{
  const f=await fixture();const event=type=>{const e=new Event(type,{cancelable:true});Object.assign(e,{code:'KeyM'});f.target.dispatchEvent(e);};
  event('keydown');f.api.advance(0);expect(f.api.play().stage).toBe('map');event('keyup');event('keydown');f.api.advance(0);expect(f.api.play().stage).toBe('ride');f.game.dispose();
});
