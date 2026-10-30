import { PEOPLE, SHEETS, applyCharacterPalette, type ArtSheets } from './pixel-assets';
import { createMap } from './maps';
import { paintWorld } from './world-art';
import type { Zone } from './types';
const canvas=(w:number,h:number)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const load=(url:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error(url));i.src=url;});
class PixelGallery {
 private images=new Map<string,HTMLCanvasElement|HTMLImageElement>();private urls=new Map<string,string>();private pending:Promise<void>|null=null;ready=false;
 load(){return this.pending??=this.prepare();}
 private async prepare(){
  await Promise.all([...PEOPLE.flatMap(id=>['walk','face'].map(kind=>[id+':'+kind,`./assets/people/${id}-${kind}.png`])),['bramble:face','./assets/people/bramble-face.png'],...SHEETS.map(name=>[name,`./assets/tiles/${name}.png`]),['bramble','./assets/enemies/bramble.png'],['demon','./assets/enemies/demon.png'],...['slash','heal','shield','burst'].map(id=>['effect:'+id,`./assets/fx/${id}.png`])].map(async([key,url])=>{
   const im=await load(url);if(key.includes(':')){const c=canvas(im.width,im.height);c.getContext('2d')!.drawImage(im,0,0);applyCharacterPalette(c,key.split(':')[0]);this.images.set(key,c);}else this.images.set(key,im);
  }));this.ready=true;
 }
 private data(key:string,make:()=>HTMLCanvasElement){if(!this.urls.has(key))this.urls.set(key,make().toDataURL());return this.urls.get(key)!;}
 face(id:string){if(!this.ready)return `./assets/people/${id}-face.png`;return this.data('face:'+id,()=>this.images.get(id+':face') as HTMLCanvasElement);}
 actor(id:string,facing=0,phase=0){return this.data(`actor:${id}:${facing}:${phase}`,()=>{const c=canvas(16,16);c.getContext('2d')!.drawImage(this.images.get(id+':walk')!,facing*16,phase*16,16,16,0,0,16,16);return c;});}
 enemy(id:string){if(!['bramble','demon'].includes(id))return this.actor(id);return this.data('enemy:'+id,()=>{const size=id==='bramble'?62:50,c=canvas(size,size);c.getContext('2d')!.drawImage(this.images.get(id)!,0,0,size,size,0,0,size,size);return c;});}
 effect(kind:string){const key=kind==='slash'?'slash':kind==='shield'?'shield':kind==='resonate'?'burst':'heal';const image=this.images.get('effect:'+key)!;const frameWidth=key==='shield'?24:key==='burst'?40:32;return {image,frameWidth,height:image.height,frames:image.width/frameWidth};}
 battle(zone:Zone){return this.data('battle:'+zone,()=>{
  const m=createMap(zone),sheets=Object.fromEntries(SHEETS.map(name=>[name,this.images.get(name)!])) as ArtSheets,p=paintWorld(m,sheets),world=canvas(m.width*16,m.height*16),g=world.getContext('2d')!;g.imageSmoothingEnabled=false;g.drawImage(p.ground,0,0);for(const prop of [...p.props].sort((a,b)=>a.depth-b.depth))g.drawImage(prop.canvas,prop.x,prop.y);
  const c=canvas(384,216),ctx=c.getContext('2d')!;ctx.imageSmoothingEnabled=false;ctx.drawImage(world,184,zone==='forest'?190:75,384,216,0,0,384,216);return c;
 });}
}
export const PIXELS=new PixelGallery();
