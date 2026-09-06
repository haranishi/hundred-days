import { expect, test } from '@playwright/test';

const PATH='/day-030-world-window/';
const AKITA={lat:39.7176,lon:140.1305};
/* 空のスタイルでも glyphs は「{fontstack}」「{range}」を含むURLでないと MapLibre 5 が検証で落とし、
   スタイルが永久に読み込み中になる（クラスタの件数ラベルが symbol 層で文字を使うため）。
   フォントの要求は空のPBFで返す。 */
const EMPTY_STYLE={version:8,sources:{},layers:[],glyphs:'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'};
/* 初期表示の中心（15,25）からの大圏距離は北にあるものほど近い＝「リンクのみ」の n6・w5 が
   いちばん近い並びになる。種別の優先が距離に勝つことを、この配置で見る。 */
const CAMERAS={generatedAt:'2026-09-05',count:6,kinds:{yt:2,img:1,hls:1,page:2},cameras:[
  {i:'n1',a:AKITA.lat,o:AKITA.lon,k:'yt',n:'秋田駅前ライブ',u:'v:video123',c:'JP',p:'秋田観光局',d:45,z:'town',s:'駅前の様子',r:'A-1',w:'https://example.invalid/source',t:'2026-09-01'},
  {i:'n2',a:AKITA.lat+.001,o:AKITA.lon+.001,k:'yt',n:'秋田チャンネル',u:'c:UCakita',c:'JP',p:'https://www.example.invalid/company/about'},
  {i:'n3',a:AKITA.lat+.002,o:AKITA.lon,k:'img',n:'秋田の空',u:'https://example.invalid/cam.jpg',c:'JP'},
  {i:'n4',a:AKITA.lat+.003,o:AKITA.lon,k:'hls',n:'秋田港配信',u:'https://example.invalid/live.m3u8',c:'JP'},
  {i:'w5',a:AKITA.lat+.004,o:AKITA.lon,k:'page',n:'秋田道路',u:'https://example.invalid/page',c:'JP'},
  {i:'n6',a:AKITA.lat+.005,o:AKITA.lon,k:'page',u:'https://example.invalid/other',c:'JP',r:'NO-6'},
]};
const COUNTRIES={JP:{ja:'日本',en:'Japan',continent:'Asia'}};

async function stub(page,{windy=false,hlsHang=false}={}){
  const requests={windy:[],images:[]};
  await page.addInitScript(()=>{globalThis.__E2E__=true;});
  await page.route('https://tiles.openfreemap.org/**',route=>new URL(route.request().url()).pathname.includes('/fonts/')
    ?route.fulfill({contentType:'application/x-protobuf',body:Buffer.alloc(0)})
    :route.fulfill({contentType:'application/json',body:JSON.stringify(EMPTY_STYLE)}));
  await page.route('**/day-030-world-window/data/cameras.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(CAMERAS)}));
  await page.route('**/day-030-world-window/data/countries.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(COUNTRIES)}));
  await page.route('https://www.youtube-nocookie.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>player</title>'}));
  await page.route('https://webcams.windy.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>timelapse</title>'}));
  await page.route('https://example.invalid/**',route=>{
    const url=new URL(route.request().url());
    /* 応答も失敗も返さない＝配信が黙ったまま。<video> に error すら来ない実際の症状を作る。 */
    if(hlsHang && url.pathname==='/live.m3u8') return;
    if(url.pathname!=='/cam.jpg')return route.abort();
    requests.images.push(url.toString());
    /* 2回目だけ失敗させる。失敗の案内が出ることと、そのあと「更新」で本当に戻ることの両方を見る。 */
    return requests.images.length===2
      ?route.abort()
      :route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')});
  });
  await page.route('**/api/day-030/windy*',route=>{
    const url=new URL(route.request().url());requests.windy.push(url.toString());
    let body={configured:false};
    if(windy){
      if(url.searchParams.has('status'))body={configured:true};
      else if(url.searchParams.has('bbox'))body={webcams:[{id:901,title:'Windy 秋田',lat:AKITA.lat+.01,lon:AKITA.lon+.01,status:'active',city:'Akita',country:'Japan',categories:['city']}],total:1,attribution:'Webcams provided by windy.com'};
      else body={id:901,title:'Windy 秋田',lat:AKITA.lat+.01,lon:AKITA.lon+.01,image:'https://example.invalid/windy.jpg',player:{day:'https://webcams.windy.com/day'},detailUrl:'https://www.windy.com/webcams/901'};
    }
    route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  return requests;
}

async function open(page,options){
  const requests=await stub(page,options);await page.goto(PATH);
  await page.waitForSelector('#panel[data-loaded="true"]');
  /* isStyleLoaded() は Math.random を差し替えたテストで永久に false のままになる。
     アプリが層まで入れたときに付ける #map[data-ready] を待つ。 */
  await page.waitForSelector('#map[data-ready="true"]');
  return requests;
}
async function mapClick(page,lon,lat){
  const point=await page.evaluate(async({lon,lat})=>{const map=globalThis.__cameraMap;map.jumpTo({center:[lon,lat],zoom:13});await new Promise(resolve=>map.once('idle',resolve));const p=map.project([lon,lat]);return{x:p.x,y:p.y};},{lon,lat});
  const canvas=await page.locator('#map canvas').boundingBox();await page.mouse.click(canvas.x+point.x,canvas.y+point.y);
}
/* その要素の中心を実際に押せるか（別の層が上に乗っていないか）をブラウザ側で確かめる。 */
const reachable=(page,selectors)=>page.evaluate((list)=>Object.fromEntries(list.map((selector)=>{
  const node=document.querySelector(selector);if(!node)return[selector,false];
  const rect=node.getBoundingClientRect();
  const hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);
  return[selector,Boolean(hit)&&(hit===node||node.contains(hit))];
})),selectors);
const boxOf=(page,selector)=>page.evaluate((one)=>{const r=document.querySelector(one).getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};},selector);
const overlaps=(one,other)=>!(one.right<=other.left||other.right<=one.left||one.bottom<=other.top||other.bottom<=one.top);

