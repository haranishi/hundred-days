// バイナリを書く・読む小さな道具（リトルエンディアン）。
// 書く側は範囲の外の値を端に寄せる（NaN は0）。読む側は足りなければ DecodeError を投げ、呼ぶ側が null にして捨てる。

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8')

export class DecodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DecodeError'
  }
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return v === Infinity ? max : v === -Infinity ? min : 0
  const r = Math.round(v)
  return r < min ? min : r > max ? max : r
}

/** UTF-8 で max バイトまでに切る（文字の途中で切らない） */
export function utf8Truncate(s: string, maxBytes: number): Uint8Array {
  const bytes = encoder.encode(s)
  if (bytes.length <= maxBytes) return bytes
  let end = maxBytes
  // 続きのバイト（10xxxxxx）の手前まで戻る
  while (end > 0 && ((bytes[end] ?? 0) & 0xc0) === 0x80) end--
  return bytes.subarray(0, end)
}

export class ByteWriter {
  private buf: Uint8Array
  private view: DataView
  private pos = 0

  constructor(initial = 512) {
    this.buf = new Uint8Array(initial)
    this.view = new DataView(this.buf.buffer)
  }

  get length(): number {
    return this.pos
  }

  private ensure(n: number): void {
    if (this.pos + n <= this.buf.length) return
    let size = this.buf.length * 2
    while (size < this.pos + n) size *= 2
    const next = new Uint8Array(size)
    next.set(this.buf.subarray(0, this.pos))
    this.buf = next
    this.view = new DataView(next.buffer)
  }

  u8(v: number): this {
    this.ensure(1)
    this.view.setUint8(this.pos, clampInt(v, 0, 0xff))
    this.pos += 1
    return this
  }

  u16(v: number): this {
    this.ensure(2)
    this.view.setUint16(this.pos, clampInt(v, 0, 0xffff), true)
    this.pos += 2
    return this
  }

  u32(v: number): this {
    this.ensure(4)
    this.view.setUint32(this.pos, clampInt(v, 0, 0xffffffff), true)
    this.pos += 4
    return this
  }

  i16(v: number): this {
    this.ensure(2)
    this.view.setInt16(this.pos, clampInt(v, -0x8000, 0x7fff), true)
    this.pos += 2
    return this
  }

  i32(v: number): this {
    this.ensure(4)
    this.view.setInt32(this.pos, clampInt(v, -0x80000000, 0x7fffffff), true)
    this.pos += 4
    return this
  }

  f32(v: number): this {
    this.ensure(4)
    this.view.setFloat32(this.pos, Number.isFinite(v) ? v : 0, true)
    this.pos += 4
    return this
  }

  f64(v: number): this {
    this.ensure(8)
    this.view.setFloat64(this.pos, Number.isFinite(v) ? v : 0, true)
    this.pos += 8
    return this
  }

  /** 長さ（1バイト）＋UTF-8。255バイトを超える分は切る */
  str(s: string, maxBytes = 255): this {
    const bytes = utf8Truncate(s, Math.min(255, maxBytes))
    this.u8(bytes.length)
    this.ensure(bytes.length)
    this.buf.set(bytes, this.pos)
    this.pos += bytes.length
    return this
  }

  /** あとから値を書き直す（数を先に置いて、中身を書いたあとで埋めるとき） */
  patchU16(at: number, v: number): void {
    this.view.setUint16(at, clampInt(v, 0, 0xffff), true)
  }

  /** 書いた分だけの新しい配列 */
  finish(): Uint8Array {
    return this.buf.slice(0, this.pos)
  }
}

export class ByteReader {
  private readonly view: DataView
  private pos = 0

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  get remaining(): number {
    return this.bytes.byteLength - this.pos
  }

  private need(n: number): void {
    if (this.pos + n > this.bytes.byteLength) throw new DecodeError(`足りない: ${this.pos}+${n} > ${this.bytes.byteLength}`)
  }

  u8(): number {
    this.need(1)
    const v = this.view.getUint8(this.pos)
    this.pos += 1
    return v
  }

  u16(): number {
    this.need(2)
    const v = this.view.getUint16(this.pos, true)
    this.pos += 2
    return v
  }

  u32(): number {
    this.need(4)
    const v = this.view.getUint32(this.pos, true)
    this.pos += 4
    return v
  }

  i16(): number {
    this.need(2)
    const v = this.view.getInt16(this.pos, true)
    this.pos += 2
    return v
  }

  i32(): number {
    this.need(4)
    const v = this.view.getInt32(this.pos, true)
    this.pos += 4
    return v
  }

  f32(): number {
    this.need(4)
    const v = this.view.getFloat32(this.pos, true)
    this.pos += 4
    if (!Number.isFinite(v)) throw new DecodeError('有限でない数')
    return v
  }

  f64(): number {
    this.need(8)
    const v = this.view.getFloat64(this.pos, true)
    this.pos += 8
    if (!Number.isFinite(v)) throw new DecodeError('有限でない数')
    return v
  }

  str(): string {
    const n = this.u8()
    this.need(n)
    const s = decoder.decode(this.bytes.subarray(this.pos, this.pos + n))
    this.pos += n
    return s
  }

  /** 表の番号を読む。表の外なら壊れたデータとして投げる */
  pick<T>(table: readonly T[]): T {
    const i = this.u8()
    const v = table[i]
    if (v === undefined) throw new DecodeError(`表の外の番号 ${i}`)
    return v
  }

  /** 読み切ったか（余りがあれば壊れたデータ） */
  end(): void {
    if (this.pos !== this.bytes.byteLength) throw new DecodeError(`余りがある: ${this.bytes.byteLength - this.pos}`)
  }
}

/** 受け取った中身（ArrayBuffer・型付き配列）を Uint8Array で見る（写さない） */
export function asBytes(data: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  return new Uint8Array(data)
}
