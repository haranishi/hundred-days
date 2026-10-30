import './style.css';
import './premium.css';
import './retro.css';
import { GameUI } from './ui';
const publicUrl=import.meta.env.VITE_PUBLIC_URL;
if(publicUrl&&!document.querySelector('link[rel="canonical"]')){try{const url=new URL(publicUrl);if(['https:','http:'].includes(url.protocol)){url.search='';url.hash='';const canonical=document.createElement('link');canonical.rel='canonical';canonical.href=url.href;document.head.append(canonical);const og=document.createElement('meta');og.setAttribute('property','og:url');og.content=url.href;document.head.append(og);document.querySelector<HTMLMetaElement>('meta[property="og:image"]')!.content=new URL('og-cover.png',url).href;}}catch{/* Public metadata is optional for local play. */}}
try {
 new GameUI();
} catch (error) {
 console.error('Game initialization failed', error);
 document.querySelector('#app')!.innerHTML='<main class="startup-error"><h1>世界の準備に失敗しました</h1><p>ページを再読み込みしてください。保存の設定やWebGLを有効にすると遊べる場合があります。</p><button onclick="location.reload()">もう一度読み込む</button></main>';
}
