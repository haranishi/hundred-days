import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkDistribution, validateContent } from '../../tools/check-release.mjs'
import { embeddedNotices, fiberLicense, policyFor, sha256, validateEmbeddedNotices, validateMitText, validatePackageMetadata, viteCoreLicense } from '../../tools/license-policy.mjs'

const license = readFileSync(new URL('../../tools/licenses/react-three-fiber-9.8.0.LICENSE.txt', import.meta.url), 'utf8')
const temporary: string[] = []
afterEach(() => { for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true }) })

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'kumimae-release-test-'))
  temporary.push(directory)
  mkdirSync(join(directory, 'assets'))
  mkdirSync(join(directory, 'legal'))
  const generated = [
    ['index.html', '<!doctype html><script type="module" src="./assets/app-ok.js"></script>'],
    ['assets/app-ok.js', 'document.body.dataset.ready = "true";'],
    ['assets/app-ok.css', 'body { color: white; }'],
  ]
  for (const [file, content] of generated) writeFileSync(join(directory, file!), content!)
  writeFileSync(join(directory, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  writeFileSync(join(directory, 'legal/THIRD_PARTY_NOTICES.txt'), license)
  writeFileSync(join(directory, 'legal/data-and-rights.html'), '<!doctype html><title>利用データと権利</title>')
  const manifest = {
    schemaVersion: 1,
    noticeSha256: sha256(license),
    generatedFiles: generated.map(([file, content]) => ({ file, sha256: sha256(content!) })),
    packages: [{ name: 'react', version: '19.3.0', license: 'MIT', licenses: [{ source: 'node_modules/react/LICENSE' }] }],
  }
  writeFileSync(join(directory, 'legal/THIRD_PARTY_MANIFEST.json'), JSON.stringify(manifest))
  return directory
}

describe('actual upstream notices remain complete', () => {
  it('preserves the pinned official Fiber license and provenance hash', () => {
    expect(sha256(license)).toBe(fiberLicense.sha256)
    expect(fiberLicense.source).toContain('/7db6056f80f11db3ba97038429eb935514f8b4d1/LICENSE')
    expect(validateMitText(license, 'upstream')).toBe(license)
  })

  it('rejects missing retention conditions and truncated warranty text', () => {
    expect(() => validateMitText(license.replace(/The above copyright notice[\s\S]*?Software\.\n/, ''), 'fixture')).toThrow('notice-retention')
    expect(() => validateMitText(license.slice(0, license.indexOf('OUT OF OR')), 'fixture')).toThrow('Truncated')
  })

  it('rejects unreviewed packages, changed licenses and changes to the pinned release', () => {
    expect(() => policyFor('unreviewed-runtime')).toThrow('Unreviewed')
    const pkg = { name: '@react-three/fiber', version: '9.8.0', license: 'MIT' }
    const locked = { version: '9.8.0', license: 'MIT', integrity: 'sha512-fixture' }
    expect(() => validatePackageMetadata(pkg, locked, pkg.name)).not.toThrow()
    expect(() => validatePackageMetadata(pkg, { ...locked, license: 'ISC' }, pkg.name)).toThrow('license')
    expect(() => validatePackageMetadata({ ...pkg, version: '9.9.0' }, { ...locked, version: '9.9.0' }, pkg.name)).toThrow('version changed')
    expect(() => validatePackageMetadata(pkg, { ...locked, version: '9.7.0' }, pkg.name)).toThrow('version mismatch')
  })

  it('retains embedded copyrights and stops on additional terms', () => {
    const comments = embeddedNotices('/* @license MIT\nCopyright Fixture */\n// SPDX-License-Identifier: Apache-2.0\n// Copyright Fixture\nconst n = 1;')
    expect(comments).toHaveLength(2)
    expect(() => validateEmbeddedNotices(comments, 'fixture')).toThrow('Additional source license')
  })

  it('includes Vite browser helper permission without treating server dependencies as distributed', () => {
    const source = `# Vite core license\n\n${license}\n# Licenses of bundled dependencies\nSERVER_ONLY`
    expect(viteCoreLicense(source)).toContain('Permission is hereby granted')
    expect(viteCoreLicense(source)).not.toContain('SERVER_ONLY')
    expect(() => viteCoreLicense(license)).toThrow('structure changed')
  })
})

describe('release fails closed before copying files', () => {
  it('accepts only the complete audited artifact set', () => {
    expect(checkDistribution(fixture())).toMatchObject({ packages: 1 })
  })

  it('rejects a GLB or an unknown public file', () => {
    const directory = fixture()
    writeFileSync(join(directory, 'assets/model.glb'), 'glTF')
    expect(() => checkDistribution(directory)).toThrow('Unknown asset type')
    rmSync(join(directory, 'assets/model.glb'))
    writeFileSync(join(directory, 'private.json'), '{}')
    expect(() => checkDistribution(directory)).toThrow('Unknown top-level')
  })

  it('rejects altered notices and application code after the notice audit', () => {
    const directory = fixture()
    writeFileSync(join(directory, 'legal/THIRD_PARTY_NOTICES.txt'), 'MIT')
    expect(() => checkDistribution(directory)).toThrow('notice hash mismatch')
    writeFileSync(join(directory, 'legal/THIRD_PARTY_NOTICES.txt'), license)
    writeFileSync(join(directory, 'assets/app-ok.js'), 'console.log("changed")')
    expect(() => checkDistribution(directory)).toThrow('graph/output mismatch')
  })

  it('rejects symlinks and missing rights documents', () => {
    const directory = fixture()
    rmSync(join(directory, 'legal/data-and-rights.html'))
    expect(() => checkDistribution(directory)).toThrow('legal document')
    symlinkSync(fileURLToPath(import.meta.url), join(directory, 'legal/data-and-rights.html'))
    expect(() => checkDistribution(directory)).toThrow('Symbolic link')
  })

  it('detects root-relative assets, private paths and restricted benchmark/price sources', () => {
    expect(() => validateContent('import("/assets/bundle.js")', 'assets/main.js')).toThrow('Root-relative')
    expect(() => validateContent('body{background:url(/photo.png)}', 'assets/main.css')).toThrow('Root-relative')
    expect(() => validateContent(['', 'Users', 'fixture', 'private.txt'].join('/'), 'index.html')).toThrow('Private filesystem')
    expect(() => validateContent('const source="https://kakaku.com/";', 'assets/main.js')).toThrow('Unapproved')
    expect(() => validateContent('const source="benchmarks.json";', 'assets/main.js')).toThrow('Unapproved')
    expect(() => validateContent('const source="sample.glb";', 'assets/main.js')).toThrow('model/photo')
  })

  it('allows the shared 100days share controls and home navigation', () => {
    expect(() => validateContent('<a href="/">Home</a><script src="/shared/share.js"></script><link href="/shared/share.css" rel="stylesheet">', 'index.html')).not.toThrow()
  })

  it('only accepts shared files identical to the site source', () => {
    const directory = fixture()
    mkdirSync(join(directory, 'shared'))
    for (const name of ['share.css', 'share.js']) {
      const source = new URL(`../../../../shared/${name}`, import.meta.url)
      writeFileSync(join(directory, 'shared', name), readFileSync(source))
    }
    expect(checkDistribution(directory).files.every((file) => !file.startsWith('shared/'))).toBe(true)
    writeFileSync(join(directory, 'shared/share.js'), 'console.log("changed")')
    expect(() => checkDistribution(directory)).toThrow('Shared controls differ')
  })
})
