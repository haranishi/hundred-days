import sax from 'sax';
import { posix } from 'node:path';
import { DocumentError } from './errors.js';
import { OFFICE_FORMATS, officeNamespace, type OfficeKind } from './formats.js';
export interface PackageInfo { names: Set<string>; types: Map<string,string>; relations: { source: string; type: string; target: string; external: boolean }[]; documentRoot: boolean; roots?: Set<OfficeKind>; }
const allowedRelations = new Set(['officeDocument','styles','settings','theme','fontTable','numbering','webSettings','header','footer','image','hyperlink','footnotes','endnotes','comments','customXml','customXmlProps','extended-properties','core-properties','custom-properties','thumbnail','glossaryDocument','people','commentsExtended','commentsIds','person','chart','chartStyle','chartColorStyle','diagramData','diagramLayout','diagramQuickStyle','diagramColors','chartUserShapes','control','printerSettings','worksheet','sharedStrings','calcChain','table','pivotTable','pivotCacheDefinition','pivotCacheRecords','drawing','vmlDrawing','slide','slideMaster','slideLayout','notesSlide','notesMaster','presProps','viewProps','tableStyles','themeOverride','handoutMaster','tags','commentAuthors']);
function unsafe(): never { throw new DocumentError('UNSAFE_DOCUMENT','外部参照や埋込オブジェクトのある文書は変換できません。画像を埋め込み、標準のOffice文書として保存し直してください。'); }
export function createXmlCheck(name: string, info: PackageInfo): sax.SAXParser {
  const parser = sax.parser(true,{xmlns:true,trim:false});
  parser.ondoctype = unsafe;
  parser.onerror = () => { throw new DocumentError('INVALID_FILE','文書の構造を読み取れません。Officeで保存し直してください。'); };
  let xmlDepth=0,instructionDepth=0, orphanInstructions='',formulaDepth=0,formulaText='';
  const checkFormula=(text:string)=>{
    if(/\b(?:WEBSERVICE|RTD|DDE|IMAGE|STOCKHISTORY|PY|CUBEVALUE|CUBEMEMBER)\s*\(|\[[^\]]+\][^!]*!|\|[^!]+!/i.test(text))unsafe();
    if(/\bHYPERLINK\s*\(/i.test(text)){const match=text.match(/\bHYPERLINK\s*\(\s*"((?:""|[^"])*)"/i);if(!match||!/^(?:https?:\/\/|mailto:)/i.test(match[1]!.replace(/""/g,'"')))unsafe();}
  };
  const fields:{text:string;collecting:boolean}[]=[];
  const checkInstruction=(text:string)=>{if(/\b(?:DDEAUTO|DDE|INCLUDETEXT|INCLUDEPICTURE)\b/i.test(text))unsafe();};
  const addInstruction=(text:string)=>{const field=fields.at(-1);if(field?.collecting){field.text+=text;if(field.text.length>65536)unsafe();checkInstruction(field.text);}else{orphanInstructions+=text;if(orphanInstructions.length>65536)unsafe();checkInstruction(orphanInstructions);}};
  parser.onopentag = node => {
    xmlDepth++;
    if(formulaDepth)unsafe();
    const attribute = (key: string): string => {
      const wordAttribute=key.startsWith('w:'),local=key.split(':').at(-1);
      for(const value of Object.values(node.attributes)){
        if(typeof value==='string')continue;
        const wordNamespace=value.uri==='http://schemas.openxmlformats.org/wordprocessingml/2006/main'||value.uri==='http://purl.oclc.org/ooxml/wordprocessingml/main';
        if(value.local===local&&(wordAttribute?wordNamespace:value.uri===''))return value.value;
      }
      return '';
    };
    const qualified=node as sax.QualifiedTag;
    const local = qualified.local || node.name;
    if((local==='f'||local==='definedName')&&officeNamespace(qualified.uri,'spreadsheetml')){formulaDepth=xmlDepth;formulaText='';}
    if(['externalData','ddeLink','oleLink','externalBook','webQuery','databasePr','dataFeedPr'].includes(local))unsafe();
    if((local==='sheetProtection'&&(['1','true','on'].includes(attribute('sheet'))||!!attribute('password')||!!attribute('hashValue')))||(local==='workbookProtection'&&['lockStructure','lockWindows','lockRevision','workbookPassword','revisionsPassword','workbookHashValue','revisionsHashValue'].some(key=>!['','0','false','off'].includes(attribute(key))))||local==='modifyVerifier')throw new DocumentError('PASSWORD_PROTECTED','保護された文書は変換できません。保護を解除して保存してください。');
    for(const [kind,format] of Object.entries(OFFICE_FORMATS)){if(xmlDepth===1&&name===format.path&&local===format.root&&officeNamespace(qualified.uri,format.namespace)){(info.roots??=new Set()).add(kind as OfficeKind);if(kind==='docx')info.documentRoot=true;}}
    if(local==='fldChar'){const type=attribute('w:fldCharType')||attribute('fldCharType');if(type==='begin')fields.push({text:'',collecting:true});else if(type==='separate'){const field=fields.at(-1);if(field){checkInstruction(field.text);field.collecting=false;}}else if(type==='end'){const field=fields.pop();if(field)checkInstruction(field.text);}}
    if(local==='instrText')instructionDepth++;
    if(local==='fldSimple' && /\b(?:DDEAUTO|DDE|INCLUDETEXT|INCLUDEPICTURE)\b/i.test(attribute('w:instr')||attribute('instr')))unsafe();
    if (['altChunk','object','oleObject','control'].includes(local)) unsafe();
    if (local === 'documentProtection' && ['1','true','on'].includes(attribute('w:enforcement') || attribute('enforcement'))) throw new DocumentError('PASSWORD_PROTECTED','保護された文書は変換できません。保護を解除して保存してください。');
    if (name === '[Content_Types].xml' && local === 'Override') {
      const part=attribute('PartName'),type=attribute('ContentType');
      if (!part.startsWith('/') || /macroenabled|vba|activex|oleobject/i.test(type)) unsafe();
      info.types.set(part.slice(1),type);
    }
    if (name === '[Content_Types].xml' && local === 'Default' && /macroenabled|vba|activex|oleobject/i.test(attribute('ContentType'))) unsafe();
    if (name.endsWith('.rels') && local === 'Relationship') {
      const type=attribute('Type'),target=attribute('Target'),mode=attribute('TargetMode');
      const suffix=type.slice(type.lastIndexOf('/')+1);
      if (!type.startsWith('http://schemas.openxmlformats.org/') && !type.startsWith('http://schemas.microsoft.com/') && !type.startsWith('http://purl.oclc.org/ooxml/officeDocument/relationships/')) unsafe();
      if (!allowedRelations.has(suffix) || !target || (mode && mode !== 'External' && mode !== 'Internal')) unsafe();
      if (mode === 'External') {
        if (suffix !== 'hyperlink' || !/^(?:https?:\/\/|mailto:)/i.test(target)) unsafe();
        try { const url=new URL(target); if (!['http:','https:','mailto:'].includes(url.protocol)) unsafe(); } catch { unsafe(); }
      } else if (target.startsWith('#') && suffix === 'hyperlink') return;
      else {
        if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('//') || target.includes('\\')) unsafe();
        let decoded: string; try { decoded=decodeURIComponent(target.split('#')[0] || ''); } catch { unsafe(); }
        const base = name === '_rels/.rels' ? '' : posix.dirname(posix.dirname(name));
        const resolved=decoded.startsWith('/')?posix.normalize(decoded.slice(1)):posix.normalize(posix.join(base,decoded));
        if (resolved === '..' || resolved.startsWith('../') || resolved.startsWith('/')) unsafe();
        info.relations.push({source:name,type:suffix,target:resolved,external:false}); return;
      }
      info.relations.push({source:name,type:suffix,target,external:true});
    }
  };
  parser.onclosetag=name=>{const local=name.split(':').pop();if(local==='instrText')instructionDepth=Math.max(0,instructionDepth-1);if(formulaDepth===xmlDepth){formulaDepth=0;checkFormula(formulaText);formulaText='';}xmlDepth--;};
  parser.ontext = text => {if(instructionDepth)addInstruction(text);if(formulaDepth){formulaText+=text;if(formulaText.length>65536)unsafe();}};
  parser.oncdata=parser.ontext;
  parser.onend=()=>{for(const field of fields)checkInstruction(field.text);checkInstruction(orphanInstructions);};
  return parser;
}
export function validatePackage(info: PackageInfo, expected?: OfficeKind): OfficeKind {
  function invalid():never{throw new DocumentError('INVALID_FILE','拡張子と文書の内容が一致しません。標準のDOCX・XLSX・PPTXで保存し直してください。');}
  if (!info.names.has('[Content_Types].xml') || !info.names.has('_rels/.rels')) invalid();
  const office=info.relations.filter(rel=>rel.source==='_rels/.rels' && rel.type==='officeDocument');
  if(office.length!==1)invalid();
  const kind=(Object.keys(OFFICE_FORMATS) as OfficeKind[]).find(value=>OFFICE_FORMATS[value].path===office[0]?.target);
  if(!kind || expected&&kind!==expected)invalid();
  const format=OFFICE_FORMATS[kind];
  if(!info.names.has(format.path)||info.types.get(format.path)!==format.contentType||!(info.roots?.has(kind)||kind==='docx'&&info.documentRoot))invalid();
  if(info.roots&&info.roots.size!==1)invalid();
  for (const rel of info.relations) if (!rel.external && !info.names.has(rel.target)) throw new DocumentError('INVALID_FILE','文書内の参照先が見つかりません。Officeで保存し直してください。');
  return kind;
}
