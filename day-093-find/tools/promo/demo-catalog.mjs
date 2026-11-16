// Demo catalog items (32 items = 16 look photos x 2 passes) and isolated local DB/app setup for Day093 promo capture.
// Uses only the app's own 16 look photographs served at https://day93.rairakku.com/looks/<id>.png.
// Shop/brand/JAN are kept empty/NULL and no mall names appear anywhere in the item data.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_ORIGIN } from './timeline.mjs';

const LOOK_CATALOG = [
  { look: 'ryosan-01', style: 'ryosan', category: 'setup', color: 'pink', name1: 'ツイードノーカラーセットアップ', price1: 6980, name2: 'パールボタンツイードミニセット', price2: 22800 },
  { look: 'ryosan-02', style: 'ryosan', category: 'setup', color: 'pink', name1: 'リボンタイブラウス＆ミニスカート', price1: 5480, name2: 'フリルレースサスペンダーセット', price2: 21800 },
  { look: 'jirai-01', style: 'jirai', category: 'setup', color: 'black', name1: 'レースフリルリボンセットアップ', price1: 5980, name2: 'ベルベットリボンゴシックセット', price2: 23200 },
  { look: 'jirai-02', style: 'jirai', category: 'setup', color: 'black', name1: 'シアー袖ティアードミニセット', price1: 6480, name2: 'クラシカルブラックフリルセット', price2: 22400 },
  { look: 'kireime-01', style: 'kireime', category: 'setup', color: 'beige', name1: 'とろみブラウス＆テーパードパンツ', price1: 20800, name2: 'センタープレスきれいめパンツセット', price2: 24800 },
  { look: 'kireime-02', style: 'kireime', category: 'outer', color: 'black', name1: 'ノーカラージャケット＆タイトスカート', price1: 21800, name2: 'ウールライクジャケットスタイル', price2: 26800 },
  { look: 'street-01', style: 'y2k', category: 'tops', color: 'gray', name1: 'ヘビーウェイトフーディ＆カーゴ', price1: 6800, name2: 'オーバーサイズ裏毛パーカーセット', price2: 22900 },
  { look: 'street-02', style: 'y2k', category: 'tops', color: 'black', name1: 'ビッグTシャツ＆ワイドデニム', price1: 4980, name2: 'ウォッシュワイドデニムコーデ', price2: 21500 },
  { look: 'y2k-01', style: 'y2k', category: 'bottoms', color: 'blue', name1: 'リブタンク＆ローライズデニムミニ', price1: 4480, name2: 'ヴィンテージウォッシュミニスカセット', price2: 21200 },
  { look: 'y2k-02', style: 'y2k', category: 'outer', color: 'pink', name1: 'ベロアジップブルゾン＆プリーツ', price1: 5800, name2: 'ショート丈ベロアトラックセット', price2: 22600 },
  { look: 'furugi-01', style: 'y2k', category: 'onepiece', color: 'brown', name1: '小花柄ロングシャツワンピース', price1: 6200, name2: 'レトロフラワープリントマキシワンピ', price2: 23500 },
  { look: 'furugi-02', style: 'y2k', category: 'tops', color: 'yellow', name1: '総柄オープンカラーシャツ＆デニム', price1: 5900, name2: 'ヴィンテージ調柄シャツコーデ', price2: 22200 },
  { look: 'girly-01', style: 'kireime', category: 'setup', color: 'white', name1: 'パフスリーブブラウス＆フレアスカート', price1: 7480, name2: 'クラシカルモノトーンミディセット', price2: 24200 },
  { look: 'girly-02', style: 'kireime', category: 'onepiece', color: 'white', name1: 'リボンタイパフスリーブワンピース', price1: 20400, name2: 'コットンタッチフレアミディワンピ', price2: 24600 },
  { look: 'natural-01', style: 'kireime', category: 'onepiece', color: 'beige', name1: 'リネンライクゆったりロングワンピ', price1: 5600, name2: 'ナチュラルリネン風リラックスワンピ', price2: 21900 },
  { look: 'natural-02', style: 'kireime', category: 'tops', color: 'white', name1: 'バンドカラーシャツ＆ワイドパンツ', price1: 6900, name2: 'コットンシャツ＆リネンパンツセット', price2: 23800 },
];

export const priceBandOf = (price) =>
  price <= 3000 ? 'u3k' : price <= 5000 ? 'u5k' : price <= 10000 ? 'u10k' : price <= 20000 ? 'u20k' : 'o20k';

// Indexes into LOOK_CATALOG whose second copy is a women item: 9 looks whose style is not 'kireime'.
const SECOND_PASS_WOMEN = new Set(
  LOOK_CATALOG.map((entry, idx) => (entry.style === 'kireime' ? -1 : idx)).filter((idx) => idx >= 0).slice(0, 9),
);

