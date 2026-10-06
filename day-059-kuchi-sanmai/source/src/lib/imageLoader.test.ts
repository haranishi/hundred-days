// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadImageFile, MAX_IMAGE_BYTES, validateSvg } from './imageLoader'

afterEach(() => { vi.unstubAllGlobals() })

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">${body}</svg>`

describe('self-contained SVG validation', () => {
  it('図形、内部グラデーションと内部 use は利用できる', () => {
    expect(validateSvg(svg('<defs><linearGradient id="mint"><stop stop-color="#00ffaa" /></linearGradient><path id="shape" d="M0 0h10v10z" /></defs><use href="#shape" fill="url(#mint)" />'))).toContain('url(#mint)')
  })

  it.each([
    '<image href="https://example.invalid/image.png" />',
    '<use href="https://example.invalid/vector.svg#shape" />',
    '<path fill="url(https://example.invalid/paint.svg#x)" d="M0 0" />',
    '<style>@import "https://example.invalid/style.css";</style>',
    '<path style="fill:u\\72l(https://example.invalid/image)" />',
    '<path style="fill:url/**/(https://example.invalid/image)" />',
    '<g xml:base="https://example.invalid/"><use href="#shape" /></g>',
    '<foreignObject><iframe xmlns="http://www.w3.org/1999/xhtml" /></foreignObject>',
    '<script>fetch("https://example.invalid")</script>',
    '<path onload="alert(1)" />',
    '<animate attributeName="href" to="https://example.invalid/" />',
  ])('外部参照・動的要素をデコード前に拒否する: %s', (content) => {
    expect(() => validateSvg(svg(content))).toThrow()
  })

  it('外部実体と XML スタイルシートを拒否する', () => {
    expect(() => validateSvg(`<!DOCTYPE svg SYSTEM "https://example.invalid/a.dtd">${svg('')}`)).toThrow()
    expect(() => validateSvg(`<?xml-stylesheet href="https://example.invalid/a.css"?>${svg('')}`)).toThrow()
    expect(() => validateSvg('<svg><path></svg>')).toThrow()
  })
})

function fileFromBytes(data: Uint8Array, name: string, type: string): File {
  return {
    name, type, size: data.byteLength,
    slice: (start: number, end: number) => ({ arrayBuffer: async () => data.slice(start, end).buffer }),
  } as unknown as File
}

function pngFile(): File {
  const data = new Uint8Array(32)
  data.set([137, 80, 78, 71, 13, 10, 26, 10])
  const dimensions = new DataView(data.buffer)
  dimensions.setUint32(16, 100)
  dimensions.setUint32(20, 100)
  return fileFromBytes(data, 'character.png', 'image/png')
}

function stubDecoder({ fail = false, width = 100 } = {}) {
  const revoke = vi.fn()
  const create = vi.fn(() => 'blob:decoded-image')
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
  class FakeImage {
    naturalWidth = width
    naturalHeight = 100
    src = ''
    decoding = ''
    async decode() {
      if (fail) throw new Error('corrupt image')
    }
  }
  vi.stubGlobal('Image', FakeImage)
  return { create, revoke }
}

describe('image file lifecycle', () => {
  it('decode が終わった画像の URL を呼び出し側へ引き渡す', async () => {
    const { revoke } = stubDecoder()
    const loaded = await loadImageFile(pngFile())
    expect(loaded).toMatchObject({ width: 100, height: 100, objectUrl: 'blob:decoded-image' })
    expect(revoke).not.toHaveBeenCalled()
  })

  it('decode 失敗時には作成した URL を解放する', async () => {
    const { revoke } = stubDecoder({ fail: true })
    await expect(loadImageFile(pngFile())).rejects.toThrow('画像を読み込めませんでした')
    expect(revoke).toHaveBeenCalledWith('blob:decoded-image')
  })

  it('デコード後の寸法上限違反も URL を解放する', async () => {
    const { revoke } = stubDecoder({ width: 9000 })
    await expect(loadImageFile(pngFile())).rejects.toThrow('画像が大きすぎます')
    expect(revoke).toHaveBeenCalledWith('blob:decoded-image')
  })

  it('偽装した画像や巨大ファイルは URL を作る前に拒否する', async () => {
    const { create } = stubDecoder()
    const fake = fileFromBytes(new Uint8Array([1, 2, 3]), 'fake.png', 'image/png')
    await expect(loadImageFile(fake)).rejects.toThrow('一致しません')
    await expect(loadImageFile({ size: MAX_IMAGE_BYTES + 1 } as File)).rejects.toThrow('25 MB')
    expect(create).not.toHaveBeenCalled()
  })
})
