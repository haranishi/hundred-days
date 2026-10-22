// RFC 3492 §6.2の復号手順を実装。RFCの長い例も読める256字で挿入処理の計算量を抑える。
const MAX_INT = 0x7fffffff;
function adapt(delta, count, first) {
  delta = first ? Math.floor(delta / 700) : Math.floor(delta / 2);
  delta += Math.floor(delta / count);
  let k = 0;
  while (delta > 455) { delta = Math.floor(delta / 35); k += 36; }
  return k + Math.floor(36 * delta / (delta + 38));
}
function digit(char) {
  const n = char.charCodeAt(0);
  if (n >= 48 && n <= 57) return n - 22;
  if (n >= 65 && n <= 90) return n - 65;
  if (n >= 97 && n <= 122) return n - 97;
  return 36;
}
export function toUnicode(label) {
  if (typeof label !== 'string' || !/^xn--/i.test(label) || label.length > 256) return label;
  const input = label.slice(4);
  if (!input) return label;
  const output = [];
  let position = 0;
  const delimiter = input.lastIndexOf('-');
  if (delimiter >= 0) {
    for (let j = 0; j < delimiter; j++) {
      const cp = input.charCodeAt(j);
      if (cp >= 128) return label;
      output.push(cp);
    }
    position = delimiter + 1;
  }
  let n = 128, i = 0, bias = 72;
  while (position < input.length) {
    const old = i;
    let weight = 1;
    for (let k = 36; ; k += 36) {
      if (position >= input.length) return label;
      const d = digit(input[position++]);
      if (d >= 36 || d > Math.floor((MAX_INT - i) / weight)) return label;
      i += d * weight;
      const t = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias;
      if (d < t) break;
      if (weight > Math.floor(MAX_INT / (36 - t))) return label;
      weight *= 36 - t;
    }
    const count = output.length + 1;
    bias = adapt(i - old, count, old === 0);
    const increment = Math.floor(i / count);
    if (increment > 0x10ffff - n) return label;
    n += increment;
    if (n >= 0xd800 && n <= 0xdfff) return label;
    i %= count;
    output.splice(i, 0, n);
    i++;
  }
  return output.length ? String.fromCodePoint(...output) : label;
}
export function toUnicodeHost(host) {
  return typeof host === 'string' ? host.split('.').map(toUnicode).join('.') : host;
}
