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

// Reference comparison only: noninterlaced 8-bit RGB/RGBA PNG, no browser or image dependency.
export function decodePNG(b){
 const width=b.readUInt32BE(16),height=b.readUInt32BE(20),channels=b[25]===2?3:b[25]===6?4:0;
 if(b[24]!==8||b[28]!==0||!channels)throw Error('comparison PNG requires 8-bit RGB/RGBA without interlace');
 const chunks=[];for(let at=8;at<b.length;){const n=b.readUInt32BE(at),type=b.toString('ascii',at+4,at+8);if(type==='IDAT')chunks.push(b.subarray(at+8,at+8+n));at+=n+12;}
 const rows=inflateSync(Buffer.concat(chunks)),stride=width*channels,pixels=new Uint8Array(height*stride),rgba=new Uint8Array(width*height*4);
 const paeth=(a,b,c)=>{const p=a+b-c,aa=Math.abs(p-a),bb=Math.abs(p-b),cc=Math.abs(p-c);return aa<=bb&&aa<=cc?a:bb<=cc?b:c;};
 for(let y=0;y<height;y++){const filter=rows[y*(stride+1)];if(filter>4)throw Error('PNG filter');for(let x=0;x<stride;x++){const a=x>=channels?pixels[y*stride+x-channels]:0,b=y?pixels[(y-1)*stride+x]:0,c=y&&x>=channels?pixels[(y-1)*stride+x-channels]:0,v=rows[y*(stride+1)+1+x];pixels[y*stride+x]=(v+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;}}
 for(let i=0;i<width*height;i++)rgba.set([pixels[i*channels],pixels[i*channels+1],pixels[i*channels+2],channels===4?pixels[i*channels+3]:255],i*4);
 return {width,height,rgba};
}
export function resize(im,width,height){const rgba=new Uint8Array(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const at=(Math.min(im.height-1,Math.floor(y/height*im.height))*im.width+Math.min(im.width-1,Math.floor(x/width*im.width)))*4;rgba.set(im.rgba.subarray(at,at+4),(y*width+x)*4);}return {width,height,rgba};}
