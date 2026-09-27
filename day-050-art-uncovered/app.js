import { ARTWORKS, ART_BY_ID } from './data/artworks.js';
import { createGame, revealMore, answer, next, score, POINTS, REVEAL, dayStamp, readProgress, saveProgress } from './lib/game.js';
import { Gallery } from './lib/gallery.js';
import { filterWorks } from './lib/catalog.js';

const $=id=>document.getElementById(id);
const gallery=new Gallery($('gallery'));
let storage;try{storage=window.localStorage;}catch{storage=null;}
let progress=readProgress(storage),game=null,screen='home',busy=false,request=0;
let currentWork=ARTWORKS[0],browseReturn=null,collectionScroll=0;
const number=value=>value.toLocaleString('ja-JP');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
gallery.setEnabled(gallery.enabled);

function setScreen(name,focus){
  screen=name;document.body.dataset.screen=name;
  for(const id of ['home','question','answer','result'])$(`${id}-screen`).hidden=id!==name;
  $('collection-open').hidden=name==='question'||(name==='answer'&&!browseReturn);
  if(focus){requestAnimationFrame(()=>{$(focus).focus({preventScroll:true});
    if(innerWidth<=700)window.scrollTo({top:name==='answer'?Math.max(0,$('gallery').getBoundingClientRect().top+scrollY-20):70,behavior:reduced.matches?'instant':'smooth'});
    else window.scrollTo({top:0,behavior:reduced.matches?'instant':'smooth'});
  });}
}

function updateProgress(){
  $('seen-count').textContent=`${progress.seen.length} / ${ARTWORKS.length}`;
}

function recordSeen(id){
  progress.seen=[...new Set([...progress.seen,id])].filter(id=>ART_BY_ID.has(id));
  saveProgress(storage,progress);updateProgress();
}

function setCaption(work,question=false){
  $('art-label').textContent=question?'一部分から、名画を探す。':work.artist;
  $('art-caption').replaceChildren();
  $('art-caption').append(document.createTextNode(question?'どこまで見れば、わかる？':work.title));
  const year=document.createElement('span');year.textContent=question?'気になった色や形を、手がかりに。':work.year;
  $('art-caption').append(year);
  $('stage-badge').textContent=question?`DETAIL ${game.step+1} / 4`:`COLLECTION ${String(ARTWORKS.findIndex(w=>w.id===work.id)+1).padStart(2,'0')} / ${String(ARTWORKS.length).padStart(2,'0')}`;
}

function lockQuestion(lock){
  for(const el of document.querySelectorAll('#choices button,#reveal-more,#skip-question'))el.disabled=lock;
  if(!lock&&game?.step===3)$('reveal-more').disabled=true;
}

async function showArt(work,fraction=1,question=false){
  const token=++request;currentWork=work;busy=true;
  $('art-error').hidden=true;$('art-loading').hidden=false;
  if(question)lockQuestion(true);
  setCaption(work,question);
  try{
    const success=await gallery.show(work,fraction,question?'出題中の名画の一部分。作品名を4つの選択肢から選んでください。':work.alt);
    if(token!==request||!success)return;
    $('art-loading').hidden=true;busy=false;
    if(question)lockQuestion(false);
  }catch{
    if(token!==request)return;
    $('art-loading').hidden=true;$('art-error').hidden=false;
    $('live').textContent='作品を読み込めませんでした。再読み込みするか、入口に戻れます。';
  }
}

function start(mode){
  browseReturn=null;
  const seed=mode==='daily'?`daily-v1-${dayStamp()}`:`random-${crypto.getRandomValues(new Uint32Array(1))[0]}`;
  game=createGame(ARTWORKS,seed);renderQuestion();
}

function renderQuestion(){
  const round=game.rounds[game.index],work=ART_BY_ID.get(round.id);
  $('round-count').textContent=`WORK ${String(game.index+1).padStart(2,'0')} / 05`;
  $('total-score').textContent=`${number(score(game))} pt`;
  $('round-progress').replaceChildren(...game.rounds.map((_,i)=>{const mark=document.createElement('span');mark.className=i<game.index?'done':i===game.index?'current':'';return mark;}));
  $('round-progress').setAttribute('aria-label',`5問中${game.index+1}問目`);
  $('choices').replaceChildren(...round.options.map((id,i)=>{
    const option=ART_BY_ID.get(id),button=document.createElement('button');button.className='choice';button.dataset.id=id;
    const ordinal=document.createElement('span');ordinal.className='choice-number';ordinal.textContent=String(i+1);ordinal.setAttribute('aria-hidden','true');
    const texts=document.createElement('span'),title=document.createElement('span'),artist=document.createElement('span');
    title.className='choice-title';title.textContent=option.title;artist.className='choice-artist';artist.textContent=option.artist;texts.append(title,artist);button.append(ordinal,texts);
    button.addEventListener('click',()=>submitAnswer(id));return button;
  }));
  updateReveal();setScreen('question','question-title');showArt(work,REVEAL[game.step],true);
}

