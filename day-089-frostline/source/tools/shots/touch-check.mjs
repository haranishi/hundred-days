// node tools/shots/touch-check.mjs [URL] [--webgl]
import { options, session, begin, VIEWPORTS, fail } from './common.mjs';
function assert(condition, message) { if (!condition) throw Error(message); }
/** スクロールで隠れた部品も1つずつ見せ、押せる大きさを検査する。 */
async function checkScreen(page, viewport, screen, {onePage=false}={}) {
  const scope=page.locator(`[data-screen="${screen}"]:visible`);
  assert(await scope.count()===1, `${screen}: 画面が開きません`);
  const buttons=scope.locator('button');
  for(let i=0;i<await buttons.count();i++) {
    const button=buttons.nth(i);if(!await button.isVisible())continue;
    await button.scrollIntoViewIfNeeded();
    const r=await button.boundingBox();
    assert(r.width>=43.9&&r.height>=43.9, `${screen}: 44px未満のボタンがあります`);
    assert(r.x>=-.5&&r.x+r.width<=viewport.width+.5&&r.y>=-.5&&r.y+r.height<=viewport.height+.5, `${screen}: ボタンが画面の外にあります`);
    const blocked=await button.evaluate(el=>{
      const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return !hit||!(hit===el||el.contains(hit));
    });
    assert(!blocked, `${screen}: ボタンに他の部品が重なっています`);
  }
  const pairs=await scope.evaluate(el=>{
    const rects=[...el.querySelectorAll('button')].filter(b=>!b.closest('[hidden]')).map(b=>({b,r:b.getBoundingClientRect()})).filter(({b,r})=>{
      if(r.width===0||r.x<0||r.y<0||r.right>innerWidth+.5||r.bottom>innerHeight+.5)return false;
      for(let p=b.parentElement;p&&p!==el;p=p.parentElement){
        const style=getComputedStyle(p);if([style.overflowX,style.overflowY].some(v=>['auto','scroll','hidden'].includes(v))){
          const clip=p.getBoundingClientRect();if(r.left<clip.left-.5||r.right>clip.right+.5||r.top<clip.top-.5||r.bottom>clip.bottom+.5)return false;
        }
      }
      return true;
    });
    const collisions=[];
    for(let i=0;i<rects.length;i++)for(const other of rects.slice(i+1)){
      const a=rects[i].r,b=other.r;
      if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5)collisions.push([rects[i].b.dataset.action,other.b.dataset.action]);
    }
    return collisions;
  });
  assert(!pairs.length,`${screen}: ボタンが重なっています ${JSON.stringify(pairs)}`);
  const result=await scope.evaluate(el=>({page:document.documentElement.scrollWidth,
    overflow:[...el.querySelectorAll('.modal')].some(p=>p.scrollHeight>p.clientHeight+1),
    focused:el.contains(document.activeElement)}));
  assert(result.page<=viewport.width,`${screen}: 横にはみ出しています`);
  assert(!onePage||!result.overflow,`${screen}: 記録が1枚に収まりません`);
  assert(result.focused,`${screen}: 開いた画面に焦点がありません`);
}
async function checkFocus(page, screen) {
  const scope=page.locator(`[data-screen="${screen}"]:visible`);
  const buttons=scope.locator('button:enabled');
  const first=buttons.first(),last=buttons.last();
  await last.focus();await page.keyboard.press('Tab');
  assert(await first.evaluate(el=>el===document.activeElement),`${screen}: Tabが画面から出ます`);
  await first.focus();await page.keyboard.press('Shift+Tab');
  assert(await last.evaluate(el=>el===document.activeElement),`${screen}: Shift+Tabが画面から出ます`);
}
async function checkPlayScreens(page,viewport) {
  await page.locator('[data-controls] [data-action="map"]').tap();
  assert(await page.evaluate(()=>window.__ginrei.play().stage)==='map','指で地図が開きません');
  const before=await page.evaluate(()=>window.__ginrei.state());
  await page.evaluate(()=>window.__ginrei.advance(1));
  assert(JSON.stringify(before)===JSON.stringify(await page.evaluate(()=>window.__ginrei.state())),'地図の間に滑走が進みます');
  await checkFocus(page,'map');await checkScreen(page,viewport,'map');
  await page.locator('[data-screen="map"] [data-action="map-select"]').first().tap();
  await page.locator('[data-action="map-start"]').tap();
  assert(await page.evaluate(()=>window.__ginrei.play().stage)==='ride','地図の「ここから滑る」で再開しません');
  // 平らな面で制動して止まり、画面の区切りボタンを使う。自動で駅に着いた場合も記録を検査する。
  await page.evaluate(()=>window.__ginrei.setInput({brake:1}));
  for(let second=0;second<90;second++) {
    const state=await page.evaluate(()=>{window.__ginrei.advance(.5);return window.__ginrei.play();});
    if(state.stage==='summary'||state.canFinish)break;
  }
  const state=await page.evaluate(()=>window.__ginrei.play());
  assert(state.stage==='summary'||state.canFinish,'45秒制動しても一本を区切れません。出発地点の停止条件を確認してください');
  if(state.stage!=='summary')await page.locator('[data-screen="hud"] [data-action="finish"]').tap();
  await page.evaluate(()=>window.__ginrei.setInput(null));
  await checkFocus(page,'summary');await checkScreen(page,viewport,'summary',{onePage:true});
  await page.locator('[data-screen="summary"] [data-action="map"]').tap();
  await page.keyboard.press('Escape');
  assert(await page.evaluate(()=>window.__ginrei.play().stage)==='summary','地図のEscapeが記録へ戻りません');
  await page.locator('[data-action="again"]').tap();
  assert(await page.evaluate(()=>window.__ginrei.play().stage)==='ride','同じ地点から再開しません');
  // もう一度記録を出し、最初のボタンを1操作する。
  await page.evaluate(()=>window.__ginrei.setInput({brake:1}));
  for(let second=0;second<90;second++) {
    const s=await page.evaluate(()=>{window.__ginrei.advance(.5);return window.__ginrei.play();});
    if(s.stage==='summary'||s.canFinish)break;
  }
  if(await page.evaluate(()=>window.__ginrei.play().stage)!=='summary')await page.locator('[data-screen="hud"] [data-action="finish"]').tap();
  await page.evaluate(()=>window.__ginrei.setInput(null));
  const next=await page.evaluate(()=>window.__ginrei.play().summary.next.id);
  await page.locator('[data-action="next"]').tap();
  assert(await page.evaluate(()=>window.__ginrei.play().current.id)===next,'1操作で次の一本が始まりません');
  await page.locator('[data-control="pause"]').tap();
  await page.evaluate(()=>window.__ginrei.advance(0));
  await page.locator('[data-screen="pause"] [data-action="map"]').tap();
  await page.locator('[data-action="map-close"]').tap();
  assert(await page.evaluate(()=>window.__ginrei.play().stage)==='pause','地図から一時停止へ戻りません');
  await page.locator('[data-action="settings"]').tap();
  await page.locator('[data-action="progress-clear"]').tap();
  await checkScreen(page,viewport,'settings');
  await page.locator('[data-action="progress-cancel"]').tap();
  await page.locator('[data-action="progress-clear"]').tap();
  await page.locator('[data-action="progress-confirm"]').tap();
  assert(await page.evaluate(()=>window.__ginrei.play().progress.totals.runs)===0,'確認後に進み具合が消えません');

}
try {
  const config = options(); if (config.webkit) throw Error('指の検査はCDPを使うためChromiumで実行してください');
  for (const viewport of [...VIEWPORTS, { width: 844, height: 390 }]) {
    await session(config, viewport, async ({ page, context }) => {
      // 題字から地図を開き、Escapeで題字へ戻る。
      await page.locator('[data-screen="title"] [data-action="map"]').tap();
      await checkFocus(page,'map');await checkScreen(page,viewport,'map');
      await page.keyboard.press('Escape');
      assert(await page.evaluate(()=>window.__ginrei.play().stage)==='title','題字の地図から戻れません');
      await begin(page);
      const layout = await page.evaluate(() => {
        const visible = element => element.getClientRects().length && !element.closest('[hidden]');
        const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
        return {
          controls: [...document.querySelectorAll('[data-control], [data-controls] [data-action]')].filter(visible).map(el => ({ control: el.dataset.control ?? el.dataset.action, ...rect(el) })),
          panels: [...document.querySelectorAll('[data-readouts], [data-message-wrap]')].filter(visible).map(rect),
          scrollWidth: document.documentElement.scrollWidth,
        };
      });
      const { controls, panels } = layout;
      assert(layout.scrollWidth <= viewport.width, `${viewport.width}: 横にはみ出しています`);
      for (const name of ['steer', 'jump', 'brake', 'pause', 'camera']) assert(controls.some(c => c.control === name), `${name}: 部品が見つかりません`);
      for (const r of controls) {
        assert(r.width >= 44 && r.height >= 44, `${r.control}: 44px未満です`);
        assert(r.x >= 0 && r.y >= 0 && r.x + r.width <= viewport.width + .5 && r.y + r.height <= viewport.height + .5, `${r.control}: 画面の外にあります`);
      }
      const overlaps = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > .5 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > .5;
      for (let i = 0; i < controls.length; i++) {
        for (const b of controls.slice(i + 1)) assert(!overlaps(controls[i], b), `${controls[i].control}と${b.control}が重なっています`);
        for (const panel of panels) assert(!overlaps(controls[i], panel), `${controls[i].control}に表示が重なっています`);
      }
      const center = name => { const r = controls.find(c => c.control === name); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
      const cdp = await context.newCDPSession(page);
      const left = { id: 1, ...center('steer') }, right = { id: 2, ...center('jump') };
      const send = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
      const sample = () => page.evaluate(() => { window.__ginrei.advance(1 / 120); return window.__ginrei.input(); });
      try {
        await send('touchStart', [left]);
        await send('touchStart', [left, right]);
        left.x += 32;
        await send('touchMove', [left, right]);
        let value = await sample();
        assert(value.steer > .3 && value.jump === true, '舵と2本目のジャンプを同時に受け付けません');
        // CDP の touchEnd・touchCancel には「離す指」を渡す（残る指ではない）。実測で確かめた決まり。
        await send('touchEnd', [right]); value = await sample();
        assert(value.steer > .3 && value.jump === false, '2本目を離したときにジャンプだけが解除されません');
        await send('touchEnd', [left]); value = await sample();
        assert(value.steer === 0 && value.jump === false, '指を離しても操作が残っています');
        // 逆の順で離しても、右の指の押下は残る。
        left.x -= 32;
        await send('touchStart', [left]); await send('touchStart', [left, right]);
        await send('touchEnd', [left]); value = await sample();
        assert(value.steer === 0 && value.jump === true, '左の指を離すと右の指まで解除されます');
        await send('touchCancel', []); value = await sample(); // 取消は指を渡さない（全部の取消）
        assert(value.jump === false, '取消でジャンプが解除されません');
      } finally { await cdp.detach(); }
      await checkPlayScreens(page,viewport);
      console.log(`指の操作と配置: ${viewport.width}×${viewport.height} 合格`);
    }, { hasTouch: true, isMobile: true });
  }
} catch (error) { fail(error); }
