// 撮影用ステージの描画。render-promo.mjs が毎コマ await stage.apply(state) を呼ぶ。
(() => {
  const $ = (sel) => document.querySelector(sel);
  const el = {
    uiLayer: $('#ui-layer'),
    appImg: $('#app-img'),
    aiLayer: $('#ai-layer'),
    aiImg: $('#ai-img'),
    aiPlaceholder: $('#ai-placeholder'),
    phGlow: $('#ai-placeholder .ph-glow'),
    phTitle: $('#ai-placeholder .ph-title'),
    phSub: $('#ai-placeholder .ph-sub'),
    aiScrim: $('#ai-scrim'),
    capBand: $('#caption-band'),
    cap: $('#cap'),
    capTagBand: $('#caption-tag-band'),
    capTag: $('#cap-tag'),
    hls: $('#hls'),
    ripple: $('#ripple'),
    finger: $('#finger'),
    callout: $('#callout'),
    calloutLabel: $('#callout .callout-label'),
    calloutSub: $('#callout .callout-sub'),
    calloutValue: $('#callout .callout-value'),
    calloutRows: $('#callout .callout-rows'),
    footerRow: $('#footer-row'),
    footerLogo: $('#footer-logo'),
    footerBrandFallback: $('#footer-brand-fallback'),
    footerBrandSub: $('#footer-brand-sub'),
    footerNote: $('#footer-note'),
    endcard: $('#endcard'),
    endBrandCard: $('#end-brand-card'),
    endLogo: $('#end-logo'),
    endTitleFallback: $('#end-title-fallback'),
    endCta: $('#end-cta'),
    fadeCurtain: $('#fade-curtain'),
  };

  let lastAppSrc = '';
  let lastAiSrc = '';
  let lastCapKey = '';
  let lastCapTag = '';
  let lastCalloutRowsKey = '';

  const set = (node, css) => Object.assign(node.style, css);

  function loadImage(img, src) {
    if (!src) return Promise.resolve();
    if (img.dataset.loadedSrc === src && img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const done = () => {
        img.dataset.loadedSrc = src;
        if (typeof img.decode === 'function') img.decode().catch(() => {}).finally(resolve);
        else resolve();
      };
      img.onload = done;
      img.onerror = () => reject(new Error(`画像の読み込みに失敗: ${src}`));
      img.src = src;
    });
  }

  window.stage = {
    // 画面に見えている文字・札の左右の端（CSS px）。左右の安全域の検査に使う（render-promo.mjs が10コマごとに呼ぶ）。
    measureText() {
      const out = [];
      const visible = (node, min = 0.5) => {
        for (let n = node; n && n !== document.body; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < min) return false;
        }
        return true;
      };
      const textBox = (node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getBoundingClientRect();
      };
      const push = (name, node, box) => {
        if (!node || !visible(node)) return;
        const b = box || node.getBoundingClientRect();
        out.push({ name, left: Math.round(b.left * 10) / 10, right: Math.round(b.right * 10) / 10 });
      };
      [...el.cap.querySelectorAll('.ln')].forEach((ln, i) => push(`字幕${i + 1}行目`, ln, textBox(ln)));
      push('字幕の札', el.capTag);
      push('下端注記（左）', $('#footer-brand'));
      push('下端注記（右）', el.footerNote);
      push('大きな札', el.callout);
      [...document.querySelectorAll('#end-inner > *')].forEach((n, i) => push(`終わりのカード${i + 1}`, n));
      return out;
    },
    async init(cfg) {
      $('#end-series').textContent = cfg.end.series;
      $('#end-title-fallback').textContent = cfg.end.title;
      $('#end-sub').textContent = cfg.end.sub;
      $('#end-badge').textContent = cfg.end.badge;
      el.endCta.textContent = cfg.end.cta || '';
      $('#end-url').textContent = cfg.end.url;
      $('#end-disclosure').textContent = cfg.end.disclosure;
      el.footerNote.textContent = cfg.footerNote;
      el.footerBrandSub.textContent = cfg.footerBrandText || cfg.end.sub;
      el.footerBrandFallback.textContent = cfg.end.title;

      if (cfg.logoBg) {
        el.endBrandCard.style.background = cfg.logoBg;
        el.footerLogo.style.background = cfg.logoBg;
      }

      if (cfg.logoSrc) {
        try {
          await Promise.all([
            loadImage(el.endLogo, cfg.logoSrc),
            loadImage(el.footerLogo, cfg.logoSrc),
          ]);
          el.endLogo.hidden = false;
          el.endTitleFallback.hidden = true;
          el.footerLogo.hidden = false;
          el.footerBrandFallback.hidden = true;
        } catch {
          el.endLogo.hidden = true;
          el.endTitleFallback.hidden = false;
          el.footerLogo.hidden = true;
          el.footerBrandFallback.hidden = false;
        }
      } else {
        el.endLogo.hidden = true;
        el.endTitleFallback.hidden = false;
        el.footerLogo.hidden = true;
        el.footerBrandFallback.hidden = false;
      }
    },

    async apply(s) {
      const pending = [];

      // UI レイヤー
      set(el.uiLayer, { opacity: s.uiAlpha.toFixed(4) });
      if (s.appSrc && s.appSrc !== lastAppSrc) {
        lastAppSrc = s.appSrc;
        pending.push(loadImage(el.appImg, s.appSrc));
      }

      // AI レイヤー（実クリップ連番 or 仮絵）
      set(el.aiLayer, { opacity: s.aiAlpha.toFixed(4), zIndex: s.aiOnTop ? '4' : '1' });
      if (s.aiAlpha > 0.001) {
        if (s.aiSrc) {
          el.aiImg.hidden = false;
          el.aiPlaceholder.hidden = true;
          if (s.aiSrc !== lastAiSrc) {
            lastAiSrc = s.aiSrc;
            pending.push(loadImage(el.aiImg, s.aiSrc));
          }
        } else {
          el.aiImg.hidden = true;
          el.aiPlaceholder.hidden = false;
          const isB = s.aiClip === 'b';
          el.aiPlaceholder.classList.toggle('is-morning', isB);
          el.phTitle.textContent = isB ? 'AI-B' : 'AI-A';
          el.phSub.textContent = `${isB ? '朝の机' : '夜の机'}  t=${s.t.toFixed(2)}s`;
          // 1コマ目から動いていることが分かるよう光の輪を滑らかに動かす
          const angle = s.t * 1.4 + (isB ? 1.8 : 0);
          const gx = Math.round(60 + Math.cos(angle) * 90);
          const gy = Math.round(240 + Math.sin(angle * 0.85) * 110);
          set(el.phGlow, { left: `${gx}px`, top: `${gy}px` });
        }
      }

      if (pending.length) await Promise.all(pending);

      // AI 字幕の下の暗い帯
      set(el.aiScrim, { opacity: (s.scrimAlpha ?? 0).toFixed(4) });

      // 下端行（左ブランド表示＋右注記。UI場面のみ）
      set(el.footerRow, { opacity: s.showFooterNote ? '1' : '0' });

      // 字幕（透明度は0から上げず、下から14px上がるだけ）と字幕下の小さな札
      const c = s.caption;
      if (!c) {
        el.cap.style.visibility = 'hidden';
        el.capTag.style.visibility = 'hidden';
        lastCapKey = '';
        lastCapTag = '';
      } else {
        el.cap.style.visibility = 'visible';
        const key = JSON.stringify([c.lines, c.big, c.fontSize]);
        if (key !== lastCapKey) {
          lastCapKey = key;
          el.cap.className = c.big ? 'big' : '';
          // 字幕ごとの文字の大きさ（左右の安全域に収まらない長い行だけ小さくする）。無ければ CSS の既定。
          if (c.fontSize) el.cap.style.setProperty('--cap-size', `${c.fontSize}px`);
          else el.cap.style.removeProperty('--cap-size');
          el.cap.replaceChildren(...c.lines.map((line) => {
            const span = document.createElement('span');
            span.className = 'ln';
            span.textContent = line;
            return span;
          }));
        }
        set(el.cap, { opacity: String(c.alpha), transform: `translateY(${c.dy}px)` });
        if (c.tag) {
          if (c.tag !== lastCapTag) {
            lastCapTag = c.tag;
            el.capTag.textContent = c.tag;
          }
          el.capTag.style.visibility = 'visible';
          set(el.capTag, { opacity: String(c.alpha), transform: `translateY(${c.dy}px)` });
        } else {
          el.capTag.style.visibility = 'hidden';
          lastCapTag = '';
        }
      }
      const bandFade = s.end ? Math.max(0, 1 - s.end.alpha * 2.4) : 1;
      set(el.capBand, { opacity: bandFade.toFixed(4) });
      set(el.capTagBand, { opacity: bandFade.toFixed(4) });

      // 黄色の枠
      const hs = s.hls || [];
      while (el.hls.children.length < hs.length) {
        const div = document.createElement('div');
        div.className = 'hl';
        el.hls.appendChild(div);
      }
      [...el.hls.children].forEach((node, i) => {
        const h = hs[i];
        if (!h) { node.style.opacity = '0'; return; }
        set(node, {
          left: `${(h.x - 4).toFixed(1)}px`,
          top: `${(h.y - 4).toFixed(1)}px`,
          width: `${(h.w + 8).toFixed(1)}px`,
          height: `${(h.h + 8).toFixed(1)}px`,
          opacity: h.alpha.toFixed(3),
          transform: `scale(${(1 + 0.05 * (1 - h.alpha)).toFixed(3)})`,
        });
      });

      // 波紋
      el.ripple.innerHTML = '';
      if (s.ripple) {
        const ring = document.createElement('i');
        const p = s.ripple.p;
        set(ring, {
          left: `${s.ripple.x.toFixed(1)}px`,
          top: `${s.ripple.y.toFixed(1)}px`,
          opacity: (0.85 * (1 - p)).toFixed(3),
          transform: `scale(${(0.5 + 1.55 * p).toFixed(3)})`,
        });
        el.ripple.appendChild(ring);
      }

      // 指の輪
      if (s.finger) {
        set(el.finger, {
          opacity: s.finger.alpha.toFixed(3),
          transform: `translate(${s.finger.x.toFixed(1)}px, ${s.finger.y.toFixed(1)}px) scale(${s.finger.press ? 0.82 : 1})`,
        });
      } else {
        el.finger.style.opacity = '0';
      }

      // 大きな札（次回対応・着地予測・担当別の目標との差）
      if (s.callout) {
        el.calloutLabel.textContent = s.callout.label;
        if (s.callout.sub) {
          el.calloutSub.textContent = s.callout.sub;
          el.calloutSub.hidden = false;
        } else {
          el.calloutSub.textContent = '';
          el.calloutSub.hidden = true;
        }
        if (Array.isArray(s.callout.rows) && s.callout.rows.length > 0) {
          el.calloutValue.textContent = '';
          el.calloutValue.hidden = true;
          el.calloutRows.hidden = false;
          const rowsKey = JSON.stringify(s.callout.rows);
          if (rowsKey !== lastCalloutRowsKey) {
            lastCalloutRowsKey = rowsKey;
            el.calloutRows.replaceChildren(...s.callout.rows.map((row) => {
              const item = document.createElement('div');
              item.className = 'callout-row';
              const name = document.createElement('span');
              name.className = 'callout-row-name';
              name.textContent = row.name;
              const val = document.createElement('span');
              val.className = row.negative ? 'callout-row-value is-negative' : 'callout-row-value';
              val.textContent = row.value;
              item.append(name, val);
              return item;
            }));
          }
        } else {
          if (lastCalloutRowsKey) {
            el.calloutRows.replaceChildren();
            lastCalloutRowsKey = '';
          }
          el.calloutRows.hidden = true;
          el.calloutValue.hidden = false;
          el.calloutValue.textContent = s.callout.value;
          el.calloutValue.classList.toggle('is-compact', s.callout.value.length > 12);
        }
        set(el.callout, {
          opacity: s.callout.alpha.toFixed(3),
          transform: `scale(${s.callout.scale.toFixed(3)})`,
        });
      } else {
        el.callout.style.opacity = '0';
      }

      // 終わりのカードと末尾フェード
      set(el.endcard, { opacity: s.end ? s.end.alpha.toFixed(4) : '0' });
      set(el.fadeCurtain, { opacity: s.end ? s.end.fadeCurtain.toFixed(4) : '0' });
    },
  };
})();
