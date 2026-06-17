import { useCallback, useEffect, useRef } from "react"
import type { Monaco } from "@monaco-editor/react"
import type { editor } from "monaco-editor"
import { eventBus } from "../../../../modules/EventBus"
import { EventType } from "../../../../modules/EventBus/types"
import { consumeReveal, getPendingReveal } from "../cellReveal"

const FLASH_DURATION_MS = 2000

// Flashes the matched text in this SQL cell's editor, drained on editor mount and on the nudge.
export const useCellReveal = (
  editorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>,
  monacoRef: React.MutableRefObject<Monaco | null>,
  cellId: string,
  bufferId: number | undefined,
) => {
  const decorationIdsRef = useRef<string[]>([])
  const clearTimerRef = useRef<number | null>(null)

  const clearReveal = useCallback(() => {
    if (clearTimerRef.current !== null) {
      window.clearTimeout(clearTimerRef.current)
      clearTimerRef.current = null
    }
    const model = editorRef.current?.getModel()
    if (model && decorationIdsRef.current.length > 0) {
      decorationIdsRef.current = model.deltaDecorations(
        decorationIdsRef.current,
        [],
      )
    }
  }, [editorRef])

  const applyReveal = useCallback(() => {
    const request = getPendingReveal()
    if (
      !request ||
      request.cellId !== cellId ||
      request.notebookField !== "cell" ||
      request.bufferId !== bufferId
    ) {
      return
    }
    const ed = editorRef.current
    const monaco = monacoRef.current
    if (!ed || !monaco || !ed.getModel()) return
    const { token, range } = request
    requestAnimationFrame(() => {
      const current = getPendingReveal()
      if (!current || current.token !== token) return
      const model = ed.getModel()
      if (!model) return
      const lineCount = model.getLineCount()
      const target = new monaco.Range(
        Math.min(range.startLineNumber, lineCount),
        range.startColumn,
        Math.min(range.endLineNumber, lineCount),
        range.endColumn,
      )
      ed.revealRangeInCenter(target)
      decorationIdsRef.current = model.deltaDecorations(
        decorationIdsRef.current,
        [{ range: target, options: { className: "notebookSearchHighlight" } }],
      )
      consumeReveal(token)
      if (clearTimerRef.current !== null) {
        window.clearTimeout(clearTimerRef.current)
      }
      clearTimerRef.current = window.setTimeout(clearReveal, FLASH_DURATION_MS)
    })
  }, [cellId, bufferId, editorRef, monacoRef, clearReveal])

  useEffect(() => {
    applyReveal()
    eventBus.subscribe(EventType.NOTEBOOK_REVEAL_CELL, applyReveal)
    return () => {
      eventBus.unsubscribe(EventType.NOTEBOOK_REVEAL_CELL, applyReveal)
      clearReveal()
    }
  }, [applyReveal, clearReveal])

  return { applyReveal }
}
