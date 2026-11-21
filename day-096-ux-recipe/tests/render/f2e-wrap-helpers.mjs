// 部品が元から持つ span も文言も、比較対象として残す。
export function stripWrap(html) {
  return html.replaceAll('<wbr>', '').replace(/<span class="uxr-nb">([^<]*)<\/span>/g, '$1');
}
