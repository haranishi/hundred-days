import type Phaser from 'phaser';
export const PEOPLE=['lyca','flame','tide','grove','storm','nora','mira','toma','merchant','inn','king','sage','demon','citizen1','citizen2','guard'];
export const SHEETS=['TilesetFloor','TilesetFloorDetail','TilesetField','TilesetHouse','TilesetNature','TilesetElement','TilesetWater','TilesetRelief','TilesetDungeon','TilesetInterior','TilesetInteriorFloor','TilesetWallSimple'];
export type ArtSheets=Record<string,CanvasImageSource>;
export function preloadPixels(scene:Phaser.Scene){
 for(const id of PEOPLE)scene.load.image('walk-source:'+id,`./assets/people/${id}-walk.png`);
 for(const name of SHEETS)scene.load.image(name,`./assets/tiles/${name}.png`);
 scene.load.spritesheet('enemy:bramble','./assets/enemies/bramble.png',{frameWidth:62,frameHeight:62});
 scene.load.spritesheet('enemy:demon','./assets/enemies/demon.png',{frameWidth:50,frameHeight:50});
 for(const [id,size] of [['slash',32],['fire',32],['water',32],['plant',32],['thunder',32],['heal',32],['shield',32],['burst',32]] as const){if(id==='fire')scene.load.spritesheet('fx:'+id,`./assets/fx/${id}.png`,{frameWidth:20,frameHeight:30});else scene.load.image('fx:'+id,`./assets/fx/${id}.png`);}
}
export function getSheets(scene:Phaser.Scene):ArtSheets{return Object.fromEntries(SHEETS.map(key=>[key,scene.textures.get(key).getSourceImage() as CanvasImageSource]));}

// Character customization at import: palette roles identify each prince and companion.
// Keep the CC0 source frames, alpha, timing and silhouettes intact.
const PALETTES:Record<string,Record<number,number>>={
 lyca:{0xd14b34:0x91613e,0x965340:0x543c2e,0xef914f:0xedb887,0x548789:0xc79e50,0xe3f1f5:0xf3e7c9},
 flame:{0xf1c471:0xaa4634,0xd78b4a:0x783829,0xe3f1f5:0xd0ab62,0x8f3e56:0x652a2a,0xe0394c:0xa63d2d,0xef914f:0xe8aa7d,0xd14b34:0x9e5d44},
 tide:{0x3b3643:0x172b3c,0x4e484a:0x2b455a,0xef914f:0xe5b58c,0xd14b34:0x9b6c55,0x548789:0x385678,0x79b8ce:0xa3bfd0,0x9ba7aa:0xc6ced0},
 grove:{0xd14b34:0x725036,0x8f3e56:0x3d3027,0xfce2ca:0xd6c293,0xc8966b:0xb5946b,0xef914f:0xe2b88f,0x4a5270:0x456048,0x548789:0x69825c},
 storm:{0x8f3e56:0x71637f,0xe0394c:0xb7a8c6,0x4e484a:0x40324f,0x5f7160:0x74628d,0xf2ad7d:0xedbd9d,0xcf736d:0xb77c68,0xe3f1f5:0xead99a,0x9ba7aa:0xb59f6b},
 nora:{0xf1c471:0xf0e3c9,0xd78b4a:0xc8b897,0xef914f:0xecb98f,0xd14b34:0x965e35,0x8f3e56:0x703c2e,0xe0394c:0xb06b44,0x8d977f:0xe9dbc0,0xabc2bc:0xf5ead2},
 mira:{0x3b3643:0x253d2d,0x4e484a:0x3c5640,0xa3754e:0xd8ab80,0xd78b4a:0xbda96d,0xf1c471:0xe9d19a,0x965340:0x8d684b,0x8d977f:0x70805a,0xe0394c:0xdfd3a3,0xabc2bc:0xd7cda1},
 toma:{0xf1c471:0x76533a,0xd78b4a:0x503b2b,0xe3f1f5:0x79553a,0x9ba7aa:0x9c7954,0x3b3643:0x253a48,0x4e484a:0x2e3e49,0xef914f:0xd6a37d,0xd14b34:0x895c46}
};
export function createPeopleTextures(scene:Phaser.Scene){
 for(const id of PEOPLE){
  const source=scene.textures.get('walk-source:'+id).getSourceImage() as HTMLImageElement;
  const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
  const ctx=canvas.getContext('2d')!;ctx.drawImage(source,0,0);
  applyCharacterPalette(canvas,id);
  const texture=scene.textures.addCanvas('walk:'+id,canvas)!;
  scene.textures.addSpriteSheet('',texture,{frameWidth:16,frameHeight:16});
 }
}

export function applyCharacterPalette(canvas:HTMLCanvasElement,id:string){
 const palette=PALETTES[id];if(!palette)return;const ctx=canvas.getContext('2d')!,pixels=ctx.getImageData(0,0,canvas.width,canvas.height),d=pixels.data;
 for(let n=0;n<d.length;n+=4){if(!d[n+3])continue;const value=palette[(d[n]<<16)|(d[n+1]<<8)|d[n+2]];if(value===undefined)continue;d[n]=value>>16;d[n+1]=(value>>8)&255;d[n+2]=value&255;}
 ctx.putImageData(pixels,0,0);
}
