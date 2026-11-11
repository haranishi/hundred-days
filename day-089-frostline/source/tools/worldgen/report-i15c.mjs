import {readFileSync,writeFileSync} from 'node:fs';
const root='.agent-harness/runs/worldgen/i15c',dir=root+'/final',a=JSON.parse(readFileSync(dir+'/stats.json')),c=JSON.parse(readFileSync(dir+'/candidates.json')),log=readFileSync(root+'/tests-final.log','utf8');
const summary=log.split('\n').filter(l=>/^\s*Tests\s/.test(l)).at(-1)?.trim()??'試験結果を確認できない';
const lines=['# I15c：方式は更新、形と滑走条件は未達あり','','隆起・浸食へ変更。ブラウザ・依存追加・commit/pushなし。',
'①合流はあるが細かい支尾根が不足。②西壁は板状露岩と縦筋が残り未達。③最高点は許容内、峰は丸みが残る。④氷河6段はあるが側端・割れ目・末端が不足。⑤主谷は読めるが停滞する。⑥森の周期縞は消えたが東の帯は急で接続も不足。⑦湖・村は実寸だが南岸の構図は木に遮られる。⑧櫛・四角い台地は除去、大きな板面と峰は残る。','',
'## 配置の実測','','北尾根は2450〜2700mで判定。較正の内部目標との差を独自の合否に使わない。橋の表は床、岸は別記。','',
'|配置|X|Z|較正目標m|実測m|','|---|---:|---:|---:|---:|',...a.points.map(p=>`|${p.name}|${p.x}|${p.z}|${p.target}|${p.actual.toFixed(2)}|`),'',
'## 合否','','|検査|合否|','|---|---|',...Object.entries(a.checks).map(([k,v])=>`|${k}|${v?'合格':'未達'}|`),'',
`最高点 (${a.highest.x},${a.highest.z}) ${a.highest.y.toFixed(2)}m。橋岸 ${a.bridgeBanks.map(b=>b.height.toFixed(3)).join('/')}m。全11基礎合格。湖の標高差${a.lake.range.toFixed(4)}m。`,
`無操作16/16、駅接続${a.drops.filter(d=>d.routePass).length}/16。帯10〜25度 ${(a.piste.fraction*100).toFixed(2)}%、東域平均${a.piste.regionMean.toFixed(2)}度。集落/乗り場周辺最大${a.surroundings.map(p=>p.max.toFixed(2)).join('/')}度。予約帯${Math.min(...a.reserve.map(p=>p.angle)).toFixed(2)}〜${Math.max(...a.reserve.map(p=>p.angle)).toFixed(2)}度。`,
`本番2回 ${a.determinism.seconds.map(s=>s.toFixed(2)).join('/')}秒、${a.determinism.files}ファイルSHA-256一致。岩${(a.reportOnly.rockFraction*100).toFixed(2)}%、支尾根の断面ピーク${a.reportOnly.branches.map(p=>p.side+':'+p.count).join('/')}と谷深さは報告のみ。`,'',
'## 試験・メタ情報','','指定試験: '+summary+'。失敗の所在は [tests-final.log](../tests-final.log)。同時作業中のstampsの3ファイルは編集していない。',
'world.json更新：heightRange、hashes、structures、drops、stations、views、reserved。追加：pistes、generation（400反復×5回、1024格子60反復、較正履歴）。版2/4096m/2048/2m/6バイナリの形式と意味は保持。','',
'## 次工程の候補と描画確認','','局所斜度のみの検査。予約帯400×60m、踏切・着地の安全が合格した場所ではない。',...c.jumpCandidates.map(p=>`- 台候補 (${p.x},${p.z}) ${p.angle.toFixed(1)}度、前方80m ${p.forward80Range.map(v=>v.toFixed(1)).join('〜')}度。`),...c.cliffCandidates.map(p=>`- 崖候補 (${p.x},${p.z}) ${p.angle.toFixed(1)}度、40m先 ${p.landing40.toFixed(1)}度。`),
'描画では西壁の板感、雪厚/岩境界、氷河の側端/末端、木の大きさ、橋/山荘、south/forest/bridge視点、地図外側の接続を確認してほしい。','',
'## 比較画像と未達の理由','','compare-map.png / compare-summit.png / compare-west.png / compare-east.png / compare-south.png / hillshade.png。',
'各回①〜⑧と係数変更は [I15c_progress.md](../../../impl/I15c_progress.md)。',
'隆起と単一受け手の浸食で狭い沢と大きな山塊が優勢になり、崩壊/拡散が追いつかなかった。後処理後の停滞も残る。数値のための壁・こぶ・平面を足さず未達として残した。'];
if(lines.length>100)throw new Error('report must remain within 100 lines');writeFileSync(dir+'/report.md',lines.join('\n')+'\n');console.log(JSON.stringify({report:dir+'/report.md',lines:lines.length,tests:summary,checks:a.checks}));
