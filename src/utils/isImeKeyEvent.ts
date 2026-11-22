import type React from "react"

// WebKit may dispatch the candidate-confirmation Enter after compositionend,
// with isComposing false but keyCode 229.
export const isImeKeyEvent = (event: React.KeyboardEvent): boolean =>
  event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229
