export type DataOperation = 'csv-json' | 'json-csv' | 'csv-tsv' | 'tsv-csv' | 'json-pretty' | 'json-minify' | 'json-yaml' | 'yaml-json' | 'markdown-html' | 'html-text' | 'base64-encode' | 'base64-decode' | 'url-encode' | 'url-decode';
export type DataOptions = { operation: DataOperation; encoding: 'utf-8' | 'shift-jis'; csvHeader: boolean; protectFormulas: boolean };
export type TransformOutput = { text: string; extension: string; mime: string; warnings: string[] };
export type OperationInfo = { id: DataOperation; label: string; inputLabel: string; description: string; extension: string; mime: string; accept: string };
const text = 'text/plain;charset=utf-8';
export const DATA_OPERATIONS: readonly OperationInfo[] = [
  { id:'csv-json', label:'CSV → JSON', inputLabel:'CSV', description:'見出しをキーにしたJSON配列に変換', extension:'json', mime:'application/json;charset=utf-8', accept:'.csv,.txt' },
  { id:'json-csv', label:'JSON → CSV', inputLabel:'JSON', description:'配列のデータを表計算で使えるCSVに変換', extension:'csv', mime:'text/csv;charset=utf-8', accept:'.json,.txt' },
  { id:'csv-tsv', label:'CSV → TSV', inputLabel:'CSV', description:'カンマ区切りからタブ区切りへ', extension:'tsv', mime:'text/tab-separated-values;charset=utf-8', accept:'.csv,.txt' },
  { id:'tsv-csv', label:'TSV → CSV', inputLabel:'TSV', description:'タブ区切りからカンマ区切りへ', extension:'csv', mime:'text/csv;charset=utf-8', accept:'.tsv,.txt' },
  { id:'json-pretty', label:'JSONを整形', inputLabel:'JSON', description:'インデントを付けて読みやすく', extension:'json', mime:'application/json;charset=utf-8', accept:'.json,.txt' },
  { id:'json-minify', label:'JSONを圧縮', inputLabel:'JSON', description:'余分な空白を取り除いてコンパクトに', extension:'json', mime:'application/json;charset=utf-8', accept:'.json,.txt' },
  { id:'json-yaml', label:'JSON → YAML', inputLabel:'JSON', description:'構造とデータ型を保ってYAMLへ', extension:'yaml', mime:'application/yaml;charset=utf-8', accept:'.json,.txt' },
  { id:'yaml-json', label:'YAML → JSON', inputLabel:'YAML', description:'JSONで表せるデータを変換', extension:'json', mime:'application/json;charset=utf-8', accept:'.yaml,.yml,.txt' },
  { id:'markdown-html', label:'Markdown → HTML', inputLabel:'Markdown', description:'スクリプト・画像・埋込を除いたHTMLへ', extension:'html', mime:'text/html;charset=utf-8', accept:'.md,.markdown,.txt' },
  { id:'html-text', label:'HTML → テキスト', inputLabel:'HTML', description:'見出し・段落の本文を取り出す', extension:'txt', mime:text, accept:'.html,.htm,.txt' },
  { id:'base64-encode', label:'テキスト → Base64', inputLabel:'テキスト', description:'日本語もUTF-8でBase64化', extension:'txt', mime:text, accept:'.txt' },
  { id:'base64-decode', label:'Base64 → テキスト', inputLabel:'Base64', description:'UTF-8のテキストに戻す', extension:'txt', mime:text, accept:'.txt,.base64' },
  { id:'url-encode', label:'URLエンコード', inputLabel:'テキスト', description:'URLの一部分をpercent符号化', extension:'txt', mime:text, accept:'.txt' },
  { id:'url-decode', label:'URLデコード', inputLabel:'percent符号化テキスト', description:'percent符号を元の文字に戻す', extension:'txt', mime:text, accept:'.txt' },
];
export function operationInfo(operation: DataOperation): OperationInfo { const result = DATA_OPERATIONS.find(item => item.id === operation); if (!result) throw new Error('Unsupported data operation'); return result; }
export const DEFAULT_DATA_OPTIONS = { encoding: 'utf-8', csvHeader: true, protectFormulas: true } as const;
