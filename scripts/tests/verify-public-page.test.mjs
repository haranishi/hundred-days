import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPublicPage} from '../verify-public-page.mjs';
const app='https://hundred-days.pages.dev/day-068-timetable-alibi/';
test('X preparation rejects the real soft-404 shape: HTTP 200 portfolio HTML',()=>{
 const html='<html><head><link rel="canonical" href="https://hundred-days.pages.dev/"><title>100 Days</title></head><body>時刻表アリバイ</body></html>';
 assert.throws(()=>verifyPublicPage(html,app),/対象アプリではない/);
});
test('X preparation accepts the generated app canonical',()=>{
 assert.deepEqual(verifyPublicPage('<link rel="canonical" href="'+app+'">',app),{canonical:app});
});
test('relative canonical and reordered HTML attributes still identify the app',()=>{
 assert.deepEqual(verifyPublicPage("<LINK href='/day-068-timetable-alibi/' REL='canonical'>",app),{canonical:app});
});
test('another app or missing identity cannot be called published',()=>{
 assert.throws(()=>verifyPublicPage('<link rel="canonical" href="/day-067-wagiri/">',app),/対象アプリではない/);
 assert.throws(()=>verifyPublicPage('<title>時刻表アリバイ</title>',app),/canonical/);
});
