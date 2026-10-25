import { test,expect } from '@playwright/test';
import type { DataOperation } from '../../src/features/data/operations';
import type {} from './harness';
test.beforeEach(async({page})=>{await page.goto('/tests/data/harness.html');await page.waitForFunction(()=>typeof window.runData==='function');});
test('all fourteen operations produce the expected local artifacts',async({page})=>{
  const examples:[DataOperation,string,string][]=[
    ['csv-json','名前,id\n田中,001','"001"'],['json-csv','[{"name":"=1+1","n":-12}]',"'=1+1"],
    ['csv-tsv','a,b\nx,y','a\tb'],['tsv-csv','a\tb\nx\ty','a,b'],['json-pretty','{"x":1}','\n  "x": 1'],
    ['json-minify','{ "x": 1 }','{"x":1}'],['json-yaml','{"名前":"田中"}','田中'],['yaml-json','名前: 田中','"名前": "田中"'],
    ['markdown-html','# 見出し\n\n**本文**','<strong>本文</strong>'],['html-text','<h1>見出し</h1><p>本文<br>次行</p>','本文\n次行'],
    ['base64-encode','日本語🌸','5pel5pys6Kqe8J+MuA=='],['base64-decode','5pel5pys6Kqe8J+MuA==','日本語🌸'],
    ['url-encode','日本語 & +','%E6%97%A5'],['url-decode','%E6%97%A5%E6%9C%AC%E8%AA%9E%20%26','日本語 &'],
  ];
  for(const [operation,text,expected]of examples){const result=await page.evaluate(async({text,operation})=>window.runData(text,operation),{text,operation});expect(result.error,operation).toBeUndefined();expect(result.text,operation).toContain(expected);expect(result.states.at(-1),operation).toBe('succeeded');expect(result.artifacts).toBe(1);expect(result.filename).toMatch(/\.(json|csv|tsv|yaml|html|txt)$/);}
});
test('unsafe markup is neither executed nor fetched or included in output',async({page})=>{
  const remote:string[]=[];page.on('request',request=>{if(request.url().startsWith('https://conversion-test.invalid'))remote.push(request.url());});
  const result=await page.evaluate(()=>window.runData('<img src="https://conversion-test.invalid/collect" srcset="https://conversion-test.invalid/retina 2x" onerror="window.bad=1"><script>window.bad=2</script><iframe src="https://conversion-test.invalid/frame"></iframe><style>@import url(https://conversion-test.invalid/css);body{background:url(https://conversion-test.invalid/bg)}</style><link rel="stylesheet" href="https://conversion-test.invalid/link"><div style="background-image:url(https://conversion-test.invalid/inline)">text</div><svg><image href="https://conversion-test.invalid/svg"/></svg>\n\n# safe','markdown-html'));
  expect(result.text).not.toMatch(/<img|<script|<iframe|onerror|window.bad/);
  const plain=await page.evaluate(()=>window.runData('<iframe src="https://conversion-test.invalid/frame-text"></iframe><img src="https://conversion-test.invalid/img-text"><p>safe</p>','html-text'));expect(plain.text).toBe('safe');
  await page.waitForTimeout(100);expect(await page.evaluate(()=>Reflect.get(window,'bad'))).toBeUndefined();expect(remote).toEqual([]);
});
test('invalid input fails without artifacts and a subsequent conversion succeeds',async({page})=>{
  const invalid=await page.evaluate(()=>window.runData('a,a\n1,2','csv-json'));expect(invalid.error?.code).toBe('INVALID_FILE');expect(invalid.artifacts).toBe(0);expect(invalid.states.at(-1)).toBe('failed');
  const valid=await page.evaluate(()=>window.runData('a,b\n1,2','csv-json'));expect(valid.states.at(-1)).toBe('succeeded');
});
test('Shift_JIS and pasted UTF8 are decoded explicitly',async({page})=>{
  const sjis=await page.evaluate(()=>window.runData('','csv-json',{bytes:[110,97,109,101,10,130,160],encoding:'shift-jis'}));expect(sjis.text).toContain('あ');
  const paste=await page.evaluate(()=>window.runData('日本語','base64-encode',{type:'text/plain;charset=utf-8',encoding:'shift-jis'}));expect(paste.text).toBe('5pel5pys6Kqe');
});
test('cancellation terminates work and emits no completed artifact',async({page})=>{
  const result=await page.evaluate(()=>window.runData('a'.repeat(2*1024*1024),'base64-encode',{cancel:true}));expect(result.artifacts).toBe(0);expect(result.states.at(-1)).toBe('cancelled');expect(result.error).toBeUndefined();
});

test('the real panel uses settings, safe source preview and correction',async({page})=>{
  await page.getByRole('button',{name:'変換する',exact:true}).click();
  await expect(page.getByLabel('変換結果のソース')).toHaveValue(/"001"/);
  await expect(page.locator('#data-encoding')).toBeDisabled();
  await page.getByRole('checkbox',{name:'先頭の行を見出しとして使う'}).uncheck();
  await expect(page.getByText('前回の設定で変換した結果です。',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'変換する',exact:true}).click();
  await expect(page.getByLabel('変換結果のソース')).toHaveValue(/^\[\n  \[/);
  await page.getByLabel('Test operation').selectOption('markdown-html');
  await page.getByLabel('Test input').fill('# 見出し\n\n<script>window.bad=3</script>');
  await page.getByRole('button',{name:'変換する',exact:true}).click();
  await expect(page.getByLabel('変換結果のソース')).toHaveValue(/<h1>見出し<\/h1>/);
  expect(await page.getByLabel('変換結果のソース').inputValue()).not.toContain('<script>');
});
