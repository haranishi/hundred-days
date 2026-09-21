import test from 'node:test';
import assert from 'node:assert/strict';
import { intersects } from '../lib/collision.js';
const a={x:10,y:10,w:20,h:20};
test('内部で重なる',()=>assert.equal(intersects(a,{x:15,y:15,w:2,h:2}),true));
test('離れた矩形は当たらない',()=>assert.equal(intersects(a,{x:31,y:10,w:5,h:5}),false));
test('辺だけの接触は当たらない',()=>assert.equal(intersects(a,{x:30,y:10,w:5,h:5}),false));
test('角の重なりも当たる',()=>assert.equal(intersects(a,{x:29,y:29,w:5,h:5}),true));
