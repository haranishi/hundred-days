// 固定ソースから静的な公開物だけを更新する。source/toolsは配信しない。
import {execFileSync} from 'node:child_process';
import {cpSync,existsSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const day=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=join(day,'source');
execFileSync('npm',['run','build'],{cwd:source,stdio:'inherit'});
for(const name of ['assets','fonts'])rmSync(join(day,name),{recursive:true,force:true});
for(const name of readdirSync(join(source,'dist')))cpSync(join(source,'dist',name),join(day,name),{recursive:true});
const html=join(day,'index.html');let text=readFileSync(html,'utf8');
text=text.replace('</head>','<link rel="stylesheet" href="./shared/share.css"><script defer src="./shared/share.js"></script></head>');
text=text.replace('</body>','<footer id="share" class="day80-share-footer"></footer></body>');
writeFileSync(html,text);
const root=resolve(day,'..');mkdirSync(join(day,'shared'),{recursive:true});
for(const name of readdirSync(join(root,'shared')).filter(n=>/\.(css|js)$/.test(n)))cpSync(join(root,'shared',name),join(day,'shared',name));
console.log('Day80 static release generated.');
