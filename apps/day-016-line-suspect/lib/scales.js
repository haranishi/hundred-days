/* 指標ごとの目安（A+〜F）

   数字を出すだけでは「で、これはいいの？」に答えられない。かといって点数だけ付けると
   価値判断を押しつけることになるので、**どの帯にも「その速さで何ができるか」を必ず添える**。
   letterは要約であって、意味を持っているのは capability のほうという設計。

   しきい値は感覚ではなく、実際の用途が要求する値から引いてある（出典は SOURCES）。
   ⚠️ 遅延は往復時間（RTT）で測っている。ITU-T G.114 は片道の時間なので、
      片道150ms＝往復300msとして換算した値をFの入口に置いている。 */

export const SOURCES = [
  { name: 'Netflix ヘルプセンター（推奨速度）', note: 'HD 720p=3Mbps / フルHD 1080p=5Mbps / 4K=15Mbps・推奨25Mbps（1本あたり）', url: 'https://help.netflix.com/en/node/306' },
  { name: 'Zoom（帯域の要件）', note: 'グループ通話の1080p送信=3.0Mbps・720p=1.8Mbps', url: 'https://developers.zoom.us/docs/video-sdk/system-requirements/' },
  { name: 'ITU-T G.114（片道の伝送時間）', note: '片道150msまでが望ましい／400ms超は許容されない。往復に直すと300ms／800ms', url: 'https://www.itu.int/rec/T-REC-G.114' }
];

/** dir: 'up'＝大きいほど良い（しきい値はその帯の下限）／'down'＝小さいほど良い（上限） */
export const SCALES = {
  dl: {
    label: '下り（受信）', unit: 'Mbps', dir: 'up',
    about: '動画を見る・ページを開く・ファイルを落とす速さ',
    bands: [
      ['A+', 300, '家族全員が同時に4Kでも余ります'],
      ['A', 100, '4Kを何本かと、大きなダウンロードを同時にできます'],
      ['B', 50, '4Kを2本くらいまでなら困りません'],
      ['C', 25, '4Kが1本ぶん。同時に他のことをすると苦しくなります'],
      ['D', 5, 'フルHDまでなら見られます。4Kは止まりやすい'],
      ['F', 0, 'HD（720p）が限界。複数人で使うと苦しい']
    ]
  },
  ul: {
    label: '上り（送信）', unit: 'Mbps', dir: 'up',
    about: 'ビデオ会議のカメラ・写真や動画のアップロード・ファイル送信の速さ',
    bands: [
      ['A+', 100, '大きな動画のアップロードも待たされません'],
      ['A', 30, '会議しながら写真を送っても平気です'],
      ['B', 10, 'ビデオ会議も投稿もふつうに使えます'],
      ['C', 5, 'ビデオ会議のカメラ1本ぶん。同時に送ると苦しい'],
      ['D', 2, '画質を落とせば通話できます。1080pは厳しい'],
      ['F', 0, 'カメラをつないだ通話が安定しません']
    ]
  },
  li: {
    label: '待機中の反応', unit: 'ms', dir: 'down',
    about: '何も流していないときの往復時間。押してから返るまでの速さ',
    bands: [
      ['A+', 20, '競技性のあるゲームでも文句なしの速さです'],
      ['A', 50, 'オンラインゲームも通話も快適です'],
      ['B', 100, 'わずかに遅れを感じることがあります'],
      ['C', 150, '素早い操作のゲームはつらい。通話は問題ありません'],
      ['D', 300, 'はっきり遅い。通話でも返事がかぶります'],
      ['F', Infinity, '会話がかみ合わなくなる領域です']
    ]
  },
  jit: {
    label: 'ゆらぎ（ジッター）', unit: 'ms', dir: 'down',
    about: '反応の速さがどれだけばらつくか。声が途切れる原因になります',
    bands: [
      ['A+', 5, 'まったく安定しています'],
      ['A', 10, '安定しています'],
      ['B', 20, 'ときどき音が乱れることがあります'],
      ['C', 30, '通話で声が途切れ始める手前です'],
      ['D', 50, '通話が聞き取りにくくなります'],
      ['F', Infinity, '音声も映像も安定しません']
    ]
  },
  bloat: {
    label: '通信中の反応', unit: 'ms', dir: 'down',
    about: '待機中と比べて、通信している最中に反応がどれだけ遅くなるか',
    bands: [
      ['A+', 5, '通信していても反応が変わりません'],
      ['A', 30, 'ほぼ影響がありません'],
      ['B', 60, 'わずかに影響します'],
      ['C', 200, '通話やゲームが途切れます'],
      ['D', 400, 'はっきり体感が悪くなります'],
      ['F', Infinity, '通信中はほとんど使いものになりません']
    ]
  }
};

/** C以下＝はっきり困り始める領域。色や診断の分岐はこの集合を見る */
export const POOR = new Set(['C', 'D', 'F']);

/**
 * 値を帯に当てる。測れていなければ grade を '—' にして、無理に点を付けない。
 * @returns {{grade: string, means: string｜null, label: string, unit: string}}
 */
export function rate(key, value) {
  const scale = SCALES[key];
  if (!scale) throw new Error(`知らない指標: ${key}`);
  const base = { label: scale.label, unit: scale.unit };
  if (!Number.isFinite(value)) return { ...base, grade: '—', means: null };
  const hit = scale.bands.find(([, threshold]) =>
    scale.dir === 'up' ? value >= threshold : value <= threshold);
  // 'up' の最後の帯は下限0なので必ず当たる。'down' の最後は Infinity なので必ず当たる
  const [grade, , means] = hit ?? scale.bands.at(-1);
  return { ...base, grade, means };
}

/** 目安表を描くための素材。画面にも文書にも同じものを使う */
export function scaleRows(key) {
  const scale = SCALES[key];
  return scale.bands.map(([grade, threshold, means], index) => {
    const previous = index === 0 ? null : scale.bands[index - 1][1];
    let range;
    if (scale.dir === 'up') {
      range = index === 0 ? `${threshold} 以上`
        : threshold === 0 ? `${previous} 未満`
        : `${threshold} 〜 ${previous}`;
    } else {
      range = index === 0 ? `${threshold} 以下`
        : threshold === Infinity ? `${previous} 超`
        : `${previous} 〜 ${threshold}`;
    }
    return { grade, range, means, unit: scale.unit };
  });
}
