// 撮影用ステージ。render-promo.mjs が毎コマ stage.apply(state) を待つ。
(() => {
  const $ = (sel) => document.querySelector(sel);
  const el = {
    app: $('#app'),
    scrim: $('#scrim'),
    shade: $('#top-shade'),
    finger: $('#finger'),
    callout: $('#callout'),
    calloutLabel: $('#callout .callout-label'),
    calloutValue: $('#callout .callout-value'),
    calloutRows: $('#callout .callout-rows'),
    pv: $('#pv'),
    pvRows: $('#pv .pv-rows'),
    pvStamp: $('#pv .pv-stamp'),
    ff: $('#ff'),
    card: $('#calm-card'),
    cap: $('#cap'),
    note: $('#cap-note'),
    tag: $('#cap-tag'),
    end: $('#endcard'),
    group: $('#end-group'),
    tile: $('#end-brand-tile'),
    brand: $('#end-brand'),
    brandFallback: $('#end-brand-fallback'),
    pills: $('#end-pills'),
    cta: $('#end-cta'),
    url: $('#end-url'),
    series: $('#end-series'),
    disclaimer: $('#end-disclaimer'),
  };
  let capKey = '';
  let rowKey = '';
  let pvKey = '';
  let brandSrc = '';

  const set = (node, css) => Object.assign(node.style, css);
  const show = (node, on) => { node.style.visibility = on ? 'visible' : 'hidden'; };

  window.stage = {
    measureText() {
      const out = [];
      const visible = (node) => {
        for (let n = node; n && n !== document.body; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.5) return false;
        }
        return true;
      };
      const push = (name, node, box = false) => {
        if (!node || !visible(node)) return;
        let b;
        if (box) b = node.getBoundingClientRect();
        else {
          const range = document.createRange();
          range.selectNodeContents(node);
          b = range.getBoundingClientRect();
        }
        if (b.width < 1) return;
        out.push({
          name,
          left: Math.round(b.left * 10) / 10,
          right: Math.round(b.right * 10) / 10,
          top: Math.round(b.top * 10) / 10,
          bottom: Math.round(b.bottom * 10) / 10,
        });
      };
      [...el.cap.querySelectorAll('.ln')].forEach((ln, i) => push(`字幕${i + 1}`, ln));
      push('小さな札', el.tag, true);
      push('注記', el.note);
      push('数字札', el.callout, true);
      push('プレビュー札', el.pv, true);
      push('早送り', el.ff, true);
      ['#end-pills', '#end-cta', '#end-url', '#end-series', '#end-disclaimer'].forEach((sel) => push(sel, $(sel)));
      push('#end-brand-tile', el.tile, true);
      return out;
    },

    init(cfg) {
      el.app.src = cfg.appUrl;
      el.pills.textContent = cfg.end.pills;
      el.cta.textContent = cfg.end.cta;
      el.url.textContent = cfg.end.urlLines.join('\n');
      el.series.textContent = cfg.end.series;
      el.disclaimer.textContent = cfg.end.disclaimerLines.join('\n');
    },

    apply(s) {
      // iframe の中をクリックすると、Playwright が外側のステージまでスクロールすることがある。毎コマ原点へ戻す。
      for (const node of [document.scrollingElement, document.body, $('#stage')]) {
        if (node && (node.scrollTop || node.scrollLeft)) { node.scrollTop = 0; node.scrollLeft = 0; }
      }
      const cam = s.camera;
      set(el.app, {
        transform: `translate(${cam.tx.toFixed(2)}px, ${cam.ty.toFixed(2)}px) scale(${cam.scale.toFixed(4)})`,
        filter: s.blur > 0.05 ? `blur(${s.blur.toFixed(2)}px)` : 'none',
      });
      set(el.scrim, { opacity: s.scrim.toFixed(3) });
      set(el.shade, { opacity: s.shade.toFixed(3) });

      const float = s.float || 0;
      $('#fx').style.transform = float ? `translateY(${float.toFixed(2)}px)` : 'none';
      el.card.style.transform = float ? `translateY(${float.toFixed(2)}px)` : 'none';
      el.note.style.transform = float ? `translateY(${float.toFixed(2)}px)` : 'none';
      const c = s.caption;
      if (!c) {
        show(el.cap, false);
        show(el.tag, false);
        show(el.note, false);
        el.card.style.opacity = '0';
        capKey = '';
      } else {
        show(el.cap, true);
        const key = JSON.stringify([c.lines, c.card, c.note]);
        if (key !== capKey) {
          capKey = key;
          el.cap.classList.toggle('is-card', Boolean(c.card));
          el.cap.replaceChildren(...c.lines.map((line) => {
            const span = document.createElement('span');
            span.className = 'ln';
            span.textContent = line;
            return span;
          }));
        }
        set(el.cap, { opacity: '1', top: `${c.top}px`, fontSize: `${c.size}px`, transform: c.card && float ? `translateY(${float.toFixed(2)}px)` : 'none' });
        el.card.style.opacity = c.card ? '1' : '0';
        if (c.tag) {
          show(el.tag, true);
          el.tag.textContent = c.tag;
          set(el.tag, { opacity: '1', top: `${c.tagTop}px`, fontSize: `${c.tagSize}px`, left: `${c.tagLeft}px` });
        } else show(el.tag, false);
        if (c.note) {
          show(el.note, true);
          el.note.textContent = c.note;
          el.note.style.fontSize = `${c.noteSize}px`;
        } else show(el.note, false);
      }

      if (s.callout) {
        show(el.callout, true);
        const call = s.callout;
        el.callout.style.display = 'flex';
        el.calloutLabel.textContent = call.label;
        el.callout.classList.toggle('is-compact', (call.value || '').length > 8);
        el.callout.classList.toggle('is-orange', Boolean(call.orange));
        if (call.rows && call.rows.length) {
          el.calloutValue.textContent = '';
          el.calloutValue.hidden = true;
          el.calloutRows.hidden = false;
          const key = JSON.stringify(call.rows);
          if (key !== rowKey) {
            rowKey = key;
            el.calloutRows.replaceChildren(...call.rows.map((row) => {
              const item = document.createElement('div');
              item.className = 'callout-row' + (row.up ? ' is-up' : '');
              const name = document.createElement('b');
              name.textContent = row.name;
              const value = document.createElement('span');
              value.textContent = row.value;
              item.append(name, value);
              return item;
            }));
          }
          [...el.calloutRows.children].forEach((node, i) => { node.style.visibility = (call.shownRows ?? 99) > i ? 'visible' : 'hidden'; });
        } else {
          el.calloutRows.hidden = true;
          el.calloutValue.hidden = false;
          rowKey = '';
          el.calloutValue.textContent = call.value;
        }
        set(el.callout, {
          left: `${call.x}px`,
          top: `${call.y}px`,
          width: `${call.w}px`,
          height: `${call.h}px`,
          opacity: '1',
          transform: `translate(${call.dx || 0}px, ${call.dy || 0}px)`,
        });
      } else {
        show(el.callout, false);
        // 行に visible を付けていると、親を隠しても行だけ残る。行の指定も外す。
        [...el.calloutRows.children].forEach((node) => { node.style.visibility = ''; });
      }

      if (s.preview) {
        show(el.pv, true);
        const key = JSON.stringify(s.preview.rows);
        if (key !== pvKey) {
          pvKey = key;
          el.pvRows.replaceChildren(...s.preview.rows.map((row) => {
            const item = document.createElement('div');
            item.className = 'pv-row' + (row.side === '貸方' ? ' is-credit' : '');
            const side = document.createElement('span');
            side.className = 'pv-side';
            side.textContent = row.side;
            const acc = document.createElement('span');
            acc.className = 'pv-acc';
            acc.textContent = row.account.length > 6 ? row.account.replace(' ', '\n') : row.account;
            const amt = document.createElement('span');
            amt.className = 'pv-amt';
            amt.textContent = row.amount;
            if (row.sub) {
              const sub = document.createElement('small');
              sub.textContent = row.sub;
              amt.append(sub);
            }
            item.append(side, acc, amt);
            return item;
          }));
        }
        el.pvStamp.hidden = !s.preview.stamp;
        el.pvStamp.textContent = s.preview.stamp || '';
        set(el.pv, { transform: `translateY(${s.preview.dy || 0}px)` });
      } else show(el.pv, false);

      show(el.ff, Boolean(s.ff));

      if (s.finger) {
        set(el.finger, {
          opacity: s.finger.alpha.toFixed(3),
          transform: `translate(${s.finger.x.toFixed(1)}px, ${s.finger.y.toFixed(1)}px) scale(${s.finger.press ? 0.86 : 1})`,
        });
      } else el.finger.style.opacity = '0';

      if (s.brand && s.brand.src !== brandSrc) {
        brandSrc = s.brand.src;
        el.brand.src = s.brand.src;
        el.tile.style.background = s.brand.bg || '#fff';
      }
      el.brand.hidden = !brandSrc;
      el.brandFallback.hidden = Boolean(brandSrc);

      const end = s.end;
      set(el.end, { opacity: end ? '1' : '0' });
      if (end) {
        set(el.group, { transform: `translateY(${(end.float || 0).toFixed(2)}px)` });
        const blocks = { brand: el.tile, pills: el.pills, cta: el.cta, url: el.url, series: el.series, disclaimer: el.disclaimer };
        for (const [id, node] of Object.entries(blocks)) {
          const item = end.blocks.find((block) => block.id === id);
          const on = item && item.on;
          show(node, Boolean(on));
          if (on) set(node, { opacity: '1', transform: `translateY(${item.dy}px)` });
        }
      }
    },
  };
})();
