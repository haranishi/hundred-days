import DOMPurify from 'dompurify';
import { ConversionFailure } from '../../shared/errors';
import type { DataOperation, TransformOutput } from './operations';
import { DATA_LIMITS } from './core';
const ALLOWED_TAGS=['p','br','div','span','h1','h2','h3','h4','h5','h6','ul','ol','li','strong','em','b','i','s','del','code','pre','blockquote','a','hr','table','thead','tbody','tfoot','tr','th','td','dl','dt','dd'];
export function sanitizeMarkup(text:string):string {
  if(typeof DOMPurify.sanitize!=='function')throw new ConversionFailure('UNSUPPORTED','HTMLを安全に処理できるブラウザでお試しください。');
  // Template content is inert and is never attached to the document or shown as HTML.
  const inert=document.createElement('template');inert.innerHTML=text;
  inert.content.querySelectorAll('script,style,link,meta,base,img,picture,iframe,frame,frameset,object,embed,applet,video,audio,source,track,svg,math,form,input,button').forEach(node=>node.remove());
  inert.content.querySelectorAll('*').forEach(node=>{for(const attribute of ['src','srcset','style','background','poster','data','codebase','ping'])node.removeAttribute(attribute);});
  return DOMPurify.sanitize(inert.content,{ALLOWED_TAGS,ALLOWED_ATTR:['href','title','colspan','rowspan'],ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false,FORBID_TAGS:['script','style','iframe','object','embed','form','input','button','meta','base','link','img','picture','video','audio','source','track','svg','math'],FORBID_ATTR:['style','src','srcset','target']});
}
export function htmlToText(text:string):string {
  const clean=sanitizeMarkup(text);const template=document.createElement('template');template.innerHTML=clean;
  const chunks:string[]=[];const blocks=new Set(['P','DIV','H1','H2','H3','H4','H5','H6','UL','OL','LI','PRE','BLOCKQUOTE','TR','DL','DT','DD','HR']);
  const visit=(node:Node,depth:number,preserve=false)=>{
    if(depth>DATA_LIMITS.depth)throw new ConversionFailure('LIMIT_EXCEEDED','HTMLの入れ子が深すぎます。');
    if(node.nodeType===3){chunks.push(preserve?(node.textContent||''):(node.textContent?.replace(/[\t\r\n\f ]+/g,' ')||''));return;}
    if(!(node instanceof Element)) {for(const child of node.childNodes)visit(child,depth+1,preserve);return;}
    if(node.tagName==='BR'){chunks.push('\n');return;}
    if(blocks.has(node.tagName))chunks.push('\n');
    for(const child of node.childNodes)visit(child,depth+1,preserve||node.tagName==='PRE');
    if(node.tagName==='TD'||node.tagName==='TH')chunks.push('\t');
    if(blocks.has(node.tagName))chunks.push('\n');
  };
  visit(template.content,0);
  return chunks.join('').replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
export function finalizeOutput(result:TransformOutput,operation:DataOperation):TransformOutput {
  let text=result.text;
  if(operation==='markdown-html')text=`<!doctype html>\n<html lang="ja"><head><meta charset="utf-8"><title>変換した文書</title></head><body>\n${sanitizeMarkup(text)}\n</body></html>`;
  if(operation==='html-text')text=htmlToText(text);
  if(new TextEncoder().encode(text).byteLength>DATA_LIMITS.output)throw new ConversionFailure('LIMIT_EXCEEDED','変換結果が5MiBを超えます。入力を小さくしてください。');
  return {...result,text};
}
