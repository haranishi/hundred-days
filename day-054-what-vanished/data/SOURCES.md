# 素材の出典

すべて [Poly Haven](https://polyhaven.com/) の素材で、ライセンスは [CC0](https://creativecommons.org/publicdomain/zero/1.0/)（帰属表示の義務なし）。取得には Poly Haven の公開API（https://api.polyhaven.com）を使った（Powered by Poly Haven）。一覧は `scripts/write-sources.mjs` が `data/models.json` から作る。

## 加工

`scripts/fetch-assets.mjs` で 1k の glTF を取り、重複と未使用を除き、三角形が多いものは間引き、質感画像を WebP にして小さくし（色は256〜1024px、凹凸などはその半分）、頂点を量子化した。いくつかはアプリ側で大きさを実物に合わせて縮めている（`lib/catalog.js` の scale）。額と写真立てのガラスは、素材の jpg に透明の情報が無いため、読み込み時に半透明の材質へ置き換えている。

## 3Dモデル

| ファイル | 答えの札の名前 | Poly Haven の素材 | 作者 | 三角形（元→同梱） | 大きさ |
|---|---|---|---|---|---|
| alarm-clock.glb | 目覚まし時計 | [Alarm Clock 01](https://polyhaven.com/a/alarm_clock_01) | Yann Kervran、James Ray Cock | 8985→6119 | 169KB |
| apple.glb | りんご | [Food Apple 01](https://polyhaven.com/a/food_apple_01) | Oliver Harries | 7012→5000 | 106KB |
| armchair.glb | ひじかけ椅子 | [Arm Chair 01](https://polyhaven.com/a/ArmChair_01) | Kirill Sannikov | 5626→5626 | 149KB |
| bananas.glb | バナナ | [Bananas](https://polyhaven.com/a/bananas) | Alexander Shulha | 46868→7842 | 162KB |
| basket.glb | かご | [Wicker Basket 01](https://polyhaven.com/a/wicker_basket_01) | Kuutti Siitonen | 22276→5998 | 167KB |
| bed.glb | （家具） | [Gothic Bed 01](https://polyhaven.com/a/GothicBed_01) | Kirill Sannikov | 18745→13999 | 419KB |
| bench.glb | （家具） | [Painted Wooden Bench](https://polyhaven.com/a/painted_wooden_bench) | Kirill Sannikov | 630→630 | 36KB |
| binoculars.glb | 双眼鏡 | [Vintage Binoculars](https://polyhaven.com/a/vintage_binocular) | Luke | 19362→5447 | 179KB |
| blue-vase.glb | 青い花がらの花びん | [Antique Ceramic Vase 01](https://polyhaven.com/a/antique_ceramic_vase_01) | James Ray Cock | 9408→6000 | 116KB |
| bookshelf.glb | （家具） | [Wooden Bookshelf Worn](https://polyhaven.com/a/wooden_bookshelf_worn) | Ulan Cabanilla | 10106→9000 | 201KB |
| boombox.glb | ラジカセ | [Boombox](https://polyhaven.com/a/boombox) | Thomas Paul Mouilleron | 10168→6058 | 193KB |
| cake.glb | いちごのケーキ | [Strawberry Chocolate Cake](https://polyhaven.com/a/strawberry_chocolate_cake) | Kuutti Siitonen | 27054→5996 | 171KB |
| camera.glb | カメラ | [Camera 01](https://polyhaven.com/a/Camera_01) | Rajil Jose Macatangay | 26987→5340 | 208KB |
| cassette.glb | カセットプレーヤー | [Cassette Player](https://polyhaven.com/a/cassette_player) | Oday Abuzaeed | 4830→4830 | 147KB |
| cat-statue.glb | 猫の置物 | [Concrete Cat Statue](https://polyhaven.com/a/concrete_cat_statue) | Rico Cilliers、Riley Queen | 11950→6000 | 150KB |
| ceiling-lamp.glb | （家具） | [Modern Ceiling Lamp 01](https://polyhaven.com/a/modern_ceiling_lamp_01) | James Ray Cock | 5602→5044 | 107KB |
| chandelier.glb | （家具） | [Chandelier 01](https://polyhaven.com/a/Chandelier_01) | Kirill Sannikov | 26860→13462 | 389KB |
| chess.glb | チェス盤 | [Chess Set](https://polyhaven.com/a/chess_set) | Riley Queen | 76920→6487 | 253KB |
| coffee-table.glb | （家具） | [Modern Coffee Table 01](https://polyhaven.com/a/modern_coffee_table_01) | Amin | 4504→4504 | 115KB |
| cube-shelf.glb | （家具） | [Wooden Display Shelves 01](https://polyhaven.com/a/wooden_display_shelves_01) | James Ray Cock | 3174→3174 | 79KB |
| desk.glb | （家具） | [School Desk 01](https://polyhaven.com/a/SchoolDesk_01) | Ethan Place | 4162→4162 | 103KB |
| desk-lamp.glb | オレンジの電気スタンド | [Desk Lamp Arm 01](https://polyhaven.com/a/desk_lamp_arm_01) | Yann Kervran、Kuutti Siitonen | 24102→6784 | 206KB |
| dining-chair.glb | （家具） | [Dining Chair 02](https://polyhaven.com/a/dining_chair_02) | James Ray Cock | 22013→8999 | 189KB |
| dining-table.glb | （家具） | [Dining Table](https://polyhaven.com/a/dining_table) | Aron Łyczek | 1048→1048 | 114KB |
| dresser.glb | （家具） | [Wooden Table 03](https://polyhaven.com/a/WoodenTable_03) | Gabriel Radić | 2298→2298 | 104KB |
| duck.glb | アヒルのおもちゃ | [Rubber Duck Toy](https://polyhaven.com/a/rubber_duck_toy) | Plat251 | 4288→4288 | 84KB |
| elephant.glb | 木彫りのゾウ | [Carved Wooden Elephant](https://polyhaven.com/a/carved_wooden_elephant) | Greg Zaal | 2752→2752 | 74KB |
| enamel-pot.glb | ホーロー鍋 | [Pot Enamel 01](https://polyhaven.com/a/pot_enamel_01) | Kuutti Siitonen | 11416→5012 | 103KB |
| grandfather-clock.glb | 大きな振り子時計 | [Vintage Grandfather Clock 01](https://polyhaven.com/a/vintage_grandfather_clock_01) | Yann Kervran、James Ray Cock | 8582→8582 | 265KB |
| horse.glb | 白い馬の置物 | [Horse Statue 01](https://polyhaven.com/a/horse_statue_01) | Rico Cilliers | 22388→5430 | 179KB |
| jug.glb | 花がらの水差し | [Jug 01](https://polyhaven.com/a/jug_01) | Kuutti Siitonen | 5770→5000 | 95KB |
| kettle.glb | やかん | [Vintage Electric Kettle](https://polyhaven.com/a/vintage_electric_kettle) | SV Garip | 14838→6762 | 174KB |
| kitchen-cabinet.glb | （家具） | [Painted Wooden Cabinet](https://polyhaven.com/a/painted_wooden_cabinet) | Kirill Sannikov | 2227→2227 | 85KB |
| kitchen-rack.glb | （家具） | [Drawer Cabinet](https://polyhaven.com/a/drawer_cabinet) | Ulan Cabanilla | 26406→8994 | 256KB |
| lantern.glb | 木のランタン | [Wooden Lantern 01](https://polyhaven.com/a/wooden_lantern_01) | James Ray Cock | 8321→6011 | 178KB |
| laptop.glb | ノートパソコン | [Classic Laptop](https://polyhaven.com/a/classic_laptop) | Arrangemonk | 14450→6074 | 220KB |
| leafy-plant.glb | 葉の大きい観葉植物 | [Potted Plant 02](https://polyhaven.com/a/potted_plant_02) | Rico Cilliers | 69806→11986 | 316KB |
| lemon.glb | レモン | [Lemon](https://polyhaven.com/a/lemon) | Kuutti Siitonen | 4012→4012 | 93KB |
| mantel-clock.glb | 木の置き時計 | [Mantel Clock 01](https://polyhaven.com/a/mantel_clock_01) | Yann Kervran、Rico Cilliers | 25721→5997 | 152KB |
| microwave.glb | 電子レンジ | [Vintage Microwave](https://polyhaven.com/a/vintage_microwave) | Adam Nekola | 8120→5998 | 145KB |
| nightstand.glb | （家具） | [Classic Nightstand 01](https://polyhaven.com/a/ClassicNightstand_01) | Kirill Sannikov | 2002→2002 | 63KB |
| oil-lamp.glb | 石油ランプ | [Vintage Oil Lamp](https://polyhaven.com/a/vintage_oil_lamp) | Monsta3D | 7208→6000 | 146KB |
| oil-painting.glb | 金の額の風景画 | [Fancy Picture Frame 01](https://polyhaven.com/a/fancy_picture_frame_01) | Rob Tuytel、Rico Cilliers | 938→938 | 47KB |
| painting.glb | 額に入った絵 | [Hanging Picture Frame 02](https://polyhaven.com/a/hanging_picture_frame_02) | James Ray Cock | 3678→3678 | 103KB |
| photo-frame.glb | 写真立て | [Standing Picture Frame 01](https://polyhaven.com/a/standing_picture_frame_01) | James Ray Cock | 1634→1634 | 54KB |
| pillows.glb | ジグザグ柄のクッション | [Throw Pillows 01](https://polyhaven.com/a/throw_pillows_01) | Serhii Khromov | 6362→5998 | 144KB |
| rocking-chair.glb | ゆり椅子 | [Rockingchair 01](https://polyhaven.com/a/Rockingchair_01) | Jorge Camacho | 11866→9000 | 235KB |
| school-chair.glb | 青い椅子 | [School Chair 01](https://polyhaven.com/a/SchoolChair_01) | Ethan Place | 5072→5072 | 111KB |
| side-table.glb | （家具） | [Side Table 01](https://polyhaven.com/a/side_table_01) | James Ray Cock | 2756→2756 | 98KB |
| sofa.glb | （家具） | [Sofa 01](https://polyhaven.com/a/Sofa_01) | Kirill Sannikov | 4101→4101 | 138KB |
| stove.glb | （家具） | [Electric Stove](https://polyhaven.com/a/electric_stove) | Kuutti Siitonen | 13914→9512 | 255KB |
| succulent.glb | 小さな鉢植え | [Potted Plant 04](https://polyhaven.com/a/potted_plant_04) | James Ray Cock | 8929→7105 | 172KB |
| suitcase.glb | 旅行かばん | [Vintage Suitcase](https://polyhaven.com/a/vintage_suitcase) | Maximilian Schuster | 16474→7346 | 133KB |
| tall-plant.glb | 背の高い観葉植物 | [Potted Plant 01](https://polyhaven.com/a/potted_plant_01) | Rico Cilliers | 176226→15848 | 451KB |
| tea-set.glb | ティーセット | [Tea Set 01](https://polyhaven.com/a/tea_set_01) | James Ray Cock、Rico Cilliers、Jurita Burger | 40296→8988 | 163KB |
| tv.glb | テレビ | [Television 02](https://polyhaven.com/a/television_02) | Benny Weimer | 2310→2310 | 73KB |
| tv-cabinet.glb | （家具） | [Modern Wooden Cabinet](https://polyhaven.com/a/modern_wooden_cabinet) | Patrik Pangerl | 24976→16800 | 655KB |
| ukulele.glb | ウクレレ | [Ukulele 01](https://polyhaven.com/a/Ukulele_01) | Joseph Burgan | 8912→6000 | 188KB |
| wall-clock.glb | 壁の丸い時計 | [Wall Clock](https://polyhaven.com/a/wall_clock) | PierreB3D | 3658→3658 | 123KB |
| watering-can.glb | じょうろ | [Watering Can Metal 01](https://polyhaven.com/a/watering_can_metal_01) | Charles Nderitu | 11837→5999 | 159KB |
| wine-bottles.glb | ワインのびん | [Wine Bottles 01](https://polyhaven.com/a/wine_bottles_01) | Rico Cilliers、Jurita Burger | 28848→6050 | 161KB |

## 床・壁・敷物の質感と、窓の外の景色

| ファイル | Poly Haven の素材 | 作者 | 使い方 |
|---|---|---|---|
| checker-tile_*.webp | [Floor Tiles 06](https://polyhaven.com/a/floor_tiles_06) | Rob Tuytel | 床・壁・敷物の質感 |
| garden_*.webp | [Charolettenbrunn Park](https://polyhaven.com/a/charolettenbrunn_park) | Grzegorz Wronkowski | 窓の外の景色。HDRI の色調済み JPG を 2048×1024 の WebP に縮小（家の中の光には使わない） |
| oak-floor_*.webp | [Laminate Floor 02](https://polyhaven.com/a/laminate_floor_02) | Dario Barresi、Charlotte Baglioni | 床・壁・敷物の質感 |
| parquet_*.webp | [Herringbone Parquet](https://polyhaven.com/a/herringbone_parquet) | Jenelle van Heerden、Sergej Majboroda | 床・壁・敷物の質感 |
| plaster_*.webp | [Beige Wall 001](https://polyhaven.com/a/beige_wall_001) | Dimitrios Savva、Rico Cilliers | 床・壁・敷物の質感 |
| rug_*.webp | [Fabric Pattern 05](https://polyhaven.com/a/fabric_pattern_05) | Rob Tuytel | 床・壁・敷物の質感 |
| stone-tile_*.webp | [Floor Tiles 08](https://polyhaven.com/a/floor_tiles_08) | Rob Tuytel | 床・壁・敷物の質感 |

## コードで作ったもの

壁・窓・扉・天井・幅木・壁ぎわの陰り・接地の影・効果音は、この作品のコードで作っている。3Dの表示には three.js 0.186.0（MIT。`vendor/LICENSE-three.txt`）を GLTFLoader・RoomEnvironment・mergeGeometries 入りで1ファイルにまとめて同梱した。
