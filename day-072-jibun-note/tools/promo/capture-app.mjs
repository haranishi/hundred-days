import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../../', import.meta.url));
const files = ['app.js', 'guide-app.js', 'app.css', 'guide.css', 'lib/guide-data.js', 'lib/guide-model.js', 'lib/guide-visuals.js'];
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const hashes = async () => Object.fromEntries(await Promise.all(files.map(async file => [file, hash(await readFile(join(app, file)))])));
const choices = ['yes', 'maybe', 'unlikely', 'unlikely', 'unlikely', 'unlikely', 'yes', 'maybe', 'unlikely', 'unlikely', 'unlikely', 'unlikely'];

export async function captureApp(browser, base, output) {
  const before = await hashes(), assets = {}, shots = [];
  const context = await browser.newContext({ viewport: { width: 620, height: 1100 }, locale: 'ja-JP', reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.postData()) requests.push(request.method()); });
  await mkdir(join(output, 'assets'), { recursive: true });
  async function shot(name, selector) {
    const target = page.locator(selector).first();
    await target.scrollIntoViewIfNeeded();
    const buffer = await target.screenshot({ animations: 'disabled' });
    await writeFile(join(output, 'assets', name + '.png'), buffer);
    assets[name] = 'data:image/png;base64,' + buffer.toString('base64');
    shots.push({ name, selector, sha256: hash(buffer) });
  }
  async function answer(value, count) {
    await page.locator('#guide-answers [data-answer=' + value + ']').click();
    if (count < 12) await page.waitForFunction(n => document.querySelector('#guide-count').textContent === String(n + 1).padStart(2, '0') + ' / 12', count);
    else await page.locator('#guide-result').waitFor({ state: 'visible' });
  }
  try {
    for (const file of files) {
      const response = await context.request.get(base + file);
      assert.equal(response.status(), 200, file);
      assert.equal(hash(await response.body()), before[file], 'Rebuild dist before filming: ' + file);
    }
    assert.equal((await page.goto(base)).status(), 200);
    await shot('preview', '.guide-field-board');
    await page.locator('#guide-start').click();
    await shot('question1', '.guide-question-card'); await shot('passport0', '.guide-passport');
    await shot('journey0', '#guide-journey');
    for (let i = 0; i < choices.length; i++) {
      await answer(choices[i], i + 1);
      if (i === 0) await shot('question2', '.guide-question-card');
      if (i === 2) { await shot('passport3', '.guide-passport'); await shot('journey3', '#guide-journey'); }
      if (i === 5) { await shot('passport6', '.guide-passport'); await shot('journey6', '#guide-journey'); }
    }
    const axis = await page.locator('.guide-axis-card h2').first().innerText();
    const industry = await page.locator('.guide-industry-card h3').first().innerText();
    const company = await page.locator('#guide-company-list').innerText();
    assert.match(axis, /誰かの変化を、\s*そばで支える/); assert.equal(industry, '教育・人材'); assert.match(company, /継続して関われますか/);
    await shot('axis', '.guide-axis-card'); await shot('industry', '.guide-industry-card');
    await shot('company', '#guide-company-questions'); await shot('stamp', '.guide-completion-stamp');
    assert.equal(await page.evaluate(() => localStorage.getItem('day072.career-guide.v1')), null);
    assert.deepEqual(await hashes(), before); assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    const proof = { viewport: { width: 620, height: 1100 }, method: 'Native UI choices; unmodified app; DOM screenshots edited with captions and pans; fictional answers, not a real-time screen recording', choices, axis, industry, company, sourceHashes: before, shots, pageErrors: errors, answerRequests: requests.length };
    await writeFile(join(output, 'capture-evidence.json'), JSON.stringify(proof, null, 2) + '\n');
    return { assets, proof };
  } finally { await context.close(); }
}