export function buildDemoItems() {
  const publishedAt = '2026-11-16T00:00:00.000Z';
  const fetchedAt = '2026-11-16T00:00:00.000Z';
  const items = [];
  // Pass 1 (16 women items) then Pass 2 (9 women + 7 men items, o20k)
  // so 25 women items total -> after 8 C-5 swipes, 17 unswiped women items remain (= mainCount), avoiding duplicate-photo explore picks.
  // Pass 2 women copies use only looks outside the preferred style ('kireime'): a second copy of a preferred look ranks
  // right after its first copy, so two different items with the same photo would appear back to back.
  for (const pass of [1, 2]) {
    LOOK_CATALOG.forEach((entry, idx) => {
      const n = (pass - 1) * LOOK_CATALOG.length + idx + 1;
      const price = pass === 1 ? entry.price1 : entry.price2;
      const name = pass === 1 ? entry.name1 : entry.name2;
      const gender = pass === 1 || SECOND_PASS_WOMEN.has(idx) ? 'women' : 'men';
      items.push({
        id: `demo-item-${String(n).padStart(2, '0')}`,
        source: 'rakuten',
        itemCode: `demo-code-${String(n).padStart(2, '0')}`,
        name,
        price,
        imageUrl: `${APP_ORIGIN}/looks/${entry.look}.png`,
        affiliateUrl: `${APP_ORIGIN}/disclosure.html?demo=${n}`,
        shopName: '',
        brandName: null,
        janCode: null,
        gender,
        category: entry.category,
        styleTags: [entry.style],
        colorTags: [entry.color],
        priceBand: priceBandOf(price),
        availability: 1,
        isPublished: 1,
        publishedAt,
        fetchedAt,
      });
    });
  }
  return items;
}

export async function createLocalGateway(findRoot, dbDir) {
  const msaRoot = resolve(findRoot, 'msa');
  // Register tsx loader dynamically so the unified Worker TypeScript modules can run in Node without a build step.
  const tsxApiUrl = pathToFileURL(join(msaRoot, 'node_modules/tsx/dist/esm/api/index.mjs')).href;
  const { register } = await import(tsxApiUrl);
  const unregister = register();

  const libsqlUrl = pathToFileURL(join(msaRoot, 'node_modules/@libsql/client/lib-esm/node.js')).href;
  const { createClient } = await import(libsqlUrl);
  const schemaUrl = pathToFileURL(join(msaRoot, 'services/catalog/src/schema.ts')).href;
  const { ensureSchema } = await import(schemaUrl);
  const workerUrl = pathToFileURL(join(msaRoot, 'services/gateway/src/worker-unified.ts')).href;
  const { createUnifiedApp } = await import(workerUrl);

  mkdirSync(dbDir, { recursive: true });
  const clients = new Map();
  const makeDb = (name) => {
    let c = clients.get(name);
    if (!c) {
      c = createClient({ url: `file:${join(dbDir, `${name}.db`)}` });
      clients.set(name, c);
    }
    return c;
  };

  const catalogDb = makeDb('catalog');
  await ensureSchema(catalogDb);
  const items = buildDemoItems();
  for (const it of items) {
    await catalogDb.execute({
      sql: `INSERT INTO items
              (id, source, item_code, name, price, image_url, affiliate_url, shop_name,
               brand_name, jan_code, gender, category, style_tags, color_tags, price_band,
               availability, is_published, published_at, fetched_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        it.id, it.source, it.itemCode, it.name, it.price, it.imageUrl, it.affiliateUrl, it.shopName,
        it.brandName, it.janCode, it.gender, it.category, JSON.stringify(it.styleTags), JSON.stringify(it.colorTags),
        it.priceBand, it.availability, it.isPublished, it.publishedAt, it.fetchedAt,
      ],
    });
  }

  const appBundle = createUnifiedApp(
    {
      AUTH_TURSO_URL: 'auth',
      AUTH_TURSO_AUTH_TOKEN: '',
      CATALOG_TURSO_URL: 'catalog',
      CATALOG_TURSO_AUTH_TOKEN: '',
      SWIPE_TURSO_URL: 'swipe',
      SWIPE_TURSO_AUTH_TOKEN: '',
      PROFILE_TURSO_URL: 'profile',
      PROFILE_TURSO_AUTH_TOKEN: '',
      ONBOARDING_V4: 'on',
      ONBOARDING_SWIPES: '8',
      GUEST_FULL_ACCESS: 'on',
      PREFERRED_AFFILIATE_SOURCE: 'rakuten',
      IMAGE_SIM_WEIGHT: '0.1',
      ALLOWED_ORIGINS: APP_ORIGIN,
    },
    makeDb,
  );

  return {
    ...appBundle,
    itemCount: items.length,
    close: async () => {
      for (const c of clients.values()) await c.close?.();
      unregister();
    },
  };
}
