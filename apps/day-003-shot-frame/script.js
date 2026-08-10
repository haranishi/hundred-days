/* スクショ映えメーカー — Day 003
 * 外部通信なし / 外部ライブラリなし / 永続化なし。
 *
 * 設計メモ:
 *  - 合成は「出力用canvas」1枚だけ。元画像の解像度に余白を足した実寸で描くので、
 *    保存したPNGは常に「元解像度＋余白」になる（プレビューの縮小に影響されない）。
 *  - 画面のプレビューは、その出力canvasを縮小したコピー。見えているものと保存される
 *    PNGが必ず一致する。縮小先は devicePixelRatio を掛けた実ピクセルなので、Retinaでも
 *    にじまない（CSSで縮めるだけだと高解像度スクショがぼやける）。
 *  - 描画は4層。①背景 → ②影 → ③クリップ → ④画像。順序を変えると影が画像の上に乗る。
 */
'use strict';

(function () {
  // ---- 定数 ----
  // Retinaのスクショは長辺3000px級が普通に来るので、丸めるとしてもここまでは許容する
  var MAX_SOURCE_PX = 4096;

  // プレビューの高さの上限。画面の6割を目安に、極端な値だけ切る
  var PREVIEW_MAX_H = 560;
  var PREVIEW_MIN_H = 200;

  // 背景プリセット。colorsが1色なら単色、2色以上なら左上→右下のグラデーション。
  // canvasの塗りとチップの色見本を同じ定義から作るので、見本と実物がずれない。
  var BACKGROUNDS = [
    { id: 'ocean',    name: 'オーシャン', colors: ['#4f9cff', '#7d5cff'] },
    { id: 'sunset',   name: 'サンセット', colors: ['#ff9a5b', '#ff4f81'] },
    { id: 'mint',     name: 'ミント',     colors: ['#3ee0a8', '#2f9dff'] },
    { id: 'ink',      name: 'インク',     colors: ['#3a4363', '#0f1218'] },
    { id: 'paper',    name: 'ペーパー',   colors: ['#f2f4f8'] },
    { id: 'charcoal', name: 'チャコール', colors: ['#14161c'] }
  ];

  // ---- DOM ----
  var dropEl = document.getElementById('drop');
  var fileInput = document.getElementById('file');
  var noteEl = document.getElementById('drop-note');
  var editorEl = document.getElementById('editor');
  var stageEl = document.getElementById('stage');
  var previewCanvas = document.getElementById('preview');
  var chipsEl = document.getElementById('bg');
  var padInput = document.getElementById('pad');
  var padValueEl = document.getElementById('pad-value');
  var radiusInput = document.getElementById('radius');
  var radiusValueEl = document.getElementById('radius-value');
  var shadowInput = document.getElementById('shadow');
  var shadowValueEl = document.getElementById('shadow-value');
  var infoEl = document.getElementById('info');
  var saveBtn = document.getElementById('save');

  // ---- 状態 ----
  var sourceCanvas = null;                                  // 読み込んだ画像（nullなら未読み込み）
  var bgId = BACKGROUNDS[0].id;                             // 選択中の背景プリセット
  var outCanvas = document.createElement('canvas');         // 保存にそのまま使う出力用（画面には出さない）
  var renderRaf = 0;
  var previewRaf = 0;

  // ------------------------------------------------------------------
  // 小物
  // ------------------------------------------------------------------
  function currentPreset() {
    for (var i = 0; i < BACKGROUNDS.length; i++) {
      if (BACKGROUNDS[i].id === bgId) return BACKGROUNDS[i];
    }
    return BACKGROUNDS[0];
  }

  function numberValue(input, fallback) {
    var n = Number(input.value);
    return isFinite(n) ? n : fallback;
  }

  function note(message, isWarn) {
    noteEl.textContent = message || '';
    noteEl.classList.toggle('drop__note--warn', !!isWarn);
  }

  // スライダーの現在値表示。読み上げの重複を避けるため、見た目はaria-hiddenのspanに出し、
  // 支援技術にはrange自身のaria-valuetextで伝える。
  function renderValueLabels() {
    var pad = numberValue(padInput, 10) + '%';
    padValueEl.textContent = pad;
    padInput.setAttribute('aria-valuetext', '余白 ' + pad);

    var radius = numberValue(radiusInput, 2.5) + '%';
    radiusValueEl.textContent = radius;
    radiusInput.setAttribute('aria-valuetext', '角丸 ' + radius);

    var shadow = String(numberValue(shadowInput, 55));
    shadowValueEl.textContent = shadow;
    shadowInput.setAttribute('aria-valuetext', '影 ' + shadow);
  }

  function markSelectedBg() {
    var chips = chipsEl.querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) {
      var hit = (chips[i].dataset.bg === bgId);
      chips[i].classList.toggle('is-selected', hit);
      chips[i].setAttribute('aria-pressed', hit ? 'true' : 'false');
    }
  }

  // ------------------------------------------------------------------
  // 背景の塗り
  // ------------------------------------------------------------------

  // canvas用。1色なら色文字列、2色以上なら左上→右下のグラデーションを返す
  function backgroundFill(ctx, w, h, preset) {
    var colors = preset.colors;
    if (colors.length < 2) return colors[0];

    var gradient = ctx.createLinearGradient(0, 0, w, h);
    for (var i = 0; i < colors.length; i++) {
      gradient.addColorStop(i / (colors.length - 1), colors[i]);
    }
    return gradient;
  }

  // チップの色見本用。canvasの左上→右下と同じ向きになるよう135degにする
  function backgroundCss(preset) {
    var colors = preset.colors;
    return colors.length < 2
      ? colors[0]
      : 'linear-gradient(135deg, ' + colors.join(', ') + ')';
  }

  // ------------------------------------------------------------------
  // 描画
  // ------------------------------------------------------------------

  // 角丸のパスを引く。roundRectが無いブラウザではarcToで同じ形を作る
  function roundedRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();

    if (r <= 0) {
      ctx.rect(x, y, w, h);
      return;
    }
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r);
      return;
    }

    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 縮小専用の描画。一気に小さくすると細部が飛ぶので、半分ずつ縮めてから
  // 最後に目標サイズへ合わせる。すでに十分小さければそのまま1回描くだけ。
  function drawDownscaled(source, srcW, srcH, targetCtx, targetW, targetH) {
    var current = source;
    var w = srcW;
    var h = srcH;

    while (w > targetW * 2 && h > targetH * 2) {
      w = Math.max(targetW, Math.round(w / 2));
      h = Math.max(targetH, Math.round(h / 2));

      var step = document.createElement('canvas');
      step.width = w;
      step.height = h;
      step.getContext('2d').drawImage(current, 0, 0, w, h);
      current = step;
    }

    targetCtx.drawImage(current, 0, 0, targetW, targetH);
  }

  // 出力用canvasを作り直す。パラメータはすべて元画像の解像度基準で計算する。
  function render() {
    if (!sourceCanvas) return;

    var w = sourceCanvas.width;
    var h = sourceCanvas.height;
    var longEdge = Math.max(w, h);
    var shortEdge = Math.min(w, h);

    // 余白は長辺の4〜20%。出力は「元解像度＋余白」になる
    var pad = Math.round(longEdge * numberValue(padInput, 10) / 100);
    // 角丸は短辺の0〜6%。短辺の半分を超えると形が崩れるのでそこで頭打ちにする
    var radius = Math.min(shortEdge * numberValue(radiusInput, 2.5) / 100, shortEdge / 2);
    var outW = w + pad * 2;
    var outH = h + pad * 2;

    // 影の強さ s（0〜100）を blur・offsetY・不透明度へ線形マッピングする。
    // 基準は「余白pad」。こうすると影の下端が offsetY + blur = pad ちょうどに収まり、
    // 余白を細くしても影がキャンバスの外で切れない。
    //   blur    = pad * 0.75 * (s / 100)
    //   offsetY = pad * 0.25 * (s / 100)
    //   alpha   = 0.55 * (s / 100)
    // s = 0 なら3つとも0＝影なし。
    var level = Math.max(0, Math.min(100, numberValue(shadowInput, 55))) / 100;
    var blur = pad * 0.75 * level;
    var offsetY = pad * 0.25 * level;
    var alpha = 0.55 * level;

    outCanvas.width = outW;
    outCanvas.height = outH;

    var ctx = outCanvas.getContext('2d');
    var fill = backgroundFill(ctx, outW, outH, currentPreset());

    // ① 背景：キャンバス全面を塗る
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, outW, outH);

    // ② 影：角丸矩形を「背景と同じ塗り」で塗る。塗り色が背景と同じなので矩形の中身は
    //    変わらず、まわりに影だけが増える。透過PNGを入れても背景がそのまま透けて見える。
    ctx.save();
    if (alpha > 0) {
      ctx.shadowColor = 'rgba(0, 0, 0, ' + alpha.toFixed(3) + ')';
      ctx.shadowBlur = blur;
      ctx.shadowOffsetY = offsetY;
    }
    roundedRectPath(ctx, pad, pad, w, h, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();

    // ③ クリップ：②と同じ角丸矩形で切り抜く
    ctx.save();
    roundedRectPath(ctx, pad, pad, w, h, radius);
    ctx.clip();

    // ④ 画像：等倍で置く（＝出力は元解像度のまま）
    ctx.drawImage(sourceCanvas, pad, pad);
    ctx.restore();

    infoEl.textContent = '保存サイズ ' + outW + ' × ' + outH + ' px（元画像 ' + w + ' × ' + h + ' px）';
    previewCanvas.setAttribute('aria-label', '整形したスクショのプレビュー（' + outW + '×' + outH + 'px）');

    drawPreview();
  }

  // 出力用canvasを、置ける大きさまで縮めてプレビューへ写す。
  function drawPreview() {
    if (!sourceCanvas || !outCanvas.width) return;

    // 置ける幅はstageの内側。paddingは実際の計算値から引く（CSSを変えてもずれない）
    var style = window.getComputedStyle(stageEl);
    var availW = stageEl.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    var availH = Math.max(PREVIEW_MIN_H, Math.min(PREVIEW_MAX_H, Math.round(window.innerHeight * 0.6)));
    if (!(availW > 0)) return;

    var scale = Math.min(1, availW / outCanvas.width, availH / outCanvas.height);
    var cssW = Math.max(1, Math.round(outCanvas.width * scale));
    var cssH = Math.max(1, Math.round(outCanvas.height * scale));

    // 実ピクセル数はCSSピクセル×devicePixelRatio。3倍を超える環境でも上限は3で足りる
    var dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));

    previewCanvas.style.width = cssW + 'px';
    previewCanvas.style.height = cssH + 'px';
    previewCanvas.width = Math.max(1, Math.round(cssW * dpr));
    previewCanvas.height = Math.max(1, Math.round(cssH * dpr));

    var pctx = previewCanvas.getContext('2d');
    pctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    drawDownscaled(outCanvas, outCanvas.width, outCanvas.height,
                   pctx, previewCanvas.width, previewCanvas.height);
  }

  // スライダーを動かしている間は、1フレームに1回だけ描き直す
  function scheduleRender() {
    if (renderRaf) return;
    renderRaf = window.requestAnimationFrame(function () {
      renderRaf = 0;
      render();
    });
  }

  function schedulePreview() {
    if (previewRaf) return;
    previewRaf = window.requestAnimationFrame(function () {
      previewRaf = 0;
      drawPreview();
    });
  }

  // ------------------------------------------------------------------
  // 画像の読み込み
  // ------------------------------------------------------------------

  // 読み込んだ画像を、長辺MAX_SOURCE_PXまでのcanvasにして持っておく。
  // スライダーを動かすたびに巨大な画像を読み直さずに済む。
  function buildSourceCanvas(img) {
    var w = img.naturalWidth;
    var h = img.naturalHeight;
    if (!w || !h) return null;

    var ratio = Math.min(1, MAX_SOURCE_PX / Math.max(w, h));
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * ratio));
    canvas.height = Math.max(1, Math.round(h * ratio));

    drawDownscaled(img, w, h, canvas.getContext('2d'), canvas.width, canvas.height);
    return canvas;
  }

  function handleFile(file) {
    if (!file) return;

    if (!file.type || file.type.indexOf('image/') !== 0) {
      note('画像ファイルを入れてください', true);
      return;
    }

    // FileReaderでデータURLにしてから<img>に渡す。file:// で開いても読めて、
    // canvasが汚染されない（＝toBlobで保存できる）。
    var reader = new FileReader();

    reader.onload = function () {
      var img = new Image();

      img.onload = function () {
        var built = buildSourceCanvas(img);
        if (!built) {
          note('この画像は読み込めませんでした', true);
          return;
        }

        var shrunk = (built.width !== img.naturalWidth || built.height !== img.naturalHeight);
        note(shrunk ? '大きい画像なので長辺' + MAX_SOURCE_PX + 'pxに縮小して読み込みました' : '');

        sourceCanvas = built;
        editorEl.hidden = false;                 // 先に出してからstageの幅を測る
        document.body.dataset.state = 'ready';
        render();
      };

      img.onerror = function () { note('この画像は読み込めませんでした', true); };
      img.src = String(reader.result);
    };

    reader.onerror = function () { note('ファイルを読み込めませんでした', true); };
    reader.readAsDataURL(file);
  }

  // ------------------------------------------------------------------
  // 入力（ファイル選択 / ドラッグ&ドロップ / 貼り付け）
  // ------------------------------------------------------------------
  fileInput.addEventListener('change', function () {
    handleFile(fileInput.files && fileInput.files[0]);
    fileInput.value = '';   // 同じファイルをもう一度選んでもchangeが起きるようにする
  });

  dropEl.addEventListener('dragover', function (e) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    dropEl.classList.add('is-dragover');
  });

  dropEl.addEventListener('dragleave', function (e) {
    // 中の要素をまたいだだけのときは点滅させない
    if (e.relatedTarget && dropEl.contains(e.relatedTarget)) return;
    dropEl.classList.remove('is-dragover');
  });

  dropEl.addEventListener('drop', function (e) {
    e.preventDefault();
    dropEl.classList.remove('is-dragover');
    var files = e.dataTransfer ? e.dataTransfer.files : null;
    handleFile(files && files[0]);
  });

  // ドロップゾーンの外に落としたときに、ブラウザがその画像を開いてしまうのを防ぐ
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); });

  // 「スクショを撮ってそのまま貼る」が最短の導線なので、貼り付けも受ける
  window.addEventListener('paste', function (e) {
    var items = e.clipboardData ? e.clipboardData.items : null;
    if (!items) return;

    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && items[i].type.indexOf('image/') === 0) {
        var file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          handleFile(file);
          return;
        }
      }
    }
  });

  // ------------------------------------------------------------------
  // パラメータの変更
  // ------------------------------------------------------------------
  [padInput, radiusInput, shadowInput].forEach(function (input) {
    input.addEventListener('input', function () {
      renderValueLabels();
      scheduleRender();
    });
  });

  window.addEventListener('resize', schedulePreview);

  // ------------------------------------------------------------------
  // 保存
  // ------------------------------------------------------------------
  saveBtn.addEventListener('click', function () {
    if (!sourceCanvas || !outCanvas.toBlob) return;

    // 保存するのは合成に使った出力用canvasそのもの。プレビューの縮小は一切かからない
    outCanvas.toBlob(function (blob) {
      if (!blob) return;

      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'shot-' + outCanvas.width + 'x' + outCanvas.height + '.png';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // すぐに解放するとダウンロードが始まらないブラウザがあるので少し待つ
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }, 'image/png');
  });

  // ---- 初期表示 ----
  // 背景チップはプリセット定義から組み立てる（色見本と実際の塗りを必ず同じ定義から作る）
  BACKGROUNDS.forEach(function (preset) {
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.bg = preset.id;
    chip.setAttribute('aria-pressed', 'false');

    var swatch = document.createElement('span');
    swatch.className = 'chip__swatch';
    swatch.style.background = backgroundCss(preset);

    var name = document.createElement('span');
    name.className = 'chip__name';
    name.textContent = preset.name;

    chip.appendChild(swatch);
    chip.appendChild(name);

    chip.addEventListener('click', function () {
      bgId = preset.id;
      markSelectedBg();
      render();
    });

    chipsEl.appendChild(chip);
  });

  renderValueLabels();
  markSelectedBg();
})();
