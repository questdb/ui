import type { editor } from "monaco-editor"
import {
  createSvgElement,
  createAIGutterIcon,
  type GutterIconState,
} from "./icons"

export type GlyphWidgetOptions = {
  isCancel: boolean
  hasError: boolean
  isSuccessful: boolean
  showAI?: boolean
  hasConversation: boolean
  isHighlighted: boolean
  onRunClick: () => void
  onRunContextMenu: () => void
  onAIClick: () => void
}

export const createGlyphWidgetId = (
  lineNumber: number,
  options: GlyphWidgetOptions,
): string => {
  const {
    isCancel,
    hasError,
    isSuccessful,
    showAI,
    hasConversation,
    isHighlighted,
  } = options
  const optionsId = [
    isCancel,
    hasError,
    isSuccessful,
    showAI,
    hasConversation,
    isHighlighted,
  ]
    .map((val) => (val ? "1" : "0"))
    .join("")
  return `glyph-widget-${lineNumber}-${optionsId}`
}

/**
 * Creates a glyph margin widget for a specific line in the Monaco editor.
 * The widget contains an optional AI sparkle icon and a run/cancel button,
 * each with independent hover effects and click handlers.
 */
export const createGlyphWidget = (
  lineNumber: number,
  options: GlyphWidgetOptions,
): editor.IGlyphMarginWidget => {
  const domNode = document.createElement("div")
  domNode.className = "glyph-widget-container"
  domNode.classList.add(`glyph-widget-${lineNumber}`)

  if (options.showAI) {
    let baseState: GutterIconState = options.hasConversation
      ? "active"
      : "noChat"
    if (options.isHighlighted) {
      baseState = "highlight"
    }

    const aiIconWrapper = createAIGutterIcon(baseState, 16)
    aiIconWrapper.classList.add("glyph-ai-icon")

    if (options.isHighlighted) {
      setTimeout(() => {
        aiIconWrapper.classList.remove("highlight")
        aiIconWrapper.classList.add("active")
      }, 1000)
    }

    aiIconWrapper.addEventListener("click", (e) => {
      e.stopPropagation()
      options.onAIClick?.()
    })

    domNode.appendChild(aiIconWrapper)
  }

  // Run/Cancel/Status icon
  const runIconWrapper = document.createElement("span")
  runIconWrapper.style.display = "inline-flex"
  runIconWrapper.style.alignItems = "center"
  runIconWrapper.style.justifyContent = "center"
  runIconWrapper.style.width = "24px"
  runIconWrapper.style.position = "absolute"
  runIconWrapper.style.top = "0"
  runIconWrapper.style.right = options.showAI ? "0" : "20px"
  runIconWrapper.style.height = "100%"
  runIconWrapper.style.cursor = "pointer"

  // Determine which icon to show
  let iconType: "play" | "cancel" | "loading" | "error" | "success" = "play"
  if (options.isCancel) {
    iconType = "cancel"
  } else if (options.hasError) {
    iconType = "error"
  } else if (options.isSuccessful) {
    iconType = "success"
  }

  // Add icon type as class for later identification
  runIconWrapper.className = `glyph-run-icon ${iconType}`

  const runSvg = createSvgElement(iconType, 22)
  runIconWrapper.appendChild(runSvg)

  runIconWrapper.addEventListener("mouseenter", () => {
    runIconWrapper.style.filter = "brightness(1.3)"
  })
  runIconWrapper.addEventListener("mouseleave", () => {
    runIconWrapper.style.filter = ""
  })
  runIconWrapper.addEventListener("click", (e) => {
    e.stopPropagation()
    options.onRunClick()
  })
  runIconWrapper.addEventListener("contextmenu", (e) => {
    e.preventDefault()
    e.stopPropagation()
    options.onRunContextMenu?.()
  })

  domNode.appendChild(runIconWrapper)

  return {
    getId: () => createGlyphWidgetId(lineNumber, options),
    getDomNode: () => domNode,
    getPosition: () => ({
      lane: 1, // monaco.editor.GlyphMarginLane.Left
      zIndex: 1,
      range: {
        startLineNumber: lineNumber,
        startColumn: 1,
        endLineNumber: lineNumber,
        endColumn: 1,
      },
    }),
  }
}

type IconType = "play" | "cancel" | "loading" | "error" | "success"

/**
 * Toggles a glyph widget's run icon between loading and its previous state.
 * Reads the current icon type from CSS classes on the runIconWrapper element.
 */
export const toggleGlyphWidgetLoading = (
  lineNumber: number,
  isLoading: boolean,
): void => {
  const domNode = document.querySelector(`.glyph-widget-${lineNumber}`)
  if (!(domNode instanceof HTMLElement)) return

  const runIconWrapper = domNode.querySelector(".glyph-run-icon")
  if (!(runIconWrapper instanceof HTMLElement)) return

  // Get current icon type from classes
  const iconTypes: IconType[] = [
    "play",
    "cancel",
    "loading",
    "error",
    "success",
  ]
  const currentIconType =
    iconTypes.find((type) => runIconWrapper.classList.contains(type)) || "play"

  if (isLoading && currentIconType !== "loading") {
    // Store current icon type and switch to loading
    runIconWrapper.classList.remove(...iconTypes)
    runIconWrapper.classList.add("loading")
    runIconWrapper.dataset.previousIconType = currentIconType

    // Replace with loading icon
    const loadingSvg = createSvgElement("loading", 22)
    runIconWrapper.innerHTML = ""
    runIconWrapper.appendChild(loadingSvg)
    runIconWrapper.style.animation = "glyph-spin 3s linear infinite"
    runIconWrapper.style.pointerEvents = "none"
  } else if (!isLoading && currentIconType === "loading") {
    // Restore previous icon type
    const previousIconType =
      (runIconWrapper.dataset.previousIconType as IconType) || "play"
    delete runIconWrapper.dataset.previousIconType

    runIconWrapper.classList.remove("loading")
    runIconWrapper.classList.add(previousIconType)

    // Recreate the original icon
    const originalSvg = createSvgElement(previousIconType, 22)
    runIconWrapper.innerHTML = ""
    runIconWrapper.appendChild(originalSvg)
    runIconWrapper.style.animation = ""
    runIconWrapper.style.pointerEvents = "auto"
  }
}
