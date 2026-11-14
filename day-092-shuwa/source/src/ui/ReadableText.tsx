import type { ComponentChildren } from 'preact';
// BudouX 0.10.2 の入口（index）は、HTML を扱う部品のために Node 用の DOM（linkedom）まで読み込み、
// Vite 8 の開発サーバーが起動できなくなる。文の区切りに使うのは Parser と日本語のモデルだけなので、
// DOM を読まないこの2つを直接読む（package.json の exports に無いので、相対の住所で指す）。
import { Parser } from '../../node_modules/budoux/module/parser.js';
import { model as jaModel } from '../../node_modules/budoux/module/data/models/ja.js';

const parser = new Parser(jaModel);
const cannotStartLine = /^[、。，．・！？!?：；:;）)］\]｝}」』】〉》〕〗〙〛’”]/u;
const cannotEndLine = /[（(［\[｛{「『【〈《〔〖〘〚‘“・]$/u;

/** BudouXの文節境界のうち、禁則にかかる境界は前後を結合する。 */
export function readableParts(text: string): string[] {
  return parser.parse(text).reduce<string[]>((parts, part) => {
    const previous = parts.at(-1);
    if (previous !== undefined && (cannotStartLine.test(part.trimStart()) || cannotEndLine.test(previous.trimEnd()))) parts[parts.length - 1] += part;
    else parts.push(part);
    return parts;
  }, []);
}

/**
 * 「・」は keep-all でも後ろで折れる（行末に中黒が残る）。「・」と次の1文字を折れない塊にする。
 * 文字は足さない（U+2060 などを入れると、文字列の検索や読み上げの名前が変わる）。
 */
function keepDots(part: string): ComponentChildren {
  const pieces = part.split(/(・.)/u);
  return pieces.length === 1 ? part : pieces.map(piece => /^・./u.test(piece) ? <span class="readable-nowrap">{piece}</span> : piece);
}

/** inlineのまま区切り、見出しの読み上げ名に空白を増やさない。 */
export function ReadableText({ text, endAdornment }: { text: string; endAdornment?: ComponentChildren }) {
  const parts = readableParts(text);
  return <span class="readable">{parts.map((part, index) => <>{index > 0 && <wbr />}{endAdornment && index === parts.length - 1 ? <span class="readable-tail">{keepDots(part)}{endAdornment}</span> : keepDots(part)}</>)}</span>;
}
