import { CLIENT_ONLY } from './runtime';
import type { PDFOperation } from '../features/pdf/types';
import { DATA_OPERATIONS, type DataOperation } from '../features/data/operations';
export type Category = 'images' | 'pdf' | 'documents' | 'data';
type BaseTool = { id: string; label: string; description: string; accept: string; multiple: boolean; help: string; ordered?: boolean };
export type CatalogTool = BaseTool & ({ category: 'images' } | { category: 'pdf'; operation: PDFOperation } | { category: 'documents'; kind: 'docx' | 'xlsx' | 'pptx' } | { category: 'data'; operation: DataOperation });
const imageAccept = 'image/jpeg,image/png,image/webp';
const pdfTools: { operation: PDFOperation; label: string; description: string }[] = [
  {operation:'images-pdf',label:'画像 → PDF',description:'画像を好きな順番で、1つのPDFにまとめます。'},
  {operation:'pdf-images',label:'PDF → 画像',description:'指定したページをPNG・JPGにしてZIPで保存します。'},
  {operation:'merge',label:'PDFを結合',description:'複数のPDFを、並べた順に1つにまとめます。'},
  {operation:'extract',label:'PDFのページを抽出',description:'必要なページだけを取り出して保存します。'},
  {operation:'split',label:'PDFを分割',description:'1ページずつのPDFに分け、ZIPでまとめて保存します。'},
  {operation:'reorder',label:'PDFのページを並べ替え',description:'ページの順番を指定して、新しいPDFを作ります。'},
  {operation:'rotate',label:'PDFのページを回転',description:'横向き・逆さのページの向きを整えます。'},
  {operation:'text',label:'PDF → テキスト',description:'PDFに含まれる文字を取り出します。画像の文字認識は行いません。'},
  {operation:'optimize',label:'PDFを最適化',description:'PDFの内部構造を整理します。容量が減らない場合もあります。'},
];
const ALL_TOOLS: CatalogTool[] = [
  {id:'images',category:'images',label:'画像の形式・サイズ・比率',description:'JPG・PNG・WebPの相互変換と、サイズ・比率の調整。',accept:imageAccept,multiple:true,help:'JPG・PNG・静止WebP / 1枚10MiB、合計30MiBまで'},
  ...pdfTools.map(tool => ({...tool,id:`pdf-${tool.operation}`,category:'pdf' as const,accept:tool.operation==='images-pdf'?imageAccept:'application/pdf',multiple:tool.operation==='images-pdf'||tool.operation==='merge',ordered:tool.operation==='images-pdf'||tool.operation==='merge',help:tool.operation==='images-pdf'?'画像10枚まで / 合計30MiB':'PDF 1件10MiB / 合計30MiB・100ページまで'})),
  ...([['docx','Word'],['xlsx','Excel'],['pptx','PowerPoint']] as const).map(([kind,name])=>({id:`${kind}-pdf`,category:'documents' as const,kind,label:`${name} → PDF`,description:`${name}ファイルを、提出・共有しやすいPDFに。`,accept:`.${kind}`,multiple:false,help:`${name}（.${kind}） / 10MiBまで`})),
  ...DATA_OPERATIONS.map(tool=>({id:`data-${tool.id}`,category:'data' as const,operation:tool.id,label:tool.label,description:`${tool.inputLabel}を入力して、必要な形式へ変換します。`,accept:'.txt,.csv,.tsv,.json,.yaml,.yml,.md,.markdown,.html,.htm',multiple:false,help:'テキスト貼付・ファイル入力 / 2MiBまで'})),
];
export const TOOLS = ALL_TOOLS.filter(tool => !CLIENT_ONLY || tool.category !== 'documents');
const ALL_CATEGORIES: { id: Category; label: string; aria: string; icon: string }[] = [
  {id:'images',label:'画像',aria:'画像を変換',icon:'image'},
  {id:'pdf',label:'PDF',aria:'PDFツール',icon:'file'},
  {id:'documents',label:'文書',aria:'文書を変換',icon:'file'},
  {id:'data',label:'データ',aria:'テキスト・データ変換',icon:'data'},
];

export const CATEGORIES = ALL_CATEGORIES.filter(category => TOOLS.some(tool => tool.category === category.id));
