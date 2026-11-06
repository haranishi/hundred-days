const MAX_FONT_BYTES = 64 * 1024 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const normalize = value => value.normalize('NFKC').replace(/[\s_-]/gu,'').toLowerCase();
const FAMILIES = new Set(['yugothic','yumincho','msgothic','mspgothic','msmincho','mspmincho','meiryo','meiryoui','calibri','arial','timesnewroman','游ゴシック','游ゴシック体','游明朝','游明朝体','msゴシック','mspゴシック','ms明朝','msp明朝']);
let selected = [],generation=0;
function check(signal) {if(signal?.aborted)throw new DOMException('資料の読込を取り消しました。','AbortError');}
export function supportsLocalFonts() {return typeof window!=='undefined'&&typeof window.queryLocalFonts === 'function';}
/** Only a direct, explicit UI action may call this permission-gated API. */
export async function enableLocalFonts() {
  if(!supportsLocalFonts())throw new Error('このブラウザーではPCのフォントを取得できません。標準フォントで続けられます。');
  selected=[];const version=++generation,fonts=await window.queryLocalFonts();
  if(version!==generation)return 0;
  selected=fonts.filter(font=>typeof font.family==='string'&&FAMILIES.has(normalize(font.family))).slice(0,32);
  return selected.length;
}
export function resetLocalFonts() {selected=[];generation++;}
export async function readLocalFontData({signal}={}) {
  const fonts=[],families=new Set();let bytes=0;
  for(const font of selected) {
    check(signal);let blob,data;
    try{blob=await font.blob();check(signal);if(blob.size<4||blob.size>MAX_FILE_BYTES||bytes+blob.size>MAX_FONT_BYTES)continue;data=await blob.arrayBuffer();}
    catch(error){check(signal);continue;}check(signal);
    const magic=new DataView(data).getUint32(0,false);
    const extension=magic===0x4f54544f?'otf':magic===0x74746366?'ttc':magic===0x00010000?'ttf':null;
    if(!extension)continue;
    bytes+=data.byteLength;fonts.push({data,extension});families.add(font.family);
  }
  return {fonts,families:[...families]};
}
const escapeXml = value => value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
/** Alias only different platform names for the same locally available typeface. */
export function createFontConfig(families=[]) {
  const groups=[
    {keys:['yugothic','游ゴシック','游ゴシック体'],names:['YuGothic','Yu Gothic','游ゴシック','游ゴシック体'],bold:['游ゴシック Bold']},
    {keys:['yumincho','游明朝','游明朝体'],names:['YuMincho','Yu Mincho','游明朝','游明朝体'],bold:[]},
    {keys:['msgothic','msゴシック'],names:['MS Gothic','ＭＳ ゴシック'],bold:[]},
    {keys:['mspgothic','mspゴシック'],names:['MS PGothic','ＭＳ Ｐゴシック'],bold:[]},
    {keys:['msmincho','ms明朝'],names:['MS Mincho','ＭＳ 明朝'],bold:[]},
    {keys:['mspmincho','msp明朝'],names:['MS PMincho','ＭＳ Ｐ明朝'],bold:[]}
  ];
  const allowed=families.filter(value=>typeof value==='string'&&value.length<=80&&FAMILIES.has(normalize(value)));
  const rules=[];
  for(const group of groups) {
    const target=allowed.find(value=>group.keys.includes(normalize(value)));if(!target)continue;
    for(const source of [...group.names,...group.bold]) {
      if(source===target)continue;
      rules.push('<match target="pattern"><test name="family" compare="eq"><string>'+escapeXml(source)+'</string></test><edit name="family" mode="assign" binding="strong"><string>'+escapeXml(target)+'</string></edit>'+(group.bold.includes(source)?'<edit name="weight" mode="assign"><const>bold</const></edit>':'')+'</match>');
    }
  }
  return '<?xml version="1.0"?><fontconfig>'+rules.join('')+'</fontconfig>';
}
