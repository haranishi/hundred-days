import { test,expect } from '@playwright/test';
const enter=async(page)=>{
  await page.goto('/classic.html');
  await expect(page.locator('#world')).toHaveAttribute('data-ready','true');
};

const reveal=async(page,key='arrival',{read=false}={})=>{
  await page.locator('#accuse-button').click();
  await expect(page.locator('#proof-dialog')).toBeVisible();
  await page.locator('[data-proof="'+key+'"]').click();
  await expect(page.locator('#conversation')).toHaveAttribute('data-state','reveal');
  if(read){
    for(let i=0;i<14&&!await page.locator('#result-dialog').isVisible();i++)await page.locator('#dialogue-next').click();
  }else await page.locator('#reveal-skip').click();
  await expect(page.locator('#result-dialog')).toBeVisible();
};

test('initial scene is rendered in WebGL, with no page or console errors',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await enter(page);
  await expect(page.locator('#world')).toHaveAttribute('data-renderer','webgl');
  await expect(page.locator('.station-marker')).toHaveCount(5);
  expect(await page.locator('canvas').evaluate(c=>c.width>=c.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('wrong answer recovers, every case can be solved, progress survives reload',async({page})=>{
  await enter(page);
  await page.locator('#accuse-button').click();
  await page.locator('[data-proof="arrival"]').click();
  await expect(page.locator('#proof-feedback')).toContainText('成り立ちます');
  await expect(page.locator('#proof-feedback')).toContainText('18:28');
  await page.keyboard.press('Escape');
  await expect(page.locator('#progress-label')).toHaveText('解決 0 / 3');
  await page.getByRole('button',{name:'朝倉 透の証言',exact:true}).click();
  await reveal(page,'arrival',{read:true});
  await expect(page.locator('#result-dialog')).toBeVisible();
  await expect(page.locator('#result-arrival')).toHaveText('18:38');
  await expect(page.locator('#result-reason')).toContainText('8分');
  await page.locator('#next-case').click();
  await expect(page.locator('#case-title')).toHaveText('二分間の空白');
  await reveal(page,'transfer',{read:true});
  await expect(page.locator('#result-arrival')).toHaveText('19:30');
  await page.locator('#next-case').click();
  await page.getByRole('button',{name:'水瀬 栞の証言',exact:true}).click();
  await reveal(page,'stops',{read:true});
  await expect(page.locator('#result-arrival')).toHaveText('20:34');
  await expect(page.locator('#progress-label')).toHaveText('解決 3 / 3');
  await expect(page.locator('#ending-ticket')).toBeVisible();
  await expect(page.locator('#result-closing')).toContainText('展示台へ返した');
  await page.locator('#next-case').click();
  await expect(page.locator('#result-dialog')).not.toBeVisible();
  await page.reload();await expect(page.locator('#progress-label')).toHaveText('解決 3 / 3');
});
test('range keys, play, pause and timetable tracking update the displayed time',async({page})=>{
  await enter(page);
  await page.locator('#time-range').focus();await page.keyboard.press('End');
  await expect(page.locator('#clock')).toHaveText('18:55');
  await page.locator('#play-button').click();
  await expect(page.locator('#clock')).not.toHaveText('18:55');
  await page.locator('#play-button').click();
  await expect(page.locator('#play-button')).toHaveAttribute('aria-pressed','false');
  await page.getByRole('tab',{name:'列車の時刻表'}).click();
  await page.getByRole('button',{name:'海岸線 101を追う'}).click();
  await expect(page.locator('#tracking-label')).toContainText('101');
  await expect(page.locator('#play-button')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#clock')).toHaveText(/18:0[56]/);
});
test('tabs support arrow navigation and 2D preserves station interaction',async({page})=>{
  await enter(page);
  await page.getByRole('tab',{name:'証言と記録'}).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#panel-timetable')).toBeVisible();
  await expect(page.locator('#tab-timetable')).toBeFocused();
  await page.locator('#view-2d').click();
  await expect(page.locator('.flat-map')).toBeVisible();
  await expect(page.locator('canvas')).not.toBeVisible();
  await page.getByRole('button',{name:'灯台港駅を調べる'}).click();
  await expect(page.locator('#station-caption')).toContainText('灯台港駅');
  await page.locator('#view-3d').click();
  await expect(page.locator('canvas')).toBeVisible();
});
test('hints progress, help closes with Escape, share provides supported links',async({page})=>{
  await enter(page);
  await page.keyboard.press('h');await expect(page.locator('#hint-count')).toHaveText('1 / 3');
  await page.locator('#hint-button').click();await page.locator('#hint-button').click();
  await expect(page.locator('#hint-button')).toBeDisabled();
  await expect(page.locator('#hint-text')).toContainText('18:38');
  await page.locator('#help-button').click();await expect(page.locator('#help-dialog')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('#help-button')).toBeFocused();
  await page.locator('#share-button').click();
  await expect(page.getByRole('link',{name:'Xで投稿'})).toHaveAttribute('href',/^https:\/\/x.com\/intent\/post/);
  await expect(page.getByRole('link',{name:'LINEで送る'})).toHaveAttribute('href',/^https:\/\/social-plugins.line.me/);
  await expect(page.getByRole('button',{name:'リンクをコピー'})).toBeVisible();
});
test('sound is opt-in, persists, and restart retains solved cases',async({page})=>{
  await enter(page);await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed','false');
  await page.locator('#sound-button').click();await page.reload();
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'朝倉 透の証言',exact:true}).click();await reveal(page);
  await page.getByRole('button',{name:'解説を閉じる'}).click();
  await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'水瀬 栞の証言',exact:true}).click();
  await page.locator('#dialogue-next').click();await page.locator('#dialogue-next').click();
  await expect(page.locator('#heard-count')).toHaveText('聴取 1 / 3');
  await page.locator('#restart-button').click();
  await expect(page.locator('#heard-count')).toHaveText('聴取 0 / 3');
  await expect(page.locator('#progress-label')).toHaveText('解決 1 / 3');
  await expect(page.locator('#hint-count')).toHaveText('0 / 3');
});
test('reduced motion starts paused, and query links select a valid case',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/classic.html?case=passing-station');await expect(page.locator('#world')).toHaveAttribute('data-ready','true');
  await expect(page.locator('#play-button')).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('#case-title')).toHaveText('窓の向こうの駅');
  await page.getByRole('tab',{name:'列車の時刻表'}).click();
  await expect(page.locator('.train-pass')).toHaveText('汐見中央・霧山は通過（乗降できません）');
});
test('blocked browser storage never blocks investigation or completion',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}}));
  await enter(page);await page.getByRole('button',{name:'朝倉 透の証言',exact:true}).click();await reveal(page);
  await expect(page.locator('#result-dialog')).toBeVisible();
  await expect(page.locator('#app-notice')).toContainText('保存できません');
  await expect(page.locator('#result-save-note')).toBeVisible();
});
test('unavailable WebGL falls back to a usable SVG map',async({page})=>{
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(kind,...args){if(kind==='webgl'||kind==='webgl2'||kind==='experimental-webgl')return null;return original.call(this,kind,...args);};
  });
  await enter(page);await expect(page.locator('#world')).toHaveAttribute('data-renderer','svg');
  await expect(page.locator('.flat-map')).toBeVisible();
  await page.getByRole('button',{name:'星見温泉駅を調べる'}).click();
  await expect(page.locator('#station-caption')).toContainText('星見温泉');
  await page.getByRole('button',{name:'朝倉 透の証言',exact:true}).click();await reveal(page);
  await expect(page.locator('#result-arrival')).toHaveText('18:38');
});
for(const [width,height] of [[390,844],[768,1024],[1440,900]]){
  test('screen '+width+': no horizontal overflow, readable evidence, reachable correct action',async({page})=>{
    await page.setViewportSize({width,height});await enter(page);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const markers=await page.locator('.station-marker').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{left:r.left,right:r.right};}));
    for(const r of markers){expect(r.left).toBeGreaterThanOrEqual(-1);expect(r.right).toBeLessThanOrEqual(width+1);}
    await page.getByRole('button',{name:'朝倉 透の証言',exact:true}).click();
    await expect(page.locator('#record-station')).toHaveText('灯台港');
    await reveal(page);
    await expect(page.locator('#result-dialog')).toBeVisible();
    expect(await page.locator('#result-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
    await page.getByRole('button',{name:'解説を閉じる'}).click();
    await page.locator('#tab-timetable').click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:'test-results/day068/screen-'+width+'.png',fullPage:true});
  });
}

