import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
// Called explicitly after verification, never from generation (metadata is timeless).
export function completeTask(id, description, result, remaining='なし') {
  const path='.kiro/specs/mountain-world/tasks.md';
  writeFileSync(path,readFileSync(path,'utf8').replace(`- [ ] ${id} `,`- [x] ${id} `));
  appendFileSync('.agent-harness/runs/impl/I1_progress.md',`\n## ${id}\n- 実施: ${description}\n- 検証: ${result}\n- 残件: ${remaining}\n`);
}