test.describe('Day 030 せかいのまど',()=>{
  test('初期表示は地図・一覧・件数を出し、プレーヤーはまだ作らない',async({page})=>{await open(page);await expect(page.getByRole('heading',{name:'せかいのまど'})).toBeVisible();await expect(page.locator('.camera-row')).toHaveCount(6);await expect(page.locator('iframe')).toHaveCount(0);await expect(page.locator('#windy-filter')).toBeHidden();});

  test('一覧は映像・画像を先に並べ、名前が無ければ代わりの名前を出す',async({page})=>{
    await open(page);
    const ids=await page.locator('.camera-row').evaluateAll(nodes=>nodes.map(node=>node.dataset.cameraId));
    await expect(page.locator('.camera-row .badge')).toHaveText(['映像','映像','映像','画像','リンク','リンク']);
    /* n6・w5 は中心にいちばん近いが「リンクのみ」なので最後。距離だけで並べていたら先頭2件になる。 */
    expect(ids.slice(-2)).toEqual(['n6','w5']);
    await expect(page.locator('[data-camera-id="n6"] strong')).toHaveText('カメラ NO-6');
    await expect(page.locator('.camera-row strong',{hasText:'名前のないカメラ'})).toHaveCount(0);
  });

  test('一覧から選ぶと詳細・国・向き・外部リンク・hashが出る',async({page})=>{await open(page);await expect(page.locator('#panel-eyebrow')).toHaveText('AROUND HERE');await page.locator('[data-camera-id="n1"]').click();await expect(page.locator('#panel-title')).toHaveText('秋田駅前ライブ');await expect(page.locator('#panel-eyebrow')).toHaveText('CAMERA');await expect(page.locator('.details')).toContainText('日本（アジア）');await expect(page.locator('.details')).toContainText('北東（45°）');await expect(page.getByRole('link',{name:'Googleマップで開く'})).toHaveAttribute('rel','noopener noreferrer');await expect(page).toHaveURL(/#cam=n1$/);});

  test('運営者がURLならホスト名だけを出す',async({page})=>{await open(page);await page.locator('[data-camera-id="n2"]').click();await expect(page.locator('.details')).toContainText('example.invalid');await expect(page.locator('.details')).not.toContainText('/company/about');});

  test('地図上の点をcanvasから選べる',async({page})=>{await open(page);await mapClick(page,AKITA.lon,AKITA.lat);await expect(page.locator('#panel-title')).toHaveText('秋田駅前ライブ');});

  test('クラスタを1回押すと2段以上ズームが進む',async({page})=>{
    await open(page);
    const before=await page.evaluate(async()=>{const map=globalThis.__cameraMap;map.jumpTo({center:[140.1305,39.7186],zoom:11});await new Promise(resolve=>map.once('idle',resolve));return map.getZoom();});
    const point=await page.evaluate(()=>{const map=globalThis.__cameraMap;const feature=map.queryRenderedFeatures({layers:['camera-clusters']})[0];const p=map.project(feature.geometry.coordinates);return{x:p.x,y:p.y};});
    const canvas=await page.locator('#map canvas').boundingBox();
    await page.mouse.click(canvas.x+point.x,canvas.y+point.y);
    await expect.poll(()=>page.evaluate(()=>globalThis.__cameraMap.getZoom()),{timeout:5000}).toBeGreaterThanOrEqual(before+2);
  });

  test('YouTubeは選択後だけ生成し、動画とチャンネルのprivacy-enhanced URLを使う',async({page})=>{
    await open(page);await page.locator('[data-camera-id="n1"]').click();let frame=page.locator('.viewer iframe');await expect(frame).toHaveAttribute('src',/youtube-nocookie\.com\/embed\/video123\?autoplay=1/);let box=await frame.boundingBox();expect(box.width).toBeGreaterThanOrEqual(480);expect(box.height).toBeGreaterThanOrEqual(270);
    /* allow に fullscreen があるので allowfullscreen 属性は付けない（二重指定の警告になる） */
    await expect(frame).toHaveAttribute('allow',/fullscreen/);expect(await frame.getAttribute('allowfullscreen')).toBeNull();
    await page.getByRole('button',{name:'詳細を閉じる'}).click();await page.locator('[data-camera-id="n2"]').click();frame=page.locator('.viewer iframe');await expect(frame).toHaveAttribute('src',/embed\/live_stream\?channel=UCakita&autoplay=1/);await expect(page.locator('.viewer iframe')).toHaveCount(1);
  });

  for(const width of [375,390,768,1280])test(`${width}pxでプレーヤーがパネルからはみ出さない`,async({page})=>{
    await page.setViewportSize({width,height:800});await stub(page);await page.goto(`${PATH}#cam=n1`);
    await expect(page.locator('.viewer iframe')).toBeVisible();
    const frame=await boxOf(page,'.viewer iframe');const panel=await boxOf(page,'#panel');
    expect(frame.right,'プレーヤーの右端がパネルの内側').toBeLessThanOrEqual(panel.right);
    expect(frame.left).toBeGreaterThanOrEqual(panel.left);
    /* 480×270 未満にしないのはYouTubeの推奨。スマホは幅が足りないので「大きく見る」で逃がす。 */
    if(width>=720){expect(frame.width).toBeGreaterThanOrEqual(480);expect(frame.height).toBeGreaterThanOrEqual(270);}
    else await expect(page.getByRole('button',{name:'大きく見る'})).toBeVisible();
  });

  test('共有リンクでは自動再生せず、押して開いたときだけ再生する',async({page})=>{
    const requests=await stub(page);await page.goto(`${PATH}#cam=n1`);
    await expect(page.locator('.viewer iframe')).toHaveAttribute('src',/[?&]autoplay=0/);
    await page.getByRole('button',{name:'詳細を閉じる'}).click();
    await page.locator('[data-camera-id="n1"]').click();
    await expect(page.locator('.viewer iframe')).toHaveAttribute('src',/[?&]autoplay=1/);
    expect(requests.images.length).toBe(0);
  });

  test('共有リンクで開いても提供元へ取りに行くのは1回だけ',async({page})=>{
    const requests=await stub(page);await page.goto(`${PATH}#cam=n3`);
    await expect(page.locator('.viewer img')).toHaveCount(1);
    await page.waitForTimeout(400);
    expect(requests.images.length).toBe(1);
  });

  test('静止画は時刻を付け、更新で新しいURLを要求し、失敗しても更新で戻せる',async({page})=>{
    const requests=await open(page);await page.locator('[data-camera-id="n3"]').click();
    await expect(page.locator('.viewer img')).toHaveAttribute('src',/[?&]_=[0-9]+/);
    await expect.poll(()=>requests.images.length).toBe(1);
    await page.waitForTimeout(5);await page.getByRole('button',{name:'更新',exact:true}).click();
    await expect.poll(()=>requests.images.length).toBe(2);
    const stamps=requests.images.map(value=>new URL(value).searchParams.get('_'));
    expect(stamps.every(value=>/^[0-9]+$/.test(value))).toBe(true);expect(stamps[0]).not.toBe(stamps[1]);
    /* 2回目は失敗させてあるので、img は案内文に置き換わる。 */
    await expect(page.getByText('画像を読み込めませんでした。提供元で見てください。')).toBeVisible();
    await expect(page.locator('.viewer img')).toHaveCount(0);
    await expect(page.locator('.viewer-frame.is-fallback')).toHaveCount(1);
    /* 失敗した後の「更新」が空振りしない＝表示先を作り直して本当に再試行する。 */
    await page.waitForTimeout(5);await page.getByRole('button',{name:'更新',exact:true}).click();
    await expect.poll(()=>requests.images.length).toBe(3);
    await expect(page.locator('.viewer img')).toHaveCount(1);
    await expect(page.getByText('画像を読み込めませんでした。提供元で見てください。')).toHaveCount(0);
  });

  test('ChromiumでHLSは対応ブラウザの案内になる',async({page})=>{await open(page);await page.locator('[data-camera-id="n4"]').click();await expect(page.getByText(/HLS.*Safari/)).toBeVisible({timeout:6000});await expect(page.locator('video')).toHaveCount(0);});

  test('HLSが黙ったままでも案内へ切り替える',async({page})=>{
    await open(page,{hlsHang:true});await page.locator('[data-camera-id="n4"]').click();
    /* 応答が来ないので error も来ない。5秒待って案内へ差し替わること。 */
    await expect(page.locator('video')).toHaveCount(1);
    await expect(page.getByText(/HLS.*Safari/)).toBeVisible({timeout:6000});
    await expect(page.locator('video')).toHaveCount(0);
    await expect(page.locator('.viewer-frame.is-fallback').getByRole('link',{name:'提供元で見る'})).toBeVisible();
  });

  test('リンク種別はビューアを作らず提供元ボタンを出す',async({page})=>{await open(page);await page.locator('[data-camera-id="w5"]').click();await expect(page.locator('.viewer iframe,.viewer img,.viewer video')).toHaveCount(0);await expect(page.locator('.viewer').getByRole('link',{name:'提供元で見る'})).toBeVisible();});

  test('どこかの窓はリンクのみを避けて映像か画像を開く',async({page})=>{await page.addInitScript(()=>{Math.random=()=>.7;});await open(page);await page.getByRole('button',{name:'どこかの窓を開く'}).click();await expect(page.locator('#panel .badge')).toHaveText(/映像|画像/);await expect(page).not.toHaveURL(/#cam=(w5|n6)$/);});

  test('現在地へ寄っても座標を端末へ保存しない',async({page,context})=>{await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:35.6812,longitude:139.7671});await open(page);await page.evaluate(()=>localStorage.removeItem('day030.view.v1'));await page.getByRole('button',{name:'現在地',exact:true}).click();await expect.poll(()=>page.evaluate(()=>Math.round(globalThis.__cameraMap.getZoom()))).toBe(9);expect(await page.evaluate(()=>localStorage.getItem('day030.view.v1'))).toBeNull();});

  test('種別チップで表示件数と点データが変わる',async({page})=>{
    await open(page);
    /* 全部ONなら「表示 6／6」は一覧のメタと同じ数を2度言うだけ。絞ったときだけ出す。 */
    await expect(page.locator('#camera-count')).toBeHidden();
    await page.getByRole('button',{name:'リンク',exact:true}).click();
    await expect(page.locator('#camera-count')).toHaveText('表示 4／6 か所');
    await expect(page.locator('[data-camera-id="w5"]')).toHaveCount(0);
    await page.getByRole('button',{name:'画像',exact:true}).click();
    await expect(page.locator('#camera-count')).toHaveText('表示 3／6 か所');
    await expect(page.locator('[data-camera-id="n3"]')).toHaveCount(0);
    await page.getByRole('button',{name:'リンク',exact:true}).click();
    await expect(page.locator('#camera-count')).toHaveText('表示 5／6 か所');
  });

  test('種別チップは押した状態を塗りで見せ、テーマ切替には適用しない',async({page})=>{
    await open(page);
    const styleOf=(group)=>page.evaluate((one)=>{const node=document.querySelector(`[data-kind-group="${one}"]`);const style=getComputedStyle(node);return{background:style.backgroundColor,border:style.borderTopColor,weight:style.fontWeight,color:style.color};},group);
    const on=await styleOf('image');
    await page.getByRole('button',{name:'画像',exact:true}).click();
    const off=await styleOf('image');
    expect(on.background,'ONは塗り・OFFは透明').not.toBe(off.background);
    expect(off.background).toBe('rgba(0, 0, 0, 0)');
    expect(Number(on.weight)).toBeGreaterThan(Number(off.weight));
    /* 押した状態の塗りは「今その種別が出ている」という状態の印。動作のボタン（テーマ切替）には出さない。 */
    const themeBackground=await page.evaluate(()=>getComputedStyle(document.querySelector('#theme-toggle')).backgroundColor);
    expect(themeBackground).not.toBe(on.background);
    /* 先頭の丸は凡例と同じ色を指す。 */
    const colors=await page.evaluate(()=>['video','image','page'].map((kind)=>[
      getComputedStyle(document.querySelector(`[data-kind-group="${kind}"] .kind-dot`)).color,
      getComputedStyle(document.querySelector(`.legend .${kind}`)).color,
    ]));
    for(const [chip,legend] of colors) expect(chip).toBe(legend);
  });

  test('検索候補はlistbox/optionで、選ぶとzoom 13で開く',async({page})=>{await open(page);await page.locator('#camera-search').fill('観光局');await expect(page.locator('#search-results')).toHaveAttribute('role','listbox');const option=page.locator('#search-results [role="option"]');await expect(option).toHaveCount(1);await option.click();await expect(page.locator('#panel-title')).toHaveText('秋田駅前ライブ');await expect.poll(()=>page.evaluate(()=>globalThis.__cameraMap.getZoom()),{timeout:5000}).toBeCloseTo(13,0);});

  test('検索候補は↓↑とEnterで選べ、Escで閉じる',async({page})=>{
    await open(page);const input=page.locator('#camera-search');
    await input.fill('秋田');
    await expect(page.locator('#search-results [role="option"]')).toHaveCount(5);
    await expect(input).toHaveAttribute('aria-expanded','true');
    await input.press('ArrowDown');await expect(input).toHaveAttribute('aria-activedescendant','search-option-0');
    await input.press('ArrowDown');await expect(input).toHaveAttribute('aria-activedescendant','search-option-1');
    await expect(page.locator('#search-option-1')).toHaveAttribute('aria-selected','true');
    await input.press('ArrowUp');await expect(input).toHaveAttribute('aria-activedescendant','search-option-0');
    await input.press('Enter');
    await expect(page.locator('#panel-title')).toHaveText('秋田駅前ライブ');
    await expect(input).toHaveAttribute('aria-expanded','false');
    await input.fill('秋田');await expect(page.locator('#search-results')).toBeVisible();
    await input.press('Escape');await expect(page.locator('#search-results')).toBeHidden();
  });

  test('#cam=で直接開き、別の選択でhashが変わる',async({page})=>{await stub(page);await page.goto(`${PATH}#cam=n3`);await expect(page.locator('#panel-title')).toHaveText('秋田の空');await page.getByRole('button',{name:'詳細を閉じる'}).click();await page.locator('[data-camera-id="w5"]').click();await expect(page).toHaveURL(/#cam=w5$/);});

  test('Escと×で閉じ、一覧の元のボタンへフォーカスを戻す',async({page})=>{await open(page);await page.locator('[data-camera-id="n1"]').click();await expect(page.locator('#panel-title')).toBeFocused();await page.keyboard.press('Escape');await expect(page.locator('#panel-title')).toHaveText('この範囲のカメラ');await expect(page.locator('[data-camera-id="n1"]')).toBeFocused();await page.locator('[data-camera-id="n2"]').click();await page.getByRole('button',{name:'詳細を閉じる'}).click();await expect(page.locator('[data-camera-id="n2"]')).toBeFocused();});

  test('Windy未設定なら関連UIを一切表示しない',async({page})=>{await open(page);await expect(page.locator('#windy-filter')).toBeHidden();await expect(page.locator('.legend .legend-windy')).toBeHidden();});

  test('Windy設定済みはzoom 5以上でbboxを呼び、選択後に帰属を出す',async({page})=>{const {windy:urls}=await stub(page,{windy:true});await page.goto(PATH);await expect(page.locator('#windy-filter')).toBeVisible();await page.evaluate(()=>globalThis.__cameraMap.jumpTo({center:[140.14,39.72],zoom:6}));await expect.poll(()=>urls.some(value=>new URL(value).searchParams.has('bbox')),{timeout:4000}).toBe(true);await mapClick(page,AKITA.lon+.01,AKITA.lat+.01);await expect(page.getByText('Webcams provided by',{exact:false})).toBeVisible();await expect(page.getByRole('link',{name:'add new webcam'})).toHaveAttribute('href','https://www.windy.com/webcams/add');expect(urls.some(value=>new URL(value).searchParams.get('id')==='901')).toBe(true);});

  test('初期読み込みで外へ出るのは地図配信元だけ',async({page})=>{const external=[];page.on('request',request=>{const host=new URL(request.url()).hostname;if(!['127.0.0.1','localhost'].includes(host))external.push(host);});await open(page);expect([...new Set(external)]).toEqual(['tiles.openfreemap.org']);});

  for(const viewport of [{width:375,height:667},{width:390,height:844},{width:768,height:1024},{width:1280,height:800}])test(`${viewport.width}×${viewport.height}で横スクロールがない`,async({page})=>{await page.setViewportSize(viewport);await open(page);const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,inner:innerWidth}));expect(size.scroll).toBeLessThanOrEqual(size.inner);});

  test('表示中の主要ボタンは44px以上',async({page})=>{await open(page);const boxes=await page.locator('.topbar button,.map-actions button,.panel button,.maplibregl-ctrl-group button').evaluateAll(nodes=>nodes.filter(node=>node.offsetParent!==null).map(node=>({name:node.textContent.trim()||node.getAttribute('aria-label')||node.className,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})));/* MapLibre のボタンは transform の丸めで 43.99…px と測れることがある（Day 029 で CI の Linux が実測）。整数に丸めて比べる */for(const box of boxes){expect(Math.round(box.width),`${box.name} width`).toBeGreaterThanOrEqual(44);expect(Math.round(box.height),`${box.name} height`).toBeGreaterThanOrEqual(44);}});

  test('凡例はズームボタンに重ならず、属性表示も読める',async({page})=>{
    await open(page);
    const legend=await boxOf(page,'.legend');const zoom=await boxOf(page,'.maplibregl-ctrl-zoom-in');const actions=await boxOf(page,'.map-actions');const attribution=await boxOf(page,'.maplibregl-ctrl-attrib');
    expect(overlaps(legend,zoom),'凡例とズームボタン').toBe(false);
    expect(overlaps(legend,attribution),'凡例と属性表示').toBe(false);
    expect(overlaps(actions,attribution),'ボタン列と属性表示').toBe(false);
    expect(await reachable(page,['.legend','.maplibregl-ctrl-zoom-in','.maplibregl-ctrl-attrib-inner'])).toEqual({'.legend':true,'.maplibregl-ctrl-zoom-in':true,'.maplibregl-ctrl-attrib-inner':true});
  });

  test('768pxで詳細を開いても属性表示とズームボタンが読める',async({page})=>{
    await page.setViewportSize({width:768,height:1024});await stub(page);await page.goto(`${PATH}#cam=n1`);
    await page.waitForSelector('#map[data-ready="true"]');
    /* 詳細の間はパネルが広がって地図側の余地が無くなるので、凡例は出さない（バッジは詳細の中にある）。 */
    await expect(page.locator('.legend')).toBeHidden();
    const panel=await boxOf(page,'#panel');const zoom=await boxOf(page,'.maplibregl-ctrl-zoom-in');const attribution=await boxOf(page,'.maplibregl-ctrl-attrib');
    expect(attribution.left,'属性表示がパネルの下敷きにならない').toBeGreaterThanOrEqual(panel.right);
    expect(overlaps(attribution,zoom),'属性表示とズームボタン').toBe(false);
    expect(await reachable(page,['.maplibregl-ctrl-attrib-inner','.maplibregl-ctrl-zoom-in'])).toEqual({'.maplibregl-ctrl-attrib-inner':true,'.maplibregl-ctrl-zoom-in':true});
  });

  test('出典と共有はパネルの中にあり、ページ全体は縦にスクロールしない',async({page})=>{
    await open(page);
    await expect(page.locator('#panel-content footer .share')).toHaveCount(1);
    const size=await page.evaluate(()=>({scroll:document.documentElement.scrollHeight,inner:innerHeight}));
    expect(size.scroll).toBeLessThanOrEqual(size.inner+1);
  });

  test('テーマ切替は今の状態を語で示し、aria-pressedはダークかどうか',async({page})=>{
    await page.emulateMedia({colorScheme:'dark'});await open(page);
    const button=page.locator('#theme-toggle');
    await expect(button).toHaveAttribute('aria-pressed','true');
    await expect(button).toHaveAttribute('aria-label','ライト表示に切り替える');
    await expect(page.locator('#theme-label')).toHaveText('ダーク');
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed','false');
    await expect(button).toHaveAttribute('aria-label','ダーク表示に切り替える');
    await expect(page.locator('#theme-label')).toHaveText('ライト');
  });

  test('スマホの上部バーは150px以下で、副題と凡例は一覧側に出る',async({page})=>{
    await page.setViewportSize({width:390,height:844});await open(page);
    const topbar=await boxOf(page,'.topbar');
    expect(topbar.height).toBeLessThanOrEqual(150);
    await expect(page.locator('.brand p')).toBeHidden();
    await expect(page.locator('#panel-subtitle')).toHaveText('世界の公開ライブカメラを地図で');
    await expect(page.locator('#panel-legend')).toBeVisible();
    await expect(page.locator('.legend')).toBeHidden();
  });

  test('スマホで広げたシートは上部バーの下に潜らず、×とつまみを押せる',async({page})=>{
    await page.setViewportSize({width:390,height:844});await stub(page);await page.goto(`${PATH}#cam=n1`);
    await expect(page.locator('#panel-close')).toBeVisible();
    const collapsed=await boxOf(page,'#panel');
    await page.locator('#sheet-handle').click();
    await expect(page.locator('#sheet-handle')).toHaveAttribute('aria-expanded','true');
    await expect.poll(async()=>(await boxOf(page,'#panel')).height,{timeout:5000}).toBeGreaterThan(collapsed.height+100);
    const panel=await boxOf(page,'#panel');const topbar=await boxOf(page,'.topbar');
    expect(panel.top,'広げたシートは上部バーより下').toBeGreaterThanOrEqual(topbar.bottom);
    expect(await reachable(page,['#panel-close','#sheet-handle','#panel-title'])).toEqual({'#panel-close':true,'#sheet-handle':true,'#panel-title':true});
    /* Esc 以外の逃げ道が本当に効くこと。 */
    await page.getByRole('button',{name:'詳細を閉じる'}).click();
    await expect(page.locator('#panel-title')).toHaveText('この範囲のカメラ');
    await expect(page.locator('#sheet-handle')).toHaveAttribute('aria-expanded','false');
  });

  test('reduced motionではランダム移動にflyTo/easeToを使わない',async({page})=>{await page.emulateMedia({reducedMotion:'reduce'});await open(page);await page.evaluate(()=>{const map=globalThis.__cameraMap;globalThis.__motionCalls=0;for(const name of ['flyTo','easeTo']){const original=map[name].bind(map);map[name]=(...args)=>{globalThis.__motionCalls+=1;return original(...args);};}});await page.getByRole('button',{name:'どこかの窓を開く'}).click();expect(await page.evaluate(()=>globalThis.__motionCalls)).toBe(0);});
  test('共有リンクで開いた見出しにはフォーカスを移さない',async({page})=>{
    await stub(page);await page.goto(`${PATH}#cam=n1`);
    await expect(page.locator('#panel-title')).toHaveText('秋田駅前ライブ');
    /* まだ誰も何も押していない。ここでフォーカスを移すと見出しに枠が出て入力欄に見える。 */
    expect(await page.evaluate(()=>document.activeElement===document.body)).toBe(true);
    await page.getByRole('button',{name:'詳細を閉じる'}).click();
    await page.locator('[data-camera-id="n1"]').click();
    await expect(page.locator('#panel-title')).toBeFocused();
    /* 押して開いたときは移すが、枠は出さない（キーボードで辿り着いたときだけ :focus-visible で出す）。 */
    expect(await page.evaluate(()=>getComputedStyle(document.querySelector('#panel-title')).outlineStyle)).toBe('none');
  });

  test('詳細を下までスクロールしても見出しと×は残る',async({page})=>{
    await open(page);await page.locator('[data-camera-id="n1"]').click();
    const scrolled=await page.evaluate(()=>{const node=document.querySelector('#panel-content');node.scrollTop=400;return node.scrollTop;});
    expect(scrolled,'詳細は400pxスクロールできる長さがある').toBeGreaterThanOrEqual(400);
    expect(await reachable(page,['#panel-title','#panel-close'])).toEqual({'#panel-title':true,'#panel-close':true});
    /* 続きがあることは端のフェードで見せる。 */
    await expect(page.locator('#panel-content')).toHaveClass(/has-more-above/);
  });

  test('一覧用の件数は詳細では出さない',async({page})=>{
    await open(page);
    await page.getByRole('button',{name:'リンク',exact:true}).click();
    await expect(page.locator('#camera-count')).toBeVisible();
    await page.locator('[data-camera-id="n1"]').click();
    await expect(page.locator('#camera-count')).toBeHidden();
    await page.getByRole('button',{name:'詳細を閉じる'}).click();
    await expect(page.locator('#camera-count')).toHaveText('表示 4／6 か所');
  });

  test('一覧のメタは範囲と件数を1行で言い、世界全体では総数と食い違わない',async({page})=>{
    await open(page);
    /* 世界が入りきる zoom では bounds で数えない（端の点が漏れて総数と1〜2件ずれる）。 */
    await expect(page.locator('#panel-count')).toHaveText('世界全体 6件');
    await page.evaluate(async()=>{const map=globalThis.__cameraMap;map.jumpTo({center:[140.1305,39.72],zoom:9});await new Promise(resolve=>map.once('idle',resolve));});
    await expect(page.locator('#panel-count')).toHaveText('この範囲 6件');
    await page.evaluate(async()=>{const map=globalThis.__cameraMap;map.jumpTo({center:[-60,-20],zoom:9});await new Promise(resolve=>map.once('idle',resolve));});
    await expect(page.locator('#panel-count')).toHaveText('この範囲 0件');
  });

  for(const viewport of [{width:375,height:667},{width:390,height:844}])test(`${viewport.width}pxで属性表示・ボタン列・シートが重ならない`,async({page})=>{
    await page.setViewportSize(viewport);await open(page);
    const attribution=await boxOf(page,'.maplibregl-ctrl-attrib');const actions=await boxOf(page,'.map-actions');const panel=await boxOf(page,'#panel');
    expect(attribution.height,'属性表示は1行').toBeLessThanOrEqual(20);
    expect(overlaps(attribution,actions),'属性表示とボタン列').toBe(false);
    expect(overlaps(attribution,panel),'属性表示とシート').toBe(false);
    expect(overlaps(actions,panel),'ボタン列とシート').toBe(false);
    expect(await reachable(page,['.maplibregl-ctrl-attrib-inner','#locate-button','#random-button'])).toEqual({'.maplibregl-ctrl-attrib-inner':true,'#locate-button':true,'#random-button':true});
  });

  test('単独の点は種別ごとのアイコンで描き、テーマを変えても消えない',async({page})=>{
    await open(page);
    const layer=await page.evaluate(()=>{const map=globalThis.__cameraMap;return{type:map.getLayer('camera-points').type,windy:map.getLayer('windy-points').type,images:['pin-video','pin-image','pin-page','pin-windy'].map(id=>map.hasImage(id))};});
    expect(layer.type).toBe('symbol');expect(layer.windy).toBe('symbol');
    expect(layer.images).toEqual([true,true,true,true]);
    await page.locator('[data-camera-id="n1"]').click();
    expect(JSON.stringify(await page.evaluate(()=>globalThis.__cameraMap.getLayoutProperty('camera-points','icon-size')))).toContain('1.35');
    /* スタイルを差し替えると登録した画像も消える。入れ直していないと点が丸ごと出なくなる。 */
    await page.locator('#theme-toggle').click();
    await page.waitForSelector('#map[data-ready="true"]');
    expect(await page.evaluate(()=>globalThis.__cameraMap.hasImage('pin-video'))).toBe(true);
    /* symbol 層は絵が無いと描かれない＝queryRenderedFeatures にも出ない。寄って本当に出ているか見る。 */
    await page.evaluate(async()=>{const map=globalThis.__cameraMap;map.jumpTo({center:[140.1305,39.7176],zoom:13});await new Promise(resolve=>map.once('idle',resolve));});
    await expect.poll(()=>page.evaluate(()=>globalThis.__cameraMap.queryRenderedFeatures({layers:['camera-points']}).length),{timeout:5000}).toBeGreaterThan(0);
  });

  test('検索候補は一致した理由と種別を見せる',async({page})=>{
    await open(page);
    await page.locator('#camera-search').fill('観光局');
    const option=page.locator('#search-results [role="option"]');
    await expect(option).toHaveCount(1);
    await expect(page.locator('#search-results .search-count')).toHaveText('該当 1件');
    /* 名前に「観光局」は無い。運営者で当たったことを書かないと、なぜ出たのか分からない。 */
    await expect(option.locator('small')).toHaveText('運営者 秋田観光局');
    await expect(option.locator('.badge')).toHaveText('映像');
    expect((await option.boundingBox()).height).toBeGreaterThanOrEqual(48);
    await page.locator('#camera-search').fill('駅前');
    await expect(page.locator('#search-results mark')).toHaveText('駅前');
    await expect(page.locator('#search-results [role="option"] small').first()).toHaveText('日本');
  });

  test('地図の上に浮くものは角丸と面の色がそろっている',async({page})=>{
    await open(page);
    const styles=await page.evaluate(()=>['.maplibregl-ctrl-group','.legend','#locate-button','#random-button'].map((selector)=>{
      const style=getComputedStyle(document.querySelector(selector));
      return{selector,radius:style.borderTopLeftRadius,background:style.backgroundColor};
    }));
    expect(styles.map(({radius})=>radius)).toEqual(['12px','12px','12px','12px']);
    /* 主ボタンだけは地図の上で唯一の色付き。残りの中立なものは同じ面の色にする。 */
    const neutral=styles.filter(({selector})=>selector!=='#random-button').map(({background})=>background);
    expect(new Set(neutral).size,'ズーム・凡例・現在地の面の色').toBe(1);
  });

  test('選んだカメラはパネルの外側へ寄せる',async({page})=>{
    await page.setViewportSize({width:1280,height:800});await open(page);
    await page.locator('#camera-search').fill('観光局');
    await page.locator('#search-results [role="option"]').click();
    await expect(page.locator('#panel-title')).toHaveText('秋田駅前ライブ');
    /* 地図の中心＝画面の中心のままだと、選んだ点が広がったパネルの縁に貼りつく。 */
    await expect.poll(async()=>{
      const panel=await boxOf(page,'#panel');
      const x=await page.evaluate(({lon,lat})=>globalThis.__cameraMap.project([lon,lat]).x,{lon:AKITA.lon,lat:AKITA.lat});
      return Math.round(x-(panel.right+24));
    },{timeout:8000}).toBeGreaterThan(0);
  });

  test('選択中の点には輪を敷き、点より下に置く',async({page})=>{
    await open(page);
    const layer=await page.evaluate(()=>{const map=globalThis.__cameraMap;return{type:map.getLayer('camera-selected').type,radius:map.getPaintProperty('camera-selected','circle-radius'),filter:JSON.stringify(map.getFilter('camera-selected')),order:map.getStyle().layers.map((one)=>one.id)};});
    expect(layer.type).toBe('circle');
    expect(layer.radius).toBe(18);
    expect(layer.filter).not.toContain('n1');
    /* 輪が点の上にあると、選んだ点だけ絵が見えなくなる。 */
    expect(layer.order.indexOf('camera-selected')).toBeLessThan(layer.order.indexOf('camera-points'));
    await page.locator('[data-camera-id="n1"]').click();
    await expect.poll(()=>page.evaluate(()=>JSON.stringify(globalThis.__cameraMap.getFilter('camera-selected')))).toContain('n1');
    await page.getByRole('button',{name:'詳細を閉じる'}).click();
    await expect.poll(()=>page.evaluate(()=>JSON.stringify(globalThis.__cameraMap.getFilter('camera-selected')))).not.toContain('n1');
  });

  test('クラスタの円はライトでは白地＋青の縁にする',async({page})=>{
    await page.emulateMedia({colorScheme:'dark'});await open(page);
    const paint=()=>page.evaluate(()=>{const map=globalThis.__cameraMap;return{fill:map.getPaintProperty('camera-clusters','circle-color'),stroke:map.getPaintProperty('camera-clusters','circle-stroke-color'),text:map.getPaintProperty('camera-cluster-count','text-color')};});
    expect((await paint()).fill).toBe('#294c66');
    await page.locator('#theme-toggle').click();
    /* ライトの地図は明るく、紺の円だと主ボタン（どこかの窓を開く）と同じ見た目になっていた。 */
    await expect.poll(async()=>(await paint()).fill,{timeout:8000}).toBe('#ffffff');
    const light=await paint();
    expect(light.stroke).toBe('#006da0');
    expect(light.text).not.toBe('#ffffff');
  });

  test('検索候補は最後の行を半分見せて切り、続きがあるときだけ端をぼかす',async({page})=>{
    await page.setViewportSize({width:1280,height:800});await open(page);
    await page.locator('#camera-search').fill('秋田');
    await expect(page.locator('#search-results .search-count')).toHaveText('該当 5件');
    /* 5件なら全部入る＝ぼかさない（読めない字に見える）。 */
    await expect(page.locator('#search-results')).not.toHaveClass(/has-more/);
    await page.locator('#camera-search').fill('日本');
    await expect(page.locator('#search-results [role="option"]')).toHaveCount(6);
    const box=await page.evaluate(()=>{const node=document.querySelector('#search-results');const row=node.querySelector('[role="option"]').getBoundingClientRect().height;const head=node.querySelector('.search-count').getBoundingClientRect();return{row,visible:node.clientHeight,scroll:node.scrollHeight,head:head.bottom-node.getBoundingClientRect().top};});
    expect(box.scroll,'6件は入りきらない').toBeGreaterThan(box.visible);
    /* 見えている最後の行が半分だけ＝まだ下にあることが分かる高さ。 */
    const shown=(box.visible-box.head)/box.row;
    expect(shown-Math.floor(shown)).toBeGreaterThan(.2);
    expect(shown-Math.floor(shown)).toBeLessThan(.8);
    await expect(page.locator('#search-results')).toHaveClass(/has-more/);
    await expect(page.locator('#search-results .search-count')).toHaveText('該当 6件');
  });

  test('候補が20件を超えたら「上位を表示」と言う',async({page})=>{
    await stub(page);
    /* 打ち切りの言い方を見たいので、この検査だけカメラを25件に差し替える（あとに登録した route が勝つ）。 */
    const many={...CAMERAS,count:25,cameras:Array.from({length:25},(value,order)=>({i:`m${order}`,a:AKITA.lat+order*.001,o:AKITA.lon,k:'page',n:`町のカメラ ${order}`,u:'https://example.invalid/page',c:'JP'}))};
    await page.route('**/day-030-world-window/data/cameras.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(many)}));
    await page.goto(PATH);await page.waitForSelector('#panel[data-loaded="true"]');
    await page.locator('#camera-search').fill('町のカメラ');
    await expect(page.locator('#search-results [role="option"]')).toHaveCount(20);
    /* 「20件」と言い切ると嘘になる。何件あるか分からないまま上から出していることを書く。 */
    await expect(page.locator('#search-results .search-count')).toHaveText('該当 20件以上（上位を表示）');
    await expect(page.locator('#search-results .search-count')).toHaveAttribute('aria-hidden','true');
    await expect(page.locator('#search-results')).toHaveClass(/has-more/);
  });

  test('スマホでシートを広げると上部バーはタイトル行だけになり、暗幕を押すと縮む',async({page})=>{
    await page.setViewportSize({width:390,height:844});await open(page);
    const collapsedBar=await boxOf(page,'.topbar');const collapsedPanel=await boxOf(page,'#panel');
    await expect(page.locator('#map-scrim')).toBeHidden();
    await page.locator('#sheet-handle').click();
    await expect(page.locator('#sheet-handle')).toHaveAttribute('aria-expanded','true');
    /* 地図が見えないあいだ、検索とチップは使い道がない。畳んだぶんは一覧の高さに回す。 */
    await expect(page.locator('#camera-search')).toBeHidden();
    await expect(page.locator('.filters')).toBeHidden();
    await expect(page.locator('#theme-toggle')).toBeHidden();
    await expect.poll(async()=>(await boxOf(page,'.topbar')).height,{timeout:5000}).toBeLessThanOrEqual(60);
    await expect.poll(async()=>(await boxOf(page,'#panel')).height,{timeout:5000}).toBeGreaterThan(collapsedPanel.height+100);
    const scrim=page.locator('#map-scrim');
    await expect(scrim).toBeVisible();
    /* 暗幕は上部バーとシートの間に残した地図の帯。ここを押せば縮む（つまみは片手だと届かない）。 */
    const gap=await page.evaluate(()=>{const bar=document.querySelector('.topbar').getBoundingClientRect();const panel=document.querySelector('#panel').getBoundingClientRect();return{top:bar.bottom,bottom:panel.top};});
    expect(gap.bottom-gap.top,'押せる帯が残っている').toBeGreaterThanOrEqual(40);
    await scrim.click({position:{x:195,y:(gap.top+gap.bottom)/2}});
    await expect(page.locator('#sheet-handle')).toHaveAttribute('aria-expanded','false');
    await expect(scrim).toBeHidden();
    await expect(page.locator('#camera-search')).toBeVisible();
    expect(Math.round((await boxOf(page,'.topbar')).height)).toBe(Math.round(collapsedBar.height));
  });

  test('二次テキストは13px以上・行間1.6',async({page})=>{
    const measure=(selectors)=>page.evaluate((list)=>list.map((selector)=>{
      const node=document.querySelector(selector);if(!node)return{selector,size:0,line:0};
      const style=getComputedStyle(node);return{selector,size:parseFloat(style.fontSize),line:parseFloat(style.lineHeight)/parseFloat(style.fontSize)};
    }),selectors);
    await open(page);
    const list=await measure(['.legend span','.camera-row small','#panel-content footer p']);
    await page.locator('[data-camera-id="n3"]').click();
    await expect(page.locator('.viewer img')).toHaveCount(1);
    const detail=await measure(['.fetched','.privacy-note','.source-note']);
    for(const item of [...list,...detail]){
      expect(item.size,`${item.selector} の文字サイズ`).toBeGreaterThanOrEqual(13);
      expect(item.line,`${item.selector} の行間`).toBeGreaterThanOrEqual(1.55);
    }
  });

  test('ライトでは凡例の丸に輪郭を付けて背景に溶けないようにする',async({page})=>{
    await page.emulateMedia({colorScheme:'light'});await open(page);
    const dot=await page.evaluate(()=>{const style=getComputedStyle(document.querySelector('.legend .image'));return{color:style.color,shadow:style.boxShadow,size:style.width};});
    /* 白地で沈む黄は使わない（ライトだけ色を替える）。 */
    expect(dot.color).toBe('rgb(180, 83, 9)');
    expect(dot.shadow).not.toBe('none');
    expect(parseFloat(dot.size)).toBeGreaterThanOrEqual(10);
  });
});
