import Papa from 'papaparse';
import { parseDocument, stringify as yamlStringify } from 'yaml';
import { marked } from 'marked';
import { ConversionFailure } from '../../shared/errors';
import { LIMITS } from '../../shared/limits';
import { DEFAULT_DATA_OPTIONS, operationInfo, type DataOperation, type DataOptions, type TransformOutput } from './operations';
export const DATA_LIMITS = { input: LIMITS.dataInputBytes, output: LIMITS.dataOutputBytes, markup: 256 * 1024, rows: 20_000, columns: 500, cells: 100_000, nodes: 100_000, depth: 100 } as const;
type Primitive = string | number | boolean | null;
type JsonValue = Primitive | JsonValue[] | { [key: string]: JsonValue };
function invalid(message: string): never { throw new ConversionFailure('INVALID_FILE', message); }
function limited(message: string): never { throw new ConversionFailure('LIMIT_EXCEEDED', message); }
function validUnicode(text: string) { for (let i=0;i<text.length;i++) { const n=text.charCodeAt(i); if(n>=0xd800&&n<=0xdbff){const next=text.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))invalid('入力に不完全なUnicode文字があります。');}else if(n>=0xdc00&&n<=0xdfff)invalid('入力に不完全なUnicode文字があります。'); } }
export function assertInput(text: string, operation: DataOperation): void {
  if (new TextEncoder().encode(text).byteLength > DATA_LIMITS.input) limited('テキスト入力は2MiB以内にしてください。');
  if (['markdown-html','html-text'].includes(operation) && new TextEncoder().encode(text).byteLength > DATA_LIMITS.markup) limited('Markdown・HTMLは256KiB以内にしてください。');
  validUnicode(text);
}
function toJson(value: unknown, ancestors = new Set<object>(), depth = 0, count = { value: 0 }): JsonValue {
  if(depth > DATA_LIMITS.depth) limited('データの入れ子が深すぎます。100階層以内にしてください。');
  if(++count.value > DATA_LIMITS.nodes) limited('データの要素数が上限を超えています。');
  if(value===null || typeof value==='string' || typeof value==='boolean')return value;
  if(typeof value==='number') { if(!Number.isFinite(value))invalid('有限の数値だけを変換できます。'); if(Number.isInteger(value)&&!Number.isSafeInteger(value))invalid('大きな整数は文字列として引用符で囲んでください。'); return value; }
  if(typeof value==='bigint') { if(value>BigInt(Number.MAX_SAFE_INTEGER)||value<BigInt(Number.MIN_SAFE_INTEGER))invalid('大きな整数は文字列として引用符で囲んでください。'); return Number(value); }
  if(typeof value!=='object')invalid('JSONで表せないデータ型が含まれています。');
  if(ancestors.has(value))invalid('循環するデータはJSONへ変換できません。');
  ancestors.add(value);
  try {
    if(Array.isArray(value))return value.map(item=>toJson(item,ancestors,depth+1,count));
    const result: {[key:string]:JsonValue}=Object.create(null) as {[key:string]:JsonValue};
    const entries: [unknown,unknown][]=value instanceof Map?[...value.entries()]:Object.entries(value);
    if(!(value instanceof Map)&&![Object.prototype,null].includes(Object.getPrototypeOf(value) as object|null))invalid('JSONで表せないデータ型が含まれています。');
    for(const [key,item]of entries){if(typeof key!=='string')invalid('JSONのキーにする名前は文字列で指定してください。');result[key]=toJson(item,ancestors,depth+1,count);}
    return result;
  } finally { ancestors.delete(value); }
}
function parseJson(text: string): JsonValue {
  let value: unknown;
  try { value=JSON.parse(text); } catch { invalid('JSONの書き方を確認してください。キーと文字列は二重引用符で囲みます。'); }
  const stack: (Set<string>|null)[]=[];
  const token = /"(?:\\.|[^"\\])*"|[{}\[\]]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  for(const match of text.matchAll(token)){
    const part=match[0];
    if(part==='{')stack.push(new Set()); else if(part==='[')stack.push(null); else if(part==='}'||part===']')stack.pop();
    else if(part.startsWith('"')){
      let i=match.index+part.length;while(i<text.length&&/\s/.test(text[i]!))i++;
      if(text[i]===':'){const current=stack.at(-1);if(current){const key=JSON.parse(part) as string;if(current.has(key))invalid('JSONのキーが重複しています。元のデータを確認してください。');current.add(key);}}
    }else{const number=Number(part);if(!Number.isFinite(number))invalid('有限の数値だけを変換できます。');if(Number.isInteger(number)&&!Number.isSafeInteger(number))invalid('大きな整数は文字列として引用符で囲んでください。');}
  }
  return toJson(value);
}
function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][]=[];let cells=0;let failure: string|undefined;let sizeFailure=false;
  Papa.parse<string[]>(text,{delimiter,skipEmptyLines:false,dynamicTyping:false,step(result,parser){
    if(result.errors.length){failure='引用符などCSV/TSVの書き方を確認してください。';parser.abort();return;}
    cells+=result.data.length;
    if(result.data.length>DATA_LIMITS.columns||rows.length>=DATA_LIMITS.rows||cells>DATA_LIMITS.cells){failure='表の行・列・セル数が上限を超えています（2万行・500列・10万セル）。';sizeFailure=true;parser.abort();return;}
    rows.push(result.data);
  }});
  if(failure){if(sizeFailure)limited(failure);invalid(failure);}
  if(rows.at(-1)?.length===1&&rows.at(-1)?.[0]===''&&/[\r\n]$/.test(text))rows.pop();
  if(rows.length===1&&rows[0]?.length===1&&rows[0][0]===''&&text==='')return [];
  if(rows.length>1&&rows.some(row=>row.length!==rows[0]!.length))invalid('行によって列の数が異なります。空セルも区切り文字で指定してください。');
  return rows;
}
function unparse(rows: (Primitive|string|undefined)[][], delimiter: string, protect: boolean, fields?: string[]): string {
  const config: Papa.UnparseConfig={delimiter,newline:'\r\n',escapeFormulae:protect?/^[\t\r\n]|^\s*[=+@-]/u:false};
  return fields?Papa.unparse({fields,data:rows},config):Papa.unparse(rows,config);
}
function csvToJson(text: string, header: boolean): string {
  const rows=parseDelimited(text,',');if(!header)return JSON.stringify(rows,null,2);
  const columns=rows.shift();if(!columns)return '[]';
  if(columns.some(key=>!key.trim()))invalid('見出しに空の列があります。名前を付けるか、見出しなしを選んでください。');
  if(new Set(columns).size!==columns.length)invalid('見出しが重複しています。列の名前を変えてください。');
  const output=rows.map(row=>{if(row.length!==columns.length)invalid('行によって列の数が異なります。空セルも区切り文字で指定してください。');const object:Record<string,string>=Object.create(null) as Record<string,string>;columns.forEach((key,i)=>{object[key]=row[i]!;});return object;});
  return JSON.stringify(output,null,2);
}
function jsonToCsv(text: string, protect: boolean): string {
  const value=parseJson(text);if(!Array.isArray(value))invalid('CSVにするデータは平坦なobjectの配列か、値の2次元配列にしてください。');
  if(value.length>DATA_LIMITS.rows)limited('表は2万行以内にしてください。');if(!value.length)return '';
  const primitive=(cell:JsonValue):cell is Primitive=>cell===null||typeof cell!=='object';
  if(value.every(Array.isArray)){
    const rows=value as JsonValue[][];const width=rows[0]!.length;if(width===0)invalid('CSVにする表には1列以上が必要です。');
    if(width>DATA_LIMITS.columns||width*rows.length>DATA_LIMITS.cells)limited('表の列・セル数が上限を超えています。');
    if(rows.some(row=>row.length!==width||row.some(cell=>!primitive(cell))))invalid('CSVにする配列は、列数が同じ平坦な2次元配列にしてください。');
    return unparse(rows as Primitive[][],',',protect);
  }
  if(value.some(row=>row===null||Array.isArray(row)||typeof row!=='object'))invalid('CSVにするデータは平坦なobjectの配列にしてください。');
  const rows=value as {[key:string]:JsonValue}[];const fields=[...new Set(rows.flatMap(row=>Object.keys(row)))];
  if(fields.length>DATA_LIMITS.columns||fields.length*rows.length>DATA_LIMITS.cells)limited('表の列・セル数が上限を超えています。');
  if(fields.length===0)invalid('CSVにするobjectには1列以上が必要です。');
  const cells=rows.map(row=>fields.map(key=>{const cell=row[key];if(cell!==undefined&&!primitive(cell))invalid('入れ子の値はCSVへ変換できません。平坦な表にしてください。');return cell;}));
  return unparse(cells as (Primitive|undefined)[][],',',protect,fields);
}
function encodeBase64(text:string):string {const bytes=new TextEncoder().encode(text);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
function decodeBase64(text:string):string {
  const compact=text.replace(/[ \t\r\n]/g,'');if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact))invalid('標準Base64の文字と末尾の=を確認してください。');
  try{const binary=atob(compact);const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));const normalized=btoa(binary);if(normalized!==compact)invalid('Base64の末尾の符号が不正です。');return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch(error){if(error instanceof ConversionFailure)throw error;invalid('Base64の内容がUTF-8テキストではありません。');}
}
export function transformCore(input: string, operation: DataOperation, settings: Partial<Omit<DataOptions,'operation'>> = {}): TransformOutput {
  const info=operationInfo(operation);assertInput(input,operation);const text=['base64-encode','base64-decode','url-encode','url-decode'].includes(operation)?input:input.replace(/^\uFEFF/,'');const options={...DEFAULT_DATA_OPTIONS,...settings};let output='';const warnings:string[]=[];
  try{
    switch(operation){
      case 'csv-json':output=csvToJson(text,options.csvHeader);break;
      case 'json-csv':output=jsonToCsv(text,options.protectFormulas);warnings.push('CSVでは型の情報を持てません。nullや存在しない列は空欄になります。');break;
      case 'csv-tsv':output=unparse(parseDelimited(text,','),'\t',options.protectFormulas);break;
      case 'tsv-csv':output=unparse(parseDelimited(text,'\t'),',',options.protectFormulas);break;
      case 'json-pretty':output=JSON.stringify(parseJson(text),null,2);break;
      case 'json-minify':output=JSON.stringify(parseJson(text));break;
      case 'json-yaml':output=yamlStringify(parseJson(text),{lineWidth:0,defaultStringType:'QUOTE_DOUBLE',defaultKeyType:'PLAIN'});break;
      case 'yaml-json':{const document=parseDocument(text,{version:'1.2',schema:'core',strict:true,uniqueKeys:true,intAsBigInt:true,prettyErrors:false});if(document.errors.length||document.warnings.length)invalid('YAMLの書き方とタグを確認してください。1文書のJSON互換データだけを変換できます。');output=JSON.stringify(toJson(document.toJS({mapAsMap:true,maxAliasCount:50})),null,2);break;}
      case 'markdown-html':output=marked.parse(text,{async:false,gfm:true}) as string;warnings.push('スクリプト・外部画像・埋込・フォームなどを省いたHTMLです。');break;
      case 'html-text':output=text;warnings.push('スクリプト・装飾・画像・埋込を除いた本文を取り出します。');break;
      case 'base64-encode':output=encodeBase64(text);break;
      case 'base64-decode':output=decodeBase64(text);break;
      case 'url-encode':output=encodeURIComponent(text);break;
      case 'url-decode':output=decodeURIComponent(text);break;
    }
  }catch(error){if(error instanceof ConversionFailure)throw error;invalid(operation==='yaml-json'?'YAMLを変換できません。循環・alias・JSONで表せない値を確認してください。':operation==='url-decode'?'URLのpercent符号が不正です。': '入力の構造を確認してください。');}
  if(new TextEncoder().encode(output).byteLength>DATA_LIMITS.output)limited('変換結果が5MiBを超えます。入力を小さくしてください。');
  return {text:output,extension:info.extension,mime:info.mime,warnings};
}
