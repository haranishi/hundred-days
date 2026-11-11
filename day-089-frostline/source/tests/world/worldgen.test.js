import {test,expect} from 'vitest';
import {generateWorld,sha256} from '../../tools/worldgen/generate.mjs';
test('quick valley generation is byte deterministic and retains v2 with no authored features',()=>{
 const a=generateWorld({quick:true,landscape:{iterations:12,cycles:1}}),b=generateWorld({quick:true,landscape:{iterations:12,cycles:1}});
 expect(sha256(Buffer.from(JSON.stringify(a.meta)))).toBe(sha256(Buffer.from(JSON.stringify(b.meta))));
 for(const file of Object.keys(a.files))expect(sha256(a.files[file])).toBe(sha256(b.files[file]));
 expect(a.meta.version).toBe(2);expect(a.meta.layout).toBe('valley-1');expect(a.meta.drops).toHaveLength(16);expect(a.meta.drops.filter(d=>d.hidden)).toHaveLength(4);expect(a.meta.features).toEqual([]);expect(a.meta.stations.map(s=>s.id)).toEqual(['village','lift-top','valley-mid']);expect(a.buffers.lake.length).toBe(a.meta.lake.grid**2);
});
