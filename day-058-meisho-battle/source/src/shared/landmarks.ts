// 名所の一覧（docs/04）。ここにはゲームの設計の値（名前・難しさ・種類・見間違えやすい名所・模型の有無）を置き、
// 調べて確かめる値（正式名・場所・緯度経度・豆知識・出典）は landmark-facts.ts から合わせる。
//
// - id は英小文字とハイフン。描画側（src/client/landmarks）も同じ id を使うので変えない
// - 模型のある名所（modeled）だけを出題する。名前だけの名所（nameOnly）は、はずれの選択肢にだけ使う
// - 名前だけの名所は、権利者が名前の利用に許諾を求めている名所（東京スカイツリー、シドニー・オペラハウスなど）と、
//   対戦の題材として重い名所（原爆ドーム）を入れない。確定は research/rights.md に従う
// - name は選択肢に出す短い名前。模型ありだけ長い名前にすると、名前の形で正解の見当がつくのでそろえる

import { EXPANSION_DESIGN } from './expansion-catalog'
import { LANDMARK_FACTS } from './landmark-facts'
import type { Landmark, LandmarkCategory, Region, Scope } from './types'

interface LandmarkDesign {
  id: string
  name: string
  scope: Region
  difficulty: 1 | 2 | 3
  category: LandmarkCategory
  modeled: boolean
  /** 見間違えやすい順に並べる。範囲の外の名所も書いてよい（出題範囲に合わないものは選択肢のときに外す） */
  confusables: string[]
}