test('solving the final case first leads to unresolved cases without claiming full completion',async({page})=>{
  await page.goto('/classic.html?case=passing-station');await expect(page.locator('#world')).toHaveAttribute('data-ready','true');
  await page.getByRole('button',{name:'水瀬 栞の証言',exact:true}).click();await reveal(page,'stops');
  await expect(page.locator('#progress-label')).toHaveText('解決 1 / 3');
  await expect(page.locator('#result-title')).not.toContainText('調査完了');
  await expect(page.locator('#next-case')).toContainText('未解決の事件へ');
  await page.locator('#next-case').click();await expect(page.locator('#case-title')).toHaveText('消えた青い切符');
});

test('a lost graphics context changes the view and controls without losing progress',async({page})=>{
  await enter(page);
  await page.locator('canvas').evaluate(canvas=>canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
  await expect(page.locator('#world')).toHaveAttribute('data-view','2d');
  await expect(page.locator('#view-2d')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#view-3d')).toBeDisabled();
  await page.getByRole('button',{name:'朝倉 透の証言',exact:true}).click();await reveal(page);
  await expect(page.locator('#result-arrival')).toHaveText('18:38');
});

test('following a train on a touch screen brings the railway into view',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await enter(page);
  await page.locator('#tab-timetable').click();await page.locator('[data-follow="A1"]').click();
  await expect.poll(()=>page.locator('#world').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})).toBe(true);
  await expect(page.locator('#tracking-label')).toContainText('101');
});

