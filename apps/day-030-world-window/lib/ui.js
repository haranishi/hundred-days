import { displayName, normalizeText } from './data.js';
import { compassLabel } from './direction.js';
import { continentLabel, operatorLabel } from './labels.js';
import { googleMapsUrl, osmUrl } from './links.js';
import { formatLocalTime } from './localtime.js';
import { dayPhase, sunElevation } from './sun.js';
import { bustCache, viewerFor } from './viewer.js';
import { zoneLabel } from './zones.js';

const YOUTUBE_PAGE_HOST = 'www.youtube.com';
const OSM_COPYRIGHT_HOST = 'www.openstreetmap.org';
const WINDY_HOST = 'www.windy.com';
const KIND = {
  yt: ['映像','video'], hls: ['映像','video'], img: ['画像','image'], page: ['リンク','page'], windy: ['Windy','windy'],
};
const PHASE = { day:'昼', twilight:'薄明', night:'夜' };
const HLS_UNSUPPORTED = 'この配信形式（HLS）はこのブラウザでは直接再生できません。Safari か提供元のページで見られます。';
const HLS_WAIT_MS = 5000;
const SUN_PATH = 'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.5 1.5m9.8 9.8 1.5 1.5m0-12.8-1.5 1.5M7.1 16.9l-1.5 1.5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z';
const MOON_PATH = 'M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5 8.6 8.6 0 1 0 20.5 14.6Z';
const make = (tag, className, text) => {
  const node=document.createElement(tag); if(className) node.className=className;
  if(text !== undefined) node.textContent=text; return node;
};
const badge = (kind) => { const [text,cls]=KIND[kind] || KIND.page; return make('span',`badge ${cls}`,text); };
const externalLink = (label, href, className='') => {
  const link=make('a',className,label); link.href=href; link.target='_blank'; link.rel='noopener noreferrer'; return link;
};

function providerUrl(camera) {
  if (camera.website) return camera.website;
  if (camera.kind === 'yt' && camera.url?.startsWith('v:')) return `https://${YOUTUBE_PAGE_HOST}/watch?v=${encodeURIComponent(camera.url.slice(2))}`;
  if (camera.kind === 'yt' && camera.url?.startsWith('c:')) return `https://${YOUTUBE_PAGE_HOST}/channel/${encodeURIComponent(camera.url.slice(2))}/live`;
  return camera.url;
}

