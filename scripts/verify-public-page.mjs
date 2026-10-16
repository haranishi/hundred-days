// A static host can return the portfolio with HTTP 200 for a missing app.
// The build injects the app's canonical URL, so require that exact identity.
export function verifyPublicPage(html,expectedUrl){
 const expected=new URL(expectedUrl);expected.hash='';expected.search='';
 const links=String(html).match(/<link\b[^>]*>/gi)||[];
 for(const link of links){
  const attrs=new Map();
  for(const match of link.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)){
   attrs.set(match[1].toLowerCase(),match[2]??match[3]??match[4]);
  }
  if(!(attrs.get('rel')||'').toLowerCase().split(/\s+/).includes('canonical'))continue;
  const href=attrs.get('href');
  if(!href)throw Error('canonical URLが空です');
  let canonical;
  try{canonical=new URL(href.replaceAll('&amp;','&'),expectedUrl);}catch{throw Error('canonical URLが不正です');}
  canonical.hash='';canonical.search='';
  if(canonical.href!==expected.href)throw Error('対象アプリではないページが返っています（未公開URLの一覧への転送など）');
  return {canonical:canonical.href};
 }
 throw Error('対象アプリを識別するcanonical URLがありません');
}
