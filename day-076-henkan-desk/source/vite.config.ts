import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const clientOnly = env.VITE_CLIENT_ONLY === 'true';
  const base = env.VITE_BASE_PATH || '/';
  const site = new URL(env.VITE_PUBLIC_SITE_URL || 'http://localhost:4173/').href.replace(/\/?$/, '/');
  return { base, plugins: [react(), { name: 'site-metadata', transformIndexHtml: {order:'post',handler: (html) => {
    const content = clientOnly ? html
      .replace('画像・PDF・Office・データの27ツール。形式やサイズ・比率の変更、PDF結合・分割、CSV・JSON変換まで。','画像・PDF・データの24ツール。ファイルを送信せずに形式・サイズ・比率の変更、PDF整理、CSV・JSON変換。')
      .replace('へんかんデスク | ファイルに、ちょうどいいかたちを。','へんかんデスク')
      .replace('画像の形式・サイズ・比率、PDFの整理、OfficeのPDF化、テキストとデータの変換まで。','画像の形式・サイズ・比率、PDFの整理、テキストとデータの変換まで。')
      .replace('へんかんデスク | 画像・PDF・Office・データ変換','へんかんデスク | 画像・PDF・データ変換')
      .replace('<div id="root"></div>','<div id="root"></div><section id="share" aria-label="このアプリを共有する"></section>') : html;
    return {html:content,tags:[
      { tag:'link',attrs:{rel:'canonical',href:site},injectTo:'head' },
      { tag:'meta',attrs:{property:'og:url',content:site},injectTo:'head' },
      { tag:'meta',attrs:{property:'og:image',content:site+'ogp.png'},injectTo:'head' },
      ...(clientOnly ? [
        {tag:'meta',attrs:{name:'share:text',content:'へんかんデスク'},injectTo:'head' as const},
        {tag:'meta',attrs:{name:'twitter:card',content:'summary_large_image'},injectTo:'head' as const},
        {tag:'link',attrs:{rel:'stylesheet',href:base+'shared/share.css'},injectTo:'head' as const},
        {tag:'script',attrs:{src:base+'shared/share.js',defer:true},injectTo:'body' as const}
      ]:[])
    ]};
  }}}], server: { host:'127.0.0.1',port:5173,proxy:{'/api':'http://127.0.0.1:4173'} },worker:{format:'es'},assetsInclude:['**/*.wasm'],build:{target:'es2022',rolldownOptions:{output:{comments:{legal:true}}}} };
});
