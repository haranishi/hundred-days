/** 地図と記録の共通の焦点管理。本文は各画面が組み立てる。 */
export function createPlayDialog({document,screen,title,onClose}) {
  const element=document.createElement('section');element.className='modal-backdrop';element.hidden=true;element.dataset.screen=screen;
  element.setAttribute('role','dialog');element.setAttribute('aria-modal','true');element.setAttribute('aria-label',title);
  const panel=document.createElement('div');panel.className=`panel modal ${screen}-panel`;
  const heading=document.createElement('h2');heading.textContent=title;
  const body=document.createElement('div');body.className=`${screen}-body`;panel.append(heading,body);element.append(panel);
  let previous;
  const focusables=()=>[...element.querySelectorAll('button')].filter(e=>!e.disabled&&!e.closest('[hidden]'));
  element.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}
    if(e.key==='Tab'){const all=focusables(),first=all[0],last=all.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }
  });
  return {element,body,heading,// 開いたときの焦点は、主のボタン（橙）へ。無ければ最初のボタン（画面ごとに、焦点の輪の付く場所がばらばらだった：画面の採点 1 周目）
  show(){if(element.hidden)previous=document.activeElement;element.hidden=false;(focusables().find(b=>b.classList.contains('primary'))??focusables()[0])?.focus();},
    hide(){if(element.hidden)return;element.hidden=true;previous?.focus?.();}};
}
export function textNode(document,tag,text,className) {const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;}
export function actionButton(document,action,label,handler) {const b=textNode(document,'button',label);b.dataset.action=action;b.addEventListener('click',handler);return b;}
