import { Fragment } from 'react'
import { phraseParts } from '../../lib/phrases'

// keep-all でも、閉じかっこの後ろでは折れてしまう（「グリーン」／を）。文節の中の閉じかっこの後ろにだけ、
// 折り返しを止める見えない文字（U+2060 WORD JOINER）を挟む
const holdAfterClosingBracket = (part: string): string => part.replace(/([」』）])(?=.)/gu, '$1\u2060')

/** 「|」で区切った文を、文節の切れ目に <wbr> を入れて出す。.jp-phrase（word-break: keep-all）で、語の途中では折れない */
export function Phrases({ text }: { text: string }) {
  return (
    <span className="jp-phrase">
      {phraseParts(text).map((part, index) => (
        <Fragment key={index}>
          {index > 0 && <wbr />}
          {holdAfterClosingBracket(part)}
        </Fragment>
      ))}
    </span>
  )
}
