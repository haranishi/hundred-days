import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { decodeState, encodeState, parseViewHash, viewUrl } from '../../lib/codec.js';
import { BLOCK_SCHEMA, BLOCK_TYPES, sanitizeState, validateState } from '../../lib/contract.js';
import { MINIMAL, RESERVE_SAMPLE, STRESS, emptyProps, midProps, oneEach } from '../fixtures/states.js';

const fixtures = [MINIMAL, RESERVE_SAMPLE, STRESS,
  ...BLOCK_TYPES.flatMap(type => BLOCK_SCHEMA[type].variants.flatMap((_, v) =>
    [oneEach(type, v), oneEach(type, v, midProps(type)), oneEach(type, v, emptyProps(type))])),
];
const plainCode = raw => '1.' + Buffer.from(JSON.stringify(raw)).toString('base64url');
const compressedCode = bytes => '2.' + deflateRawSync(bytes).toString('base64url');

test('すべての見本で圧縮符号が4000字に収まり、元の状態へ戻る', async t => {
  for (const state of fixtures) {
    const code = await encodeState(state);
    assert.match(code, /^2\.[\w-]+$/);
    assert.ok(code.length <= 4000);
    assert.deepEqual(JSON.parse(inflateRawSync(Buffer.from(code.slice(2), 'base64url'))), state);
    assert.deepEqual(await decodeState(code), { ok: true, state });
    if (state === STRESS) t.diagnostic(`STRESS 圧縮符号 ${code.length}字`);
  }
});

function setGlobal(t, key, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  });
}

async function expectFailure(code) {
  const result = await decodeState(code);
  assert.equal(result.ok, false);
  assert.match(result.reason, /[ぁ-んァ-ヶ一-龠]/);
  return result.reason;
}

test('圧縮APIなしでも旧JSONと短縮JSONで全見本を往復できる', async t => {
  setGlobal(t, 'CompressionStream', undefined);
  setGlobal(t, 'DecompressionStream', undefined);
  for (const state of fixtures) {
    const code = await encodeState(state);
    assert.match(code, /^1\.[\w-]+$/);
    assert.ok(code.length <= 4000);
    assert.deepEqual(await decodeState(code), { ok: true, state });
    if (state === STRESS) t.diagnostic('STRESS 非圧縮の短縮JSON ' + code.length + '字');
  }
  assert.equal(await encodeState(MINIMAL), plainCode(MINIMAL));
  assert.equal(await encodeState(RESERVE_SAMPLE), plainCode(RESERVE_SAMPLE));
  await expectFailure(compressedCode(JSON.stringify(MINIMAL)));
});

test('deflate-rawを選べないブラウザでも素のJSONを使える', async t => {
  class UnsupportedFormat { constructor() { throw new TypeError('形式に未対応'); } }
  setGlobal(t, 'CompressionStream', UnsupportedFormat);
  assert.equal(await encodeState(MINIMAL), plainCode(MINIMAL));
});

test('共有リンクは断片から符号をそのまま取り出し、開けない符号は読み取り側へ渡す', async () => {
  const base = 'https://example.invalid/recipe/';
  const code = await encodeState(MINIMAL);
  assert.equal(await viewUrl(MINIMAL, base), base + '#v=' + code);
  assert.equal(parseViewHash(new URL(await viewUrl(MINIMAL, base)).hash), code);
  assert.equal(parseViewHash('#v=broken'), 'broken');
  for (const bad of [undefined, null, {}, 1, '', '#v=', 'v=' + code, '#uxr-b1', '#x=' + code]) {
    assert.equal(parseViewHash(bad), null);
  }
});

test('型・版・Base64の文字と末尾・UTF-8・JSON・目的・圧縮形式を確かめる', async () => {
  const invalid = [null, undefined, false, {}, [], 1, '', '1', '1.', '2.', '3.YQ',
    '1.a', '1.YQ=', '1.a+b/', '1.YQ\n', '1.%20', '1._w', '1.' + Buffer.from('{').toString('base64url'),
    plainCode(null), plainCode(0), plainCode([]), plainCode({ goal: '不明' }),
    '2.' + Buffer.from('圧縮形式の誤り').toString('base64url')];
  // 同じバイト列を指す別の符号も、末尾の余りで区別する。
  const canonical = plainCode({ goal: 'buy' });
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const last = alphabet.indexOf(canonical.at(-1));
  assert.ok((canonical.length - 2) % 4 !== 0);
  invalid.push(canonical.slice(0, -1) + alphabet[last + 1]);
  const wrongUtf8 = Buffer.concat([Buffer.from('{"goal":"buy","x":"'), Buffer.from([0xff]), Buffer.from('"}')]);
  invalid.push('1.' + wrongUtf8.toString('base64url'));
  for (const code of invalid) await expectFailure(code);
});

