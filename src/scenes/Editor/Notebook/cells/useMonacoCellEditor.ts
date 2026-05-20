import { useCallback, useEffect, useRef } from "react"
import type { Monaco } from "@monaco-editor/react"
import type { editor } from "monaco-editor"
import type * as QuestDB from "../../../../utils/questdb"
import { clearModelMarkers, validateQueryJIT } from "../../Monaco/utils"

const VALIDATION_DEBOUNCE_MS = 300

type ValidateFn = (
  sql: string,
  signal?: AbortSignal,
) => ReturnType<QuestDB.Client["validateQuery"]>

export type UseMonacoCellEditorOptions = {
  cellId: string
  editorViewState?: editor.ICodeEditorViewState
  quest: QuestDB.Client
  onFocus: () => void
  onSaveViewState: (state: editor.ICodeEditorViewState) => void
  onRunAtCursor: () => void
  onRunAll: () => void
  // Fires every time Monaco reports a content-size change. Cell.tsx uses
  // this to drive cell.topHeight (the auto-grow path). Naturally rate-
  // limited by Monaco to per-line-count changes; no debouncing needed
  // here. Caller is responsible for guarding on cell.topResized.
  onContentHeightChange?: (px: number) => void
  // Optional override for the JIT validator. Notebook passes a wrapped
  // function that prepends global variables as DECLARE so `@symbol`
  // references resolve. Falls back to quest.validateQuery if absent.
  validate?: ValidateFn
}

export const useMonacoCellEditor = ({
  cellId,
  editorViewState,
  quest,
  onFocus,
  onSaveViewState,
  onRunAtCursor,
  onRunAll,
  onContentHeightChange,
  validate,
}: UseMonacoCellEditorOptions) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const validationTimeoutRef = useRef<number | null>(null)

  // Refs for handlers so the once-mounted Monaco listeners always read
  // the latest callbacks instead of capturing stale closures.
  const onRunAtCursorRef = useRef(onRunAtCursor)
  onRunAtCursorRef.current = onRunAtCursor
  const onRunAllRef = useRef(onRunAll)
  onRunAllRef.current = onRunAll
  const onContentHeightChangeRef = useRef(onContentHeightChange)
  onContentHeightChangeRef.current = onContentHeightChange
  const validateRef = useRef<ValidateFn | undefined>(validate)
  validateRef.current = validate

  const triggerValidation = useCallback(() => {
    if (!monacoRef.current || !editorRef.current) return
    validateQueryJIT(
      monacoRef.current,
      editorRef.current,
      cellId.charCodeAt(0),
      () => ({}),
      (q, signal) =>
        validateRef.current
          ? validateRef.current(q, signal)
          : quest.validateQuery(q, signal),
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

      const reportHeight = () => {
        onContentHeightChangeRef.current?.(ed.getContentHeight())
      }

      ed.onDidContentSizeChange(reportHeight)
      reportHeight()

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
    [editorViewState, onFocus, scheduleValidation],
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
    handleEditorMount,
  }
}
