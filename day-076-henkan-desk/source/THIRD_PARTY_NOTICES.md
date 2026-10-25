# Third-party notices

The browser distribution includes the following components. License texts are shipped in public/licenses/.

| Component | License text |
|---|---|
| React | [MIT](public/licenses/react.txt) |
| React DOM | [MIT](public/licenses/react-dom.txt) |
| Scheduler | [MIT](public/licenses/scheduler.txt) |
| jSquash WebP | [Apache-2.0](public/licenses/jsquash-webp.txt) |
| libwebp codec | [Codec license](public/licenses/libwebp.txt) |
| wasm-feature-detect | [Apache-2.0](public/licenses/wasm-feature-detect.txt) |

| pdf-lib | [MIT](public/licenses/pdf-lib.txt) |
| pdfjs-dist | [Apache-2.0](public/licenses/pdfjs-dist.txt) |
| fflate | [MIT](public/licenses/fflate.txt) |
| papaparse | [MIT](public/licenses/papaparse.txt) |
| yaml | [ISC](public/licenses/yaml.txt) |
| marked | [MIT](public/licenses/marked.txt) |
| dompurify | [MPL-2.0 OR Apache-2.0](public/licenses/dompurify.txt) |
| pdf-lib-standard-fonts | [MIT](public/licenses/pdf-lib-standard-fonts.txt) |
| pdf-lib-upng | [MIT](public/licenses/pdf-lib-upng.txt) |
| pako | [MIT AND Zlib](public/licenses/pako.txt) |
| tslib | [0BSD](public/licenses/tslib.txt) |

PDF.js 6.4.299 display API is locally modified (2026-10-25) by scripts/patch-pdfjs.mjs to reject incomplete operator lists before completion.
PDF.js font, CMap, ICC and WASM notices are retained alongside the files in public/pdf-assets/.

The server uses Fastify and its plugins, yauzl and sax. The engine container retains the license materials for Gotenberg, LibreOffice, qpdf and its fonts.
No user-provided files are included in this repository.

PDF.js standard-font assets use unmodified Liberation Sans 2.1.5 (SIL OFL 1.1), replacing the older GPL font binaries.
Font LICENSE_OFL, LIBERATION_AUTHORS and LIBERATION_PROVENANCE.md are shipped in public/pdf-assets/standard_fonts/.
PDF.js CMaps, Foxit fonts, ICC and WASM components retain their individual notices alongside the files.
The modified PDF.js display module retains its modification notice in the production bundle.
