import {serveOfficeAsset} from '../office-assets.mjs';
const stats={gets:[],cancelled:[]};
export default {
  async fetch(request,env) {
    const fixture=JSON.parse(env.OFFICE_STREAM_FIXTURE),files=new Map(fixture.files);
    const ASSETS={async fetch(upstream) {
      const path=new URL(upstream.url).pathname,value=files.get(path);
      if(!value)return new Response(null,{status:404});
      const bytes=new Uint8Array(value);
      if(upstream.method==='HEAD')return new Response(null,{headers:{'Content-Length':String(bytes.length)}});
      if(path.endsWith('/manifest.json'))return new Response(bytes);
      stats.gets.push(path);
      const second=path===fixture.base+'/'+fixture.parts[1].file;
      const output=second&&fixture.mode==='short'?bytes.subarray(0,bytes.length-1):
        second&&fixture.mode==='long'?new Uint8Array([...bytes,0]):bytes;
      return new Response(new ReadableStream({
        start(controller){controller.enqueue(output);if(fixture.mode!=='cancel')controller.close();},
        cancel(){stats.cancelled.push(path);}
      },{highWaterMark:0}));
    }};
    if(new URL(request.url).pathname==='/_test/stats')return Response.json(stats);
    const target=new Request(new URL(fixture.base+'/'+fixture.name,request.url));
    if(new URL(request.url).pathname==='/_test/cancel') {
      const response=await serveOfficeAsset(target,{ASSETS});
      await response.body.cancel('native consumer stopped');
      const deadline=Date.now()+1000;
      while(!stats.cancelled.length&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
      return Response.json(stats);
    }
    return serveOfficeAsset(request,{ASSETS});
  }
};
