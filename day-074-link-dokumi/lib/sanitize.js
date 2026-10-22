export function clip(value, max) {
  if (value == null) return null;
  // S5: 取得先による文字の見た目の並べ替えを防ぐため、双方向制御も除く。
  // N3: C1制御（U+0085など）とUnicodeの行・段落区切りは、コピーの受け手で行区切りとして働き、偽の行を作れる。
  // eslint-disable-next-line no-control-regex
  return String(value).replace(/[\u2028\u2029]/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, max);
}
export function hostOf(value) {
  try { return clip(new URL(value).hostname, 253) || null; } catch { return null; }
}
export function schemeOf(src, baseUrl) {
  const value = String(src ?? '').trim();
  if (value.startsWith('//')) return 'protocol-relative';
  if (!/^[a-z][a-z\d+.-]*:/i.test(value)) return 'relative';
  try {
    const scheme = new URL(value, baseUrl).protocol.slice(0, -1);
    return ['http', 'https', 'data'].includes(scheme) ? scheme : 'other';
  } catch { return 'other'; }
}

// S3: 復号済み本文を上限内だけ保持し、JSONでは超過分を解析せず拒否する。
export async function readCapped(response, cap, signal, {strict = false} = {}) {
  if (!response.body) return {bytes:new Uint8Array(),truncated:false};
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0, truncated = false, abort;
  const expired = signal ? new Promise((_,reject) => {
    abort = () => reject(new DOMException('Timeout','AbortError'));
    signal.addEventListener('abort',abort,{once:true});
    if (signal.aborted) abort();
  }) : null;
  try {
    while (strict || total < cap) {
      const pending = reader.read();
      const {done,value} = await (expired ? Promise.race([pending,expired]) : pending);
      if (done) break;
      if (!value?.length) continue;
      if (strict && value.length > cap-total) throw new RangeError('body_limit');
      const part = value.subarray(0,cap-total);
      chunks.push(part); total += part.length;
      if (!strict && total >= cap) { truncated = true; break; }
    }
  } finally {
    if (abort) signal.removeEventListener('abort',abort);
    void reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  return {bytes,truncated};
}