test('8000字までの旧リンクは開き、1字超えたら大きさを理由として返す', async () => {
  const raw = JSON.stringify(MINIMAL);
  const bytes = Buffer.from(raw + ' '.repeat(5998 - Buffer.byteLength(raw)));
  const atLimit = '1.' + bytes.toString('base64url');
  assert.equal(atLimit.length, 8000);
  assert.deepEqual(await decodeState(atLimit), { ok: true, state: MINIMAL });
  assert.match(await expectFailure(atLimit + 'A'), /大き/);
});

test('文字は保存し、共有で持ち込まれた制御文字・不正な見た目・余分な項目は取り除く', async () => {
  const raw = {
    goal: 'buy', site: { name: '店\u0000名' }, theme: { preset: '未知', accent: -1 },
    blocks: [{ id: 'b1', type: 'hero', variant: 10, props: { title: '<script>\u202e文字', extra: true } },
      { type: '未登録' }, { id: 'b1', type: 'cta' }],
  };
  for (const code of [plainCode(raw), compressedCode(JSON.stringify(raw))]) {
    const decoded = await decodeState(code);
    assert.deepEqual(decoded, { ok: true, state: sanitizeState(raw) });
    assert.equal(decoded.state.site.name, '店名');
    assert.equal(decoded.state.blocks[0].props.title, '<script>文字');
    assert.deepEqual(validateState(decoded.state), []);
  }
});

test('200KiBちょうどと1バイト超過を区別し、3MiBに展開する入力を打ち切る', async t => {
  const limit = 200 * 1024;
  const bytes = Buffer.from(JSON.stringify({ ...MINIMAL, label: '日本語' }));
  const atLimit = Buffer.alloc(limit, 0x20);
  bytes.copy(atLimit);
  assert.deepEqual(await decodeState(compressedCode(atLimit)), { ok: true, state: MINIMAL });
  assert.match(await expectFailure(compressedCode(Buffer.concat([atLimit, Buffer.from(' ')]))), /大き/);
  const oversized = Buffer.alloc(3 * 1024 * 1024, 0x20);
  bytes.copy(oversized);
  const code = compressedCode(oversized);
  assert.ok(code.length < 8000);
  assert.match(await expectFailure(code), /大き/);
  t.diagnostic(oversized.length + 'バイトに展開する入力を拒否（符号' + code.length + '字）');
});

test('展開の読み取りは上限を越えたチャンクでキャンセルし、次のチャンクを要求しない', async t => {
  let reads = 0;
  let cancelled = false;
  const chunk = new Uint8Array(16 * 1024);
  class MeasuredStream {
    constructor() {
      this.writable = new WritableStream();
      this.readable = new ReadableStream({
        pull(controller) {
          reads++;
          if (reads > 20) controller.close();
          else controller.enqueue(chunk);
        },
        cancel() { cancelled = true; },
      }, { highWaterMark: 0 });
    }
  }
  setGlobal(t, 'DecompressionStream', MeasuredStream);
  assert.match(await expectFailure(compressedCode('{}')), /大き/);
  assert.equal(cancelled, true);
  assert.equal(reads, 13);
});

test('短縮JSONでも件数・文字表の参照・セルの形を検査する', async t => {
  setGlobal(t, 'CompressionStream', undefined);
  const code = await encodeState(STRESS);
  const packed = JSON.parse(Buffer.from(code.slice(2), 'base64url'));
  assert.ok(Array.isArray(packed));
  assert.deepEqual(await decodeState(compressedCode(JSON.stringify(packed))), { ok: true, state: STRESS });
  const corrupt = [
    data => { data[0] = '未知の版'; }, data => { data[5].push(data[5][0]); },
    data => { data[5][0][1] = 'constructor'; }, data => { data[5][0][3][0] = -1; },
    data => { data[5][0][3].pop(); }, data => { data[4][data[5][0][3][0]] = '長'.repeat(99); },
  ];
  for (const mutate of corrupt) {
    const changed = structuredClone(packed);
    mutate(changed);
    const bytes = Buffer.from(JSON.stringify(changed));
    await expectFailure(compressedCode(bytes));
  }
});

test('短縮しても4000字を超える文章では、内容を削ったリンクを作らず理由を返す', async () => {
  let seed = 96;
  const varied = JSON.parse(JSON.stringify(STRESS), (_, value) => {
    if (typeof value !== 'string' || !value.startsWith('あ')) return value;
    return Array.from(value, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return String.fromCharCode(0x4e00 + (seed >>> 15) % 20000);
    }).join('');
  });
  assert.deepEqual(validateState(varied), []);
  await assert.rejects(encodeState(varied), /共有リンクが長すぎ/);
  await assert.rejects(viewUrl(varied, '/recipe/'), /共有リンクが長すぎ/);
  await assert.rejects(encodeState(null), /ページ/);
});
