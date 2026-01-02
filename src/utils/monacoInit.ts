import { loader } from "@monaco-editor/react"
import dracula from "../scenes/Editor/Monaco/dracula"
import { registerLanguageAddons } from "../scenes/Editor/Monaco/editor-addons"

loader.config({
  paths: {
    vs: "assets/vs",
  },
})

// This runs once at app startup, before any editor mounts
export const monacoPromise = loader.init().then((monaco) => {
  registerLanguageAddons(monaco)

  monaco.editor.defineTheme("dracula", dracula)
  monaco.editor.setTheme("dracula")

  return monaco
})
