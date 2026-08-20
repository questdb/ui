import { loader } from "@monaco-editor/react"
import { createDraculaTheme } from "../scenes/Editor/Monaco/dracula"
import { registerLanguageAddons } from "../scenes/Editor/Monaco/editor-addons"
import { darkTheme, lightTheme } from "../theme"
import type { ThemeMode } from "../types"

loader.config({
  paths: {
    vs: "assets/vs",
  },
})

const MONACO_THEME_NAMES: Record<ThemeMode, string> = {
  dark: "questdb-dark",
  light: "questdb-light",
}

export const getMonacoThemeName = (mode: ThemeMode) => MONACO_THEME_NAMES[mode]

export const ensureMonacoThemes = (monaco: typeof import("monaco-editor")) => {
  monaco.editor.defineTheme(
    MONACO_THEME_NAMES.dark,
    createDraculaTheme(darkTheme.color, "dark"),
  )
  monaco.editor.defineTheme(
    MONACO_THEME_NAMES.light,
    createDraculaTheme(lightTheme.color, "light"),
  )
}

export const applyMonacoTheme = (
  monaco: typeof import("monaco-editor"),
  mode: ThemeMode,
) => monaco.editor.setTheme(getMonacoThemeName(mode))

// Register both immutable themes before any editor mounts. Redefining one
// shared theme name while editors are mounting makes Monaco fall back to its
// built-in token colors until the next setTheme call.
export const monacoPromise = loader.init().then((monaco) => {
  registerLanguageAddons(monaco)
  ensureMonacoThemes(monaco)
  applyMonacoTheme(monaco, "dark")

  return monaco
})
