import { ConversionFailure } from '../../shared/errors';
function invalid(message: string): never { throw new ConversionFailure('INVALID_FILE', message); }
export function parsePages(value: string, pageCount: number): number[] {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > 100) invalid('PDFは1〜100ページで選んでください。');
  if (!value.trim()) return Array.from({ length: pageCount }, (_, i) => i);
  if (value.length > 2000) invalid('ページの指定が長すぎます。');
  const selected: number[] = [];
  for (const raw of value.replace(/[、，]/g, ',').split(',')) {
    const match = raw.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) invalid('ページは「1-3,5」のように指定してください。');
    const first = Number(match[1]), last = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 1 || last < first || last > pageCount) invalid(`ページは1〜${pageCount}の範囲で指定してください。`);
    for (let page = first; page <= last; page++) { if (selected.includes(page - 1)) invalid('同じページを重複して指定できません。'); selected.push(page - 1); }
  }
  return selected;
}
export function parseOrder(value: string, pageCount: number): number[] {
  if (value.trim().toLowerCase() === 'reverse') return parsePages('', pageCount).reverse();
  const order = parsePages(value, pageCount);
  if (order.length !== pageCount) invalid('並べ替えでは全ページを1回ずつ指定してください。');
  return order;
}