const DESIGN: readonly LandmarkDesign[] = [
  // ── 日本（模型あり 12） ──
  { id: 'tokyo-tower', name: '東京タワー', scope: 'japan', difficulty: 1, category: 'tower', modeled: true, confusables: ['eiffel-tower', 'kobe-port-tower', 'tsutenkaku', 'kyoto-tower'] },
  { id: 'kinkakuji', name: '金閣寺', scope: 'japan', difficulty: 1, category: 'temple', modeled: true, confusables: ['ginkakuji', 'byodoin', 'kiyomizudera'] },
  { id: 'itsukushima', name: '厳島神社', scope: 'japan', difficulty: 2, category: 'shrine', modeled: true, confusables: ['fushimi-inari', 'heian-jingu', 'izumo-taisha'] },
  { id: 'mt-fuji', name: '富士山', scope: 'japan', difficulty: 1, category: 'mountain', modeled: true, confusables: ['mt-yotei', 'mt-chokai', 'mt-iwaki', 'mt-kaimon', 'mt-daisen'] },
  { id: 'himeji-castle', name: '姫路城', scope: 'japan', difficulty: 2, category: 'castle', modeled: true, confusables: ['osaka-castle', 'matsumoto-castle', 'kumamoto-castle', 'nagoya-castle', 'neuschwanstein'] },
  { id: 'osaka-castle', name: '大阪城', scope: 'japan', difficulty: 2, category: 'castle', modeled: true, confusables: ['himeji-castle', 'nagoya-castle', 'kumamoto-castle', 'goryokaku'] },
  { id: 'kaminarimon', name: '雷門', scope: 'japan', difficulty: 1, category: 'gate', modeled: true, confusables: ['heian-jingu', 'kiyomizudera', 'todaiji', 'brandenburg-gate'] },
  { id: 'kiyomizudera', name: '清水寺', scope: 'japan', difficulty: 2, category: 'temple', modeled: true, confusables: ['hasedera', 'todaiji', 'kinkakuji'] },
  { id: 'todaiji', name: '東大寺', scope: 'japan', difficulty: 2, category: 'temple', modeled: true, confusables: ['toshodaiji', 'byodoin', 'kiyomizudera', 'izumo-taisha'] },
  { id: 'fushimi-inari', name: '伏見稲荷大社', scope: 'japan', difficulty: 2, category: 'shrine', modeled: true, confusables: ['itsukushima', 'heian-jingu', 'izumo-taisha'] },
  { id: 'shirakawago', name: '白川郷', scope: 'japan', difficulty: 3, category: 'village', modeled: true, confusables: ['gokayama', 'miyama', 'ouchijuku', 'tsumagojuku'] },
  { id: 'goryokaku', name: '五稜郭', scope: 'japan', difficulty: 3, category: 'castle', modeled: true, confusables: ['tatsuoka-goryokaku', 'osaka-castle', 'matsumoto-castle', 'nagoya-castle'] },
  // ── 世界（模型あり 12） ──
  { id: 'pyramids-giza', name: 'ギザのピラミッド', scope: 'world', difficulty: 1, category: 'tomb', modeled: true, confusables: ['chichen-itza', 'abu-simbel', 'machu-picchu'] },
  { id: 'eiffel-tower', name: 'エッフェル塔', scope: 'world', difficulty: 1, category: 'tower', modeled: true, confusables: ['tokyo-tower', 'arc-de-triomphe', 'notre-dame', 'big-ben'] },
  { id: 'pisa-tower', name: 'ピサの斜塔', scope: 'world', difficulty: 1, category: 'tower', modeled: true, confusables: ['colosseum', 'st-peters', 'big-ben'] },
  { id: 'statue-of-liberty', name: '自由の女神', scope: 'world', difficulty: 1, category: 'statue', modeled: true, confusables: ['christ-redeemer', 'merlion', 'mount-rushmore', 'moai', 'brooklyn-bridge'] },
  { id: 'colosseum', name: 'コロッセオ', scope: 'world', difficulty: 2, category: 'ruins', modeled: true, confusables: ['arena-verona', 'parthenon', 'stonehenge', 'pisa-tower'] },
  { id: 'taj-mahal', name: 'タージ・マハル', scope: 'world', difficulty: 2, category: 'tomb', modeled: true, confusables: ['humayun-tomb', 'blue-mosque', 'st-peters', 'angkor-wat', 'notre-dame'] },
  { id: 'great-wall', name: '万里の長城', scope: 'world', difficulty: 2, category: 'wall', modeled: true, confusables: ['hadrians-wall', 'forbidden-city', 'machu-picchu', 'tower-of-london'] },
  { id: 'big-ben', name: 'ビッグ・ベン', scope: 'world', difficulty: 2, category: 'tower', modeled: true, confusables: ['westminster-abbey', 'tower-of-london', 'tower-bridge', 'notre-dame'] },
  { id: 'moai', name: 'モアイ', scope: 'world', difficulty: 2, category: 'statue', modeled: true, confusables: ['mount-rushmore', 'stonehenge', 'abu-simbel'] },
  { id: 'stonehenge', name: 'ストーンヘンジ', scope: 'world', difficulty: 3, category: 'ruins', modeled: true, confusables: ['moai', 'parthenon', 'colosseum'] },
  { id: 'neuschwanstein', name: 'ノイシュヴァンシュタイン城', scope: 'world', difficulty: 3, category: 'castle', modeled: true, confusables: ['hohenzollern-castle', 'mont-saint-michel', 'himeji-castle', 'tower-of-london'] },
  { id: 'tower-bridge', name: 'タワーブリッジ', scope: 'world', difficulty: 3, category: 'bridge', modeled: true, confusables: ['brooklyn-bridge', 'tower-of-london', 'big-ben', 'kintaikyo'] },
  // ── 日本（追加模型12＋名前だけ） ──
  { id: 'kobe-port-tower', name: '神戸ポートタワー', scope: 'japan', difficulty: 2, category: 'tower', modeled: false, confusables: [] },
  { id: 'tsutenkaku', name: '通天閣', scope: 'japan', difficulty: 2, category: 'tower', modeled: false, confusables: [] },
  { id: 'kyoto-tower', name: '京都タワー', scope: 'japan', difficulty: 2, category: 'tower', modeled: false, confusables: [] },
  { id: 'ginkakuji', name: '銀閣寺', scope: 'japan', difficulty: 2, category: 'temple', modeled: true, confusables: ['kinkakuji', 'byodoin', 'toshodaiji'] },
  { id: 'byodoin', name: '平等院鳳凰堂', scope: 'japan', difficulty: 2, category: 'temple', modeled: true, confusables: ['kinkakuji', 'ginkakuji', 'toshodaiji'] },
  { id: 'toshodaiji', name: '唐招提寺', scope: 'japan', difficulty: 3, category: 'temple', modeled: true, confusables: ['todaiji', 'byodoin', 'kiyomizudera'] },
  { id: 'hasedera', name: '長谷寺', scope: 'japan', difficulty: 2, category: 'temple', modeled: false, confusables: [] },
  { id: 'matsumoto-castle', name: '松本城', scope: 'japan', difficulty: 2, category: 'castle', modeled: true, confusables: ['kumamoto-castle', 'himeji-castle', 'nagoya-castle'] },
  { id: 'kumamoto-castle', name: '熊本城', scope: 'japan', difficulty: 2, category: 'castle', modeled: true, confusables: ['matsumoto-castle', 'osaka-castle', 'nagoya-castle'] },
  { id: 'nagoya-castle', name: '名古屋城', scope: 'japan', difficulty: 2, category: 'castle', modeled: true, confusables: ['osaka-castle', 'himeji-castle', 'kumamoto-castle'] },
  { id: 'izumo-taisha', name: '出雲大社', scope: 'japan', difficulty: 2, category: 'shrine', modeled: true, confusables: ['heian-jingu', 'itsukushima', 'todaiji'] },
  { id: 'heian-jingu', name: '平安神宮', scope: 'japan', difficulty: 2, category: 'shrine', modeled: true, confusables: ['itsukushima', 'fushimi-inari', 'kaminarimon'] },
  { id: 'mt-yotei', name: '羊蹄山', scope: 'japan', difficulty: 2, category: 'mountain', modeled: false, confusables: [] },
  { id: 'mt-chokai', name: '鳥海山', scope: 'japan', difficulty: 2, category: 'mountain', modeled: false, confusables: [] },
  { id: 'mt-iwaki', name: '岩木山', scope: 'japan', difficulty: 3, category: 'mountain', modeled: false, confusables: [] },
  { id: 'mt-kaimon', name: '開聞岳', scope: 'japan', difficulty: 3, category: 'mountain', modeled: false, confusables: [] },
  { id: 'mt-daisen', name: '大山', scope: 'japan', difficulty: 3, category: 'mountain', modeled: false, confusables: [] },
  { id: 'gokayama', name: '五箇山', scope: 'japan', difficulty: 2, category: 'village', modeled: false, confusables: [] },
  { id: 'miyama', name: '美山かやぶきの里', scope: 'japan', difficulty: 3, category: 'village', modeled: true, confusables: ['shirakawago', 'gokayama', 'ouchijuku', 'tsumagojuku'] },
  { id: 'tsumagojuku', name: '妻籠宿', scope: 'japan', difficulty: 3, category: 'village', modeled: true, confusables: ['ouchijuku', 'miyama', 'shirakawago'] },
  { id: 'tatsuoka-goryokaku', name: '龍岡城五稜郭', scope: 'japan', difficulty: 3, category: 'castle', modeled: false, confusables: [] },
  { id: 'ouchijuku', name: '大内宿', scope: 'japan', difficulty: 3, category: 'village', modeled: true, confusables: ['tsumagojuku', 'miyama', 'shirakawago'] },
  { id: 'kintaikyo', name: '錦帯橋', scope: 'japan', difficulty: 2, category: 'bridge', modeled: true, confusables: ['tower-bridge', 'brooklyn-bridge', 'kiyomizudera'] },
  // ── 世界（追加模型12＋名前だけ） ──
  { id: 'arc-de-triomphe', name: '凱旋門', scope: 'world', difficulty: 1, category: 'gate', modeled: true, confusables: ['brandenburg-gate', 'colosseum', 'tower-of-london'] },
  { id: 'parthenon', name: 'パルテノン神殿', scope: 'world', difficulty: 2, category: 'ruins', modeled: false, confusables: [] },
  { id: 'angkor-wat', name: 'アンコール・ワット', scope: 'world', difficulty: 2, category: 'temple', modeled: true, confusables: ['forbidden-city', 'humayun-tomb', 'blue-mosque'] },
  { id: 'machu-picchu', name: 'マチュピチュ', scope: 'world', difficulty: 2, category: 'ruins', modeled: true, confusables: ['chichen-itza', 'great-wall', 'hadrians-wall'] },
  { id: 'chichen-itza', name: 'チチェン・イッツァ', scope: 'world', difficulty: 1, category: 'ruins', modeled: true, confusables: ['pyramids-giza', 'machu-picchu', 'angkor-wat'] },
  { id: 'abu-simbel', name: 'アブ・シンベル神殿', scope: 'world', difficulty: 2, category: 'temple', modeled: true, confusables: ['pyramids-giza', 'moai', 'mount-rushmore'] },
  { id: 'tower-of-london', name: 'ロンドン塔', scope: 'world', difficulty: 2, category: 'castle', modeled: false, confusables: [] },
  { id: 'westminster-abbey', name: 'ウェストミンスター寺院', scope: 'world', difficulty: 2, category: 'church', modeled: false, confusables: [] },
  { id: 'notre-dame', name: 'ノートルダム大聖堂', scope: 'world', difficulty: 2, category: 'church', modeled: false, confusables: [] },
  { id: 'st-peters', name: 'サン・ピエトロ大聖堂', scope: 'world', difficulty: 2, category: 'church', modeled: false, confusables: [] },
  { id: 'brandenburg-gate', name: 'ブランデンブルク門', scope: 'world', difficulty: 2, category: 'gate', modeled: true, confusables: ['arc-de-triomphe', 'parthenon', 'tower-of-london'] },
  { id: 'forbidden-city', name: '紫禁城', scope: 'world', difficulty: 2, category: 'palace', modeled: true, confusables: ['angkor-wat', 'tower-of-london', 'humayun-tomb'] },
  { id: 'mont-saint-michel', name: 'モン・サン＝ミシェル', scope: 'world', difficulty: 2, category: 'church', modeled: true, confusables: ['neuschwanstein', 'hohenzollern-castle', 'notre-dame'] },
  { id: 'mount-rushmore', name: 'ラシュモア山', scope: 'world', difficulty: 2, category: 'statue', modeled: false, confusables: [] },
  { id: 'brooklyn-bridge', name: 'ブルックリン橋', scope: 'world', difficulty: 2, category: 'bridge', modeled: true, confusables: ['tower-bridge', 'big-ben', 'statue-of-liberty'] },
  { id: 'christ-redeemer', name: 'コルコバードのキリスト像', scope: 'world', difficulty: 2, category: 'statue', modeled: false, confusables: [] },
  { id: 'merlion', name: 'マーライオン', scope: 'world', difficulty: 2, category: 'statue', modeled: false, confusables: [] },
  { id: 'humayun-tomb', name: 'フマーユーン廟', scope: 'world', difficulty: 3, category: 'tomb', modeled: true, confusables: ['taj-mahal', 'blue-mosque', 'angkor-wat'] },
  { id: 'blue-mosque', name: 'ブルーモスク', scope: 'world', difficulty: 2, category: 'church', modeled: true, confusables: ['taj-mahal', 'humayun-tomb', 'st-peters'] },
  { id: 'hadrians-wall', name: 'ハドリアヌスの長城', scope: 'world', difficulty: 3, category: 'wall', modeled: true, confusables: ['great-wall', 'machu-picchu', 'stonehenge'] },
  { id: 'arena-verona', name: 'ヴェローナのアレーナ', scope: 'world', difficulty: 3, category: 'ruins', modeled: false, confusables: [] },
  { id: 'hohenzollern-castle', name: 'ホーエンツォレルン城', scope: 'world', difficulty: 3, category: 'castle', modeled: false, confusables: [] },
]

