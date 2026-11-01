/* 外部Dayの紹介ページの共有ボタン。XとLINEのリンクはHTMLだけで動く。
   ここは「リンクをコピー」と、端末の共有シート（使えるときだけ）を出す。スクリプトが動かなくてもページは読める。 */
(function () {
  'use strict';
  var urlNode = document.getElementById('share-url');
  var url = urlNode ? urlNode.textContent.trim() : location.href;
  var status = document.getElementById('share-status');
  function say(text) {
    if (status) status.textContent = text;
  }

  function selectUrl() {
    if (!urlNode || !window.getSelection || !document.createRange) return false;
    var range = document.createRange();
    range.selectNodeContents(urlNode);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  var copy = document.querySelector('[data-share="copy"]');
  if (copy) {
    var label = copy.textContent;
    copy.hidden = false;
    copy.addEventListener('click', function () {
      function done() {
        say('リンクをコピーしました');
        copy.textContent = 'コピーしました';
        setTimeout(function () {
          copy.textContent = label;
        }, 2000);
      }
      // クリップボードが使えない環境では、住所を選択して、手でコピーしてもらう
      function manual() {
        say(selectUrl() ? 'リンクを選択しました。コピーしてください' : 'リンクをコピーできませんでした。住所を手で選んでください');
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, manual);
      else manual();
    });
  }

  var share = document.querySelector('[data-share="native"]');
  if (share && navigator.share) {
    share.hidden = false;
    share.addEventListener('click', function () {
      navigator.share({ title: document.title, url: url }).catch(function () {});
    });
  }
})();
