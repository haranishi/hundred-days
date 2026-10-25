import { describe,expect,it } from 'vitest';
import { decodeDataFile } from '../../src/features/data/convert';
describe('strict text decoding',()=>{
  it('decodes UTF-8 BOM and Japanese without guessing',async()=>{expect(await decodeDataFile(new File([new Uint8Array([239,187,191,227,129,130])],'test.txt'),'utf-8')).toBe('あ');});
  it('decodes Shift_JIS only when selected',async()=>{const file=new File([new Uint8Array([0x82,0xa0])],'test.txt');expect(await decodeDataFile(file,'shift-jis')).toBe('あ');await expect(decodeDataFile(file,'utf-8')).rejects.toThrow(/文字コード/);});
  it('forces pasted UTF-8 even when the old file setting was Shift_JIS',async()=>{expect(await decodeDataFile(new File(['日本語'],'pasted.txt',{type:'text/plain;charset=utf-8'}),'shift-jis')).toBe('日本語');});
  it('preserves a pasted leading BOM as text',async()=>{expect(await decodeDataFile(new File(['\uFEFFtext'],'pasted.txt',{type:'text/plain;charset=utf-8'}),'utf-8')).toBe('\uFEFFtext');});
  it('checks the size before reading',async()=>{const file=new File([new Uint8Array(2*1024*1024+1)],'too-large.txt');await expect(decodeDataFile(file,'utf-8')).rejects.toThrow(/2MiB/);});
});
