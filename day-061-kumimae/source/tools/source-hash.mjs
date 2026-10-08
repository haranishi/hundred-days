import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
export function sourceHash(source) {
  const hash = createHash('sha256')
  const files = []
  function walk(relative) {
    if (relative === 'public/shared') return
    const path = join(source, relative)
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) throw new Error(`Unexpected source symlink: ${relative}`)
    if (stat.isDirectory()) { for (const file of readdirSync(path).sort()) walk(`${relative}/${file}`) }
    else files.push(relative)
  }
  for (const entry of ['src','tools','public','package.json','package-lock.json','vite.config.ts','index.html','tsconfig.json','tsconfig.app.json','tsconfig.node.json']) walk(entry)
  for (const file of files.sort()) { hash.update(file); hash.update('\0'); hash.update(readFileSync(join(source,file))); hash.update('\0') }
  return { sha256: hash.digest('hex'), files: files.length }
}
