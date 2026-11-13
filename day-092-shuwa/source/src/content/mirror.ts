/** 左利きは右利きの鏡写し。「左右」のような対を表す語は保つ。 */
export function mirrorText(text: string, dominant: 'right' | 'left'): string {
  if (dominant === 'right') return text;
  return text.replace(/左右|右左|左|右/g, word => word === '左' ? '右' : word === '右' ? '左' : word);
}
