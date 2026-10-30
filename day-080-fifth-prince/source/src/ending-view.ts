import type Phaser from 'phaser';
import {BROTHERS,CHARACTERS} from './content';
import type {EndingCue,SceneStaging} from './types';
export interface EndingActor {id:string;sprite:Phaser.GameObjects.Sprite;label:Phaser.GameObjects.Text;targetY:number;facing:number;seated?:boolean}
export class EndingView {
 private played=new Set<EndingCue>();private cue:EndingCue|null=null;private busy=false;private disposed=false;private finishCue:(()=>void)|null=null;private unwatch:(()=>void)|null=null;
 private bars:Phaser.GameObjects.Rectangle[]=[];private glow:Phaser.GameObjects.Rectangle|null=null;private sword:Phaser.GameObjects.Graphics|null=null;private breads:Phaser.GameObjects.Graphics[]=[];
 private plates:{x:number;y:number}[]=[];private links:Phaser.GameObjects.Graphics|null=null;private gateOpen=false;private served=0;private gift:Phaser.GameObjects.Graphics|null=null;
 private reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 constructor(private scene:Phaser.Scene,private stage:SceneStaging,private cast:EndingActor[],private track:(...items:Phaser.GameObjects.GameObject[])=>void){
  if(stage.ending==='release')this.prepareGate();if(stage.ending==='supper')this.prepareTable();
  if(!this.reduced)scene.cameras.main.fadeIn(220,8,13,28);
 }
 private keep<T extends Phaser.GameObjects.GameObject>(item:T):T{this.track(item);return item;}
 private graphic(x:number,y:number,depth:number){return this.keep(this.scene.add.graphics().setPosition(x,y).setDepth(depth));}
 private prepareGate(){
  const g=this.graphic(344,144,193);g.fillStyle(0x211c35).fillRect(0,0,64,48);g.fillStyle(0x9a8aa7).fillRect(0,0,64,5).fillRect(0,0,6,48).fillRect(58,0,6,48);g.fillStyle(0xc8b69b).fillRect(6,5,52,3).fillRect(6,44,52,4);
  this.glow=this.keep(this.scene.add.rectangle(376,170,50,34,0xf8daa4,1).setAlpha(.05).setDepth(194));
  for(const x of [356,366,376,386,396])this.bars.push(this.keep(this.scene.add.rectangle(x,155,3,34,0x6c587d).setOrigin(.5,0).setDepth(196)));
  const demon=this.cast.find(a=>a.id==='demon');if(demon){this.sword=this.graphic(demon.sprite.x+8,demon.sprite.y-12,210);this.sword.fillStyle(0xddd8c0).fillRect(-1,-7,2,10);this.sword.fillStyle(0xb88a55).fillRect(-4,3,8,2).fillRect(-1,5,2,4);}
 }
 private prepareTable(){
  const t=this.stage.table!;this.plates=[{x:t.x+12,y:t.y+4},{x:t.x+48,y:t.y+4},{x:t.x+84,y:t.y+4},{x:t.x+32,y:t.y+8},{x:t.x+64,y:t.y+8}];
  for(const a of this.cast){const chair=this.graphic(a.sprite.x,a.id==='lyca'?304:a.targetY,a.targetY-1);chair.fillStyle(0x583d32).fillRect(-6,-10,12,4).fillRect(-6,-6,2,14).fillRect(4,-6,2,14);chair.fillStyle(0xa57c52).fillRect(-5,0,10,5);}
  for(const p of this.plates){const g=this.graphic(p.x,p.y,t.y+9);g.fillStyle(0xabc4cc).fillRect(-6,-2,12,5);g.fillStyle(0xe9e4cb).fillRect(-5,-3,10,5).fillRect(-3,2,6,1);}
 }
 private bread(x:number,y:number){const g=this.graphic(x,y,500);g.fillStyle(0x7b452d).fillRect(-5,-2,10,5).fillRect(-4,-3,8,7);g.fillStyle(0xd49a55).fillRect(-4,-2,8,5);g.fillStyle(0xf3d198).fillRect(-3,-2,2,2).fillRect(1,-1,2,2);return g;}
 play(cue:EndingCue):Promise<void>{
  if(this.played.has(cue)||this.disposed)return Promise.resolve();this.played.add(cue);this.cue=cue;this.busy=true;
  if(this.reduced){this.complete(cue);this.busy=false;return Promise.resolve();}
  return new Promise(resolve=>{
   const finish=()=>{this.unwatch?.();this.unwatch=null;if(!this.disposed)this.complete(cue);this.busy=false;this.finishCue=null;resolve();};this.finishCue=finish;
   if(cue==='royal'||cue==='welcome'){
    const arrived=()=>{this.unwatch?.();this.unwatch=null;if(cue==='royal'||this.disposed){finish();return;}const child=this.cast.find(a=>a.id==='citizen1')!,hero=this.cast.find(a=>a.id==='lyca')!;this.gift=this.bread(child.sprite.x,child.sprite.y-11);this.scene.tweens.add({targets:this.gift,x:hero.sprite.x,y:hero.sprite.y-9,duration:500,ease:'Sine.easeInOut'});this.scene.time.delayedCall(550,finish);};
    const tick=()=>{if(this.disposed||this.cast.every(a=>Math.abs(a.sprite.y-a.targetY)<.6))arrived();};this.scene.events.on('postupdate',tick);this.unwatch=()=>this.scene.events.off('postupdate',tick);tick();return;
   }
   if(cue==='release')this.release();else this.serve();
   this.scene.time.delayedCall(cue==='release'?1300:1250,finish);
  });
 }
 private release(){
  const hero=this.cast.find(a=>a.id==='lyca')!;const lines=this.graphic(0,0,450);this.links=lines;lines.lineStyle(1,0xe5cf9b,.75);
  for(const [i,id] of [...BROTHERS,'lyca'].entries()){const a=this.cast.find(a=>a.id===id)!;lines.lineBetween(a.sprite.x,a.sprite.y-8,hero.sprite.x,hero.sprite.y-8);const light=this.keep(this.scene.add.rectangle(a.sprite.x,a.sprite.y-8,4,4,PhaserColor(CHARACTERS[id].color)).setDepth(490));this.scene.tweens.add({targets:light,x:hero.sprite.x,y:hero.sprite.y-8,duration:400,delay:i*50,ease:'Sine.easeInOut',onComplete:()=>light.setVisible(false)});}
  if(this.sword)this.scene.tweens.add({targets:this.sword,y:this.sword.y+13,angle:80,duration:500,ease:'Quad.easeIn'});
  const demon=this.cast.find(a=>a.id==='demon')!;this.scene.tweens.add({targets:demon.sprite,alpha:.3,duration:700});this.scene.tweens.add({targets:demon.label,alpha:.3,duration:700});
  this.scene.time.delayedCall(650,()=>{if(this.disposed)return;const light=this.keep(this.scene.add.rectangle(hero.sprite.x,hero.sprite.y-8,7,7,0xf8dfa0).setDepth(490));this.scene.tweens.add({targets:light,x:376,y:170,duration:380,ease:'Sine.easeIn',onComplete:()=>light.setVisible(false)});for(const bar of this.bars)this.scene.tweens.add({targets:bar,y:bar.y-28,alpha:0,duration:400});if(this.glow)this.scene.tweens.add({targets:this.glow,alpha:.8,duration:500});});
 }
 private serve(){
  const hero=this.cast.find(a=>a.id==='lyca')!;
  for(const a of this.cast){a.label.setVisible(false);a.targetY=a.id==='lyca'?304:a.id==='grove'?302:a.targetY+2;}
  for(const [i,p] of this.plates.entries()){const bread=this.bread(hero.sprite.x,hero.sprite.y-12);this.breads.push(bread);bread.setAlpha(0);this.scene.tweens.add({targets:bread,x:p.x,y:p.y-1,alpha:1,duration:450,delay:120+i*120,ease:'Sine.easeInOut',onComplete:()=>{this.served=Math.max(this.served,i+1);bread.setDepth(this.stage.table!.y+10);}});}
 }
 private complete(cue:EndingCue){
  if(cue==='release'){this.links?.setVisible(false);this.bars.forEach(b=>b.setVisible(false));this.glow?.setAlpha(.8);this.cast.find(a=>a.id==='demon')?.sprite.setAlpha(.3);if(this.sword)this.sword.setY(208).setAngle(80);this.gateOpen=true;const path=this.graphic(0,0,192);path.fillStyle(0xf0d38c,.7);for(let y=202;y<250;y+=8)path.fillRect(374,y,4,3);}
  if(cue==='royal'||cue==='welcome')for(const a of this.cast)a.sprite.setY(a.targetY);
  if(cue==='welcome'){const hero=this.cast.find(a=>a.id==='lyca')!;this.gift??=this.bread(hero.sprite.x,hero.sprite.y-9);this.gift.setPosition(hero.sprite.x,hero.sprite.y-9);}
  if(cue==='serve'){
   for(const a of this.cast)a.label.setVisible(false);
   if(!this.breads.length)for(const p of this.plates)this.breads.push(this.bread(p.x,p.y-1).setDepth(this.stage.table!.y+10));
   this.served=5;for(const a of this.cast){if(this.reduced)a.targetY=a.id==='lyca'?304:a.id==='grove'?302:a.targetY+2;a.sprite.setY(a.targetY);a.seated=true;}
  }
 }
 snapshot(){return {cue:this.cue,busy:this.busy,gateOpen:this.gateOpen,served:this.served,seated:this.cast.filter(a=>a.seated).length};}
 dispose(){this.disposed=true;this.finishCue?.();this.unwatch?.();this.unwatch=null;}
}
const PhaserColor=(hex:string)=>Number.parseInt(hex.slice(1),16);
