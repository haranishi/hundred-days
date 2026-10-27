(function () {
  'use strict';

  /* HOME_MODEL */

  const cards = Array.from(document.querySelectorAll('article.card'));
  const search = document.getElementById('search');
  const sort = document.getElementById('sort');
  const grid = document.getElementById('app-grid');
  const count = document.getElementById('result-count');
  const status = document.getElementById('filter-status');
  const empty = document.getElementById('empty');
  const reason = document.getElementById('empty-reason');
  const tagsDialog = document.getElementById('tags-dialog');
  const tagsOpen = document.getElementById('tags-open');
  const tagsList = document.getElementById('all-tags');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const cardTags = new Map(cards.map((card) => [card, JSON.parse(card.dataset.tags)]));
  let selected = '*';
  let selectedLabel = '';
  let tagsBuilt = false;

  function apply() {
    const query = fold(search.value.trim()).replace(/\bday\s*(\d)/g, 'day$1');
    // 「34」「034」「day34」は日番号の完全一致にする（「7」が「7を含む説明文」まで拾わないように）。3文字以上は文面にも当てる
    const dayQuery = /^(?:day)?(\d{1,3})$/.exec(query);
    let shown = 0;
    cards.forEach((card) => {
      const matchesTag = selected === '*' || cardTags.get(card).some((tag) => tagKey(tag) === selected);
      const matchesText = card.dataset.search.includes(query);
      const matchesSearch = dayQuery
        ? Number(card.dataset.day) === Number(dayQuery[1]) || (query.length >= 3 && matchesText)
        : matchesText;
      card.hidden = !matchesTag || !matchesSearch;
      if (!card.hidden) shown++;
      // 絞り込みで移動したカードを、画面外用の演出で隠さない。
      card.classList.remove('reveal');
    });
    document.querySelectorAll('.chip').forEach((chip) => {
      chip.setAttribute('aria-pressed', String(chip.dataset.key === selected));
    });
    count.textContent = query || selected !== '*' ? `${shown} / ${cards.length}件` : `${cards.length}件`;
    status.textContent = `${selected === '*' ? 'すべて' : selectedLabel} ${shown}件を表示中`;
    empty.hidden = shown !== 0;
    reason.textContent = [search.value.trim() ? `検索「${search.value.trim()}」` : '',
      selected !== '*' ? `タグ「${selectedLabel}」` : ''].filter(Boolean).join('・');
  }

  function clear() {
    search.value = '';
    selected = '*';
    selectedLabel = '';
    apply();
  }

  search.addEventListener('input', apply);
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      search.value = '';
      apply();
    }
  });
  document.getElementById('clear').addEventListener('click', () => {
    clear();
    search.focus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest('input, textarea, select, [contenteditable], dialog[open]')) return;
    if (document.querySelector('dialog[open]')) return;
    event.preventDefault();
    search.focus();
  });
  sort.addEventListener('change', () => {
    const ordered = [...cards].sort((a, b) => sort.value === 'old'
      ? Number(a.dataset.day) - Number(b.dataset.day)
      : Number(b.dataset.day) - Number(a.dataset.day));
    ordered.forEach((card) => grid.appendChild(card));
    apply();
  });

  function buildTags() {
    if (tagsBuilt) return;
    tagsBuilt = true;
    const tags = new Map();
    // 日の若い順に数え、表記が割れたタグはいちばん多い綴り（同数なら先に出た綴り）で見せる。ビルド側の tagCatalog と同じ規則
    cards.slice().sort((a, b) => Number(a.dataset.day) - Number(b.dataset.day)).forEach((card) => {
      const seen = new Set();
      cardTags.get(card).forEach((label) => {
        const key = tagKey(label);
        if (!key || seen.has(key)) return;
        seen.add(key);
        if (!tags.has(key)) tags.set(key, { key, count: 0, labels: new Map() });
        const entry = tags.get(key);
        entry.count++;
        entry.labels.set(label, (entry.labels.get(label) || 0) + 1);
      });
    });
    const all = { key: '*', label: 'すべて', count: cards.length };
    const fragment = document.createDocumentFragment();
    const listed = Array.from(tags.values())
      .map((entry) => ({ key: entry.key, count: entry.count, label: Array.from(entry.labels).sort((a, b) => b[1] - a[1])[0][0] }))
      .sort((a, b) => b.count - a.count);
    [all, ...listed].forEach((tag) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip';
      button.dataset.tag = tag.key === '*' ? '*' : tag.label;
      button.dataset.key = tag.key;
      button.setAttribute('aria-pressed', String(tag.key === selected));
      button.textContent = `${tag.label}（${tag.count}）`;
      fragment.appendChild(button);
    });
    tagsList.appendChild(fragment);
  }

  tagsOpen.addEventListener('click', () => {
    buildTags();
    tagsDialog.showModal();
  });
  document.getElementById('tags-close').addEventListener('click', () => tagsDialog.close());
  tagsDialog.addEventListener('close', () => tagsOpen.focus());
  document.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    selected = chip.dataset.key;
    selectedLabel = chip.dataset.tag;
    apply();
    if (tagsDialog.open) tagsDialog.close();
  });

  const matrix = document.querySelector('.matrix');
  const cells = Array.from(matrix.querySelectorAll('a.cell'));
  const latest = matrix.querySelector('.cell--latest');
  const image = document.querySelector('.preview__img');
  const number = document.querySelector('.preview__num');
  const label = document.querySelector('.preview__label');
  const title = document.querySelector('.preview__title');
  const go = document.querySelector('.preview .go');

  image.addEventListener('load', () => {
    if (!reducedMotion.matches) image.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
  });

  function preview(cell) {
    if (!cell || !go) return;
    const data = cell.dataset;
    const hasShot = Boolean(data.shot);
    if (hasShot && image.getAttribute('src') !== data.shot) image.setAttribute('src', data.shot);
    if (!hasShot) image.removeAttribute('src');
    image.alt = hasShot ? `${data.title}の画面` : '';
    image.hidden = !hasShot;
    number.hidden = hasShot;
    number.textContent = data.day;
    label.textContent = `${cell === latest ? 'LATEST · ' : ''}DAY ${data.day}`;
    const parts = splitTitle(data.title);
    title.replaceChildren(document.createTextNode(parts.main));
    if (data.title.includes(' — ')) {
      const separator = document.createElement('span');
      separator.className = 'preview__separator';
      separator.textContent = ' — ';
      const sub = document.createElement('span');
      sub.className = 'preview__sub';
      sub.textContent = parts.sub;
      title.append(separator, sub);
    }
    go.href = data.open;
    go.dataset.day = data.day;
    go.dataset.title = data.title;
    go.firstElementChild.textContent = data.external ? '紹介ページを開く' : 'アプリを開く';
    if (data.external) {
      go.target = '_blank';
      go.rel = 'noopener';
    } else {
      go.removeAttribute('target');
      go.removeAttribute('rel');
    }
  }

  cells.forEach((cell) => {
    cell.addEventListener('mouseenter', () => preview(cell));
    cell.addEventListener('focus', () => {
      cells.forEach((item) => { item.tabIndex = item === cell ? 0 : -1; });
      preview(cell);
    });
    cell.addEventListener('click', () => {
      const card = document.getElementById(`day-${cell.dataset.day}`);
      if (!card) return;
      if (card.hidden) clear();
      card.classList.remove('reveal');
      // アンカー移動後のTabも、その日のカードから続けられるようにする。
      card.tabIndex = -1;
      card.focus({ preventScroll: true });
    });
    cell.addEventListener('keydown', (event) => {
      const index = cells.indexOf(cell);
      let target;
      switch (event.key) {
        case 'ArrowLeft': target = cells[index - 1]; break;
        case 'ArrowRight': target = cells[index + 1]; break;
        case 'ArrowUp': target = cells.find((item) => Number(item.dataset.day) === Number(cell.dataset.day) - 10); break;
        case 'ArrowDown': target = cells.find((item) => Number(item.dataset.day) === Number(cell.dataset.day) + 10); break;
        case 'Home': target = cells[0]; break;
        case 'End': target = cells[cells.length - 1]; break;
        default: return;
      }
      event.preventDefault();
      if (target) target.focus();
    });
  });
  document.querySelector('.console').addEventListener('mouseleave', () => {
    const focused = document.activeElement;
    preview(matrix.contains(focused) && focused.matches('.cell') ? focused : latest);
  });
  matrix.addEventListener('focusout', (event) => {
    // プレビューのリンクへ進むときは、いま選んだDayを開く。
    if (event.relatedTarget?.closest('.preview')) return;
    if (!matrix.contains(event.relatedTarget)) preview(latest);
  });
  document.querySelector('.console').addEventListener('focusout', (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) preview(latest);
  });

  const dialog = document.getElementById('player');
  const video = document.getElementById('player-video');
  let opener = null;

  function releaseVideo() {
    video.pause();
    video.removeAttribute('src');
    video.removeAttribute('poster');
    video.load();
  }

  document.querySelectorAll('.thumb__play').forEach((button) => {
    button.addEventListener('click', () => {
      const src = button.dataset.demo;
      if (typeof dialog.showModal !== 'function') {
        window.open(src, '_blank', 'noopener');
        return;
      }
      opener = button;
      document.getElementById('player-day').textContent = button.dataset.day || '';
      document.getElementById('player-name').textContent = button.dataset.title || '';
      if (button.dataset.poster) video.setAttribute('poster', button.dataset.poster);
      video.setAttribute('src', src);
      dialog.showModal();
      const playing = video.play();
      if (playing && typeof playing.catch === 'function') playing.catch(() => {});
    });
  });
  document.getElementById('player-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    releaseVideo();
    if (opener) {
      opener.focus();
      opener = null;
    }
  });
  [dialog, tagsDialog].forEach((modal) => {
    // ダイアログ内の余白とバックドロップを区別する。
    modal.addEventListener('click', (event) => {
      if (event.target !== modal) return;
      const rect = modal.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right ||
          event.clientY < rect.top || event.clientY > rect.bottom) modal.close();
    });
  });

  if (typeof IntersectionObserver === 'function' && !reducedMotion.matches) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.remove('reveal');
        observer.unobserve(entry.target);
      });
    });
    cards.forEach((card) => {
      if (card.getBoundingClientRect().top < window.innerHeight) return;
      card.classList.add('reveal');
      observer.observe(card);
    });
    reducedMotion.addEventListener('change', () => {
      if (!reducedMotion.matches) return;
      observer.disconnect();
      cards.forEach((card) => card.classList.remove('reveal'));
    });
  }

  const tools = document.querySelector('.tools');
  const toTools = document.getElementById('to-tools');
  const compact = window.matchMedia('(max-width: 899px)');
  // 帯が画面の上へ出たかは、位置から直接判定する。IntersectionObserver は出入りの瞬間にしか働かず、
  // 瞬間移動（動きを減らす設定のアンカー移動・再読み込みでの位置の復元）では一度も反応しない
  let toToolsFrame = 0;
  function updateToTools() {
    toToolsFrame = 0;
    toTools.hidden = !compact.matches || tools.getBoundingClientRect().bottom >= 0;
  }
  function scheduleToTools() {
    if (!toToolsFrame) toToolsFrame = requestAnimationFrame(updateToTools);
  }
  window.addEventListener('scroll', scheduleToTools, { passive: true });
  window.addEventListener('resize', scheduleToTools);
  window.addEventListener('pageshow', scheduleToTools);
  compact.addEventListener('change', scheduleToTools);
  toTools.addEventListener('click', () => {
    tools.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
  });
  updateToTools();

  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  cards.forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      if (!finePointer.matches || reducedMotion.matches) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
      card.style.setProperty('--my', `${event.clientY - rect.top}px`);
    });
  });

  // 各アプリには計測タグを入れないため、入口の匿名操作だけをここで記録する。
  function send(name, params) {
    if (typeof gtag === 'function') gtag('event', name, params || {});
  }

  function cardOf(element) {
    const card = element.closest('.card') || element.closest('[data-day][data-title]');
    return card ? { day: card.dataset.day || '', app_title: card.dataset.title || '' } : {};
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('.thumb__link, .btn--primary, .cta[data-day], .go');
    if (link) { send('app_open', cardOf(link)); return; }
    const play = event.target.closest('.thumb__play');
    if (play) { send('demo_play', cardOf(play)); return; }
    const chip = event.target.closest('.chip');
    if (chip) { send('tag_filter', { tag_name: chip.dataset.tag || '' }); return; }
    const out = event.target.closest('.pill, .follow, .footer__links a, .about__link a');
    if (out) {
      const href = out.getAttribute('href') || '';
      send('profile_click', { link_name: href.includes('x.com') ? 'x' : href.includes('github') ? 'github' : 'other' });
    }
  });
  document.querySelectorAll('.memo').forEach((memo) => {
    memo.addEventListener('toggle', () => {
      if (memo.open) send('memo_open', cardOf(memo));
    });
  });
})();
