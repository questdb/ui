import { useCallback, useEffect, useRef, useState } from "react"
import type { Monaco } from "@monaco-editor/react"
import type { editor } from "monaco-editor"
import type * as QuestDB from "../../../../utils/questdb"
import { clearModelMarkers, validateQueryJIT } from "../../Monaco/utils"

const VALIDATION_DEBOUNCE_MS = 300

export type UseMonacoCellEditorOptions = {
  cellId: string
  editorViewState?: editor.ICodeEditorViewState
  isMaximized: boolean
  minEditorHeight: number
  maxEditorHeight: number
  quest: QuestDB.Client
  onFocus: () => void
  onSaveViewState: (state: editor.ICodeEditorViewState) => void
  onRunAtCursor: () => void
  onRunAll: () => void
}

export const useMonacoCellEditor = ({
  cellId,
  editorViewState,
  isMaximized,
  minEditorHeight,
  maxEditorHeight,
  quest,
  onFocus,
  onSaveViewState,
  onRunAtCursor,
  onRunAll,
}: UseMonacoCellEditorOptions) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const validationTimeoutRef = useRef<number | null>(null)
  const [autoHeight, setAutoHeight] = useState(minEditorHeight)

  const onRunAtCursorRef = useRef(onRunAtCursor)
  onRunAtCursorRef.current = onRunAtCursor
  const onRunAllRef = useRef(onRunAll)
  onRunAllRef.current = onRunAll

  const triggerValidation = useCallback(() => {
    if (!monacoRef.current || !editorRef.current) return
    validateQueryJIT(
      monacoRef.current,
      editorRef.current,
      cellId.charCodeAt(0),
      () => ({}),
      (q, signal) => quest.validateQuery(q, signal),
    )
  }, [cellId, quest])

  const scheduleValidation = useCallback(() => {
    if (validationTimeoutRef.current) {
      window.clearTimeout(validationTimeoutRef.current)
    }
    validationTimeoutRef.current = window.setTimeout(() => {
      triggerValidation()
      validationTimeoutRef.current = null
    }, VALIDATION_DEBOUNCE_MS)
  }, [triggerValidation])

  const handleEditorMount = useCallback(
    (ed: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = ed
      monacoRef.current = monaco

      if (editorViewState) {
        ed.restoreViewState(editorViewState)
      }

      const updateHeight = () => {
        const contentHeight = ed.getContentHeight()
        const newHeight = Math.max(
          minEditorHeight,
          Math.min(contentHeight, isMaximized ? Infinity : maxEditorHeight),
        )
        setAutoHeight(newHeight)
      }

      ed.onDidContentSizeChange(updateHeight)
      updateHeight()

      ed.onDidFocusEditorWidget(onFocus)
      ed.onDidChangeCursorPosition(scheduleValidation)
      ed.onDidChangeModelContent(scheduleValidation)

      // Clear built-in Ctrl+Shift+Enter handler (same pattern as editor-addons.ts)
      ed.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
        () => {},
      )

      ed.addAction({
        id: "notebook-run",
        label: "Run Query",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => void onRunAtCursorRef.current(),
      })

      ed.addAction({
        id: "notebook-run-all",
        label: "Run All",
        keybindings: [
          monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
        ],
        run: () => void onRunAllRef.current(),
      })
    },
    [
      editorViewState,
      isMaximized,
      minEditorHeight,
      maxEditorHeight,
      onFocus,
      scheduleValidation,
    ],
  )

  useEffect(() => {
    return () => {
      if (validationTimeoutRef.current) {
        window.clearTimeout(validationTimeoutRef.current)
      }
      if (editorRef.current && monacoRef.current) {
        clearModelMarkers(monacoRef.current, editorRef.current)
        const state = editorRef.current.saveViewState()
        if (state) {
          onSaveViewState(state)
        }
      }
    }
  }, [])

  return {
    editorRef,
    monacoRef,
    autoHeight,
    handleEditorMount,
  }
}
