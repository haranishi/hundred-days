import { STORIES, confrontationLines } from './story.js';

const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createConversation({motion,sound,onInvestigate,onHeard,openLog}){
  let c=null,p=null,queue=[],index=0,after=null,timer=null,typing=false,revealing=false,current=null,atMenu=false;
  const heard=new Set(),asked=new Map(),logs=new Map();
  let onRevealEnd=null;
  const actor=$('story-actor'),next=$('dialogue-next'),choices=$('dialogue-choices');
  function stopTyping(){
    clearTimeout(timer);timer=null;typing=false;
    $('conversation').dataset.speaking='false';
    if(current)$('dialogue-text').textContent=current.text;
  }
  function controls(){
    if(atMenu){choices.hidden=false;next.hidden=true;return;}
    choices.hidden=true;
    next.hidden=false;
    next.textContent=typing?'続きを表示':index<queue.length-1?'次のセリフへ':revealing?'推理の解説へ':'質問を選ぶ';
    $('dialogue-step').textContent=(revealing?'追及後の会話':'会話')+' '+(index+1)+' / '+queue.length;
    $('reveal-skip').hidden=!revealing;
  }
  function display(){
    stopTyping();current=queue[index];
    const speaker=current.speaker||'person';
    $('speaker-name').textContent=speaker==='detective'?'あなた':speaker==='narrator'?'捜査メモ':p.name;
    $('speaker-role').textContent=speaker==='person'?p.role:speaker==='detective'?'時刻表を、証拠に。':'汐見鉄道の記録';
    $('conversation').dataset.mood=current.mood||'neutral';
    $('conversation').dataset.speaker=speaker;
    $('dialogue-announcement').textContent=(speaker==='person'?p.name:speaker==='detective'?'あなた':'捜査メモ')+'。'+current.text;
    const log=logs.get(c.id)||[];log.push({name:$('speaker-name').textContent,text:current.text});logs.set(c.id,log.slice(-100));
    const text=$('dialogue-text');text.textContent='';
    if(motion.matches){text.textContent=current.text;typing=false;}
    else{
      const chars=Array.from(current.text);let pos=0;typing=true;
      $('conversation').dataset.speaking=String(speaker==='person');
      function tick(){
        if(document.hidden){stopTyping();controls();return;}
        pos=Math.min(chars.length,pos+1);text.textContent=chars.slice(0,pos).join('');
        if(pos<chars.length)timer=setTimeout(tick,/[。！？…]/.test(chars[pos-1])?110:23);
        else{stopTyping();controls();}
      }
      timer=setTimeout(tick,23);
    }
    if(speaker==='person')sound.play('talk-'+p.id);
    controls();
  }
  function play(lines,done){
    stopTyping();atMenu=false;queue=lines;index=0;after=done;display();
  }
  function markHeard(){
    heard.add(c.id+':'+p.id);
    onHeard(c.people.filter(person=>heard.has(c.id+':'+person.id)).map(person=>person.id));
  }
  function menu(){
    stopTyping();atMenu=true;markHeard();next.hidden=true;choices.hidden=false;
    $('dialogue-step').textContent='気になることを聞こう';
    const questions=STORIES[c.id].people[p.id].questions,done=asked.get(c.id+':'+p.id)||new Set();
    choices.innerHTML=questions.map(q=>'<button type="button" data-question="'+q.id+'"><span>'+(done.has(q.id)?'✓ ':'＋ ')+esc(q.label)+'</span><span aria-hidden="true">↗</span></button>').join('');
    choices.querySelector('button')?.focus({preventScroll:true});
  }
  next.addEventListener('click',()=>{
    if(typing){stopTyping();controls();return;}
    if(index<queue.length-1){index++;display();}
    else after?.();
  });
  choices.addEventListener('click',e=>{
    const button=e.target.closest('[data-question]');if(!button)return;
    const q=STORIES[c.id].people[p.id].questions.find(q=>q.id===button.dataset.question);
    const key=c.id+':'+p.id,done=asked.get(key)||new Set();done.add(q.id);asked.set(key,done);
    $('conversation-clue').textContent='手掛かりメモ：'+q.note;
    $('conversation-clue').hidden=false;
    play([{speaker:'detective',text:q.label,mood:'neutral'},{text:q.text,mood:'neutral'}],()=>{
      menu();choices.querySelector('[data-question="'+q.id+'"]').focus({preventScroll:true});
    });
    next.focus({preventScroll:true});
  });
  $('investigate-link').addEventListener('click',()=>{stopTyping();controls();onInvestigate();});
  $('reveal-skip').addEventListener('click',()=>{stopTyping();revealing=false;$('conversation').dataset.state='investigation';onRevealEnd?.();onRevealEnd=null;});
  $('log-button').addEventListener('click',()=>{
    stopTyping();controls();
    $('conversation-log').innerHTML=(logs.get(c.id)||[]).map(l=>'<li><strong>'+esc(l.name)+'</strong><p>'+esc(l.text)+'</p></li>').join('');
    openLog($('log-dialog'),$('log-button'));
  });
  motion.addEventListener('change',()=>{if(motion.matches){stopTyping();controls();}});
  return {
    select(caseData,person){
      stopTyping();c=caseData;p=person;revealing=false;onRevealEnd=null;
      actor.style.setProperty('--character','url("./assets/'+p.id+'-expressions.webp")');
      actor.dataset.character=p.id;
      $('conversation').dataset.state='listening';
      $('chapter-goal').textContent=STORIES[c.id].goal;
      $('conversation-clue').hidden=true;$('reveal-impact').hidden=true;$('reveal-skip').hidden=true;
      const story=STORIES[c.id].people[p.id];
      play([{text:story.greeting},{text:p.words}],menu);
    },
    reveal(caseData,person,answer,done){
      stopTyping();c=caseData;p=person;revealing=true;onRevealEnd=done;
      actor.style.setProperty('--character','url("./assets/'+p.id+'-expressions.webp")');
      actor.dataset.character=p.id;
      $('conversation').dataset.state='reveal';
      $('reveal-impact').hidden=false;
      $('chapter-goal').textContent='証言が崩れた。隠していた事情を聞こう。';
      $('conversation-clue').hidden=true;
      play(confrontationLines(c,p,answer),()=>{
        stopTyping();revealing=false;$('conversation').dataset.state='investigation';onRevealEnd=null;done();
      });
      next.focus({preventScroll:true});
      $('conversation').scrollIntoView({block:'nearest',behavior:motion.matches?'auto':'smooth'});
    },
    reset(caseId){
      for(const key of [...heard])if(key.startsWith(caseId+':'))heard.delete(key);
      for(const key of [...asked.keys()])if(key.startsWith(caseId+':'))asked.delete(key);
      logs.delete(caseId);
    },
    heardFor(caseId){return [...heard].filter(k=>k.startsWith(caseId+':')).map(k=>k.split(':')[1]);},
    finishTyping(){if(typing){stopTyping();controls();}},
    isRevealing(){return revealing;}
  };
}
