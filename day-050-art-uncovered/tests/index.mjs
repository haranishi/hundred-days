import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { ARTWORKS } from '../data/artworks.js';
import { createGame, revealMore, answer, next, score, cropAt, dayStamp, readProgress, saveProgress } from '../lib/game.js';

test('same daily seed fixes order and choices, with no duplicate questions or choices',()=>{
  const game=createGame(ARTWORKS,'daily-2026-09-27');
  assert.deepEqual(game,createGame(ARTWORKS,'daily-2026-09-27'));
  assert.equal(new Set(game.rounds.map(r=>r.id)).size,5);
  for(const r of game.rounds){assert.equal(new Set(r.options).size,4);assert.ok(r.options.includes(r.id));}
});
test('different seeds vary the exhibit, leaving the source collection untouched',()=>{
  const before=ARTWORKS.map(w=>w.id);
  assert.notDeepEqual(createGame(ARTWORKS,'a').rounds,createGame(ARTWORKS,'b').rounds);
  assert.deepEqual(ARTWORKS.map(w=>w.id),before);
});
test('a wrong or skipped answer scores zero and advances only after the explanation',()=>{
  const game=createGame(ARTWORKS,'a');assert.equal(next(game),game);
  const wrong=answer(game,game.rounds[0].options.find(id=>id!==game.rounds[0].id));
  assert.equal(score(wrong),0);assert.equal(wrong.phase,'answer');assert.equal(wrong.index,0);
  assert.equal(next(wrong).index,1);assert.equal(answer(game,null).answers[0].points,0);
});
test('reveal stages reduce the score and stop at the whole picture',()=>{
  let game=createGame(ARTWORKS,'a');
  for(const expected of [1000,750,500,250]){
    assert.equal(answer(game,game.rounds[0].id).answers[0].points,expected);game=revealMore(game);
  }
  assert.equal(game.step,3);assert.equal(revealMore(game),game);
});
test('double answers, invalid choices and reveal after answering do not change state',()=>{
  const game=createGame(ARTWORKS,'a');assert.equal(answer(game,-999),game);
  const answered=answer(game,game.rounds[0].id);
  assert.equal(answer(answered,game.rounds[0].id),answered);assert.equal(revealMore(answered),answered);
});
test('five answers produce one result with a bounded 5000-point score',()=>{
  let game=createGame(ARTWORKS,'a');
  for(let i=0;i<5;i++){game=next(answer(game,game.rounds[game.index].id));}
  assert.equal(game.phase,'result');assert.equal(game.answers.length,5);assert.equal(score(game),5000);assert.equal(next(game),game);
});
test('daily exhibit changes at midnight in Japan, independently of local timezone',()=>{
  assert.equal(dayStamp(new Date('2026-09-26T14:59:59Z')),'2026-09-26');
  assert.equal(dayStamp(new Date('2026-09-26T15:00:00Z')),'2026-09-27');
});
test('image crops never include pixels outside the artwork',()=>{
  for(const focus of [[0,0],[1,1],[.5,.5]])for(const f of [.22,.4,.66,1]){
    const c=cropAt(focus,f);assert.ok(c.x>=0&&c.y>=0);assert.ok(c.x+c.size<=1&&c.y+c.size<=1);
  }
  assert.deepEqual(cropAt([0,1],1),{x:0,y:0,size:1});
});
test('broken or unavailable browser storage does not break play',()=>{
  assert.deepEqual(readProgress(null),{seen:[],best:0});
  assert.deepEqual(readProgress({getItem:()=>'{broken'}),{seen:[],best:0});
  assert.equal(saveProgress({setItem(){throw new Error('quota');}},{}),false);
  assert.deepEqual(readProgress({getItem:()=>JSON.stringify({seen:[1,1,'bad',2],best:99999})}),{seen:[1,2],best:5000});
});
test('all artworks have specific, attributed background and intent content',()=>{
  for(const work of ARTWORKS){
    assert.match(work.source,new RegExp(`/artworks/${work.id}$`));
    for(const field of ['background','intent','intentLabel','look','alt'])assert.ok(work[field].length>3,`${work.id} ${field}`);
    assert.ok(existsSync(new URL('../'+work.image,import.meta.url)),`Missing image ${work.id}`);
  }
  const manifest=JSON.parse(readFileSync(new URL('../data/image-manifest.json',import.meta.url)));
  assert.equal(manifest.length,ARTWORKS.length);
  for(const asset of manifest){assert.match(asset.license,/public domain|cc0/i);assert.ok(asset.copyrighted==='False'||asset.license==='CC0');}
});
