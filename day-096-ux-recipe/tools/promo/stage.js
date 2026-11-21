// 撮影用ステージの描画。render-promo.mjs が毎コマ stage.apply(state) を呼ぶ（状態はすべて動画の時刻から Node 側で計算する）。
(() => {
  const $ = (s) => document.querySelector(s);
  const el = { cap: $('#cap'), stripe: $('#stripe'), appwrap: $('#appwrap'), labels: $('#labels'), hls: $('#hls'), ripple: $('#ripple'),
    finger: $('#finger'), badge: $('#badge'), callout: $('#callout'), flash: $('#flash'), end: $('#endcard'), endStrip: $('#end-strip'), band: $('#band') };
  let capKey = '', labelKey = '';
  const set = (node, css) => Object.assign(node.style, css);

  window.stage = {
    // cfg: { stages:[{color,label}], iframes:[{name,url}], end:{title,sub,pills,series,url} }
    init(cfg) {
      window.__baseScale = cfg.app.scale;
      el.stripe.innerHTML = cfg.stages.map((s) => `<i style="background:${s.color}"></i>`).join('');
      el.endStrip.innerHTML = el.stripe.innerHTML;
      for (const f of cfg.iframes) {
        const fr = document.createElement('iframe');
        fr.name = f.name; fr.src = f.url; fr.setAttribute('scrolling', 'no');
        fr.style.width = `${cfg.app.viewport.width}px`; fr.style.height = `${cfg.app.viewport.height}px`; fr.style.left = `${(540 - cfg.app.viewport.width) / 2}px`;
        el.appwrap.appendChild(fr);
      }
      $('#end-label').textContent = cfg.end.label; $('#end-lead').textContent = cfg.end.lead; $('#end-cta').textContent = cfg.end.cta;
      $('#end-title').textContent = cfg.end.title; $('#end-sub').textContent = cfg.end.sub;
      $('#end-pills').innerHTML = cfg.end.pills.map((p) => `<span>${p}</span>`).join('');
      $('#end-series').textContent = cfg.end.series; $('#end-url').textContent = cfg.end.url;
    },
    showIframe(name) { for (const f of el.appwrap.children) f.classList.toggle('on', f.name === name); },
    // s: { iframe, caption:{lines,big,accentFrom,dots:{n,on},alpha,dy}|null, labels:[{x,y,text,alpha}], hls:[{x,y,w,h,alpha}],
    //      ripple:{x,y,p}|null, finger:{x,y,alpha,press}|null, badge:{text,kind,x,y,p}|null, flash, end:{p}, blur }
    apply(s) {
      for (const f of el.appwrap.children) { const on = f.name === s.iframe; f.classList.toggle('on', on); f.style.transformOrigin = s.appOrigin || '50% 0'; f.style.transform = `scale(${((window.__baseScale || 1) * (on && s.appScale ? s.appScale : 1)).toFixed(4)})`; }
      set(el.appwrap, { filter: s.blur ? `blur(${(s.blur * 9).toFixed(2)}px) brightness(${(1 - 0.45 * s.blur).toFixed(3)})` : 'none' });
      // caption
      const c = s.caption;
      if (!c) { el.cap.style.opacity = 0; capKey = ''; }
      else {
        const key = JSON.stringify([c.lines, c.big, c.accentFrom, c.dots && c.dots.n]);
        if (key !== capKey) {
          capKey = key;
          el.cap.className = c.big ? 'big' : '';
          el.cap.innerHTML = c.lines.map((t, i) => `<span class="ln${c.accentFrom != null && i >= c.accentFrom ? ' acc' : ''}">${t}</span>`).join('')
            + (c.dots ? `<span class="dots">${Array.from({ length: c.dots.n }, () => '<b></b>').join('')}</span>` : '');
        }
        if (c.dots) [...el.cap.querySelectorAll('.dots b')].forEach((b, i) => b.classList.toggle('on', i === c.dots.on));
        set(el.cap, { opacity: c.alpha, transform: `translateY(${c.dy}px)` });
      }
      set(el.band, { opacity: 1 - (s.end ? Math.min(1, s.end.p * 2.2) : 0) });
      // labels under the real chips
      const lk = JSON.stringify((s.labels || []).map((l) => [l.x, l.y, l.text]));
      if (lk !== labelKey) { labelKey = lk; el.labels.innerHTML = (s.labels || []).map((l) => `<span style="left:${l.x}px;top:${l.y}px">${l.text}</span>`).join(''); }
      [...el.labels.children].forEach((n, i) => { n.style.opacity = s.labels[i].alpha; });
      // highlights
      const hs = s.hls || [];
      while (el.hls.children.length < hs.length) { const d = document.createElement('div'); d.className = 'hl'; el.hls.appendChild(d); }
      [...el.hls.children].forEach((d, i) => {
        const h = hs[i];
        if (!h) { d.style.opacity = 0; return; }
        const L = Math.max(5, h.x - 4), R = Math.min(535, h.x + h.w + 4); // 画面の端で枠の辺が欠けない
        set(d, { left: `${L}px`, top: `${h.y - 4}px`, width: `${R - L}px`, height: `${h.h + 8}px`, opacity: h.alpha, transform: `scale(${(1 + 0.06 * (1 - h.alpha)).toFixed(3)})` });
      });
      // ripple
      el.ripple.innerHTML = '';
      if (s.ripple) {
        const r = document.createElement('i'), p = s.ripple.p;
        set(r, { left: `${s.ripple.x}px`, top: `${s.ripple.y}px`, opacity: (0.75 * (1 - p)).toFixed(3), transform: `scale(${(0.55 + 1.5 * p).toFixed(3)})` });
        el.ripple.appendChild(r);
      }
      // finger
      if (s.finger) set(el.finger, { opacity: s.finger.alpha, transform: `translate(${s.finger.x}px, ${s.finger.y}px) scale(${s.finger.press ? 0.8 : 1})` });
      else el.finger.style.opacity = 0;
      // badge
      if (s.badge) {
        const b = s.badge, pop = Math.min(1, b.p / 0.12), fade = b.p > 0.7 ? 1 - (b.p - 0.7) / 0.3 : 1;
        el.badge.className = b.kind; el.badge.textContent = b.text;
        set(el.badge, { opacity: fade.toFixed(3), transform: `translate(${b.x}px, ${(b.y - 26 * b.p).toFixed(2)}px) scale(${(0.6 + 0.4 * pop).toFixed(3)})` });
      } else el.badge.style.opacity = 0;
      // callout: { lines:[a,b], tone, alpha, scale }
      if (s.callout) {
        const c = s.callout;
        el.callout.className = c.tone; el.callout.children[0].textContent = c.lines[0]; el.callout.children[1].textContent = c.lines[1];
        set(el.callout, { opacity: c.alpha.toFixed(3), transform: `scale(${c.scale.toFixed(3)})` });
      } else el.callout.style.opacity = 0;
      set(el.flash, { opacity: s.flash || 0 });
      // end card
      set(el.end, { opacity: s.end ? s.end.p : 0 });
    },
  };
})();
