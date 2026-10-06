import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const noticePath = resolve(projectRoot, 'public/legal/THIRD_PARTY_NOTICES.txt')

// 見出しのアプリ名は src/appName.ts の APP_NAME だけから取る（名前を変えても、ここを書き換えなくて済むように）
async function appName() {
  const source = await readFile(resolve(projectRoot, 'src/appName.ts'), 'utf8')
  const found = source.match(/export const APP_NAME = '([^']+)'/)
  invariant(found, 'src/appName.ts に APP_NAME が見つからない')
  return found[1]
}

// This is an audited distribution policy, not a list of every installed tool.
// New browser dependencies/virtual helpers fail until their actual notices are reviewed.
const policies = new Map([
  ['react', { files: ['LICENSE'], scope: 'React browser runtime and JSX runtime.' }],
  ['react-dom', { files: ['LICENSE'], scope: 'React DOM browser rendering runtime, including its embedded source notices.' }],
  ['scheduler', { files: ['LICENSE'], scope: 'Scheduling runtime included by React DOM.' }],
  ['zustand', { files: ['LICENSE'], scope: 'Browser state stores and React bindings.' }],
  ['fix-webm-duration', { files: ['LICENSE'], scope: 'Lazy-loaded browser code for WebM duration correction.' }],
  ['tailwindcss', { files: ['LICENSE'], scope: 'Generated CSS, including the base reset and theme/utilities. The compiler is not distributed.' }],
  ['vite', { files: ['LICENSE.md'], scope: 'Only browser modulepreload and dynamic-import preload helpers. Vite server/build dependencies are not included here.' }],
  ['rolldown', { files: ['LICENSE', 'THIRD-PARTY-LICENSE'], scope: 'Generated browser module-interoperability runtime. Upstream third-party notices are retained; complete Rollup/esbuild tools are not distributed.' }],
])

const virtualOwners = new Map([
  ['\0vite/modulepreload-polyfill.js', 'vite'],
  ['\0vite/preload-helper.js', 'vite'],
  ['\0rolldown/runtime.js', 'rolldown'],
])

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

export function policyFor(name) {
  const policy = policies.get(name)
  invariant(policy, `Unreviewed distributed package: ${name}. Review its license and add a distribution policy first.`)
  return policy
}

export function validatePackageMetadata(pkg, locked, expectedName) {
  policyFor(expectedName)
  invariant(pkg.name === expectedName, `Package identity mismatch: ${expectedName}.`)
  invariant(typeof pkg.version === 'string' && pkg.version.length > 0, `Missing installed version: ${expectedName}.`)
  invariant(locked?.version === pkg.version, `Installed/lock version mismatch: ${expectedName}. Run the project dependency installation first.`)
  invariant(pkg.license === 'MIT' && locked.license === 'MIT', `Unknown or changed license: ${expectedName}. Review the actual license before distribution.`)
}

export function validateMitText(text, source) {
  invariant(/\bMIT licen[cs]e\b|\bMIT License\b/i.test(text), `Missing MIT license title: ${source}.`)
  invariant(/^Copyright\s+.+\S/im.test(text), `Missing copyright notice: ${source}.`)
  invariant(/Permission is hereby granted,[\s\S]*?without restriction/i.test(text), `Missing permission grant: ${source}.`)
  invariant(/The above copyright notice and this permission notice shall be included/i.test(text), `Missing notice-retention condition: ${source}.`)
  invariant(/THE SOFTWARE IS PROVIDED "AS IS"/.test(text), `Missing warranty disclaimer: ${source}.`)
  invariant(/OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN\s+(?:THE\s+)?SOFTWARE\./.test(text), `Truncated MIT license: ${source}.`)
  return text
}

export function viteCoreLicense(text) {
  const boundary = '\n# Licenses of bundled dependencies\n'
  const offset = text.indexOf(boundary)
  invariant(text.startsWith('# Vite core license\n') && offset > 0, 'Vite LICENSE.md structure changed. Re-review the browser helper license.')
  // The entire upstream core license section is preserved. The following section
  // applies to packages bundled into the Vite build tool, not this browser app.
  return text.slice(0, offset)
}

