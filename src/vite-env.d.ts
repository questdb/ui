/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly COMMIT_HASH: string
  readonly MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