/** 模型48か所の id（docs/04 と docs/06 の表の順）。描画側はこの id で模型を登録する */
const CATALOG: readonly LandmarkDesign[] = [...DESIGN.filter(row => !EXPANSION_DESIGN.some(extra => extra.id === row.id)), ...EXPANSION_DESIGN]
export const MODELED_LANDMARK_IDS: readonly string[] = CATALOG.filter(row => row.modeled).map(row => row.id)
export type ModeledLandmarkId = (typeof MODELED_LANDMARK_IDS)[number]

function withFacts(design: LandmarkDesign): Landmark {
  const facts = Object.hasOwn(LANDMARK_FACTS, design.id) ? LANDMARK_FACTS[design.id] : undefined
  if (!facts) throw new Error(`landmark-facts.ts に ${design.id} の値がない`)
  return {
    id: design.id,
    name: design.name,
    officialName: facts.officialName,
    scope: design.scope,
    place: facts.place,
    lat: facts.lat,
    lon: facts.lon,
    built: facts.built,
    difficulty: design.difficulty,
    category: design.category,
    confusables: [...design.confusables],
    fact: facts.fact,
    factSources: facts.factSources.map((s) => ({ ...s })),
    modeled: design.modeled,
    nameOnly: !design.modeled,
  }
}

/** すべての名所（模型あり＋名前だけ） */
export const LANDMARKS: readonly Landmark[] = CATALOG.map(withFacts)

const BY_ID: ReadonlyMap<string, Landmark> = new Map(LANDMARKS.map((l) => [l.id, l]))

export function getLandmark(id: string): Landmark | undefined {
  return BY_ID.get(id)
}

export function isLandmarkId(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id)
}

/** その名所が出題範囲に入るか */
export function inScope(landmark: Landmark, scope: Scope): boolean {
  return scope === 'all' || landmark.scope === scope
}

/** 範囲の中の名所。modeledOnly なら模型のあるものだけ */
export function landmarksInScope(scope: Scope, opts: { modeledOnly?: boolean } = {}): Landmark[] {
  return LANDMARKS.filter((l) => inScope(l, scope) && (!opts.modeledOnly || l.modeled))
}