test('dialogue types with a speaking portrait, can finish immediately and never advances on its own',async({page})=>{
 await enter(page);
 await page.getByRole('button',{name:'朝倉 透の証言',exact:true}).click();
 await expect(page.locator('#conversation')).toHaveAttribute('data-speaking','true');
 expect(await page.locator('.actor-talk').evaluate(e=>getComputedStyle(e).animationName)).toBe('character-speak');
 await page.locator('#dialogue-next').click();
 await expect(page.locator('#conversation')).toHaveAttribute('data-speaking','false');
 await expect(page.locator('#dialogue-text')).toContainText('今日は列車と夕日');
 await expect(page.locator('#dialogue-step')).toHaveText('会話 1 / 2');
 await page.locator('#dialogue-next').click();await page.locator('#dialogue-next').click();
 await expect(page.locator('#dialogue-text')).toContainText('18時30分');
 await expect(page.locator('#dialogue-step')).toHaveText('会話 2 / 2');
 await expect(page.locator('#dialogue-next')).toHaveText('質問を選ぶ');
});

test('questions leave clues, mark the heard character, and survive opening the conversation log',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await enter(page);
 await page.locator('#dialogue-next').click();await page.locator('#dialogue-next').click();
 await expect(page.locator('#heard-count')).toHaveText('聴取 1 / 3');
 await expect(page.locator('[data-question="ticket"]')).toBeFocused();
 await page.locator('[data-question="ticket"]').click();
 await expect(page.locator('#speaker-name')).toHaveText('あなた');
 await page.locator('#dialogue-next').click();
 await expect(page.locator('#speaker-name')).toHaveText('水瀬 栞');
 await expect(page.locator('#dialogue-text')).toContainText('祖父はこの鉄道の運転士');
 await page.locator('#dialogue-next').click();
 await expect(page.locator('[data-question="ticket"]')).toContainText('✓');
 await expect(page.locator('#conversation-clue')).toContainText('開業第一号');
 await page.locator('#log-button').click();
 await expect(page.locator('#conversation-log')).toContainText('祖父はこの鉄道の運転士');
 await page.keyboard.press('Escape');
 await expect(page.locator('#log-button')).toBeFocused();
 await expect(page.locator('[data-question="ticket"]')).toBeVisible();
 await page.getByRole('button',{name:'朝倉 透の証言',exact:true}).click();
 await page.getByRole('button',{name:'水瀬 栞の証言',exact:true}).click();
 await page.locator('#dialogue-next').click();await page.locator('#dialogue-next').click();
 await expect(page.locator('[data-question="ticket"]')).toContainText('✓');
 await expect(page.locator('#heard-count')).toHaveText('聴取 1 / 3');
});

