import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {buildProps} from '../../tools/propgen/model.mjs';
import {encodeProps} from '../../tools/propgen/format.mjs';
const models=buildProps(),contact={lodge:[46,19],'chalet-a':[10.7,8.5],'chalet-b':[12.2,9.85],'chalet-c':[13.7,10.15]};
it.each(Object.entries(contact))('%s keeps its centered structural contact and permitted overhang', (name,size)=>{
 const m=models.find(m=>m.name===name),ground=m.p.filter((p,i)=>p[1]<1e-7&&m.material[i]!==2);
 expect(m.collision.size).toEqual(size);expect(m.collision.center).toEqual([0,0]);
 for(const [k,span] of [[0,size[0]],[2,size[1]]]){
  expect(Math.min(...ground.map(p=>p[k]))).toBeCloseTo(-span/2,7);
  expect(Math.max(...ground.map(p=>p[k]))).toBeCloseTo(span/2,7);
  expect(m.bounds.min[k]).toBeGreaterThanOrEqual(-span/2-2.5);
  expect(m.bounds.max[k]).toBeLessThanOrEqual(span/2+2.5);
 }
 expect(m.bounds.max[1]).toBeLessThanOrEqual(name==='lodge'?16:9);
 expect(m.tri.length).toBeLessThanOrEqual(name==='lodge'?14000:2600);
 expect(m.p.some((p,i)=>m.material[i]===4&&m.color[i].join(',')==='255,205,120')).toBe(true);
 expect(m.p.some((p,i)=>m.material[i]===0&&m.color[i][0]>=150&&m.color[i][0]<=175&&m.color[i][1]>=100&&m.color[i][1]<=120)).toBe(true);
});
it('keeps all material IDs and both total budgets',()=>{
 for(const m of models)expect(m.material.every(i=>Number.isInteger(i)&&i>=0&&i<=6)).toBe(true);
 const e=encodeProps(models);expect(e.meta.triangleCount).toBeLessThanOrEqual(40000);expect(e.bin.length+Buffer.byteLength(e.json)).toBeLessThanOrEqual(2500000);
});
it('leaves every non-building source mesh exactly unchanged',()=>{
 const expected=[
  [
    "bridge",
    "near",
    "b275c3c5c8f2c7347c2b28f14e860268b138961c3e06b6742d9bbec6605b3065"
  ],
  [
    "lift-tower",
    "near",
    "da5e6de895ded3babb904d1873f5d15dee1eb9390243b2fdc63735b1f62c0df5"
  ],
  [
    "lift-chair",
    "near",
    "86e38162c0bc349f24b549a76cefda7488ee9def1e29a1f44f7c05dd1382de39"
  ],
  [
    "lift-station",
    "near",
    "4fe0bd389a9de4786b69cf8262b6867729a291b4364510f37fbc93cd929b385e"
  ],
  [
    "fence",
    "near",
    "55048c114bc0e6ba58580b6ea4ffd4a59e7abcc4358ccf0827e785fa0658e8af"
  ],
  [
    "fir-a",
    "near",
    "e42e89fef4ed6fcb9a7147196acc12b43bd2fcf12551b423c5a2f7d555b921a5"
  ],
  [
    "fir-a",
    "mid",
    "8343352731da0c97da9c3c1577a8f52a9d39a61cbd36c0f8ea2aa9f19750024e"
  ],
  [
    "fir-a",
    "far",
    "27eea2e0624bfcbd2275c09aca0eb601162dc66fbc0e1738f327c162a6872b69"
  ],
  [
    "fir-b",
    "near",
    "3e6b05144642398099222eeebfc223aba20ef6cd94d648d3dcd95645568ebba9"
  ],
  [
    "fir-b",
    "mid",
    "0fc4dcbf3da2f834ed3edb3e550eb61112d723c725be5e9f43299f1b8a25a799"
  ],
  [
    "fir-b",
    "far",
    "772d6c5c6fec52554521e4ec7226c0ac294471a9f758a30064224d952f953d92"
  ],
  [
    "fir-c",
    "near",
    "dbcaa1695da26d0897522e2d039f9a7457bb69c884f65ff9f7508043ecfdd632"
  ],
  [
    "fir-c",
    "mid",
    "e85d3259bcdbbd6d535b99bedaef26f0e69ee05e7d4ce5d22c1c32ddbbb16f46"
  ],
  [
    "fir-c",
    "far",
    "01307822c5f43f7cbd0ef0f73cea3f777ffefbb24072ef40aebf894fc2544928"
  ],
  [
    "boulder-a",
    "near",
    "b1c347ab994fc61bb1969f036c12016e26e2a97585e625e318467f703efa2c2c"
  ],
  [
    "boulder-b",
    "near",
    "cf148bb816182a34a27b9749ac1319ea0ac7c81c5cd2ab9783f49c4bad8c56e8"
  ]
];
 expect(models.slice(4).map(m=>[m.name,m.lod,createHash('sha256').update(JSON.stringify(m)).digest('hex')])).toEqual(expected);
});
