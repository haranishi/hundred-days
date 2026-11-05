'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { renderSvg } = require('../svg-renderer.js');

test('abort during file inspection cannot proceed to rendering', async t => {
  const controller = new AbortController();
  t.mock.method(fs, 'stat', async () => {
    controller.abort();
    return {size:100};
  });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'airpresenter-abort-'));
  try {
    await assert.rejects(renderSvg(path.join(dir, 'not-opened.svg'), dir, {signal:controller.signal}), {code:'ABORTED'});
    assert.deepEqual(await fs.readdir(dir), []);
  } finally { t.mock.restoreAll(); await fs.rm(dir,{recursive:true,force:true}); }
});
