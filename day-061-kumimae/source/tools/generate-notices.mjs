import { readFile, readdir, realpath, mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { embeddedNotices, fiberLicense, invariant, policyFor, sha256, validateEmbeddedNotices, validateMitText, validatePackageMetadata, virtualOwners, viteCoreLicense } from './license-policy.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const legalRoot = resolve(projectRoot, 'public/legal')
const unixPath = (path) => path.split(sep).join('/')
const json = async (path) => JSON.parse(await readFile(path, 'utf8'))
const noticeNames = (names) => names.filter((name) => /^(?:licen[cs]e|copying|notice|third[-_ ]?party)/i.test(name))

async function packageForModule(filename) {
  invariant(isAbsolute(filename), 'Unrecognized module path in browser graph.')
  let directory = dirname(filename)
  while (directory !== dirname(directory)) {
    try {
      const pkg = await json(resolve(directory, 'package.json'))
      if (pkg.name) return { root: directory, pkg }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    directory = dirname(directory)
  }
  throw new Error('No package metadata for a distributed module.')
}

export async function generateNotices() {
  const lock = await json(resolve(projectRoot, 'package-lock.json'))
  invariant(lock.lockfileVersion >= 2 && lock.packages, 'package-lock.json package records are required.')
  const modulesRoot = await realpath(resolve(projectRoot, 'node_modules'))
  const packages = new Map()
  const inspectedDirectories = new Set()

  async function registerPackage(root, pkg) {
    root = await realpath(root)
    const within = unixPath(relative(modulesRoot, root))
    invariant(within && !within.startsWith('../') && !isAbsolute(within), 'A browser package is outside the project installation.')
    const lockPath = `node_modules/${within}`
    const policy = policyFor(pkg.name)
    validatePackageMetadata(pkg, lock.packages[lockPath], pkg.name)
    if (!packages.has(lockPath)) {
      const found = noticeNames(await readdir(root)).sort()
      invariant(found.join() === [...policy.files].sort().join(), `Changed package license/notice files need review: ${pkg.name}.`)
      packages.set(lockPath, { root, pkg, policy, lockPath, modules: new Map(), embedded: new Map(), licenses: [] })
    }
    return packages.get(lockPath)
  }

  async function registerTool(name, module) {
    const root = resolve(projectRoot, 'node_modules', name)
    const entry = await registerPackage(root, await json(resolve(root, 'package.json')))
    entry.modules.set(module, null)
  }

  // The production graph includes dynamic chunks and generated browser helpers.
  // write:false leaves dist untouched and does not execute npm lifecycle scripts.
  const { build } = await import('vite')
  const result = await build({ root: projectRoot, configFile: resolve(projectRoot, 'vite.config.ts'), logLevel: 'error', build: { write: false, watch: null } })
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((bundle) => bundle.output ?? [])
  invariant(outputs.some((item) => item.type === 'chunk'), 'No production JavaScript output found.')
  const emittedFiles = new Set(outputs.map((item) => item.fileName))

  for (const output of outputs) {
    if (output.type !== 'chunk') continue
    for (const imported of [...output.imports, ...output.dynamicImports]) {
      invariant(emittedFiles.has(imported), 'External browser import outside the audited distribution.')
    }
    for (const [id, metadata] of Object.entries(output.modules)) {
      if (!metadata.renderedLength) continue
      if (id.startsWith('\0')) {
        const owner = virtualOwners.get(id)
        invariant(owner, 'Unreviewed generated browser helper. Review the module graph.')
        await registerTool(owner, id.slice(1))
        continue
      }
      const filename = id.split('?')[0]
      if (!filename.split(sep).includes('node_modules')) continue
      const { root, pkg } = await packageForModule(filename)
      const entry = await registerPackage(root, pkg)
      const modulePath = unixPath(relative(entry.root, filename))
      const source = await readFile(filename, 'utf8')
      entry.modules.set(modulePath, sha256(source))
      const notices = embeddedNotices(source)
      validateEmbeddedNotices(notices, `${pkg.name}/${modulePath}`)
      if (notices.length) entry.embedded.set(modulePath, notices)
      // A root MIT declaration must not silently override a nested NOTICE/LICENSE.
      for (let directory = dirname(filename); directory !== entry.root && !inspectedDirectories.has(directory); directory = dirname(directory)) {
        invariant(directory !== dirname(directory), 'Package/module directory mismatch.')
        inspectedDirectories.add(directory)
        invariant(noticeNames(await readdir(directory)).length === 0, `Nested license/notice needs review: ${pkg.name}/${modulePath}.`)
      }
    }
  }

  const ordered = [...packages.values()].sort((a, b) => a.pkg.name.localeCompare(b.pkg.name) || a.lockPath.localeCompare(b.lockPath))
  const parts = ['くみまえ — Third-Party Software Notices', '', 'Generated from package-lock.json, installed package files and the production browser module graph.', 'Versions describe distributed code. Development/server-only packages are not listed merely because they are installed.', 'Copyright, permission and disclaimer text is preserved below. This file does not license the application or its input data.', '', 'Included packages:', ...ordered.map(({ pkg }) => `- ${pkg.name} ${pkg.version} (${pkg.license})`), '']

  for (const entry of ordered) {
    const { pkg, root, policy, lockPath } = entry
    parts.push('='.repeat(78), `${pkg.name} — ${pkg.version}`, `License: ${pkg.license}`, `Scope: ${policy.scope}`, 'Distributed modules/parts:', ...[...entry.modules.keys()].sort().map((module) => `  - ${module}`), '')
    const licenses = policy.files.map((file) => ({ path: resolve(root, file), source: `${lockPath}/${file}`, file }))
    if (pkg.name === '@react-three/fiber') licenses.push({ path: resolve(projectRoot, fiberLicense.file), source: fiberLicense.source, file: 'LICENSE (official release commit)', expectedHash: fiberLicense.sha256 })
    for (const license of licenses) {
      let content = await readFile(license.path, 'utf8')
      const originalHash = sha256(content)
      if (license.expectedHash) invariant(originalHash === license.expectedHash, 'Vendored React Three Fiber license hash mismatch.')
      if (pkg.name === 'vite') content = viteCoreLicense(content)
      if (license.file === 'THIRD-PARTY-LICENSE') {
        for (const section of content.split(/\r?\n---\r?\n/)) validateMitText(section, license.source)
      } else validateMitText(content, license.source)
      entry.licenses.push({ source: license.source, sourceSha256: originalHash, includedSha256: sha256(content) })
      parts.push(`--- Upstream license text: ${license.source} ---`, content, '')
    }
    for (const [module, notices] of [...entry.embedded].sort(([a], [b]) => a.localeCompare(b))) parts.push(`--- Source notices retained from ${pkg.name}/${module} ---`, ...notices, '')
  }

  const content = `${parts.join('\n')}\n`
  const manifest = {
    schemaVersion: 1,
    scope: 'Production browser modules, generated helpers and their upstream notices.',
    noticeSha256: sha256(content),
    fiberLicenseProvenance: fiberLicense,
    generatedFiles: outputs.map((output) => ({ file: output.fileName, sha256: sha256(output.type === 'chunk' ? output.code : output.source) })).sort((a, b) => a.file.localeCompare(b.file)),
    packages: ordered.map(({ pkg, lockPath, policy, modules, licenses, embedded }) => ({
      name: pkg.name, version: pkg.version, license: pkg.license, lockPath, integrity: lock.packages[lockPath].integrity, scope: policy.scope, licenses,
      modules: [...modules].sort(([a], [b]) => a.localeCompare(b)).map(([file, hash]) => ({ file, ...(hash ? { sha256: hash } : {}) })),
      embeddedNotices: [...embedded].sort(([a], [b]) => a.localeCompare(b)).map(([file, notices]) => ({ file, sha256: sha256(notices.join('\n')) })),
    })),
  }
  return { content, manifest: `${JSON.stringify(manifest, null, 2)}\n`, packages: ordered.map(({ pkg }) => `${pkg.name}@${pkg.version}`) }
}

async function main() {
  const args = process.argv.slice(2)
  invariant(args.every((argument) => argument === '--check'), 'Usage: node tools/generate-notices.mjs [--check]')
  const result = await generateNotices()
  const files = [['THIRD_PARTY_NOTICES.txt', result.content], ['THIRD_PARTY_MANIFEST.json', result.manifest]]
  if (args.includes('--check')) {
    for (const [name, content] of files) invariant(await readFile(resolve(legalRoot, name), 'utf8') === content, `${name} is stale. Run npm run notices.`)
    console.log(`Third-party notices match the production graph (${result.packages.length} packages).`)
  } else {
    await mkdir(legalRoot, { recursive: true })
    for (const [name, content] of files) await writeFile(resolve(legalRoot, name), content, 'utf8')
    console.log(`Generated readable notices and manifest (${result.packages.length} packages).`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(`Notice generation failed: ${error.message}`); process.exitCode = 1 })
