import { describe, expect, it } from 'vitest';
import { safeFilename } from '../../src/app/download';
describe('saving an actual format under a safe name', () => {
  it.each([['application/zip','.zip'],['application/json;charset=utf-8','.json'],['text/csv;charset=utf-8','.csv'],['application/yaml;charset=utf-8','.yaml'],['text/html;charset=utf-8','.html'],['text/plain;charset=utf-8','.txt']])('keeps the extension for %s',(mime,extension)=>{ expect(safeFilename('result.wrong',mime)).toBe('result'+extension); });
  it('does not keep an incorrect or executable extension', () => { expect(safeFilename('photo.exe', 'image/webp')).toBe('photo.webp'); });
  it('removes path and control characters while preserving Japanese', () => { expect(safeFilename('../private/写真\n.png','application/pdf')).toBe('写真.pdf'); });
  it('uses a useful name for empty and path-only names', () => { expect(safeFilename('...','image/png')).toBe('converted.png'); });
});
