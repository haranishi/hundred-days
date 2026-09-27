import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ARTWORKS } from '../data/artworks.js';

const files={
  24645:'The Great Wave off Kanagawa.png',
  28560:'Vincent van Gogh - The Bedroom - 1926.417 - Art Institute of Chicago.jpg',
  27992:'Georges Seurat - A Sunday on La Grande Jatte -- 1884 - Google Art Project.jpg',
  20684:'Gustave Caillebotte - Paris Street, Rainy Day - 1964.336 - Art Institute of Chicago.jpg',
  16568:'Claude Monet - Water Lilies - 1933.1157 - Art Institute of Chicago.jpg',
  111442:"Mary Cassatt - The Child's Bath - 1910.2 - Art Institute of Chicago.jpg",
  111436:'Paul Cézanne - The Basket of Apples - 1926.252 - Art Institute of Chicago.jpg',
  80607:'Vincent van Gogh - Self-Portrait - 1954.326 - Art Institute of Chicago.jpg',
  14620:'Claude Monet - Cliff Walk at Pourville - Google Art Project.jpg',
};
const root=new URL('../',import.meta.url);
await mkdir(new URL('assets/art/',root),{recursive:true});
await mkdir(new URL('tools/cache/',root),{recursive:true});
const manifest=[];
for(const work of ARTWORKS){
  const api=`https://api.artic.edu/api/v1/artworks/${work.id}?fields=id,title,date_display,artist_display,image_id,is_public_domain,description,short_description,credit_line,main_reference_number,thumbnail`;
  const record=await(await fetch(api,{signal:AbortSignal.timeout(30000)})).json();
  if(!record.data.is_public_domain)throw new Error('Public-domain status not verified');
  await writeFile(new URL(`tools/cache/${work.id}.json`,root),JSON.stringify(record,null,2));
  const params=new URLSearchParams({action:'query',format:'json',titles:`File:${files[work.id]}`,prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'960'});
  const reply=await fetch(`https://commons.wikimedia.org/w/api.php?${params}`,{headers:{'User-Agent':'ArtUncovered/1.0 (local educational artwork importer)'},signal:AbortSignal.timeout(30000)});
  if(!reply.ok)throw new Error(`Commons ${work.id}: ${reply.status}`);
  const data=await reply.json(),info=Object.values(data.query.pages)[0].imageinfo[0];
  const license=info.extmetadata.LicenseShortName?.value||'';
  if(!/public domain|cc0/i.test(license))throw new Error(`Review license for ${work.id}: ${license}`);
  const url=info.thumburl||info.url;
  const response=await fetch(url,{headers:{'User-Agent':'ArtUncovered/1.0 (local educational artwork importer)'},signal:AbortSignal.timeout(60000)});
  if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw new Error(`Image ${work.id}: ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  await writeFile(new URL(work.image,root),bytes);
  manifest.push({id:work.id,title:record.data.title,referenceNumber:record.data.main_reference_number,imageId:record.data.image_id,source:work.source,commonsPage:info.descriptionurl,imageUrl:url,license,licenseUrl:info.extmetadata.LicenseUrl?.value||'https://creativecommons.org/publicdomain/mark/1.0/',copyrighted:info.extmetadata.Copyrighted?.value,descriptionLicense:'CC-BY-4.0',creditLine:record.data.credit_line,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),retrieved:new Date().toISOString().slice(0,10)});
  console.log(`${work.id}: ${license}, ${Math.round(bytes.length/1024)} KB`);
  await new Promise(resolve=>setTimeout(resolve,900));
}
await writeFile(new URL('data/image-manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
