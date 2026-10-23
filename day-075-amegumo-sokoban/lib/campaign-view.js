// Original garden signage and terrain. Rules remain in game.js.
export const CHAPTERS = [
  {name:'雫の庭', theme:'回り道を、覚える。'},
  {name:'石段の庭', theme:'降ろす前に、考える。'},
  {name:'雨玉の庭', theme:'ひと雫を、拾いに。'},
  {name:'風の庭', theme:'離れた道を、つなぐ。'},
];
export const flowerColor = index => ['#fff6c9','#e9a898','#c5b9da','#ecbc7e','#b8d2b3'][index % 5];
export function terrainMarkup(level, state, coord) {
  let svg='';
  (level.ledges||[]).forEach((edge,index)=>{
    const a=coord(edge.from.x,edge.from.y),b=coord(edge.to.x,edge.to.y);
    const rotation=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI-90;
    const offset=(b[0]>a[0]||b[1]<a[1])?20:-20;
    svg+=`<g data-ledge="${index}" transform="translate(${(a[0]+b[0])/2} ${(a[1]+b[1])/2}) rotate(${rotation})" pointer-events="none"><path d="M-28 -5H28M-28 1H28M-28 7H28" stroke="#826d53" stroke-width="3" fill="none"/><g transform="translate(${offset} 0)"><circle r="14" fill="#f7efd6" stroke="#826d53"/><path d="M0 -8V8M-5 3L0 8L5 3" fill="none" stroke="#77543b" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></g></g>`;
  });
  (level.portals||[]).forEach((pad,index)=>{
    const [x,y]=coord(pad.x,pad.y);
    svg+='<g data-portal="'+index+'" transform="translate('+x+' '+y+')" pointer-events="none"><ellipse cy="5" rx="29" ry="22" fill="#c3c7d7" stroke="#737d9b" stroke-width="2"/><ellipse cy="3" rx="22" ry="16" fill="#e4e4e7" stroke="#8995a8"/><path d="M-15 4Q-5 -11 9 -2T10 11M-7 3Q1 -4 6 3" stroke="#7584a4" stroke-width="2.6" fill="none" stroke-linecap="round"/><rect x="-29" y="15" width="22" height="20" rx="6" fill="#596d86"/><text x="-18" y="30" text-anchor="middle" fill="#fffdf3" font-size="15" font-weight="700">'+(index?'B':'A')+'</text></g>';
  });
  (level.dew||[]).forEach((item,index)=>{
    const [x,y]=coord(item.x,item.y),used=state.collected?.[index];
    svg+='<g data-dew="'+index+'" data-collected="'+Boolean(used)+'" transform="translate('+x+' '+y+')" pointer-events="none">';
    svg+=used?'<circle r="16" fill="none" stroke="#8fa9a0" stroke-width="1.5" stroke-dasharray="3 5"/><path d="m-5 1 4 4 8-9" stroke="#759484" stroke-width="2" fill="none"/>':'<circle r="26" fill="#e0ecdb" stroke="#91b3a3" stroke-dasharray="2 5"/><path d="M0 -20C-3 -13 -13 -4 -13 4A13 13 0 0 0 13 4C13 -4 3 -13 0 -20Z" fill="#70a7ac" stroke="#427681" stroke-width="1.5"/><path d="M-6 -2Q-10 7-4 11" stroke="#d8f0e8" stroke-width="3" fill="none" stroke-linecap="round"/><rect x="2" y="10" width="27" height="20" rx="7" fill="#fff8e7" stroke="#71978c"/><text x="15" y="25" text-anchor="middle" fill="#35695e" font-size="14" font-weight="700">+1</text>';
    svg+='</g>';
  });
  return svg;
}
export function mechanicLegend(level, state) {
  const rows=[];
  if(level.ledges?.length) rows.push('<p><b class="mechanic-mark mark-ledge" aria-hidden="true">段</b><span><strong>石段</strong> 雲は矢印の方向だけ。庭師は往復できます。</span></p>');
  if(level.dew?.length) rows.push('<p><b class="mechanic-mark mark-dew">+1</b><span><strong>雨玉</strong> 雲が拾うと1滴補充。一度だけ使えます。<small>残り'+level.dew.filter((_,i)=>!state.collected?.[i]).length+'個</small></span></p>');
  if(level.portals?.length) rows.push('<p><b class="mechanic-mark mark-portal">↔</b><span><strong>風穴 A・B</strong> 雲だけが反対側へ。出口を空けておこう。</span></p>');
  return rows.join('');
}
export function campaignEvents(before, after, level) {
  const collected=(after.collected||[]).flatMap((used,i)=>used&&!before.collected?.[i]?[i]:[]);
  const warped=[];
  if(level.portals?.length===2) before.clouds.forEach((cloud,index)=>{
    if(cloud.x!==after.player.x||cloud.y!==after.player.y)return;
    const entry={x:cloud.x+after.player.x-before.player.x,y:cloud.y+after.player.y-before.player.y};
    const i=level.portals.findIndex(p=>p.x===entry.x&&p.y===entry.y);
    if(i<0)return;
    const exit=level.portals[1-i],actual=after.clouds[index];
    if(actual.x===exit.x&&actual.y===exit.y)warped.push({index,entry,exit});
  });
  return {collected,warped};
}
