import './DayBar.css'

// 100日チャレンジ版（Day59）の帯：左は一覧へ戻るリンク、右はこのアプリの共有。
// 共有の欄は index.html の <dialog id="share-dialog"> にあり、中身はサイト共通の部品（shared/share.js）が据え付ける。

const DAY_LABEL = '100 DAYS / 059'

function openShare(): void {
  const dialog = document.getElementById('share-dialog')
  if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal()
}

export function DayBar() {
  return (
    <nav className="day-bar" aria-label="100日チャレンジ">
      <a className="day-bar-link" href="../" data-action="day-index">{DAY_LABEL}</a>
      <button type="button" className="day-bar-link" data-action="share-app" aria-label="このアプリを共有する" onClick={openShare}>共有する</button>
    </nav>
  )
}
