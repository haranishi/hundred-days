import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {miniSite} from './helpers.mjs';
import {APP_PATH,SECURITY_HEADERS,CONTENT_SECURITY_POLICY} from '../../day-084-airpresenter/web/policy.mjs';

test('Day84 root builds emit identical Worker security headers and preserve other Day policies', t => {
  const {write,build,read}=miniSite(t);
  write('day-084-airpresenter/meta.json',JSON.stringify({day:84,title:'AirPresenter',status:'published'}));
  write('day-084-airpresenter/index.html','<!doctype html><html><head><title>AirPresenter</title></head><body></body></html>');
  write('day-084-airpresenter/web/policy.mjs',readFileSync(new URL('../../day-084-airpresenter/web/policy.mjs',import.meta.url),'utf8'));
  const result=build();
  assert.equal(result.status,0,result.output);
  const shared=read('_headers');
  const dayRule=shared.split('/day-084-airpresenter/*\n')[1].split('\n\n')[0];
  assert.ok(dayRule.includes('Content-Security-Policy: '+CONTENT_SECURITY_POLICY));
  assert.ok(dayRule.includes('Referrer-Policy: '+SECURITY_HEADERS['Referrer-Policy']));
  const worker=read('day-084-airpresenter/_headers');
  assert.equal(worker,[APP_PATH+'/*',...Object.entries(SECURITY_HEADERS).map(([key,value])=>'  '+key+': '+value),''].join('\n'));
  const other=shared.split('/day-001-alpha/*\n')[1].split('\n\n')[0];
  assert.ok(!other.includes('wasm-unsafe-eval'));
  assert.ok(!other.includes('wss://rairakku.com'));
  assert.ok(!other.includes('accelerometer=(self)'));
});