function displayPath(path) {
  return relative(projectRoot, path).split(sep).join('/')
}

async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function packageForModule(id) {
  const filename = id.split('?')[0]
  invariant(isAbsolute(filename), `Unrecognized module path: ${id}.`)
  let directory = dirname(filename)
  while (directory !== projectRoot && directory !== dirname(directory)) {
    try {
      const pkg = await json(resolve(directory, 'package.json'))
      if (pkg.name) return { root: directory, pkg }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    directory = dirname(directory)
  }
  throw new Error(`No package metadata for distributed module: ${displayPath(filename)}.`)
}

function embeddedNotices(source) {
  return [...source.matchAll(/\/\*[\s\S]*?\*\//g)]
    .map((match) => match[0])
    .filter((comment) => /@license|copyright|\bMIT\b|\blicense(?:d)?\b|\bBSD\b|\bApache\b/i.test(comment))
}

export async function generateNotices() {
  const lock = await json(resolve(projectRoot, 'package-lock.json'))
  invariant(lock.lockfileVersion >= 2 && lock.packages, 'A package-lock.json with package records is required.')
  const packages = new Map()

  async function registerPackage(root, pkg) {
    const policy = policyFor(pkg.name)
    const lockPath = displayPath(root)
    validatePackageMetadata(pkg, lock.packages[lockPath], pkg.name)
    const entryId = `${pkg.name}@${pkg.version}:${lockPath}`
    if (!packages.has(entryId)) {
      const licenseFiles = (await readdir(root)).filter((name) => /^(?:licen[cs]e|copying|notice|third[-_ ]?party)/i.test(name))
      invariant(licenseFiles.every((name) => policy.files.includes(name)), `Additional upstream license/notice files need review: ${pkg.name}.`)
      packages.set(entryId, { root, pkg, policy, modules: new Set(), embedded: new Map() })
    }
    return packages.get(entryId)
  }

  async function registerTool(name, module) {
    const root = resolve(projectRoot, 'node_modules', name)
    const entry = await registerPackage(root, await json(resolve(root, 'package.json')))
    entry.modules.add(module)
    return entry
  }

  // Inspect the actual production module graph (including dynamic imports).
  // write:false neither replaces dist nor publishes anything. npm lifecycle
  // scripts are not invoked by Vite's API, so prebuild cannot recurse.
  const { build } = await import('vite')
  const result = await build({
    root: projectRoot,
    configFile: resolve(projectRoot, 'vite.config.ts'),
    logLevel: 'error',
    build: { write: false, watch: null },
  })
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((bundle) => bundle.output ?? [])
  invariant(outputs.some((item) => item.type === 'chunk'), 'No production JavaScript output found.')
  const emittedFiles = new Set(outputs.map((item) => item.fileName))

  for (const output of outputs) {
    if (output.type === 'asset' && output.fileName.endsWith('.css')) {
      const css = typeof output.source === 'string' ? output.source : Buffer.from(output.source).toString('utf8')
      const tailwind = css.match(/\/\*! tailwindcss v([^ |]+) \| MIT License \| https:\/\/tailwindcss\.com \*\//)
      if (tailwind) {
        const entry = await registerTool('tailwindcss', 'Generated CSS (Tailwind base, theme and utility rules)')
        invariant(tailwind[1] === entry.pkg.version, 'Tailwind CSS banner/installed version mismatch.')
      }
      continue
    }
    if (output.type !== 'chunk') continue
    for (const imported of [...output.imports, ...output.dynamicImports]) {
      invariant(emittedFiles.has(imported), 'An external browser import is outside the audited distribution. Review the bundle import graph.')
    }
    for (const [id, metadata] of Object.entries(output.modules)) {
      if (!metadata.renderedLength) continue
      if (id.startsWith('\0')) {
        const owner = virtualOwners.get(id)
        invariant(owner, `Unreviewed generated browser helper: ${JSON.stringify(id)}.`)
        await registerTool(owner, id.slice(1))
        continue
      }
      if (!id.split(sep).includes('node_modules')) continue
      const { root, pkg } = await packageForModule(id)
      const entry = await registerPackage(root, pkg)
      const modulePath = relative(root, id.split('?')[0]).split(sep).join('/')
      entry.modules.add(modulePath)
      const notices = embeddedNotices(await readFile(id.split('?')[0], 'utf8'))
      invariant(notices.every((notice) => !/\b(?:AGPL|LGPL|GPL|Apache|BSD|ISC|MPL|CC0|Unlicense|Zlib)\b/i.test(notice)), `Additional source license terms need review: ${pkg.name}/${modulePath}.`)
      if (notices.length) entry.embedded.set(modulePath, notices)
    }
  }

  // This app imports Tailwind in its entry stylesheet. Fail rather than silently
  // omit generated CSS if an upstream change removes/changes the attribution banner.
  const entryCss = await readFile(resolve(projectRoot, 'src/index.css'), 'utf8')
  if (/@import\s+["']tailwindcss(?:["'/])/.test(entryCss)) {
    invariant([...packages.values()].some((entry) => entry.pkg.name === 'tailwindcss'), 'Tailwind CSS attribution banner was not detected; review CSS output.')
  }

  const ordered = [...packages.values()].sort((a, b) => a.pkg.name.localeCompare(b.pkg.name) || a.pkg.version.localeCompare(b.pkg.version))
  const parts = [
    `${await appName()} — Third-Party Software Notices`,
    '',
    'Generated from the installed packages, package-lock.json and the production browser module graph.',
    'Versions below describe the distributed code, not dependency version ranges.',
    'This file preserves third-party copyright, permission and disclaimer text.',
    'It does not license the application code, sample artwork, or user-provided media.',
    'Development/test/server-only packages are not listed merely because they are installed.',
    '',
    'Included packages:',
    ...ordered.map(({ pkg }) => `- ${pkg.name} ${pkg.version} (${pkg.license})`),
    '',
  ]

  for (const entry of ordered) {
    const { pkg, root, policy } = entry
    parts.push('='.repeat(78), `${pkg.name} — ${pkg.version}`, `License: ${pkg.license}`, `Scope: ${policy.scope}`, 'Distributed modules/parts:', ...[...entry.modules].sort().map((module) => `  - ${module}`), '')
    for (const filename of policy.files) {
      let text = await readFile(resolve(root, filename), 'utf8')
      const source = `${displayPath(root)}/${filename}`
      if (pkg.name === 'vite') text = viteCoreLicense(text)
      if (filename === 'THIRD-PARTY-LICENSE') {
        for (const section of text.split(/\r?\n---\r?\n/)) validateMitText(section, source)
      } else validateMitText(text, source)
      parts.push(`--- Upstream license text: ${source} ---`, text, '')
    }
    for (const [module, notices] of [...entry.embedded].sort(([a], [b]) => a.localeCompare(b))) {
      parts.push(`--- Additional notices preserved from ${pkg.name}/${module} ---`, ...notices, '')
    }
  }
  return { content: `${parts.join('\n')}\n`, packages: ordered.map(({ pkg }) => `${pkg.name}@${pkg.version}`) }
}

async function main() {
  const args = process.argv.slice(2)
  invariant(args.every((argument) => argument === '--check'), 'Usage: node tools/generate-notices.mjs [--check]')
  const { content, packages } = await generateNotices()
  if (args.includes('--check')) {
    invariant(await readFile(noticePath, 'utf8') === content, 'THIRD_PARTY_NOTICES.txt is stale. Run node tools/generate-notices.mjs.')
    console.log(`Third-party notices are current (${packages.length} distributed packages).`)
    return
  }
  await mkdir(dirname(noticePath), { recursive: true })
  await writeFile(noticePath, content, 'utf8')
  console.log(`Generated public/legal/THIRD_PARTY_NOTICES.txt (${packages.length} distributed packages).`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Third-party notice generation failed: ${error.message}`)
    process.exitCode = 1
  })
}
