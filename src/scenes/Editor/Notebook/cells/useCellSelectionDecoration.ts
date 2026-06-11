import { useCallback, useRef } from "react"
import type { Monaco } from "@monaco-editor/react"
import type { editor } from "monaco-editor"

export const useCellSelectionDecoration = (
  editorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>,
  monacoRef: React.MutableRefObject<Monaco | null>,
) => {
  const decorationIdsRef = useRef<string[]>([])

  const applyHighlight = useCallback(
    (success: boolean) => {
      const ed = editorRef.current
      const mon = monacoRef.current
      if (!ed || !mon) return
      const selection = ed.getSelection()
      const model = ed.getModel()
      if (!selection || !model || selection.isEmpty()) return

      decorationIdsRef.current = ed.deltaDecorations(decorationIdsRef.current, [
        {
          range: new mon.Range(
            selection.startLineNumber,
            selection.startColumn,
            selection.endLineNumber,
            selection.endColumn,
          ),
          options: {
            isWholeLine: false,
            className: success
              ? "selectionSuccessHighlight"
              : "selectionErrorHighlight",
          },
        },
      ])
    },
    [editorRef, monacoRef],
  )

  const clearHighlight = useCallback(() => {
    const ed = editorRef.current
    if (!ed) return
    decorationIdsRef.current = ed.deltaDecorations(decorationIdsRef.current, [])
  }, [editorRef])

  return { applyHighlight, clearHighlight }
}