function updateReveal(){
  $('reveal-status').textContent=`見える範囲 ${game.step+1} / 4`;
  $('available-points').textContent=number(POINTS[game.step]);
  $('reveal-more').disabled=game.step===3||busy;
  $('reveal-more').textContent=game.step===3?'絵の全体が見えています':'⊕ もう少し全体を見る';
  $('question-hint').hidden=game.step<2;
  $('question-hint').textContent=ART_BY_ID.get(game.rounds[game.index].id).hint;
  $('stage-badge').textContent=`DETAIL ${game.step+1} / 4`;
}

function submitAnswer(id){
  if(busy||screen!=='question'||game.phase!=='question')return;
  game=answer(game,id);renderAnswer(ART_BY_ID.get(game.rounds[game.index].id));
}

function renderAnswer(work,browsing=false){
  recordSeen(work.id);
  const result=browsing?null:game.answers.at(-1);
  $('answer-verdict').textContent=browsing?'図録からの一枚':result.correct?'✓ 正解です':result.selected===null?'この絵の正体は…':'惜しい。この絵の正体は…';
  $('answer-verdict').dataset.correct=String(result?.correct??true);
  $('answer-points').textContent=browsing?'':`+ ${number(result.points)} pt`;
  $('answer-artist').textContent=work.artist;$('answer-title').textContent=work.title;$('answer-year').textContent=`${work.year} ／ ${work.era}`;
  $('answer-choice').hidden=!result||result.correct||result.selected===null;
  $('answer-choice').textContent=result?.selected?`あなたの答え：${ART_BY_ID.get(result.selected).title}`:'';
  $('story-hook').textContent=work.hook;$('story-background').textContent=work.background;$('story-intent-label').textContent=work.intentLabel;$('story-intent').textContent=work.intent;$('story-look').textContent=work.look;
  $('source-link').href=work.source;
  $('next-question').textContent=browsing?(browseReturn==='result'?'5作品の結果へ戻る':'図録に戻る'):game.index===4?'今日の5作品を振り返る →':'次の作品へ →';
  setScreen('answer','answer-title');showArt(work,1);
  $('live').textContent=browsing?`${work.title}の解説`:result.correct?`正解です。${result.points}点。${work.title}。`:`正解は${work.title}です。`;
}

function showResult(){
  const total=score(game);progress.best=Math.max(progress.best,total);saveProgress(storage,progress);
  $('final-score').textContent=number(total);
  $('result-detail').textContent=`5問中 ${game.answers.filter(a=>a.correct).length} 問正解 · この端末の最高 ${number(progress.best)} pt`;
  $('result-works').replaceChildren(...game.answers.map(result=>{
    const work=ART_BY_ID.get(result.id),button=document.createElement('button');button.className='result-work';button.setAttribute('aria-label',`${work.title}の解説を見返す`);
    const image=document.createElement('img');image.src=work.image;image.alt='';const points=document.createElement('span');points.textContent=result.correct?`${result.points} pt`:'鑑賞';button.append(image,points);
    button.addEventListener('click',()=>{browseReturn='result';renderAnswer(work,true);});return button;
  }));
  setScreen('result','result-title');showArt(ART_BY_ID.get(game.answers.at(-1).id),1);
}

function renderCollection(){
  const works=filterWorks(ARTWORKS,$('collection-search').value);
  $('collection-count').textContent=`${works.length} / ${ARTWORKS.length} 作品`;
  $('collection-empty').hidden=works.length>0;
  $('collection-grid').replaceChildren(...works.map(work=>{
    const button=document.createElement('button');button.className='collection-item';
    button.dataset.id=work.id;
    const image=document.createElement('img');image.src=work.image;image.alt='';image.loading='lazy';
    const title=document.createElement('h3');title.textContent=work.title;const artist=document.createElement('p');artist.textContent=work.artist;const seen=document.createElement('small');seen.textContent=progress.seen.includes(work.id)?'出会った作品':'これから出会う作品';
    button.append(image,title,artist,seen);button.addEventListener('click',()=>{collectionScroll=$('collection-dialog').scrollTop;$('collection-dialog').close();browseReturn='collection';renderAnswer(work,true);});return button;
  }));
}

