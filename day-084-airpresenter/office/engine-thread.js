// ZetaJS 1.2.0 UNO bridge; original document bytes and font declarations stay unchanged.
Module.zetajs.then(z=>{
  const css=z.uno.com.sun.star,desktop=css.frame.Desktop.create(z.getUnoComponentContext());
  const property=(Name,Value)=>new css.beans.PropertyValue({Name,Value});let processing=false;
  z.mainPort.onmessage=event=>{
    const message=event.data;
    if(processing||message?.cmd!=='convert'||!['pptx','ppt'].includes(message.extension))return;
    processing=true;let document;const source='/tmp/input.'+message.extension;
    try{
      document=desktop.loadComponentFromURL('file://'+source,'_blank',0,[
        property('Hidden',true),property('ReadOnly',true),
        property('MacroExecutionMode',new z.Any(z.type.short,0)),
        property('UpdateDocMode',new z.Any(z.type.short,0))
      ]);
      if(!document.supportsService('com.sun.star.presentation.PresentationDocument'))throw Error();
      const total=document.getDrawPages().getCount();
      if(!Number.isInteger(total)||total<1||total>100){z.mainPort.postMessage({cmd:'error',code:'PAGE_LIMIT'});return;}
      z.mainPort.postMessage({cmd:'count',total});
      document.storeToURL('file:///tmp/output.pdf',[property('Overwrite',true),property('FilterName','impress_pdf_Export')]);
      document.close(false);document=null;
      z.mainPort.postMessage({cmd:'converted'});
    }catch{z.mainPort.postMessage({cmd:'error',code:'INVALID_DOCUMENT'});}
    finally{try{document?.close(false);}catch{}try{FS.unlink(source);}catch{}}
  };
  z.mainPort.postMessage({cmd:'ready'});
});
