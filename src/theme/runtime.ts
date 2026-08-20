import type { ColorShape } from "../types"
import type { DefaultTheme } from "styled-components"
import { darkTheme } from "./index"

let activeTheme: DefaultTheme = darkTheme

export const setRuntimeTheme = (theme: DefaultTheme): void => {
  activeTheme = theme
}

export const getThemeColor = (name: keyof ColorShape): string =>
  activeTheme.color[name]
