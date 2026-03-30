/// <reference types="vite/client" />

type ImportMetaEnv = {
  readonly COMMIT_HASH: string
  readonly CONSOLE_VERSION: string
  readonly MODE: string
}

type ImportMeta = {
  readonly env: ImportMetaEnv
}
