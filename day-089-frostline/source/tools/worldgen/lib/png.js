import {deflateSync,inflateSync} from 'node:zlib';
const CRC_TABLE=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function chunk(type,data) {
  const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length,0);b.write(type,4,4,'ascii');b.set(data,8);
  let crc=0xffffffff;for(let i=4;i<b.length-4;i++)crc=CRC_TABLE[(crc^b[i])&255]^(crc>>>8);
  b.writeUInt32BE((crc^0xffffffff)>>>0,b.length-4);return b;
}
export function encodePNG(width,height,rgba) {
  if(rgba.length!==width*height*4)throw new Error('PNG pixel count mismatch');
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const rows=Buffer.alloc(height*(width*4+1));
  for(let j=0;j<height;j++)rows.set(rgba.subarray(j*width*4,(j+1)*width*4),j*(width*4+1)+1);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows,{level:6})),chunk('IEND',Buffer.alloc(0))]);
}
/** Decode non-interlaced 8-bit RGB/RGBA PNGs for reference contact sheets. */
export function decodePNG(bytes){
 const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20),type=bytes[25],channels=type===6?4:type===2?3:0;if(bytes[24]!==8||!channels||bytes[28])throw new Error('8-bit RGB(A) noninterlaced PNG required');
 const parts=[];for(let p=8;p<bytes.length;){const len=bytes.readUInt32BE(p),name=bytes.toString('ascii',p+4,p+8);if(name==='IDAT')parts.push(bytes.subarray(p+8,p+8+len));p+=12+len;}
 const raw=inflateSync(Buffer.concat(parts)),stride=w*channels,data=new Uint8Array(w*h*4),previous=new Uint8Array(stride),row=new Uint8Array(stride);
 const paeth=(a,b,c)=>{const p=a+b-c,aa=Math.abs(p-a),bb=Math.abs(p-b),cc=Math.abs(p-c);return aa<=bb&&aa<=cc?a:bb<=cc?b:c;};
 for(let y=0;y<h;y++){const filter=raw[y*(stride+1)];for(let x=0;x<stride;x++){const left=x>=channels?row[x-channels]:0,up=previous[x],corner=x>=channels?previous[x-channels]:0;row[x]=(raw[y*(stride+1)+1+x]+(filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):filter===4?paeth(left,up,corner):0))&255;}
 for(let x=0;x<w;x++){const k=(y*w+x)*4;data[k]=row[x*channels];data[k+1]=row[x*channels+1];data[k+2]=row[x*channels+2];data[k+3]=channels===4?row[x*channels+3]:255;}previous.set(row);}
 return {width:w,height:h,data};
}
export function sideBySide(left,right,width=640,height=480){
 const out=new Uint8Array(width*2*height*4);for(const [slot,im]of [[0,left],[1,right]])for(let y=0;y<height;y++)for(let x=0;x<width;x++){const ix=Math.min(im.width-1,Math.floor(x*im.width/width)),iy=Math.min(im.height-1,Math.floor(y*im.height/height));out.set(im.data.subarray((iy*im.width+ix)*4,(iy*im.width+ix)*4+4),(y*width*2+slot*width+x)*4);}return encodePNG(width*2,height,out);
}
