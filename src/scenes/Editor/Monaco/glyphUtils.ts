import type { editor } from "monaco-editor"
import {
  createSvgElement,
  createAIGutterIcon,
  applyGutterIconState,
  getHoverState,
  type GutterIconState,
} from "./icons"

export type GlyphWidgetOptions = {
  isCancel?: boolean
  hasError?: boolean
  isSuccessful?: boolean
  isLoading?: boolean
  showAI?: boolean
  hasConversation?: boolean
  isHighlighted?: boolean // For temporary highlight when conversation is first created
  onRunClick: () => void
  onRunContextMenu?: () => void
  onAIClick?: () => void
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
  domNode.style.display = "flex"
  domNode.style.alignItems = "center"
  domNode.style.gap = "5px"
  domNode.style.cursor = "pointer"
  domNode.style.marginLeft = "1rem"
  domNode.style.width = "53px"
  domNode.style.height = "100%"

  // AI sparkle icon (if enabled)
  if (options.showAI) {
    // Determine initial state based on conversation status and highlight flag
    let baseState: GutterIconState = options.hasConversation
      ? "active"
      : "noChat"
    if (options.isHighlighted) {
      baseState = "highlight"
    }

    const aiIconWrapper = createAIGutterIcon(baseState, 16)
    aiIconWrapper.classList.add("glyph-ai-icon")
    aiIconWrapper.style.position = "absolute"
    aiIconWrapper.style.top = "50%"
    aiIconWrapper.style.left = "0"
    aiIconWrapper.style.transform = "translateY(-50%)"
    aiIconWrapper.style.cursor = "pointer"

    // Track current state for hover transitions
    let currentBaseState = baseState

    // Handle highlight -> active transition after delay
    if (options.isHighlighted) {
      setTimeout(() => {
        currentBaseState = "active"
        applyGutterIconState(aiIconWrapper, "active", 16)
      }, 2000)
    }

    aiIconWrapper.addEventListener("mouseenter", () => {
      const hoverState = getHoverState(currentBaseState)
      applyGutterIconState(aiIconWrapper, hoverState, 16)
    })

    aiIconWrapper.addEventListener("mouseleave", () => {
      applyGutterIconState(aiIconWrapper, currentBaseState, 16)
    })

    aiIconWrapper.addEventListener("click", (e) => {
      e.stopPropagation()
      options.onAIClick?.()
    })

    domNode.appendChild(aiIconWrapper)
  }

  // Run/Cancel/Status icon
  const runIconWrapper = document.createElement("span")
  runIconWrapper.className = "glyph-run-icon"
  runIconWrapper.style.display = "inline-flex"
  runIconWrapper.style.alignItems = "center"
  runIconWrapper.style.justifyContent = "center"
  runIconWrapper.style.width = "24px"
  runIconWrapper.style.position = "absolute"
  runIconWrapper.style.top = "0"
  runIconWrapper.style.right = "0"
  runIconWrapper.style.height = "100%"

  // Determine which icon to show
  let iconType: "play" | "cancel" | "loading" | "error" | "success" = "play"
  if (options.isCancel) {
    iconType = "cancel"
  } else if (options.isLoading) {
    iconType = "loading"
  } else if (options.hasError) {
    iconType = "error"
  } else if (options.isSuccessful) {
    iconType = "success"
  }

  const runSvg = createSvgElement(iconType, 22)
  runIconWrapper.appendChild(runSvg)

  // Add spin animation for loading state
  if (options.isLoading) {
    runIconWrapper.style.animation = "glyph-spin 3s linear infinite"
  }

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
    getId: () => `glyph-widget-${lineNumber}`,
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

/**
 * Removes all glyph widgets from the editor and clears the widgets array.
 */
export const clearGlyphWidgets = (
  editor: editor.IStandaloneCodeEditor,
  widgetsRef: React.MutableRefObject<editor.IGlyphMarginWidget[]>,
): void => {
  widgetsRef.current.forEach((widget) => {
    editor.removeGlyphMarginWidget(widget)
  })
  widgetsRef.current = []
}
