// タイトル：値札POPの題字・一言・4つの入口・消音・素材の表記（docs/02 ③④⑤）。
// 迷う分岐は対戦の2択なので、その2つにだけ1行の説明を添える。

import type { ScreensAPI } from '../../contracts';
import { currentAudio } from '../../audio';
import { button, h } from './dom';
import { icon } from './looks';
import { awning } from './parts';

type TitleHandlers = Parameters<ScreensAPI['showTitle']>[0];

function menuItem(opts: {
  a: string;
  label: string;
  sub?: string;
  tone: 'red' | 'blue' | 'green' | 'plain';
  iconName: 'play' | 'friends' | 'dice' | 'help';
  onClick: () => void;
}): HTMLButtonElement {
  const subId = opts.sub ? `sy-sub-${opts.a}` : undefined;
  return button(
    [
      h('span', { class: 'sy-menu-tile', 'aria-hidden': 'true' }, icon(opts.iconName, 26)),
      h(
        'span',
        { class: 'sy-menu-text' },
        h('span', { class: 'sy-menu-main' }, opts.label),
        // 説明は名前に混ぜず、説明として読ませる（aria-describedby）。名前は「友だちと対戦」だけ
        opts.sub ? h('span', { class: 'sy-menu-sub', id: subId, 'aria-hidden': 'true' }, opts.sub) : null,
      ),
      h('span', { class: 'sy-menu-arrow', 'aria-hidden': 'true' }, '›'),
    ],
    { cls: `sy-menu-item sy-menu-item--${opts.tone}`, a: opts.a, onClick: opts.onClick, attrs: { 'aria-describedby': subId } },
  );
}

export function titleScreen(hd: TitleHandlers): { el: HTMLElement; focus: HTMLElement } {
  let muted = hd.muted;
  const muteLabel = h('span', { class: 'sy-mute-label' });
  const muteIcon = h('span', { class: 'sy-mute-icon' });
  const mute = button([muteIcon, muteLabel], {
    cls: 'sy-btn--ghost sy-mute',
    a: 'mute',
    onClick: () => {
      hd.onToggleMute();
      // 本当の状態は音の側にある。音がまだ無いとき（試験など）は自分で切り替える
      muted = currentAudio()?.muted ?? !muted;
      paintMute();
    },
  });
  const paintMute = (): void => {
    muteIcon.replaceChildren(icon(muted ? 'sound-off' : 'sound-on', 24));
    muteLabel.textContent = muted ? '音 オフ' : '音 オン';
    // 名前は変えず、押されているか（＝消音中か）で状態を伝える
    mute.setAttribute('aria-pressed', String(muted));
    mute.setAttribute('aria-label', '消音');
  };
  paintMute();

  const solo = menuItem({ a: 'solo', label: 'ひとりで遊ぶ', tone: 'red', iconName: 'play', onClick: hd.onSolo });
  const menu = h(
    'nav',
    { class: 'sy-menu', 'aria-label': 'あそびかたを選ぶ' },
    solo,
    menuItem({ a: 'friends', label: '友だちと対戦', sub: 'リンクを送って友だちと', tone: 'blue', iconName: 'friends', onClick: hd.onFriends }),
    menuItem({ a: 'random', label: 'だれかと対戦', sub: '知らない人と自動で', tone: 'green', iconName: 'dice', onClick: hd.onRandom }),
    menuItem({ a: 'howto', label: 'あそびかた', tone: 'plain', iconName: 'help', onClick: hd.onHowTo }),
  );

  // 一言は句の切れ目でだけ折り返す（日本語は語の途中で切れやすい）。蛍光ペンは句ごとに引く
  const tagline = h(
    'p',
    { class: 'sy-tagline' },
    ...['2分間で、スーパーの', '“やっちゃダメ”を全部やれ'].map((t) => h('span', { class: 'sy-tagline-part' }, t)),
  );

  const el = h(
    'div',
    { class: 'sy-layer sy-layer--menu sy-layer--title', 'data-screen': 'title' },
    awning(),
    h(
      'div',
      { class: 'sy-title' },
      h(
        'div',
        { class: 'sy-title-hero' },
        h('p', { class: 'sy-store-sign' }, h('span', { class: 'sy-store-sign-small' }, '舞台は'), 'スーパーきちんと堂'),
        h(
          'h1',
          { class: 'sy-logo', 'aria-label': 'スーパーやりたい放題' },
          h('span', { class: 'sy-logo-top', 'aria-hidden': 'true' }, 'スーパー'),
          h('span', { class: 'sy-logo-main', 'aria-hidden': 'true' }, 'やりたい放題'),
        ),
        tagline,
      ),
      h(
        'div',
        { class: 'sy-title-menu' },
        menu,
        // 迷惑行為の報道が続いているので、架空の店のゲームだと一言添える（公開前の調査での勧め・docs/01）
        h('p', { class: 'sy-disclaimer' }, '架空のお店でのゲームです。現実のお店では、まねしないでね。'),
        h(
          'p',
          { class: 'sy-credit' },
          '3D素材：Kenney（CC0）',
          // 配信物に入る第三者の部品（three.js・Rapier）の許諾の文。縮めたコードには残らないので別のファイルで配る
          h('a', { class: 'sy-credit-link', href: 'licenses.txt', target: '_blank', rel: 'noopener' }, 'ライセンス'),
        ),
      ),
      mute,
    ),
  );
  return { el, focus: solo };
}
