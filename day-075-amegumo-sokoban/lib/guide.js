const GUIDE_STORAGE_KEY = 'amegumo-sokoban.guide.v1';
export {GUIDE_STORAGE_KEY};

export function readGuideSeen(storage) {
  try { return storage?.getItem(GUIDE_STORAGE_KEY) === '1'; }
  catch { return false; }
}

export function rememberGuide(storage) {
  try {
    if (!storage) return false;
    storage.setItem(GUIDE_STORAGE_KEY, '1');
    return true;
  } catch { return false; }
}

export function setupGuide({onBeforeOpen = () => {}, onAfterClose = () => {}, onDemo = () => {}, onDemoCancel = () => {}} = {}) {
  const byId = id => document.getElementById(id);
  const dialog = byId('help-dialog');
  const opener = byId('help-button');
  const panels = [...dialog.querySelectorAll('[data-guide-panel]')];
  const markers = [...dialog.querySelectorAll('[data-guide-marker]')];
  let storage;
  try { storage = window.localStorage; } catch { /* Private modes may deny even the getter. */ }
  let sessionSeen = readGuideSeen(storage);
  let step = 0;

  function resetDemo() {
    onDemoCancel();
    byId('guide-demo').classList.remove('has-rained');
    byId('guide-demo-count').textContent = '0 / 1';
    byId('guide-demo-cloud-count').textContent = '1';
    byId('guide-demo-action').disabled = false;
    byId('guide-demo-action').textContent = '雲を押して、1滴';
    byId('guide-demo-status').textContent = 'この小さな畑で、ためしてみましょう。';
  }

  function showStep(nextStep, focus = false) {
    step = Math.max(0, Math.min(panels.length - 1, nextStep));
    panels.forEach((panel, index) => { panel.hidden = index !== step; });
    markers.forEach((marker, index) => {
      if (index === step) marker.setAttribute('aria-current', 'step');
      else marker.removeAttribute('aria-current');
    });
    byId('guide-prev').disabled = step === 0;
    byId('guide-next').textContent = step === panels.length - 1 ? '庭をはじめる' : '次へ';
    byId('guide-page').textContent = `${step + 1} / ${panels.length}`;
    resetDemo();
    if (focus) panels[step].querySelector('h3').focus({preventScroll: true});
    dialog.scrollTop = 0;
  }

  function markSeen() {
    sessionSeen = true;
    rememberGuide(storage);
  }

  function close() {
    if (!dialog.open) return;
    markSeen();
    dialog.close();
  }

  function open() {
    if (dialog.open) return;
    opener.focus({preventScroll: true});
    onBeforeOpen();
    showStep(0);
    dialog.showModal();
  }

  opener.addEventListener('click', open);
  byId('help-close').addEventListener('click', close);
  byId('guide-skip').addEventListener('click', close);
  byId('guide-prev').addEventListener('click', () => showStep(step - 1, true));
  byId('guide-next').addEventListener('click', () => {
    if (step === panels.length - 1) close();
    else showStep(step + 1, true);
  });
  byId('guide-demo-action').addEventListener('click', () => {
    if (byId('guide-demo-action').disabled) return;
    onDemo();
    byId('guide-demo').classList.add('has-rained');
    byId('guide-demo-count').textContent = '1 / 1';
    byId('guide-demo-cloud-count').textContent = '0';
    byId('guide-demo-action').disabled = true;
    byId('guide-demo-action').textContent = '1滴、とどきました';
    byId('guide-demo-status').textContent = '1 / 1で、花がひらきます。置いたままでは雨は増えません。';
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  });
  dialog.addEventListener('close', () => {
    markSeen();
    resetDemo();
    opener.focus({preventScroll: true});
    onAfterClose();
  });

  return {
    open,
    showFirstVisit() {
      if (sessionSeen || dialog.open) return false;
      open();
      return true;
    }
  };
}