export function createUI(handlers) {
  const refs = {
    panel:document.querySelector('#panel'), title:document.querySelector('#panel-title'), body:document.querySelector('#panel-body'), panelCount:document.querySelector('#panel-count'),
    content:document.querySelector('#panel-content'),
    eyebrow:document.querySelector('#panel-eyebrow'), subtitle:document.querySelector('#panel-subtitle'), panelLegend:document.querySelector('#panel-legend'),
    close:document.querySelector('#panel-close'), handle:document.querySelector('#sheet-handle'), count:document.querySelector('#camera-count'),
    search:document.querySelector('#camera-search'), candidates:document.querySelector('#search-results'), random:document.querySelector('#random-button'),
    locate:document.querySelector('#locate-button'), windyFilter:document.querySelector('#windy-filter'), windyHint:document.querySelector('#windy-hint'),
    topbar:document.querySelector('.topbar'), toast:document.querySelector('#toast'), theme:document.querySelector('#theme-toggle'), scrim:document.querySelector('#map-scrim'),
    themeLabel:document.querySelector('#theme-label'), themeIcon:document.querySelector('#theme-icon'),
  };
  let viewerTimer=null; let hlsTimer=null; let toastTimer=null; let returnFocus=null; let returnCameraId='';
  /* 「表示 4／9,164 か所」はチップの効き目を示す数。全部ONなら一覧のメタと同じ数を2回言うだけなので出さない。 */
  let countFiltered=false; let detailMode=false;
  let countryNames={}; let options=[]; let activeIndex=-1;
  const label=(camera)=>displayName(camera,countryNames);

  /* 上部バーは検索欄の折り返しや種別チップの増減で高さが変わる。実測値を CSS 変数に流して、
     パネルの上端（と、モバイルで広げたシートの上端）がバーの下に潜らないようにする。
     入るのは「バーの下端＝画面上端からの距離」。 */
  function measureTopbar() {
    const bottom=Math.round(refs.topbar.getBoundingClientRect().bottom);
    if(bottom>0) document.documentElement.style.setProperty('--topbar-h',`${bottom}px`);
  }
  measureTopbar();
  if(globalThis.ResizeObserver) new ResizeObserver(measureTopbar).observe(refs.topbar);
  else addEventListener('resize',measureTopbar);

  /* パネルは中身がいつも画面より長い。上下の端に「まだ続きがある」合図（app.css のフェード）を出す。
     中身が差し替わるたびに測り直したいので、一覧・詳細の入れ物のサイズ変化で拾う。 */
  function updateScrollHints() {
    const node=refs.content;
    node.classList.toggle('has-more-above',node.scrollTop>4);
    node.classList.toggle('has-more-below',node.scrollTop+node.clientHeight<node.scrollHeight-4);
  }
  refs.content.addEventListener('scroll',updateScrollHints,{passive:true});
  if(globalThis.ResizeObserver) new ResizeObserver(updateScrollHints).observe(refs.body);
  else addEventListener('resize',updateScrollHints);

  document.querySelectorAll('[data-kind-group]').forEach((button) => button.addEventListener('click', () => handlers.toggleKind(button.dataset.kindGroup, button)));
  refs.windyFilter.addEventListener('click', () => handlers.toggleWindy(refs.windyFilter));
  refs.search.addEventListener('input', () => handlers.search(refs.search.value));
  refs.search.addEventListener('keydown', onSearchKey);
  refs.random.addEventListener('click', () => handlers.random(refs.random));
  refs.locate.addEventListener('click', () => handlers.locate(refs.locate));
  refs.close.addEventListener('click', handlers.close);
  refs.theme.addEventListener('click', handlers.theme);
  refs.handle.addEventListener('click', () => setExpanded(!refs.panel.classList.contains('is-expanded')));
  /* 広げたシートのつまみは画面の上端にあって片手だと届かない。地図側のどこを押しても縮められるようにする。 */
  refs.scrim.addEventListener('click', () => setExpanded(false));
  document.addEventListener('keydown',(event)=>{ if(event.key==='Escape' && refs.close.hidden===false) handlers.close(); });

  function setExpanded(expanded) {
    refs.panel.classList.toggle('is-expanded',expanded);
    /* 広げている間、上部バーは検索とチップを畳んでタイトル行だけにする（地図が見えないので使い道がない）。
       畳んだぶんの高さは --topbar-h 経由でシートの上端に回る。 */
    document.body.classList.toggle('sheet-expanded',expanded);
    refs.scrim.hidden=!expanded;
    refs.handle.setAttribute('aria-expanded',String(expanded));
    refs.handle.setAttribute('aria-label',expanded?'パネルを縮める':'パネルを広げる');
  }
  function setDetailMode(on) {
    /* 一覧を下まで見てから選ぶと、詳細も同じ位置から表示されて見出しが画面外にいた。
       切り替わったときだけ先頭へ戻す（一覧の描き直しは地図を動かすたびに起きるので、そこでは触らない）。 */
    if(refs.panel.classList.contains('is-detail')!==on) refs.content.scrollTop=0;
    refs.panel.classList.toggle('is-detail',on);
    /* パネルの幅は凡例や属性表示の逃げ場にも効くので、幅の元になる値は body 側に持たせる。 */
    document.body.classList.toggle('has-detail',on);
    refs.eyebrow.textContent=on?'CAMERA':'AROUND HERE';
    refs.subtitle.hidden=on; refs.panelLegend.hidden=on;
    detailMode=on; syncCount();
  }
  /* 出すのは「一覧を見ていて、かつチップで絞っているとき」だけ。 */
  function syncCount() { refs.count.hidden=detailMode||!countFiltered; }

  function cleanupViewer() { if(viewerTimer) clearInterval(viewerTimer); viewerTimer=null; if(hlsTimer) clearTimeout(hlsTimer); hlsTimer=null; }
  function setLoading() { cleanupViewer(); refs.title.textContent='この範囲のカメラ';refs.panelCount.textContent='読み込み中…';refs.close.hidden=true;refs.subtitle.hidden=true;refs.panelLegend.hidden=true;refs.body.replaceChildren(...Array.from({length:3},()=>make('div','skeleton'))); }
  function setError(message) { cleanupViewer();refs.panelCount.textContent='';refs.body.replaceChildren(make('p','error',message)); }
  function updateCount(visible,total) { countFiltered=visible<total;refs.count.textContent=`表示 ${visible.toLocaleString('ja-JP')}／${total.toLocaleString('ja-JP')} か所`;syncCount(); }
  /* データが揃って一覧を描き終えた印。件数の文言は絞り込み次第で消えるので、待ち合わせはこちらを見る（E2E・デモ収録）。 */
  function setLoaded() { refs.panel.dataset.loaded='true'; }
  function setKindButton(button,on) { button.setAttribute('aria-pressed',String(on)); }
  function configureWindy(configured) { refs.windyFilter.hidden=!configured;document.querySelectorAll('[data-windy-legend]').forEach((node)=>{node.hidden=!configured;}); }
  function setWindyHint(text='') { refs.windyHint.textContent=text ? `・${text}` : ''; }
  function setTheme(dark) {
    refs.theme.setAttribute('aria-pressed',String(dark));
    refs.theme.setAttribute('aria-label',dark?'ライト表示に切り替える':'ダーク表示に切り替える');
    /* 見えている語は「今どちらか」。押した先を書くと、色と語がいつも食い違って見える。 */
    refs.themeLabel.textContent=dark?'ダーク':'ライト';
    refs.themeIcon?.setAttribute('d',dark?MOON_PATH:SUN_PATH);
  }
  function showToast(message) { refs.toast.textContent=message;refs.toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{refs.toast.hidden=true;},4000); }

  /* 数が3つ（副題・一覧のメタ・チップの件数）並ぶと、どれが何の数か読み取れなかった。
     一覧のメタは「どこの・いくつのうち・何件出しているか」を1行で言い切る。 */
  function renderList(items,total,countries,onSelect,{worldwide=false}={}) {
    cleanupViewer();countryNames=countries||{};refs.title.textContent='この範囲のカメラ';refs.close.hidden=true;setDetailMode(false);
    const scope=worldwide?'世界全体':'この範囲';
    refs.panelCount.textContent=total>items.length
      ? `${scope} ${total.toLocaleString('ja-JP')}件・近い順に${items.length}件`
      : `${scope} ${total.toLocaleString('ja-JP')}件`;
    if(!items.length){refs.body.replaceChildren(make('p','empty','この範囲に、選んだ種別のカメラはありません。'));return;}
    /* 一覧は地図を動かすたびに描き直す。行を入れ替えるとフォーカスが body へ飛んでキーボードの
       居場所が消えるので、同じカメラの行が残っていれば戻す。 */
    const focused=document.activeElement?.closest?.('.camera-row')?.dataset.cameraId||'';
    refs.body.replaceChildren(...items.map((camera)=>{
      const button=make('button','camera-row');button.type='button';button.dataset.cameraId=camera.id;
      button.append(make('strong','',label(camera)),make('small','',countryNames[camera.country]?.ja || camera.country || '国不明'),badge(camera.kind));
      button.addEventListener('click',()=>onSelect(camera.id,button));return button;
    }));
    if(focused)refs.body.querySelector(`[data-camera-id="${CSS.escape(focused)}"]`)?.focus({preventScroll:true});
  }

  function rememberTrigger(trigger) { if(trigger instanceof HTMLElement && trigger !== refs.close){returnFocus=trigger;returnCameraId=trigger.dataset.cameraId||'';} }
  function focusBack() { const target=returnFocus?.isConnected?returnFocus:(returnCameraId?document.querySelector(`[data-camera-id="${CSS.escape(returnCameraId)}"]`):null);returnFocus=null;returnCameraId='';target?.focus?.(); }
  /* 見出しへフォーカスを移すのは「利用者が押して開いた」ときだけ。共有リンク（#cam=）で開いた直後は
     誰も何も押しておらず、移すと見出しに枠が出て入力欄に見える（枠の見た目は app.css 側で :focus-visible に寄せた）。 */
  function heading(camera,focus=false) { refs.title.textContent=label(camera);if(focus)refs.title.focus({preventScroll:true}); }

  function setActiveOption(index) {
    if(!options.length){activeIndex=-1;refs.search.removeAttribute('aria-activedescendant');return;}
    activeIndex=(index+options.length)%options.length;
    options.forEach((option,order)=>option.setAttribute('aria-selected',String(order===activeIndex)));
    refs.search.setAttribute('aria-activedescendant',options[activeIndex].id);
    options[activeIndex].scrollIntoView({block:'nearest'});
  }
  function onSearchKey(event) {
    if(event.key==='Escape'){hideCandidates();return;}
    if(!options.length)return;
    if(event.key==='ArrowDown'){event.preventDefault();setActiveOption(activeIndex+1);}
    else if(event.key==='ArrowUp'){event.preventDefault();setActiveOption(activeIndex-1);}
    else if(event.key==='Enter'&&activeIndex>=0){event.preventDefault();options[activeIndex].click();}
  }
  /* 「Madrid」と入れると名前に Madrid の無い候補が並ぶ（運営者名で当たっている）。
     どこが当たったのかを 1段目の <mark> と 2段目の項目名で見せる。 */
  function markMatch(text,query) {
    const node=make('strong');const needle=normalizeText(query);const normalized=normalizeText(text);
    const index=needle?normalized.indexOf(needle):-1;
    /* NFKC で長さが変わる名前（全角など）は正規化後の位置を元の文字列に当てられない。
       間違った場所を光らせるくらいなら強調しない。 */
    if(index<0||normalized.length!==text.length){node.textContent=text;return node;}
    node.append(text.slice(0,index),make('mark','',text.slice(index,index+needle.length)),text.slice(index+needle.length));
    return node;
  }
  function matchReason(camera,matched) {
    if(matched==='operator')return `運営者 ${operatorLabel(camera.operator)}`;
    if(matched==='ref')return `番号 ${camera.ref}`;
    return countryNames[camera.country]?.ja || camera.country || '国不明';
  }
  function showCandidates(matches,countries,onSelect,{more=false}={}) {
    countryNames=countries||{};const query=refs.search.value;
    options=matches.map(({camera,matched},order)=>{
      const button=make('button','search-option');
      button.type='button';button.id=`search-option-${order}`;button.setAttribute('role','option');button.setAttribute('aria-selected','false');
      /* 候補から開いて閉じたときは、同じカメラの一覧の行へフォーカスを戻す（候補は閉じた時点で消えている）。 */
      button.dataset.cameraId=camera.id;
      const text=make('span','search-option-text');
      text.append(markMatch(label(camera),query),make('small','',matchReason(camera,matched)));
      button.append(text,badge(camera.kind));
      button.addEventListener('click',()=>{hideCandidates();onSelect(camera.id,button);});return button;
    });
    /* 件数は見えていれば十分で、listbox の項目として読み上げる対象ではない。
       打ち切ったときは「何件あるか分からないが上から順に出している」ことを言い切る。 */
    const count=make('p','search-count',more?`該当 ${options.length}件以上（上位を表示）`:`該当 ${options.length}件`);count.setAttribute('aria-hidden','true');
    refs.candidates.replaceChildren(count,...options);refs.candidates.hidden=!options.length;
    /* 下端のぼかしは「まだ続きがある」ときだけ（表示してから測らないと高さが0になる）。 */
    refs.candidates.classList.toggle('has-more',refs.candidates.scrollHeight>refs.candidates.clientHeight+4);
    refs.search.setAttribute('aria-expanded',String(options.length>0));
    activeIndex=-1;refs.search.removeAttribute('aria-activedescendant');
  }
  function hideCandidates(){refs.candidates.hidden=true;refs.candidates.replaceChildren();options=[];activeIndex=-1;refs.search.setAttribute('aria-expanded','false');refs.search.removeAttribute('aria-activedescendant');}

  function renderViewer(camera,autoplay) {
    const wrap=make('div','viewer');
    wrap.append(make('p','privacy-note','見ているのは提供元が公開している映像です。個人の特定には使わないでください。'));
    const frame=make('div','viewer-frame'); const view=viewerFor(camera,{canPlayHls:document.createElement('video').canPlayType('application/vnd.apple.mpegurl')!=='',autoplay});
    const fallbackBox=(text)=>{const box=make('div','viewer-fallback');box.append(make('p','',text));const url=providerUrl(camera);if(url)box.append(externalLink('提供元で見る',url,'large-link'));return box;};
    if(view.mode==='youtube' && view.src){
      const iframe=make('iframe');iframe.src=view.src;iframe.title=`${label(camera)}のライブ映像`;
      /* allow に fullscreen を入れてあるので allowfullscreen 属性は付けない（同じ許可の二重指定になる）。 */
      iframe.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';iframe.referrerPolicy='strict-origin-when-cross-origin';
      frame.append(iframe);wrap.append(frame,make('p','viewer-note','配信が終わっている場合があります。'));
      /* スマホはパネルの幅がプレーヤーの推奨（480px）に届かない。シートを広げて見てもらう逃げ道を置く。 */
      const bigger=make('button','sheet-expand','大きく見る');bigger.type='button';bigger.addEventListener('click',()=>setExpanded(true));wrap.append(bigger);
    }
    else if(view.mode==='image'){
      const fetched=make('span','fetched');
      const fail=()=>{frame.classList.add('is-fallback');frame.replaceChildren(fallbackBox('画像を読み込めませんでした。提供元で見てください。'));};
      /* 失敗のたびに <img> を外すと「更新」の行き先が消えて、押しても何も起きなかった。
         毎回作り直して差し替えるので、失敗した後の再試行も本当に効く。 */
      const refresh=()=>{
        const now=new Date();const image=make('img');image.alt=label(camera);
        image.addEventListener('error',fail);image.src=bustCache(view.src,now.getTime());
        frame.classList.remove('is-fallback');frame.replaceChildren(image);
        fetched.textContent=`取得 ${now.toLocaleTimeString('ja-JP',{hour12:false})}`;
      };
      const tools=make('div','viewer-tools');const button=make('button','', '更新');button.type='button';button.addEventListener('click',refresh);
      tools.append(button,fetched);wrap.append(frame,tools);refresh();
      viewerTimer=setInterval(()=>{if(!refs.close.hidden && document.visibilityState==='visible')refresh();},60_000);
    } else if(view.mode==='hls') {
      const video=make('video');video.controls=true;video.autoplay=true;video.playsInline=true;video.muted=true;
      /* canPlayType の申告はあてにならない。Chromium は HLS を再生できないのに 'maybe' を返す
         （Chrome 151・Playwright同梱ともに実測）。しかも error すら来ずに黒い箱のまま止まるので、
         読めた合図（loadedmetadata）が5秒来なければ案内へ切り替える。 */
      const guide=()=>{clearTimeout(hlsTimer);hlsTimer=null;frame.classList.add('is-fallback');frame.replaceChildren(fallbackBox(HLS_UNSUPPORTED));};
      video.addEventListener('error',guide);
      video.addEventListener('loadedmetadata',()=>{clearTimeout(hlsTimer);hlsTimer=null;});
      hlsTimer=setTimeout(guide,HLS_WAIT_MS);
      video.src=view.src;frame.append(video);wrap.append(frame);
    }
    else if(camera.kind==='hls'){frame.classList.add('is-fallback');frame.replaceChildren(fallbackBox(HLS_UNSUPPORTED));wrap.append(frame);}
    else { const message=make('div','viewer-fallback');message.append(make('p','', 'このカメラは提供元のページで見られます。'),externalLink('提供元で見る',providerUrl(camera),'large-link'));wrap.append(message); }
    return wrap;
  }

  function detailRows(camera,countries) {
    const dl=make('dl','details'); const add=(label,value,node=null)=>{if(!node&&(value===null||value===undefined||value===''))return;dl.append(make('dt','',label));const dd=make('dd');if(node)dd.append(node);else dd.textContent=value;dl.append(dd);};
    const country=countries[camera.country];add('国',country?`${country.ja}（${continentLabel(country.continent)}）`:(camera.country||'不明'));add('運営者',operatorLabel(camera.operator));
    if(Number.isFinite(camera.direction)){const arrow=document.createElementNS('http://www.w3.org/2000/svg','svg');arrow.setAttribute('class','direction-arrow');arrow.setAttribute('viewBox','0 0 24 24');arrow.style.setProperty('--direction',`${camera.direction}deg`);const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M12 21V4m0 0-5 6m5-6 5 6');arrow.append(path);const span=make('span','',`${compassLabel(camera.direction)}（${camera.direction}°）`);const box=make('span');box.append(arrow,span);add('向き','',box);}
    add('区分',camera.zone?zoneLabel(camera.zone):null);add('説明',camera.description);add('確認日',camera.checkDate);
    const now=new Date();add('現地時刻',`${formatLocalTime(camera.lon,now)}ごろ（経度からの推定）・${PHASE[dayPhase(sunElevation(camera.lat,camera.lon,now))]}`);
    add('座標',`${camera.lat.toFixed(5)}, ${camera.lon.toFixed(5)}`);return dl;
  }

  function renderDetail(camera,countries,trigger,{autoplay=true,focusHeading=true}={}) {
    cleanupViewer();countryNames=countries||{};rememberTrigger(trigger);refs.close.hidden=false;refs.panelCount.textContent='';setDetailMode(true);heading(camera,focusHeading);
    const content=document.createDocumentFragment();content.append(badge(camera.kind),renderViewer(camera,autoplay),detailRows(camera,countryNames));
    const links=make('div','external-links');links.append(externalLink('Googleマップで開く',googleMapsUrl(camera.lat,camera.lon)));
    const osm=osmUrl(camera.id);if(osm)links.append(externalLink('OpenStreetMapで見る',osm));const provider=providerUrl(camera);if(provider)links.append(externalLink('提供元で見る',provider));content.append(links);
    const source=make('p','source-note');source.append('カメラの位置とURL: ',externalLink('© OpenStreetMap contributors（ODbL）',`https://${OSM_COPYRIGHT_HOST}/copyright`),'。映像・画像は各提供元のもの');content.append(source);refs.body.replaceChildren(content);
  }

  function renderWindyLoading(camera,trigger){cleanupViewer();rememberTrigger(trigger);refs.close.hidden=false;refs.panelCount.textContent='';setDetailMode(true);heading(camera,true);refs.body.replaceChildren(badge('windy'),make('div','skeleton'));}
  function renderWindy(camera,detail) {
    cleanupViewer();const item={...camera,...detail,kind:'windy',name:detail.title||camera.name};heading(item);const content=document.createDocumentFragment();content.append(badge('windy'),make('p','privacy-note','見ているのは提供元が公開している映像です。個人の特定には使わないでください。'));
    const viewer=make('div','viewer');if(detail.image){const frame=make('div','viewer-frame');const image=make('img');image.src=detail.image;image.alt=label(item);frame.append(image);viewer.append(frame);}
    if(detail.player?.day){const frame=make('div','viewer-frame');const iframe=make('iframe');iframe.src=detail.player.day;iframe.title=`${label(item)}のタイムラプス`;iframe.allow='fullscreen';iframe.referrerPolicy='strict-origin-when-cross-origin';frame.append(iframe);viewer.append(frame);}
    const credit=make('p','windy-credit');credit.append('Webcams provided by ',externalLink('windy.com',`https://${WINDY_HOST}/webcams`),' - ',externalLink('add new webcam',`https://${WINDY_HOST}/webcams/add`));viewer.append(credit);content.append(viewer);
    const links=make('div','external-links');if(detail.detailUrl)links.append(externalLink('Windyで見る',detail.detailUrl));content.append(links);refs.body.replaceChildren(content);
  }
  function closeDetail(){cleanupViewer();refs.close.hidden=true;setExpanded(false);setDetailMode(false);focusBack();}

  return { refs,setLoading,setError,updateCount,setLoaded,setKindButton,configureWindy,setWindyHint,setTheme,showToast,renderList,renderDetail,renderWindyLoading,renderWindy,showCandidates,hideCandidates,closeDetail };
}
