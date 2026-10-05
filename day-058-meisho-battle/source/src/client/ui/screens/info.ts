// 遊び方・設定・クレジット・豆知識の出典の一覧。

import { CPU_LEVEL_NAMES } from '../../../shared/cpu'
import { LANDMARKS } from '../../../shared/landmarks'
import type { GameAudio } from '../../audio'
import type { AppContext } from '../app-context'
import { h } from '../dom'
import { ART_BUILD, ART_BUZZ, ART_CHOICE } from './howto-art'
import { menuScreen } from './menu'

function art(svg: string): HTMLElement {
  const el = h('div', { class: 'howto-art' })
  el.innerHTML = svg
  return el
}

export const createHowtoScreen = menuScreen({
  name: 'howto',
  title: '遊び方',
  wide: true,
  build(card, ctx) {
    const step = (n: number, svg: string, title: string, body: string): HTMLElement =>
      h(
        'li',
        { class: 'howto-step' },
        art(svg),
        h('div', { class: 'howto-text' }, h('h2', null, h('span', { class: 'howto-n' }, String(n)), title), h('p', null, body)),
      )
    card.append(
      h(
        'ol',
        { class: 'howto-steps' },
        step(1, ART_BUILD, '模型が組み上がる', '白い部品が少しずつ積み上がり、途中で色が付きます。どこの名所か考えよう。'),
        step(2, ART_BUZZ, 'わかったら早押し', '早く押すほど高得点（1000点→200点）。いま押すと何点かは上の帯に出ます。'),
        step(3, ART_CHOICE, '4択で答える', 'まちがえると−200点で、その問題はもう押せません。全8問の合計で勝負。'),
      ),
      h('p', { class: 'howto-keys' }, 'キーボード：早押しは Space（ふたりは F と J）、4択は 1〜4。'),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary btn-block',
          'data-action': 'solo',
          on: {
            click: () => {
              ctx.audio.play('tap')
              ctx.go('solo')
            },
          },
        },
        `ひとりで遊んでみる（${CPU_LEVEL_NAMES.minarai}と）`,
      ),
    )
  },
})

function toggle(label: string, sub: string, on: boolean, onChange: (v: boolean) => void): HTMLElement {
  const state = h('span', { class: 'switch-state', 'aria-hidden': 'true' }, on ? 'オン' : 'オフ')
  const input = h('input', {
    type: 'checkbox',
    role: 'switch',
    checked: on,
    on: {
      change: () => {
        state.textContent = input.checked ? 'オン' : 'オフ'
        onChange(input.checked)
      },
    },
  })
  return h('label', { class: 'switch' }, h('span', { class: 'switch-text' }, h('b', null, label), h('small', null, sub)), state, input)
}

export const createSettingsScreen = menuScreen({
  name: 'settings',
  title: '設定',
  build(card, ctx) {
    const audio = ctx.audio as GameAudio
    const sfxOn = typeof audio.sfxEnabled === 'function' ? audio.sfxEnabled() : true
    const bgmOn = typeof audio.bgmEnabled === 'function' ? audio.bgmEnabled() : true
    card.append(
      h(
        'div',
        { class: 'switches' },
        toggle('効果音', '部品の「コトッ」、早押し、正解・まちがいの音', sfxOn, (v) => {
          ctx.audio.setSfxEnabled(v)
          if (v) ctx.audio.play('tap')
        }),
        toggle('BGM', 'ゲーム中に小さく流れる曲', bgmOn, (v) => ctx.audio.setBgmEnabled(v)),
      ),
      h('p', { class: 'note' }, '音は最初に画面に触れたときから鳴ります。設定はこの端末に覚えます。'),
      h(
        'p',
        { class: 'note' },
        '端末の「視差効果を減らす」「アニメーションを減らす」設定がオンなら、模型の跳ねと回転を止めます。',
      ),
    )
  },
})

const THREE_LICENSE = `The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`

const WORLD_ATLAS_LICENSE = `Copyright 2013-2019 Michael Bostock

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`

function license(title: string, text: string): HTMLElement {
  return h('details', { class: 'license' }, h('summary', null, title), h('pre', null, text))
}

export const createCreditsScreen = menuScreen({
  name: 'credits',
  title: 'クレジット',
  wide: true,
  build(card, ctx) {
    card.append(
      h(
        'dl',
        { class: 'credits' },
        h('dt', null, '地図'),
        h(
          'dd',
          null,
          'Natural Earth（4.1.0・パブリックドメイン）の陸地のデータを、world-atlas（© 2013-2019 Michael Bostock・ISC ライセンス）から変換して使っています。Made with Natural Earth.',
          license('world-atlas のライセンス（ISC）', WORLD_ATLAS_LICENSE),
        ),
        h('dt', null, '3Dの描画'),
        h('dd', null, 'three.js（MIT ライセンス）', license('three.js のライセンス（MIT）', THREE_LICENSE)),
        h('dt', null, '名所の模型'),
        h('dd', null, 'このゲームのために、箱や円柱を組み合わせて作った簡単な形です。文字・ロゴ・看板は入れていません。'),
        h('dt', null, '豆知識'),
        h(
          'dd',
          null,
          '答えあわせの豆知識は、出典で確かめた1文です。',
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-secondary btn-block btn-sources',
              'data-action': 'sources',
              on: {
                click: () => {
                  ctx.audio.play('tap')
                  ctx.go('sources')
                },
              },
            },
            '豆知識の出典の一覧',
          ),
        ),
        h('dt', null, '音'),
        h('dd', null, '効果音と BGM は、音源ファイルを使わずにブラウザの中で作っています。'),
      ),
    )
  },
})

export const createSourcesScreen = menuScreen({
  name: 'sources',
  title: '豆知識の出典',
  lead: '答えあわせに出る豆知識と、確かめた出典の一覧です（外部のサイトが開きます）。',
  back: 'credits',
  wide: true,
  build(card) {
    const items = LANDMARKS.filter((l) => l.modeled && l.fact)
    card.append(
      h(
        'ul',
        { class: 'sources' },
        ...items.map((l) =>
          h(
            'li',
            { class: 'source' },
            h('b', { class: 'source-name' }, l.name),
            h('p', { class: 'source-fact' }, l.fact),
            ...l.factSources.map((s) => h('a', { class: 'source-link', href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.title)),
          ),
        ),
      ),
    )
  },
})
