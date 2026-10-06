import type { BackgroundImage } from '../types/canvas'
import type { CharacterAsset, CharacterSlot } from '../types/character'

export const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg'
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024
export const MAX_IMAGE_DIMENSION = 8192
const MAX_IMAGE_PIXELS = 32_000_000

export interface LoadedImage {
  image: HTMLImageElement
  width: number
  height: number
  objectUrl: string
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const SVG_TAGS = new Set([
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'textPath', 'title', 'desc', 'defs', 'symbol', 'use', 'clipPath',
  'mask', 'linearGradient', 'radialGradient', 'stop', 'pattern', 'marker', 'filter',
  'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix',
  'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight', 'feDropShadow', 'feFlood',
  'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feMerge', 'feMergeNode',
  'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight',
  'feTile', 'feTurbulence',
])

/** 外部素材・スクリプト・CSS 読込を持たない、自己完結した SVG だけを画像として扱う。 */
export function validateSvg(source: string): string {
  if (/<!DOCTYPE|<!ENTITY|<\?(?!xml\s)/i.test(source)) {
    throw new Error('SVG の外部参照・文書型宣言には対応していません。PNG に変換してください。')
  }
  const document = new DOMParser().parseFromString(source, 'image/svg+xml')
  const root = document.documentElement
  if (document.querySelector('parsererror') || root.localName !== 'svg' || root.namespaceURI !== SVG_NAMESPACE) {
    throw new Error('SVG の形式を確認してください。')
  }
  for (const element of document.querySelectorAll('*')) {
    if (element.namespaceURI !== SVG_NAMESPACE || !SVG_TAGS.has(element.localName)) {
      throw new Error('この SVG は外部素材や動的な要素を含みます。PNG に変換してください。')
    }
    for (const attribute of element.attributes) {
      const name = attribute.localName.toLowerCase()
      const value = attribute.value.trim()
      if (/^on/.test(name) || name === 'base') {
        throw new Error('SVG のスクリプトや外部参照には対応していません。')
      }
      if (name === 'href' && !/^#[A-Za-z_][\w:.-]*$/.test(value)) {
        throw new Error('外部画像を参照する SVG は使えません。PNG に変換してください。')
      }
      // CSS のエスケープ、コメント、import と外部 url() を禁止する。
      const withoutLocalUrls = value.replace(/url\(\s*(['"]?)#[A-Za-z_][\w:.-]*\1\s*\)/gi, '')
      if (/\\|\/\*|@|url\s*\(/i.test(withoutLocalUrls)) {
        throw new Error('SVG の外部スタイルや外部 URL には対応していません。')
      }
    }
  }
  return new XMLSerializer().serializeToString(root)
}

function imageMime(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase()
  const formats: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    gif: 'image/gif', svg: 'image/svg+xml',
  }
  const inferred = extension ? formats[extension] : undefined
  const supplied = file.type.toLowerCase().split(';')[0]
  if (Object.values(formats).includes(supplied)) return supplied
  return !supplied || supplied === 'application/octet-stream' ? inferred ?? null : null
}

function validateSignature(header: Uint8Array, mime: string): boolean {
  const ascii = (start: number, end: number) => String.fromCharCode(...header.slice(start, end))
  if (mime === 'image/png') return header.length >= 24 && ascii(1, 4) === 'PNG' && header[0] === 137 && header[4] === 13 && header[5] === 10 && header[6] === 26 && header[7] === 10
  if (mime === 'image/jpeg') return header[0] === 255 && header[1] === 216 && header[2] === 255
  if (mime === 'image/gif') return ['GIF87a', 'GIF89a'].includes(ascii(0, 6))
  if (mime === 'image/webp') return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
  return false
}

function checkDimensions(width: number, height: number): void {
  if (!width || !height || !Number.isFinite(width * height)) throw new Error('画像のサイズを読み取れませんでした。')
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) {
    throw new Error('画像が大きすぎます。各辺 8,192 px 以下、合計 3,200 万画素以下に縮小してください。')
  }
}

export async function loadImageFile(file: File): Promise<LoadedImage> {
  if (file.size === 0) throw new Error('空のファイルは読み込めません。')
  if (file.size > MAX_IMAGE_BYTES) throw new Error('画像は 25 MB 以下のファイルを選んでください。')
  const mime = imageMime(file)
  if (!mime) throw new Error('PNG・JPEG・WebP・GIF・SVG の画像を選んでください。')
  let source: Blob = file
  if (mime === 'image/svg+xml') {
    source = new Blob([validateSvg(await file.text())], { type: mime })
  } else {
    const header = new Uint8Array(await file.slice(0, 32).arrayBuffer())
    if (!validateSignature(header, mime)) throw new Error('ファイルの内容が画像形式と一致しません。')
    if (mime === 'image/png') {
      const dimensions = new DataView(header.buffer)
      checkDimensions(dimensions.getUint32(16), dimensions.getUint32(20))
    }
    if (file.type !== mime) source = new Blob([file], { type: mime })
  }
  const objectUrl = URL.createObjectURL(source)
  const image = new Image()
  image.decoding = 'async'
  image.src = objectUrl
  try {
    await image.decode()
    checkDimensions(image.naturalWidth, image.naturalHeight)
    return { image, width: image.naturalWidth, height: image.naturalHeight, objectUrl }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    image.src = ''
    if (error instanceof Error && error.message.startsWith('画像')) throw error
    throw new Error('画像を読み込めませんでした。別の画像か PNG への変換をお試しください。')
  }
}

export async function toCharacterAsset(slot: CharacterSlot, file: File): Promise<CharacterAsset> {
  return { slot, fileName: file.name, ...await loadImageFile(file) }
}

export async function toBackgroundImage(file: File): Promise<BackgroundImage> {
  return { fileName: file.name, ...await loadImageFile(file) }
}
