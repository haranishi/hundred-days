// 名前の整形と、自動の仮名（docs/05「名前」）。名所バトルの names.ts を写して、仮名をスーパーの言葉に替えた。
// 友だちの部屋では本人が入れた名前を整えて使う。相手探しの部屋では仮名だけを使い、入れた名前は送らせない。

import type { RandomInt } from './roomcode'

/** 名前の長さの上限（見た目の文字数） */
export const NAME_MAX_CHARS = 8

/**
 * 消す文字：制御文字（改行・タブを含む）、行・段落の区切り、片方だけのサロゲート、
 * 見えない文字（ゼロ幅スペース・文字の向きを変える記号・BOM・ハングルの埋め字・点字の空白など）。
 * 絵文字をつなぐゼロ幅接合子（U+200D）と U+200C は、絵文字や文字の形に要るので残す。
 */
const INVISIBLE =
  /[\p{Cc}\p{Zl}\p{Zp}\p{Cs}­؜ᅟᅠ᠎​‎‏‪-‮⁠-⁤⁦-⁯⠀ㅤ﻿ﾠ]/gu

/** 書記素（見た目の1文字）に分ける。Intl.Segmenter がない環境では、コードポイントで分ける */
export function splitGraphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text), (s) => s.segment)
  }
  return Array.from(text)
}

/** 1文字に重ねてよい結合文字の数。多すぎると上下へはみ出してほかの人の表示にかぶるため、超えた分は消す */
export const MAX_MARKS_PER_CHAR = 4
/** 1文字のコードポイントの上限。肌の色つきの家族の絵文字（11個）は残し、それより長いつなぎ方は切る */
export const MAX_CODE_POINTS_PER_CHAR = 12

const MARK = /^\p{M}$/u
const ZWJ = '‍'

/** 書記素1つを整える。切ったあと末尾に残ったつなぎ（ZWJ）は落とす */
export function trimGrapheme(grapheme: string): string {
  const out: string[] = []
  let marks = 0
  for (const cp of grapheme) {
    if (out.length >= MAX_CODE_POINTS_PER_CHAR) break
    if (MARK.test(cp)) {
      if (marks >= MAX_MARKS_PER_CHAR) continue
      marks++
    }
    out.push(cp)
  }
  while (out.length > 0 && out[out.length - 1] === ZWJ) out.pop()
  return out.join('')
}

/**
 * 人に見せる短い文字列を整える。前後の空白・制御文字・改行・見えない文字を消し、続く空白は1つにまとめ、
 * 見た目で maxChars 文字までにする。何も残らなければ null。
 */
export function sanitizeText(input: unknown, maxChars: number): string | null {
  if (typeof input !== 'string') return null
  const base = input.normalize('NFC').replace(INVISIBLE, '').replace(/\s+/gu, ' ').trim()
  if (base === '') return null
  const text = splitGraphemes(base).slice(0, Math.max(0, maxChars)).map(trimGrapheme).join('').trim()
  return text === '' ? null : text
}

/** 本人が入れた名前を整える（NAME_MAX_CHARS＝8文字まで）。何も残らなければ null */
export function sanitizeName(input: unknown): string | null {
  return sanitizeText(input, NAME_MAX_CHARS)
}

/** 仮名の前半（スーパーの売り場や物） */
export const PSEUDONYM_HEADS = ['試食', 'カート', '特売', '半額', 'ベル', 'お菓子', '冷凍', 'バナナ'] as const
/** 仮名の後半（呼び名）。前後を合わせて8文字以内に収まるようにしてある */
export const PSEUDONYM_TAILS = ['ハンター', '番長', 'マニア', '名人', '大臣', '職人', '隊長', '王子'] as const

/** 作れる仮名のすべて（8×8＝64通り） */
export function allPseudonyms(): string[] {
  return PSEUDONYM_HEADS.flatMap((head) => PSEUDONYM_TAILS.map((tail) => `${head}${tail}`))
}

/**
 * 「試食ハンター」「カート番長」のような仮名を作る。avoid にある名前（同じ部屋の相手の仮名など）とは重ねない。
 * 全部が avoid に入っていたら、重なっても1つ返す。
 */
export function pseudonym(randomInt: RandomInt, avoid: readonly string[] = []): string {
  for (let i = 0; i < 16; i++) {
    const head = PSEUDONYM_HEADS[randomInt(PSEUDONYM_HEADS.length)] ?? PSEUDONYM_HEADS[0]
    const tail = PSEUDONYM_TAILS[randomInt(PSEUDONYM_TAILS.length)] ?? PSEUDONYM_TAILS[0]
    const name = `${head}${tail}`
    if (!avoid.includes(name)) return name
  }
  const all = allPseudonyms()
  return all.find((name) => !avoid.includes(name)) ?? (all[0] as string)
}
