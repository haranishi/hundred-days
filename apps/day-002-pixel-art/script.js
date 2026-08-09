/* ドット絵メーカー — Day 002
 * 外部通信なし / 外部ライブラリなし / 永続化なし。
 *
 * 設計メモ:
 *  - 変換は2段階。①オフスクリーンcanvasへ「横Nドット」に縮小する ②表示用canvasへ
 *    imageSmoothingEnabled=false で最近傍拡大する。②のcanvasをそのまま保存に使うので、
 *    画面に見えているものと書き出したPNGが必ず一致する。
 *  - 読み込んだ画像は長辺2048pxに丸めた1枚のcanvasにしてから使い回す。スライダーを
 *    動かすたびに元の巨大画像を読み直さずに済む。
 */
'use strict';

(function () {
  // ---- 定数 ----
  var MAX_SOURCE_PX = 2048;    // 読み込み時に長辺をここまで縮める
  var EXPORT_LONG_PX = 1024;   // 書き出しの長辺の目安
  var DEFAULT_DOTS = 48;

  // 減色パレット。ボタンのラベルはこの配列の長さから作るので、
  // 色を足し引きしても「8色」「4階調」という表示とずれない。
  var RETRO_COLORS = [
    [25, 29, 41],      // 黒（影）
    [103, 90, 118],    // 紫みのグレー（中間調。ここが無いと灰色が緑に寄る）
    [179, 63, 82],     // 赤
    [232, 121, 75],    // 橙
    [242, 193, 78],    // 黄
    [63, 169, 106],    // 緑
    [79, 156, 255],    // 青
    [242, 244, 248]    // 白
  ];

  var GREEN_COLORS = [
    [14, 42, 18],      // 暗
    [47, 93, 42],
    [107, 154, 52],
    [195, 214, 74]     // 明
  ];

  // ---- DOM ----
  var dropEl = document.getElementById('drop');
  var fileInput = document.getElementById('file');
  var dropNoteEl = document.getElementById('drop-note');
  var dotsInput = document.getElementById('dots');
  var dotsValueEl = document.getElementById('dots-value');
  var paletteEl = document.getElementById('palette');
  var paletteButtons = Array.prototype.slice.call(
    paletteEl.querySelectorAll('.btn--seg')
  );
  var resultEl = document.getElementById('result');
  var sourceEl = document.getElementById('source');
  var outputCanvas = document.getElementById('output');
  var infoEl = document.getElementById('info');
  var saveBtn = document.getElementById('save');

  // ---- 状態 ----
  var sourceCanvas = null;   // 長辺2048pxに丸めた元画像（nullなら未読み込み）
  var paletteMode = 'none';  // none | retro | green
  var dotCanvas = document.createElement('canvas'); // 縮小用（画面には出さない）

  // ------------------------------------------------------------------
  // 表示まわりの小物
  // ------------------------------------------------------------------
  function currentDots() {
    var n = Number(dotsInput.value);
    return (isFinite(n) && n > 0) ? Math.round(n) : DEFAULT_DOTS;
  }

  // スライダーの値の表示。読み上げの重複を避けるため、見た目はaria-hiddenの
  // spanに出し、支援技術にはrange自身のaria-valuetextで伝える。
  function renderDotsLabel() {
    var text = currentDots() + 'ドット';
    dotsValueEl.textContent = text;
    dotsInput.setAttribute('aria-valuetext', text);
  }

  function markSelectedPalette() {
    paletteButtons.forEach(function (btn) {
      var hit = (btn.dataset.palette === paletteMode);
      btn.classList.toggle('is-selected', hit);
      btn.setAttribute('aria-pressed', hit ? 'true' : 'false');
    });
  }

  function note(message) {
    dropNoteEl.textContent = message || '';
  }

  // ------------------------------------------------------------------
  // 画像処理
  // ------------------------------------------------------------------

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

  // 読み込んだ画像を、長辺MAX_SOURCE_PXまでのcanvasに変換して持っておく。
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

  // RGB距離が最小の色を選ぶ。比較するだけなので平方根は取らない。
  function nearestColor(palette, r, g, b) {
    var best = palette[0];
    var bestDist = Infinity;

    for (var i = 0; i < palette.length; i++) {
      var c = palette[i];
      var dr = r - c[0];
      var dg = g - c[1];
      var db = b - c[2];
      var dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    return best;
  }

  // 輝度（0〜255）。人の目の感度に合わせた重み付き平均。
  function luma(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // 縮小済みのドットを、選ばれたパレットの色に置き換える。
  function quantize(ctx, w, h) {
    if (paletteMode === 'none') return;

    var image = ctx.getImageData(0, 0, w, h);
    var data = image.data;
    var useGreen = (paletteMode === 'green');
    var steps = GREEN_COLORS.length;

    for (var i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;   // 透明な部分はさわらない

      var color;
      if (useGreen) {
        // 輝度を等分して、暗い順に並べたパレットへ割り当てる
        var index = Math.floor(luma(data[i], data[i + 1], data[i + 2]) / 256 * steps);
        color = GREEN_COLORS[Math.min(steps - 1, Math.max(0, index))];
      } else {
        color = nearestColor(RETRO_COLORS, data[i], data[i + 1], data[i + 2]);
      }

      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
    }

    ctx.putImageData(image, 0, 0);
  }

  // 変換して表示する。スライダーとパレットの変更でそのつど呼ぶ。
  function render() {
    if (!sourceCanvas) return;

    // ① 「横Nドット」に縮小。縦はアスペクト比を保って四捨五入（最低1）
    var dotsW = currentDots();
    var dotsH = Math.max(1, Math.round(dotsW * sourceCanvas.height / sourceCanvas.width));

    dotCanvas.width = dotsW;
    dotCanvas.height = dotsH;
    var dotCtx = dotCanvas.getContext('2d');
    dotCtx.clearRect(0, 0, dotsW, dotsH);   // 透過画像のとき前回の絵が透けないように
    drawDownscaled(sourceCanvas, sourceCanvas.width, sourceCanvas.height, dotCtx, dotsW, dotsH);
    quantize(dotCtx, dotsW, dotsH);

    // ② 最近傍で整数倍に拡大。長辺がEXPORT_LONG_PXに最も近くなる倍率を選ぶ
    //    （整数倍にしないとドットの境界がにじむ）
    var scale = Math.max(1, Math.round(EXPORT_LONG_PX / Math.max(dotsW, dotsH)));
    outputCanvas.width = dotsW * scale;
    outputCanvas.height = dotsH * scale;

    var outCtx = outputCanvas.getContext('2d');
    outCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
    outCtx.imageSmoothingEnabled = false;  // canvasのサイズを変えると設定が戻るので毎回入れる
    outCtx.drawImage(dotCanvas, 0, 0, outputCanvas.width, outputCanvas.height);

    infoEl.textContent = dotsW + ' × ' + dotsH + ' ドット ／ 保存サイズ ' +
                         outputCanvas.width + ' × ' + outputCanvas.height + ' px';
  }

  // ------------------------------------------------------------------
  // 画像の読み込み
  // ------------------------------------------------------------------
  function handleFile(file) {
    if (!file) return;

    if (!file.type || file.type.indexOf('image/') !== 0) {
      note('画像ファイルを入れてください');
      return;
    }
    note('');

    // FileReaderでデータURLにしてから<img>に渡す。file:// で開いても読めて、
    // canvasが汚染されない（＝getImageDataとtoBlobが使える）。
    var reader = new FileReader();

    reader.onload = function () {
      var img = new Image();

      img.onload = function () {
        var built = buildSourceCanvas(img);
        if (!built) {
          note('この画像は読み込めませんでした');
          return;
        }
        sourceCanvas = built;
        sourceEl.src = img.src;          // 元画像の表示。処理と同じ1枚を使う
        resultEl.hidden = false;
        document.body.dataset.state = 'ready';
        render();
      };

      img.onerror = function () { note('この画像は読み込めませんでした'); };
      img.src = String(reader.result);
    };

    reader.onerror = function () { note('ファイルを読み込めませんでした'); };
    reader.readAsDataURL(file);
  }

  // ------------------------------------------------------------------
  // 入力
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

  dotsInput.addEventListener('input', function () {
    renderDotsLabel();
    render();   // 128ドットまでなら軽いのでデバウンスしない
  });

  paletteButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      paletteMode = btn.dataset.palette;
      markSelectedPalette();
      render();
    });
  });

  // ------------------------------------------------------------------
  // 保存
  // ------------------------------------------------------------------
  saveBtn.addEventListener('click', function () {
    if (!sourceCanvas || !outputCanvas.toBlob) return;

    outputCanvas.toBlob(function (blob) {
      if (!blob) return;

      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'dot-art-' + currentDots() + 'dot.png';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // すぐに解放するとダウンロードが始まらないブラウザがあるので少し待つ
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }, 'image/png');
  });

  // ---- 初期表示 ----
  // ボタンのラベルはパレットの色数から作る（表示と実際の色数を必ず一致させる）
  paletteButtons.forEach(function (btn) {
    if (btn.dataset.palette === 'retro') {
      btn.textContent = 'レトロ' + RETRO_COLORS.length + '色';
    } else if (btn.dataset.palette === 'green') {
      btn.textContent = '緑' + GREEN_COLORS.length + '階調';
    }
  });

  renderDotsLabel();
  markSelectedPalette();
})();
