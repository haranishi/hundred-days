import { describe, expect, it } from 'vitest';
import { transformCore } from '../../src/features/data/core';
const run = (input: string, operation: Parameters<typeof transformCore>[1], options = {}) => transformCore(input, operation, options).text;
describe('structured data conversions', () => {
  it('parses quoted Japanese CSV without changing numeric-looking strings', () => { expect(JSON.parse(run('name,id,note\r\n"田中,一郎",001,"a\nb"\r\n', 'csv-json'))).toEqual([{name:'田中,一郎',id:'001',note:'a\nb'}]); });
  it('supports headerless CSV and rejects duplicate or blank headers', () => { expect(JSON.parse(run('a,1\nb,2','csv-json',{csvHeader:false}))).toEqual([['a','1'],['b','2']]); expect(()=>run('x,x\n1,2','csv-json')).toThrow(/重複/); expect(()=>run('x,\n1,2','csv-json')).toThrow(/空/); });
  it('rejects row-width mismatches and malformed quotes', () => { expect(()=>run('a,b\n1','csv-json')).toThrow(/列/); expect(()=>run('a,b\n"unterminated,2','csv-json')).toThrow(); });
  it('keeps dangerous object keys as data, without prototype changes', () => { const output=JSON.parse(run('__proto__,constructor\nx,y','csv-json')); expect(output[0].__proto__).toBe('x'); expect(output[0].constructor).toBe('y'); expect(({} as Record<string,unknown>).x).toBeUndefined(); });
  it('converts JSON rows with union columns and safe formula strings', () => { const output=run('[{"name":"=SUM(A1)","num":-12},{"name":"ok","empty":null}]','json-csv'); expect(output).toContain("'=SUM(A1)"); expect(output).toContain('-12'); expect(output.split('\r\n')[0]).toBe('name,num,empty'); });
  it('also protects formula-like CSV header names', () => { expect(run('[{"=cmd":"safe"}]','json-csv').split('\r\n')[0]).toContain("'=cmd"); });
  it('allows explicit formula opt-out and protects whitespace-prefixed formulas', () => { expect(run('[{"x":"  =1+1"}]','json-csv')).toContain("'  =1+1"); expect(run('[{"x":"=1+1"}]','json-csv',{protectFormulas:false})).not.toContain("'=1+1"); });
  it('rejects nested and mixed JSON rows', () => { expect(()=>run('[{"x":{"y":1}}]','json-csv')).toThrow(/平坦/); expect(()=>run('[{"x":1},[2]]','json-csv')).toThrow(); });
  it('rejects rows with no columns instead of losing them', () => { for(const input of ['[{}]','[[]]']) expect(()=>run(input,'json-csv')).toThrow(/1列/); });
  it('transfers CSV and TSV while keeping quoted delimiter and empty fields', () => { const tsv=run('name,note,empty\r\na,"x,y",','csv-tsv'); expect(tsv).toBe('name\tnote\tempty\r\na\tx,y\t'); expect(run(tsv,'tsv-csv')).toBe('name,note,empty\r\na,"x,y",'); });
  it('formats and minifies valid JSON', () => { expect(run('{"a":[1,true,null]}','json-minify')).toBe('{"a":[1,true,null]}'); expect(run('{"a":1}','json-pretty')).toContain('\n  "a": 1\n'); });
  it('rejects duplicate JSON keys and values outside safe number semantics', () => { expect(()=>run('{"a":1,"a":2}','json-pretty')).toThrow(/重複/); expect(()=>run('{"n":9007199254740993}','json-pretty')).toThrow(/整数/); expect(()=>run('1e999','json-pretty')).toThrow(/数値/); });
  it('round-trips JSON-compatible YAML with Japanese and quotes', () => { const json='{"名前":"田中","items":[1,true,null,"001"]}'; expect(JSON.parse(run(run(json,'json-yaml'),'yaml-json'))).toEqual(JSON.parse(json)); });
  it('rejects YAML duplicates, unknown tags, non-string map keys and cycles', () => { for(const input of ['a: 1\na: 2','!unsupported value','1: value','a: &x [*x]']) expect(()=>run(input,'yaml-json')).toThrow(); });
  it('rejects unsupported YAML numbers and deep JSON', () => { expect(()=>run('a: 9007199254740993','yaml-json')).toThrow(/整数/); expect(()=>run('a: .inf','yaml-json')).toThrow(); expect(()=>run('['.repeat(101)+'0'+']'.repeat(101),'json-pretty')).toThrow(/深/); });
  it('rejects output expansion beyond the output limit', () => { expect(()=>run('['.repeat(99)+Array.from({length:30000},()=>0).join(',')+']'.repeat(99),'json-pretty')).toThrow(/5MiB/); });
  it('limits CSV columns and avoids silent truncation', () => { expect(()=>run(Array.from({length:501},(_,i)=>`c${i}`).join(','),'csv-json')).toThrow(/列|上限/); });
});
describe('Unicode encodings', () => {
  it('round-trips UTF-8 Base64 including emoji', () => { const text='こんにちは🌸'; expect(run(run(text,'base64-encode'),'base64-decode')).toBe(text); });
  it('preserves a leading Unicode BOM character in pasted encodings', () => { const text='\uFEFF日本語'; expect(run(run(text,'base64-encode'),'base64-decode')).toBe(text); expect(run(run(text,'url-encode'),'url-decode')).toBe(text); });
  it('rejects illegal and noncanonical Base64 and invalid UTF-8', () => { for(const input of ['not base64!','YQ','YR==','/w==']) expect(()=>run(input,'base64-decode')).toThrow(); });
  it('allows whitespace in standard Base64', () => { expect(run('Y Q==\n','base64-decode')).toBe('a'); });
  it('uses URL component semantics and rejects malformed percent encoding', () => { expect(run(run('日本語 & + /','url-encode'),'url-decode')).toBe('日本語 & + /'); expect(run('a+b','url-decode')).toBe('a+b'); expect(()=>run('%E3%81','url-decode')).toThrow(); });
});