function openCollection(){
  renderCollection();
  $('collection-dialog').showModal();
  $('collection-dialog').scrollTop=collectionScroll;
}

function home(){
  ++request;busy=false;browseReturn=null;game=null;
  setScreen('home');showArt(ARTWORKS[0],1);window.scrollTo({top:0,behavior:'instant'});
}

function share(result=false){
  const url=document.querySelector('link[rel="canonical"]').href;
  const text=result?`名画の、その先。\n5問中${game.answers.filter(a=>a.correct).length}問正解・${number(score(game))}点。\n絵を当てたら、その物語にも出会えた。`:'';
  $('share-result-text').hidden=!result;$('result-share-controls').hidden=!result;$('share-result-text').textContent=text;
  $('copy-status').textContent='';$('copy-fallback').hidden=true;
  $('result-x').href=`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  $('result-line').href=`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  $('copy-result').onclick=async()=>{
    const value=`${text}\n${url}`;let timeout;
    $('copy-status').textContent='コピーしています…';
    try{
      await Promise.race([navigator.clipboard.writeText(value),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('clipboard timeout')),2500);})]);
      $('copy-status').textContent='結果とリンクをコピーしました。';
    }catch{
      $('copy-status').textContent='自動コピーができませんでした。下の文を選んでコピーできます。';
      $('copy-fallback').hidden=false;$('copy-fallback').value=value;$('copy-fallback').focus();$('copy-fallback').select();
    }finally{clearTimeout(timeout);}
  };
  $('native-result').hidden=typeof navigator.share!=='function';
  $('native-result').onclick=async()=>{try{await navigator.share({title:'名画の、その先。',text,url});}catch{}};
  $('share-dialog').showModal();
}

$('start-daily').addEventListener('click',()=>start('daily'));
$('start-random').addEventListener('click',()=>start('random'));
$('replay').addEventListener('click',()=>start('random'));
$('back-home').addEventListener('click',home);
$('error-home').addEventListener('click',home);
$('reveal-more').addEventListener('click',()=>{if(busy||game?.phase!=='question')return;game=revealMore(game);gallery.setCrop(REVEAL[game.step]);updateReveal();$('live').textContent=`見える範囲 ${game.step+1} / 4。正解で${POINTS[game.step]}点。`;});
$('skip-question').addEventListener('click',()=>submitAnswer(null));
$('next-question').addEventListener('click',()=>{
  if(browseReturn){const back=browseReturn;browseReturn=null;if(back==='result')showResult();else{home();openCollection();}return;}
  if(game?.phase!=='answer')return;game=next(game);game.phase==='result'?showResult():renderQuestion();
});
$('view-toggle').addEventListener('click',()=>{gallery.setEnabled(!gallery.enabled);if(!gallery.renderer)$('live').textContent='この端末では平面展示で作品を楽しめます。';});
$('image-retry').addEventListener('click',()=>showArt(currentWork,screen==='question'?REVEAL[game.step]:1,screen==='question'));
$('collection-open').addEventListener('click',openCollection);
$('collection-search').addEventListener('input',()=>{collectionScroll=0;renderCollection();});
$('collection-clear').addEventListener('click',()=>{collectionScroll=0;$('collection-search').value='';renderCollection();$('collection-search').focus();});
$('share-open').addEventListener('click',()=>share(false));
$('result-share').addEventListener('click',()=>share(true));
for(const dialog of document.querySelectorAll('dialog')){
  dialog.querySelector('.close-dialog').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
}
document.addEventListener('keydown',event=>{
  if(document.querySelector('dialog[open]')||screen!=='question'||event.altKey||event.metaKey||event.ctrlKey||event.repeat)return;
  if(/^[1-4]$/.test(event.key)){event.preventDefault();const option=game.rounds[game.index].options[Number(event.key)-1];submitAnswer(option);}
});
document.addEventListener('visibilitychange',()=>gallery.render());
$('collection-total').textContent=ARTWORKS.length;
updateProgress();showArt(ARTWORKS[0],1);
