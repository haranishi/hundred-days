import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE,HERO } from '../lib/sprites/hero.js';
import { PROPS } from '../lib/sprites/props.js';
import { drawSprite } from '../lib/render.js';
test('スプライトは共通16色以内・宣言した寸法とフレーム',()=>{assert.ok(PALETTE.length<=16);assert.equal(PALETTE[0],'transparent');for(const [name,s] of Object.entries({...HERO,...PROPS})){for(const rows of Object.values(s.frames)){assert.equal(rows.length,s.h,name);for(const row of rows){assert.equal(row.length,s.w,name);assert.ok([...row].every(c=>parseInt(c,36)<PALETTE.length));}}}for(const s of Object.values(HERO))assert.deepEqual(Object.keys(s.frames),['idle','walk1','walk2','jump','hurt']);});
test('描画はパレットを1画素ずつ塗る',()=>{let pixels=0;drawSprite({set fillStyle(v){assert.ok(PALETTE.includes(v));},fillRect(x,y,w,h){assert.equal(w,1);assert.equal(h,1);pixels++;}},HERO.chibi,0,0);assert.ok(pixels>0);});
