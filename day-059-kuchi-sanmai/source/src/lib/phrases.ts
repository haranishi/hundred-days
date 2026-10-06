// 文節の区切りの印。画面では <wbr> にして、語の途中では折れず、文節の切れ目でだけ折れるようにする。
// Chrome 系は CSS の word-break: auto-phrase でも折れ方が良くなるが、iPhone の Safari には効かないため、
// 見出し・案内・注意書きのような決まった短い文だけ、区切りを手で入れる（UI採点 M8）。
export const PHRASE_BREAK = '|'

export const phraseParts = (text: string): string[] => text.split(PHRASE_BREAK)

/** 区切りの印を外した文。読み上げ用の名前・title・テストで使う */
export const plainText = (text: string): string => phraseParts(text).join('')
