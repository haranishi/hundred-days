import { BLOCK_SCHEMA, BLOCK_TYPES, HASH_VIEW, MAX_BLOCKS } from './contract.js';
import { restoreState } from './state.js';

const WRITE_LIMIT = 4000;
const READ_LIMIT = 8000;
const BYTE_LIMIT = 200 * 1024;
const UNREADABLE = 'このリンクは読み取れませんでした。';
const TOO_LARGE = 'このリンクは大きすぎるため開けません。';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function base64url(bytes) {
  const chunks = [];
  // 一度に渡せる引数の数はブラウザによって異なる。
  for (let i = 0; i < bytes.length; i += 8192) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return btoa(chunks.join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function readBase64(payload) {
  if (!payload || /[^A-Za-z0-9_-]/.test(payload) || payload.length % 4 === 1) throw new Error(UNREADABLE);
  const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  if (base64url(bytes) !== payload) throw new Error(UNREADABLE);
  return bytes;
}

// 普通のJSONが収まらないときだけ、項目名は契約の順で省略し、同じ文言は一度だけ持つ。
// 文章や行を削らず、将来項目の順が変わる場合に識別できるよう短縮形式にも版を付ける。
const TABLE_FORMAT = 'uxr-table-1';

function packState(state) {
  const words = [];
  const indices = new Map();
  function packFields(fields, values) {
    return fields.map(field => {
      const value = values[field.key];
      if (field.kind === 'list') return value.map(row => packFields(field.item, row));
      if (field.kind === 'check') return value;
      if (!indices.has(value)) {
        indices.set(value, words.length);
        words.push(value);
      }
      return indices.get(value);
    });
  }
  const rows = state.blocks.map(({ id, type, variant, props }) => [id, type, variant, packFields(BLOCK_SCHEMA[type].fields, props)]);
  return [TABLE_FORMAT, state.goal, state.site.name, state.theme, words, rows];
}

function unpackState([format, goal, name, theme, words, rows]) {
  if (format !== TABLE_FORMAT || !Array.isArray(words) || !Array.isArray(rows) || rows.length > MAX_BLOCKS) throw new Error(UNREADABLE);
  function unpackFields(fields, cells) {
    if (!Array.isArray(cells) || cells.length !== fields.length) throw new Error(UNREADABLE);
    return Object.fromEntries(fields.map((field, i) => {
      const cell = cells[i];
      if (field.kind === 'list') {
        if (!Array.isArray(cell) || cell.length > field.max) throw new Error(UNREADABLE);
        return [field.key, cell.map(row => unpackFields(field.item, row))];
      }
      if (field.kind === 'check') {
        if (typeof cell !== 'boolean') throw new Error(UNREADABLE);
        return [field.key, cell];
      }
      const word = Number.isInteger(cell) && cell >= 0 ? words[cell] : undefined;
      // 文字表の参照を何度たどっても、項目の最大長（UTF-16では最大2単位/文字）を超えない。
      if (typeof word !== 'string' || word.length > field.max * 2) throw new Error(UNREADABLE);
      return [field.key, word];
    }));
  }
  const blocks = rows.map(([id, type, variant, cells]) => {
    if (!BLOCK_TYPES.includes(type)) throw new Error(UNREADABLE);
    return { id, type, variant, props: unpackFields(BLOCK_SCHEMA[type].fields, cells) };
  });
  return { goal, site: { name }, theme, blocks };
}

function compressor() {
  if (typeof CompressionStream !== 'function' || typeof DecompressionStream !== 'function') return null;
  try {
    return new CompressionStream('deflate-raw');
  } catch {
    // 古いブラウザには圧縮APIがあっても、この形式を選べないものがある。
    return null;
  }
}

async function encodeJson(data) {
  let bytes = encoder.encode(JSON.stringify(data));
  const transform = compressor();
  if (transform) {
    const stream = new Blob([bytes]).stream().pipeThrough(transform);
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return (transform ? '2.' : '1.') + base64url(bytes);
}

export async function encodeState(state) {
  const clean = restoreState(state);
  if (!clean) throw new Error('ページの内容を読み取れませんでした。');
  let code = await encodeJson(clean);
  if (code.length <= WRITE_LIMIT) return code;
  code = await encodeJson(packState(clean));
  if (code.length <= WRITE_LIMIT) return code;
  throw new RangeError('共有リンクが長すぎます。文章か部品を減らしてください。');
}

async function inflate(bytes, transform) {
  const reader = new Blob([bytes]).stream().pipeThrough(transform).getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BYTE_LIMIT) {
        await reader.cancel();
        throw new RangeError(TOO_LARGE);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function decodeState(code) {
  try {
    if (typeof code !== 'string' || !/^[12]\./.test(code)) return { ok: false, reason: UNREADABLE };
    if (code.length > READ_LIMIT) return { ok: false, reason: TOO_LARGE };
    let bytes = readBase64(code.slice(2));
    if (code[0] === '2') {
      let transform;
      try {
        transform = new DecompressionStream('deflate-raw');
      } catch {
        return { ok: false, reason: 'このブラウザでは圧縮したリンクを開けません。' };
      }
      bytes = await inflate(bytes, transform);
    }
    const raw = JSON.parse(decoder.decode(bytes));
    const state = restoreState(Array.isArray(raw) ? unpackState(raw) : raw);
    return state ? { ok: true, state } : { ok: false, reason: 'このリンクの中身が正しくありません。' };
  } catch (error) {
    return { ok: false, reason: error instanceof RangeError && error.message === TOO_LARGE ? TOO_LARGE : UNREADABLE };
  }
}

const viewPrefix = '#' + HASH_VIEW + '=';

export async function viewUrl(state, base) {
  return base + viewPrefix + await encodeState(state);
}

export function parseViewHash(hash) {
  if (typeof hash !== 'string' || !hash.startsWith(viewPrefix)) return null;
  return hash.slice(viewPrefix.length) || null;
}
