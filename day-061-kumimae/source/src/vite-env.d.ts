/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" のとき本番ビルドでもテストの窓口 window.__kumimae を出す（E2E 用） */
  readonly VITE_TEST_HOOK?: string
}
