// 配信する第三者の許諾の文（public/licenses.txt）。縮めたコードには three.js・Rapier の許諾の文が残らないので、別のファイルで配る。
// 部品の版を上げたのに文を作り直し忘れる、本文が欠ける、を見張る。
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const text = readFileSync(new URL('../../public/licenses.txt', import.meta.url), 'utf8')
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { dependencies: Record<string, string> }

const threeLicense = readFileSync(new URL('../../node_modules/three/LICENSE', import.meta.url), 'utf8').trim()
const rapierLicense = readFileSync(new URL('../../node_modules/@dimforge/rapier3d-compat/LICENSE', import.meta.url), 'utf8').trim()

describe('public/licenses.txt', () => {
  it('インストールした three.js と Rapier の LICENSE の全文を、そのまま含む（条項の一部を消しても気づく）', () => {
    expect(text).toContain(threeLicense)
    expect(text).toContain(rapierLicense)
  })

  it('three.js と Rapier の版が package.json と一致する（部品を上げたら作り直す）', () => {
    expect(text).toContain(`1. three.js ${pkg.dependencies.three}（MIT License）`)
    expect(text).toContain(`2. Rapier（@dimforge/rapier3d-compat ${pkg.dependencies['@dimforge/rapier3d-compat']}）（Apache License 2.0）`)
  })

  it('MIT の本文と著作権表示を含む', () => {
    expect(text).toMatch(/Copyright © 2010-\d{4} three\.js authors/)
    expect(text).toContain('Permission is hereby granted, free of charge, to any person obtaining a copy')
    expect(text).toContain('THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND')
  })

  it('Apache License 2.0 の本文（条件と付録）を含む', () => {
    expect(text).toContain('Version 2.0, January 2004')
    expect(text).toContain('TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION')
    expect(text).toContain('END OF TERMS AND CONDITIONS')
  })

  it('Kenney の CC0 の謝意とライセンスの住所を含む', () => {
    expect(text).toContain('Kenney')
    expect(text).toContain('CC0 1.0')
    expect(text).toContain('https://creativecommons.org/publicdomain/zero/1.0/legalcode')
  })
})