test('a wrong piece of evidence is explained without solving, and correct evidence starts a confession',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await enter(page);
 await page.getByRole('button',{name:'朝倉 透の証言',exact:true}).click();
 await page.locator('#accuse-button').click();await page.locator('[data-proof="coast"]').click();
 await expect(page.locator('#proof-feedback')).toContainText('反証できない');
 await expect(page.locator('#proof-response')).toContainText('山手線の終点');
 await expect(page.locator('#progress-label')).toHaveText('解決 0 / 3');
 await expect(page.locator('#result-dialog')).not.toBeVisible();
 await page.locator('#proof-back').click();await expect(page.locator('#tab-timetable')).toBeFocused();
 await expect(page.locator('#panel-timetable')).toBeVisible();
 await page.locator('#accuse-button').click();await page.locator('[data-proof="arrival"]').click();
 await expect(page.locator('#conversation')).toHaveAttribute('data-state','reveal');
 await expect(page.locator('#conversation')).toHaveAttribute('data-mood','surprised');
 await expect(page.locator('#dialogue-next')).toBeFocused();
 await expect(page.locator('#progress-label')).toHaveText('解決 1 / 3');
 await expect(page.locator('#answer-feedback')).not.toBeVisible();
 await page.locator('#dialogue-next').click();
 await expect(page.locator('#speaker-name')).toHaveText('朝倉 透');
 await expect(page.locator('#dialogue-text')).toContainText('隠してた');
 await page.locator('#dialogue-next').click();await page.locator('#dialogue-next').click();await page.locator('#dialogue-next').click();
 await expect(page.locator('#result-closing')).toContainText('配達員');
});

test('switching characters or cases cancels pending typing without changing progress',async({page})=>{
 await enter(page);
 await page.getByRole('button',{name:'朝倉 透の証言',exact:true}).click();
 await page.getByRole('button',{name:'三好 灯の証言',exact:true}).click();
 await page.locator('#dialogue-next').click();
 await expect(page.locator('#dialogue-text')).toContainText('私も配達しながら探すよ');
 await page.locator('[data-case="1"]').click();await page.locator('#dialogue-next').click();
 await expect(page.locator('#dialogue-text')).toContainText('青い封筒');
 await expect(page.locator('#speaker-name')).toHaveText('三好 灯');
 await expect(page.locator('#progress-label')).toHaveText('解決 0 / 3');
});

test('reduced motion displays full dialogue with no moving mouth, and the portrait fits on desktop',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await enter(page);
 await expect(page.locator('#dialogue-text')).toContainText('なくしたままには、できません');
 await expect(page.locator('#conversation')).toHaveAttribute('data-speaking','false');
 expect(await page.locator('.actor-talk').evaluate(e=>getComputedStyle(e).display)).toBe('none');
 const [actor,frame]=await Promise.all([page.locator('.actor-base').boundingBox(),page.locator('#story-actor').boundingBox()]);
 expect(actor.y).toBeGreaterThanOrEqual(frame.y-1);expect(actor.y+actor.height).toBeLessThanOrEqual(frame.y+frame.height+1);
});

test('a cancelled accusation restores focus and never changes the solved count',async({page})=>{
 await enter(page);await page.locator('#accuse-button').click();await page.keyboard.press('Escape');
 await expect(page.locator('#accuse-button')).toBeFocused();
 await expect(page.locator('#progress-label')).toHaveText('解決 0 / 3');
});

test('keyboard can complete listening, select a question and return from its answer',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await enter(page);
 await page.locator('#dialogue-next').focus();await page.keyboard.press('Enter');await page.keyboard.press('Enter');
 await expect(page.locator('[data-question="ticket"]')).toBeFocused();
 await page.keyboard.press('Enter');await expect(page.locator('#dialogue-next')).toBeFocused();
 await page.keyboard.press('Enter');await page.keyboard.press('Enter');
 await expect(page.locator('[data-question="ticket"]')).toBeFocused();
 await expect(page.locator('#conversation-clue')).toContainText('祖父');
});
