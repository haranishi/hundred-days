import { deflateRawSync,crc32 } from 'node:zlib';
export function makeZip(entries:Record<string,string|Buffer>):Buffer{
 const local:Buffer[]=[],central:Buffer[]=[];let offset=0;
 for(const [name,value]of Object.entries(entries)){
  const nameBytes=Buffer.from(name),data=typeof value==='string'?Buffer.from(value):value,compressed=deflateRawSync(data),crc=crc32(data);
  const head=Buffer.alloc(30);head.writeUInt32LE(0x04034b50);head.writeUInt16LE(20,4);head.writeUInt16LE(0x800,6);head.writeUInt16LE(8,8);head.writeUInt32LE(crc,14);head.writeUInt32LE(compressed.length,18);head.writeUInt32LE(data.length,22);head.writeUInt16LE(nameBytes.length,26);
  const center=Buffer.alloc(46);center.writeUInt32LE(0x02014b50);center.writeUInt16LE(20,4);center.writeUInt16LE(20,6);center.writeUInt16LE(0x800,8);center.writeUInt16LE(8,10);center.writeUInt32LE(crc,16);center.writeUInt32LE(compressed.length,20);center.writeUInt32LE(data.length,24);center.writeUInt16LE(nameBytes.length,28);center.writeUInt32LE(offset,42);
  local.push(head,nameBytes,compressed);central.push(center,nameBytes);offset+=head.length+nameBytes.length+compressed.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22),count=Object.keys(entries).length;
 end.writeUInt32LE(0x06054b50);end.writeUInt16LE(count,8);end.writeUInt16LE(count,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,directory,end]);
}
const mainType='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
export function docxEntries(options:{externalImage?:boolean;hyperlink?:string;unsafeXml?:boolean;protection?:boolean;embeddedImage?:boolean}={}):Record<string,string|Buffer>{
 const picture=options.embeddedImage?'<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="914400" cy="914400"/><wp:docPr id="1" name="Test image"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="test.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rIdImage"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>':'';
 const entries:Record<string,string|Buffer>={
  '[Content_Types].xml':`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="${mainType}"/></Types>`,
  '_rels/.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  'word/document.xml':`<?xml version="1.0"?>${options.unsafeXml?'<!DOCTYPE document [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>':''}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:rFonts w:ascii="Noto Sans CJK JP" w:eastAsia="Noto Sans CJK JP"/></w:rPr><w:t>変換テスト：日本語の本文</w:t></w:r></w:p><w:tbl><w:tblPr><w:tblW w:w="5000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2500"/><w:gridCol w:w="2500"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>項目</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>結果</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p>${picture}</w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`
 };
 const rels:string[]=[];
 if(options.externalImage)rels.push('<Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="http://127.0.0.1/private.png" TargetMode="External"/>');
 if(options.hyperlink)rels.push(`<Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${options.hyperlink}" TargetMode="External"/>`);
 if(options.embeddedImage){rels.push('<Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image.png"/>');entries['word/media/image.png']=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5WMr8AAAAASUVORK5CYII=','base64');}
 if(rels.length)entries['word/_rels/document.xml.rels']=`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`;
 if(options.protection)entries['word/settings.xml']='<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:documentProtection w:enforcement="1"/></w:settings>';
 return entries;
}
export function sampleDocx(options:Parameters<typeof docxEntries>[0]={}):Buffer{return makeZip(docxEntries(options));}
