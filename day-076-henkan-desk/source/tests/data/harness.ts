import { convertData } from '../../src/features/data/convert';
import { DEFAULT_DATA_OPTIONS,type DataOperation,type DataOptions } from '../../src/features/data/operations';
import type { ConversionEvent,ConversionError } from '../../src/shared/contracts';
type InputOptions=Partial<Omit<DataOptions,'operation'>>&{bytes?:number[];type?:string;cancel?:boolean};
type Report={text?:string;mime?:string;filename?:string;states:string[];error?:ConversionError;warnings:string[];artifacts:number};
declare global { interface Window { runData:(text:string,operation:DataOperation,settings?:InputOptions)=>Promise<Report>; } }
window.runData=async(text,operation,settings={})=>{
  const controller=new AbortController();const report:Report={states:[],warnings:[],artifacts:0};let blob:Blob|undefined;
  const file=new File(settings.bytes?[new Uint8Array(settings.bytes)]:[text],'input.txt',{type:settings.type||'text/plain'});
  const emit=(event:ConversionEvent)=>{if(event.type==='state')report.states.push(event.state);if(event.type==='error')report.error=event.error;if(event.type==='result'){report.artifacts++;blob=event.artifact.blob;report.mime=event.artifact.mime;report.filename=event.artifact.filename;}};
  const pending=convertData([{id:'input',file}],{...DEFAULT_DATA_OPTIONS,...settings,operation},{signal:controller.signal,emit},output=>{report.warnings=output.warnings;});
  if(settings.cancel)setTimeout(()=>controller.abort(),0);
  await pending;if(blob)report.text=await blob.text();return report;
};

import './panel-harness';
