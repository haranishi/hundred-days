/** Metres; row-major j * grid + i; X east, Z south, Y up. */
export const WORLD_FORMAT_VERSION = 2;
export const SIZE = 4096;
export const GRID = 2048;
export const CELL = 2;
export const TILE_GRID = 256;
export const TILE_PERIOD = 96;
export const FILES = Object.freeze({height:'height.f32', tileA:'tile-a.f32', masksA:'masks-a.bin', masksB:'masks-b.bin', sunVis:'sun-evening.u8', lake:'lake.u8'});
export function constantsFor(quick = false) {
  const grid = quick ? 512 : GRID;
  return {size:SIZE,grid,cell:SIZE/grid,maskGrid:grid/2,tileGrid:TILE_GRID,tilePeriod:TILE_PERIOD};
}
export function cellToWorld(i, c) { return (i + 0.5) * c.cell - c.size / 2; }
export function worldToCell(x, c) { return (x + c.size / 2) / c.cell - 0.5; }
export function formatError(message) { return new Error(`${message}. npm run worldgen で山を作り直してください。`); }
export function validateMeta(m) {
  if (!m || m.version !== WORLD_FORMAT_VERSION) throw formatError('山データの版が一致しません');
  if (typeof m.seed !== 'string' || !m.seed.length || !Number.isInteger(m.grid) || m.grid < 4 || m.grid % 2 ||
      (!Number.isFinite(m.size) || !Number.isFinite(m.cell) || !(m.size > 0)) || m.cell !== m.size/m.grid || m.maskGrid !== m.grid/2 || m.tileGrid !== TILE_GRID || m.tilePeriod !== TILE_PERIOD ||
      !Array.isArray(m.heightRange) || m.heightRange.length !== 2 || !m.heightRange.every(Number.isFinite) || m.heightRange[0] > m.heightRange[1] ||
      !Array.isArray(m.drops) || !Array.isArray(m.zones) || !m.zones.length || !m.sun ||
      ![m.sun.x,m.sun.y,m.sun.z].every(Number.isFinite) || !m.hashes) throw formatError('world.json の必須項目が不正です');
  for (const file of Object.values(FILES).filter(f=>f!=='lake.u8'||m.lake)) if (!/^[a-f0-9]{64}$/.test(m.hashes[file])) throw formatError(`${file} の SHA-256 が不正です`);
  for (const z of m.zones) if (!z || !Number.isInteger(z.id) || z.id<0 || z.id>255 || typeof z.name !== 'string') throw formatError('区域が不正です');
  for (const d of m.drops) if (!d || typeof d.id !== 'string' || typeof d.name !== 'string' || ![d.x,d.y,d.z,d.heading].every(Number.isFinite) || ![1,2,3,4].includes(d.level) || !m.zones.some(z=>z.id===d.zone)) throw formatError('出発地点が不正です');
  validateFeatures(m);validateValley(m);
  return m;
}

export function validateFeatures(m){
  const fail=()=>{throw formatError('版2の仕掛け・駅・地図が不正です');};
  if(!Array.isArray(m.features)||!Array.isArray(m.stations)||m.map?.file!=='map.png'||m.map?.size!==1024)fail();
  const ids=new Set();
  for(const f of m.features){
    if(!f||typeof f.id!=='string'||ids.has(f.id)||!['kicker','cliff','chute','lip','rollers','pipe','spines','mounds'].includes(f.kind)||![f.x,f.y,f.z,f.heading,f.length,f.width].every(Number.isFinite)||f.length<=0||f.width<=0)fail();ids.add(f.id);
    if(['kicker','cliff','lip','rollers'].includes(f.kind)){
      if(typeof f.name!=='string'||!f.name.length||typeof f.size!=='string'||!Number.isFinite(f.drop)||f.drop<0||(['cliff','lip'].includes(f.kind)&&(f.drop<2||f.drop>12)))fail();
      if(!Array.isArray(f.speed)||f.speed.length!==2||!f.speed.every(Number.isFinite)||f.speed[0]<=0||f.speed[1]<f.speed[0]||!Array.isArray(f.air)||f.air.length!==2||!f.air.every(Number.isFinite)||f.air[0]<0||f.air[1]<f.air[0]||!f.approach||![f.approach.x,f.approach.z,f.approach.heading,f.approach.speed].every(Number.isFinite)||f.approach.speed<0)fail();
      const dx=f.approach.x-f.x,dz=f.approach.z-f.z;if(dx*Math.sin(f.heading)-dz*Math.cos(f.heading)>-35)fail();
      if(f.kind==='kicker'&&!['S','M','L','XL'].includes(f.size))fail();if(f.kind==='cliff'&&!(f.height>=2&&f.height<=12))fail();
    }
  }
  const stations=new Set();for(const s of m.stations){if(!s||typeof s.id!=='string'||stations.has(s.id)||typeof s.name!=='string'||![s.x,s.y,s.z,s.radius].every(Number.isFinite)||s.radius<25||typeof s.base!=='boolean')fail();stations.add(s.id);}
  const drops=new Set();for(const d of m.drops){if(drops.has(d.id)||!['practice','park','bigair','open','plateau','forest','ridge','gully','steep','chute','spine'].includes(d.kind)||!stations.has(d.finish)||typeof d.hidden!=='boolean'||typeof d.about!=='string'||[...d.about].length>40||/[\r\n]/.test(d.about))fail();drops.add(d.id);}
}

function validateValley(m){
 const fail=()=>{throw formatError('谷・湖・構造物・視点のデータが不正です');};
 if(m.lake){const l=m.lake;if(![l.level,l.x0,l.z0,l.size].every(Number.isFinite)||l.size<=0||![512,1024].includes(l.grid))fail();}
 if(m.layout!=='valley-1')return;
 const s=m.structures;if(!m.lake||!s||!Array.isArray(s.chalets)||s.chalets.length!==8||!s.lift||!Array.isArray(s.lift.towers)||s.lift.towers.length!==8||!Array.isArray(s.roads)||!Array.isArray(m.views)||!Array.isArray(m.reserved))fail();
 const finitePoint=b=>b&&[b.x,b.y,b.z].every(Number.isFinite);
 for(const b of [s.lodge,...s.chalets,s.lift.base,s.lift.top,s.bridge])if(!finitePoint(b)||![b.yaw,b.length,b.width].every(Number.isFinite)||b.length<=0||b.width<=0)fail();
 if(!Number.isFinite(s.bridge.rise)||s.bridge.rise<0)fail();
 for(const t of s.lift.towers)if(!finitePoint(t)||!Number.isFinite(t.height)||t.height<=0)fail();
 for(const road of s.roads)if(!Array.isArray(road)||road.length<2||road.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))fail();
 const ids=new Set();for(const v of m.views){if(!v||typeof v.id!=='string'||ids.has(v.id)||![v.pos,v.target].every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite))||!Number.isFinite(v.fov)||v.fov<=0||v.fov>=150)fail();ids.add(v.id);}
 for(const r of m.reserved)if(!r||![r.x,r.z,r.heading,r.width,r.length].every(Number.isFinite)||r.width<=0||r.length<=0)fail();
}
