import { loader, type Monaco } from "@monaco-editor/react"
import type { editor, IRange } from "monaco-editor"
import React, {
  createContext,
  MutableRefObject,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react"
import {
  appendQuery,
  clearModelMarkers,
  insertTextAtCursor,
  QuestDBLanguageName,
  QueryKey,
  normalizeQueryText,
  parseQueryKey,
  createQueryKey,
  getQueriesFromText,
} from "../../scenes/Editor/Monaco/utils"
import { useSchemaCompletionProvider } from "../../scenes/Editor/Monaco/questdb-sql/useSchemaCompletionProvider"
import {
  cloneNotebookViewStateWithCellIdMap,
  generateId,
  nextCopyLabel,
} from "../../scenes/Editor/Notebook/notebookUtils"
import { snapshotResultsMatchQueries } from "../../scenes/Editor/Notebook/statementIdentity"
import { createCell, type NotebookCell } from "../../store/notebook"
import { NotebookToolError } from "../../utils/notebooks/notebookToolError"
import { requestCellReveal } from "../../scenes/Editor/Notebook/cellReveal"
import type { ConversationId } from "../AIConversationProvider/types"
import { normalizeSql } from "../../utils/formatSql"
import type { Buffer, PreviewContent } from "../../store/buffers"
import {
  closedBuffersToDelete,
  nextOpenPosition,
  positionsAfterMove,
  positionsWithout,
  sortPinnedBuffers,
} from "../../utils/buffers/tabOrder"
import {
  resolveNextActiveBuffer,
  pushRecentBuffer,
} from "../../utils/buffers/nextActiveBuffer"
import { promoteActivePreview } from "../../utils/buffers/previewPromotion"
import { appendQueryTarget } from "../../utils/buffers/appendQueryTarget"
import {
  fetchExampleDashboard,
  type ExampleDashboardContent,
} from "../../utils/examples/exampleDashboards"
import type { ExampleDashboard } from "../SettingsProvider/types"
import { useSettings } from "../SettingsProvider/context"
import { hasExampleDashboards } from "../../utils/examples/hasExampleDashboards"
import { isFreshWorkspace } from "../../utils/examples/isFreshWorkspace"
import { getValue, setValue } from "../../utils/localStorage"
import { StoreKey } from "../../utils/localStorage/types"
import { tabKindOf } from "../../utils/ai/workspaceInfo"
import { buildTablePreviewCell } from "../../utils/notebooks/tablePreviewCell"
import type { ExecutionRefs } from "../../scenes/Editor/index"
import {
  bufferStore,
  BufferType,
  bufferTypeOf,
  fallbackBuffer,
  makeBuffer,
  makeFallbackBuffer,
} from "../../store/buffers"
import { toast } from "../../components/Toast"
import { db } from "../../store/db"
import {
  copyNotebookSnapshots,
  deleteNotebookSnapshots,
  pruneToRecentNotebooks,
} from "../../store/notebookResults"
import { removeNotebookBufferLayouts } from "../../scenes/Editor/Notebook/notebookColumnLayoutStore"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import { emitUserAction } from "../../utils/notebooks/notebookAIBridge"
import {
  addCellTransition,
  forgetBuffer,
  releaseArchivedBuffer,
  withBoundNotebook,
  withBoundNotebookReadOnly,
} from "../../utils/notebooks/notebookController"
import { enqueueBufferTask } from "../../utils/notebooks/notebookBufferQueue"

import { useLiveQuery } from "dexie-react-hooks"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"

export const MAX_TABS = 100

const SNAPSHOT_COPY_ERROR_TOAST_ID = "notebook-snapshot-copy-error"

const CELL_START_RANGE = {
  startLineNumber: 1,
  startColumn: 1,
  endLineNumber: 1,
  endColumn: 1,
}

type IStandaloneCodeEditor = editor.IStandaloneCodeEditor

export type PreviewBufferContentDiff = {
  type: "diff"
  original: string
  modified: string
  conversationId?: ConversationId
}

export type PreviewBufferContentCode = {
  type: "code"
  value: string
}

export type PreviewBufferContent =
  | PreviewBufferContentDiff
  | PreviewBufferContentCode

export type ApplyAISQLChangeOptions = {
  newSQL: string
  queryKey?: QueryKey
}

export type ApplyAISQLChangeResult = {
  success: boolean
  finalQueryKey?: QueryKey
  queryStartOffset?: number
}

export type EditorContext = {
  editorRef: MutableRefObject<IStandaloneCodeEditor | null>
  monacoRef: MutableRefObject<Monaco | null>
  insertTextAtCursor: (text: string) => void
  appendQuery: (query: string) => void
  tabsDisabled: boolean
  setTabsDisabled: (disabled: boolean) => void
  buffers: Buffer[]
  activeBuffer: Buffer
  setActiveBuffer: (
    buffer: Buffer,
    options?: { focus?: boolean; fromSearch?: boolean },
  ) => Promise<void>
  addBuffer: (
    buffer?: Partial<Buffer>,
    options?: {
      shouldSelectAll?: boolean
      afterBufferId?: number
      activate?: boolean
      signal?: AbortSignal
    },
  ) => Promise<Buffer | undefined>
  deleteBuffer: (
    id: number,
    setActiveBuffer?: boolean,
    initiator?: "user" | "agent",
  ) => Promise<void>
  archiveBuffer: (id: number, initiator?: "user" | "agent") => Promise<void>
  duplicateNotebook: (
    id: number,
    options?: { activate?: boolean; signal?: AbortSignal },
  ) => Promise<Buffer | undefined>
  updateBuffer: (
    id: number,
    buffer?: Partial<Buffer>,
    setNewActiveBuffer?: boolean,
  ) => Promise<void>
  updateBuffersPositions: (
    positions: { id: number; position: number }[],
  ) => Promise<void>
  closeBuffer: (id: number) => Promise<void>
  restoreBuffer: (id: number) => Promise<void>
  keepBufferOpen: (id: number) => Promise<void>
  reorderBuffer: (id: number, toIndex: number) => Promise<void>
  clearArchivedBuffers: () => Promise<void>
  openExampleDashboard: (example: ExampleDashboard) => Promise<void>
  runImportedNotebookCells: (
    bufferId: number,
    cellIds: string[],
  ) => Promise<void>
  openTableNotebook: (table: {
    name: string
    designatedTimestamp?: string
  }) => Promise<void>
  editorReadyTrigger: (editor: IStandaloneCodeEditor) => void
  previewBuffer: (id: number) => Promise<void>
  discardPreview: () => Promise<void>
  queryParamProcessedRef: MutableRefObject<boolean>
  isNavigatingFromSearchRef: MutableRefObject<boolean>
  showPreviewBuffer: (content: PreviewBufferContent) => Promise<void>
  closePreviewBuffer: () => Promise<void>
  applyAISQLChange: (options: ApplyAISQLChangeOptions) => ApplyAISQLChangeResult
  executionRefs: MutableRefObject<ExecutionRefs>
  cleanupExecutionRefs: (bufferId: number) => void
  highlightQuery: (queryKey: QueryKey, bufferId: number) => Promise<boolean>
}

const defaultValues = {
  editorRef: { current: null },
  monacoRef: { current: null },
  insertTextAtCursor: () => undefined,
  appendQuery: () => undefined,
  tabsDisabled: false,
  setTabsDisabled: () => undefined,
  buffers: [],
  activeBuffer: fallbackBuffer,
  setActiveBuffer: () => Promise.resolve(),
  addBuffer: () => Promise.resolve(fallbackBuffer),
  deleteBuffer: () => Promise.resolve(),
  archiveBuffer: () => Promise.resolve(),
  duplicateNotebook: () => Promise.resolve(undefined),
  updateBuffer: () => Promise.resolve(),
  updateBuffersPositions: () => Promise.resolve(),
  closeBuffer: () => Promise.resolve(),
  restoreBuffer: () => Promise.resolve(),
  keepBufferOpen: () => Promise.resolve(),
  reorderBuffer: () => Promise.resolve(),
  clearArchivedBuffers: () => Promise.resolve(),
  openExampleDashboard: () => Promise.resolve(),
  runImportedNotebookCells: () => Promise.resolve(),
  openTableNotebook: () => Promise.resolve(),
  editorReadyTrigger: () => undefined,
  previewBuffer: () => Promise.resolve(),
  discardPreview: () => Promise.resolve(),
  queryParamProcessedRef: { current: false },
  isNavigatingFromSearchRef: { current: false },
  showPreviewBuffer: () => Promise.resolve(),
  closePreviewBuffer: () => Promise.resolve(),
  applyAISQLChange: () => ({ success: false }),
  executionRefs: { current: {} },
  cleanupExecutionRefs: () => undefined,
  highlightQuery: () => Promise.resolve(false),
}

const isPendingImportDeletion = (buffer: Buffer) =>
  (buffer as Record<string, unknown>)._markedForDeletion === true

const EditorContext = createContext<EditorContext>(defaultValues)

export const EditorProvider: React.FC = ({ children }) => {
  const editorRef = useRef<IStandaloneCodeEditor>(null)
  const monacoRef = useRef<Monaco>(null)
  const executionRefs = useRef<ExecutionRefs>({})
  const [loadedMonaco, setLoadedMonaco] = useState<Monaco | null>(null)
  const [temporaryBufferId, setTemporaryBufferId] = useState<number | null>(
    null,
  )
  const [tabsDisabled, setTabsDisabled] = useState(false)
  const rawBuffers = useLiveQuery(bufferStore.getAll, [])
  const buffers = useMemo(() => {
    if (!rawBuffers) return undefined
    return rawBuffers
      .filter((buffer) => !isPendingImportDeletion(buffer))
      .map((buffer) => ({
        ...buffer,
        isTemporary: buffer.id === temporaryBufferId,
      }))
  }, [rawBuffers, temporaryBufferId])

  const activeBufferId = useLiveQuery(
    () => bufferStore.getActiveId(),
    [],
  )?.value

  const [activeBuffer, setActiveBufferState] = useState<Buffer>(fallbackBuffer)
  const activeBufferRef = useRef(activeBuffer)
  const recentBufferIdsRef = useRef<number[]>([])
  const searchUpdateTimeoutRef = useRef<number | null>(null)
  const queryParamProcessedRef = useRef(false)
  const isNavigatingFromSearchRef = useRef(false)

  const ranOnce = useRef(false)

  // Showcase deployments open the first example dashboard for a first-time
  // visitor, so the first paint is live charts rather than an empty editor.
  // The file is fetched the moment the provider mounts, in parallel with the
  // IndexedDB read, and the tab is created before the first render below.
  // Decided once per browser, on the first load: after that the visitor's own
  // tabs decide.
  const { consoleConfig } = useSettings()
  const firstExample = hasExampleDashboards(consoleConfig)
    ? consoleConfig.exampleDashboards![0]
    : undefined
  const autoOpenRef = useRef<Promise<ExampleDashboardContent | null> | null>(
    null,
  )
  if (
    autoOpenRef.current === null &&
    firstExample &&
    getValue(StoreKey.EXAMPLE_DASHBOARD_AUTO_OPENED) === ""
  ) {
    autoOpenRef.current = fetchExampleDashboard(firstExample.path).catch(
      (error: unknown) => {
        console.error("Could not preload the example dashboard:", error)
        return null
      },
    )
  }
  const [autoOpenedId, setAutoOpenedId] = useState<number | null>(null)

  useSchemaCompletionProvider(loadedMonaco)

  const getNextPosition = useCallback(() => {
    if (!buffers) return 0
    const activeBuffers = buffers.filter((b) => !b.archived || b.isTemporary)
    return Math.max(...activeBuffers.map((b) => b.position), -1) + 1
  }, [buffers])

  const cleanupExecutionRefs = useCallback((bufferId: number) => {
    delete executionRefs.current[bufferId.toString()]
  }, [])

  const setActiveBuffer = useCallback(
    async (
      buffer: Buffer,
      options?: { focus?: boolean; fromSearch?: boolean },
    ) => {
      try {
        const currentActiveBufferId = (await bufferStore.getActiveId())?.value

        if (currentActiveBufferId) {
          if (buffer.id === currentActiveBufferId) {
            activeBufferRef.current = buffer
            setActiveBufferState(buffer)
            return
          }
        }

        await bufferStore.setActiveId(buffer.id as number)
        activeBufferRef.current = buffer
        setActiveBufferState(buffer)
        recentBufferIdsRef.current = pushRecentBuffer(
          recentBufferIdsRef.current,
          buffer.id as number,
        )

        if (options?.fromSearch) {
          isNavigatingFromSearchRef.current = true
        }

        if (
          editorRef.current &&
          monacoRef.current &&
          !buffer.notebookViewState
        ) {
          const currentModel = editorRef.current.getModel()
          if (currentModel) {
            currentModel.dispose()
          }

          const model = monacoRef.current.editor.createModel(
            buffer.value,
            QuestDBLanguageName,
          )
          editorRef.current.setModel(model)
          clearModelMarkers(monacoRef.current, editorRef.current)

          if (buffer.editorViewState) {
            editorRef.current.restoreViewState(buffer.editorViewState)
          }

          if (options?.focus !== false) {
            editorRef.current.focus()
          }
        }
      } catch (e) {
        console.warn("Error setting active buffer:", e)
      }
    },
    [],
  )

  const highlightQuery = useCallback(
    async (queryKey: QueryKey, bufferId: number): Promise<boolean> => {
      const buffer = await bufferStore.getById(bufferId)
      if (!buffer || buffer.archived) {
        return false
      }

      const { queryText, startOffset, endOffset } = parseQueryKey(queryKey)
      const contentAtOffset = buffer.value.slice(startOffset, endOffset)
      if (normalizeQueryText(contentAtOffset) !== queryText) {
        return false
      }

      const targetBuffer = buffers?.find((b) => b.id === bufferId)
      if (targetBuffer && activeBuffer.id !== bufferId) {
        await setActiveBuffer(targetBuffer)
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      if (!editorRef.current) {
        return false
      }
      const model = editorRef.current.getModel()
      if (!model) {
        return false
      }

      const startPosition = model.getPositionAt(startOffset)
      const endPosition = model.getPositionAt(endOffset)

      editorRef.current.revealPositionNearTop(startPosition)
      editorRef.current.setPosition(startPosition)

      const decorationIds = model.deltaDecorations(
        [],
        [
          {
            range: {
              startLineNumber: startPosition.lineNumber,
              startColumn: startPosition.column,
              endLineNumber: endPosition.lineNumber,
              endColumn: endPosition.column,
            },
            options: {
              isWholeLine: false,
              className: "aiQueryHighlight",
            },
          },
        ],
      )

      editorRef.current.focus()

      setTimeout(() => {
        if (!model.isDisposed()) {
          model.deltaDecorations(decorationIds, [])
        }
      }, 1000)

      return true
    },
    [buffers, activeBuffer.id, setActiveBuffer],
  )

  const addBuffer: EditorContext["addBuffer"] = useCallback(
    async (
      newBuffer,
      { shouldSelectAll = false, afterBufferId, activate = true, signal } = {},
    ) => {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError")
      }
      if (buffers && buffers.length >= MAX_TABS) {
        toast.error(
          `Tab limit reached (${MAX_TABS}). Delete closed tabs from the Tabs panel to free up space.`,
        )
        return undefined
      }

      const bufferType = bufferTypeOf(newBuffer ?? {})

      void trackEvent(ConsoleEvent.TAB_ADD, {
        type: bufferType,
        count: (buffers?.length ?? 0) + 1,
      })

      const fallback = makeFallbackBuffer(bufferType)

      const currentDefaultTabNumbers = (
        await db.buffers
          .filter((buffer) => {
            if (!buffer.label.startsWith(fallback.label)) return false
            if (newBuffer?.notebookViewState)
              return buffer.notebookViewState !== undefined
            if (newBuffer?.metricsViewState)
              return buffer.metricsViewState !== undefined
            return true
          })
          .toArray()
      )
        .map((buffer) => buffer.label.slice(fallback.label.length + 1))
        .filter(Boolean)
        .map((n) => parseInt(n, 10))
        .sort()

      const nextNumber = () => {
        for (let i = 0; i <= currentDefaultTabNumbers.length; i++) {
          const next = i + 1
          if (!currentDefaultTabNumbers.includes(next)) {
            return next
          }
        }
      }

      const activeBuffers = buffers ? sortPinnedBuffers(buffers) : []
      const insertAfter =
        afterBufferId !== undefined
          ? activeBuffers.find((b) => b.id === afterBufferId)
          : undefined
      const position = insertAfter
        ? insertAfter.position + 1
        : activeBuffers.length

      const buffer = makeBuffer({
        ...newBuffer,
        label: newBuffer?.label ?? `${fallback.label} ${nextNumber()}`,
        position,
      })

      let id: number
      if (insertAfter) {
        const toShift = activeBuffers.filter(
          (b) => typeof b.id === "number" && b.position >= position,
        )
        id = await db.transaction("rw", db.buffers, async () => {
          for (const b of toShift) {
            if (signal?.aborted) {
              throw new DOMException("Aborted", "AbortError")
            }
            await db.buffers.update(b.id as number, {
              position: b.position + 1,
            })
          }
          if (signal?.aborted) {
            throw new DOMException("Aborted", "AbortError")
          }
          return db.buffers.add(buffer)
        })
      } else {
        if (signal?.aborted) {
          throw new DOMException("Aborted", "AbortError")
        }
        id = await db.buffers.add(buffer)
      }

      if (activate) {
        await setActiveBuffer(buffer, { focus: true })
      }

      if (
        activate &&
        shouldSelectAll &&
        editorRef.current &&
        !newBuffer?.notebookViewState
      ) {
        const model = editorRef.current.getModel()
        if (model) {
          editorRef.current.setSelection(model.getFullModelRange())
        }
      }

      return { id, ...buffer }
    },
    [buffers, setActiveBuffer],
  )

  const showPreviewBuffer: EditorContext["showPreviewBuffer"] = useCallback(
    async (content) => {
      const existingPreviewBuffer = buffers?.find(
        (b) => b.isPreviewBuffer && !b.archived,
      )

      const previewContent: PreviewContent =
        content.type === "diff"
          ? {
              type: "diff",
              original: content.original,
              modified: content.modified,
              conversationId: content.conversationId,
            }
          : {
              type: "code",
              value: content.value,
            }

      const label = content.type === "diff" ? "AI Suggestion" : "Preview"

      if (existingPreviewBuffer && existingPreviewBuffer.id) {
        await bufferStore.update(existingPreviewBuffer.id, {
          previewContent,
          label,
        })
        const updatedBuffer = {
          ...existingPreviewBuffer,
          previewContent,
          label,
        }
        await setActiveBuffer(updatedBuffer)
      } else {
        const position = buffers
          ? buffers.filter((b) => !b.archived && !b.isTemporary).length
          : 0
        await addBuffer({
          label,
          value: "",
          isPreviewBuffer: true,
          position,
          previewContent,
        })
      }
    },
    [buffers, setActiveBuffer, addBuffer],
  )

  useEffect(() => {
    let cancelled = false
    void loader.init().then((m) => {
      if (!cancelled) setLoadedMonaco(m)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (ranOnce.current || !buffers || !activeBufferId) return
    ranOnce.current = true

    const activateStored = () => {
      const buffer =
        buffers.find((buffer) => buffer.id === activeBufferId) ?? buffers[0]
      const activeBuffers = buffers.filter((b) => !b.archived)
      const nextBuffer = buffer.archived
        ? (activeBuffers[0] ?? fallbackBuffer)
        : buffer
      activeBufferRef.current = nextBuffer
      setActiveBufferState(nextBuffer)
    }

    const pending = autoOpenRef.current
    if (!pending || !firstExample || !isFreshWorkspace(buffers)) {
      // A visitor who already has tabs keeps them: the example is never opened
      // for them, now or after they later empty the workspace, and later loads
      // skip the fetch.
      if (pending) setValue(StoreKey.EXAMPLE_DASHBOARD_AUTO_OPENED, "true")
      activateStored()
      return
    }
    // First visit on a showcase deployment: create the example tab and make it
    // the active one before anything is painted.
    void pending.then(async (content) => {
      if (!content) {
        activateStored()
        return
      }
      try {
        const buffer = makeBuffer({
          label: firstExample.title,
          notebookViewState: content.notebookViewState,
          templateId: firstExample.id,
          position: nextOpenPosition(buffers),
        })
        const id = await db.buffers.add(buffer)
        await bufferStore.setActiveId(id)
        setValue(StoreKey.EXAMPLE_DASHBOARD_AUTO_OPENED, "true")
        const created = { ...buffer, id }
        activeBufferRef.current = created
        setActiveBufferState(created)
        recentBufferIdsRef.current = pushRecentBuffer(
          recentBufferIdsRef.current,
          id,
        )
        setAutoOpenedId(id)
      } catch (error) {
        console.error("Could not open the example dashboard:", error)
        activateStored()
      }
    })
  }, [buffers, activeBufferId])

  // The notebook has to be mounted (the provider renders children only once an
  // active buffer exists) before its cells can be run.
  useEffect(() => {
    if (autoOpenedId === null || activeBuffer.id !== autoOpenedId) return
    void runNotebookCells(autoOpenedId)
    setAutoOpenedId(null)
  }, [autoOpenedId, activeBuffer.id])

  if (!buffers || !activeBufferId || activeBuffer === fallbackBuffer) {
    return null
  }

  const updateBuffer: EditorContext["updateBuffer"] = async (
    id,
    payload,
    setNewActiveBuffer = false,
  ) => {
    const editorViewState = editorRef.current?.saveViewState()
    const bufferType = await bufferStore.getBufferTypeById(id)
    let newPosition = null

    if (payload && "isTemporary" in payload) {
      if (payload.isTemporary) {
        setTemporaryBufferId(id)
      } else if (id === temporaryBufferId) {
        if (payload?.archived === false) {
          newPosition = getNextPosition()
        } else {
          newPosition = -1
        }
        setTemporaryBufferId(null)
      }
    }

    const { isTemporary: _, ...dbPayload } = payload || {}
    const isPreviewContentWrite =
      id === temporaryBufferId && !(payload && "isTemporary" in payload)
    const {
      value: _value,
      metricsViewState: _metrics,
      notebookViewState: _notebook,
      ...previewSafePayload
    } = dbPayload
    // Renaming a notebook opened from an example dashboard makes it the user's
    // own: it leaves the example row and is kept like any other notebook.
    const detachFromExample =
      payload !== undefined &&
      "label" in payload &&
      buffers.find((b) => b.id === id)?.templateId !== undefined
    const effectivePayload = {
      ...(isPreviewContentWrite ? previewSafePayload : dbPayload),
      ...(newPosition !== null ? { position: newPosition } : {}),
      ...(detachFromExample ? { templateId: undefined } : {}),
    }

    if (Object.keys(effectivePayload).length > 0) {
      await bufferStore.update(id, {
        ...effectivePayload,
        ...(editorViewState && bufferType === BufferType.SQL
          ? { editorViewState }
          : {}),
      })
    }
    const promotedActive = promoteActivePreview(activeBufferRef.current, id, {
      ...payload,
      ...effectivePayload,
    })
    if (promotedActive) {
      activeBufferRef.current = promotedActive
      setActiveBufferState(promotedActive)
    }
    if (setNewActiveBuffer) {
      await setActiveBufferOnRemoved(id)
    }
    if (searchUpdateTimeoutRef.current) {
      window.clearTimeout(searchUpdateTimeoutRef.current)
    }

    const searchUpdateKeys = ["value", "label", "archived", "notebookViewState"]
    const keys = Object.keys(payload || {})
    if (searchUpdateKeys.some((key) => keys.includes(key))) {
      searchUpdateTimeoutRef.current = window.setTimeout(() => {
        const contentOnlyKeys = ["value", "notebookViewState"]
        const metaUpdate = !(
          keys.length === 1 && contentOnlyKeys.includes(keys[0])
        )
        const contentUpdate = keys.some((key) => contentOnlyKeys.includes(key))
        eventBus.publish(EventType.BUFFERS_UPDATED, {
          type: "update",
          metaUpdate,
          contentUpdate,
          bufferId: id,
        })
        searchUpdateTimeoutRef.current = null
      }, 300)
    }
  }

  const setActiveBufferOnRemoved = async (id: number) => {
    const activeBufferId = (await bufferStore.getActiveId())?.value
    recentBufferIdsRef.current = recentBufferIdsRef.current.filter(
      (recentId) => recentId !== id,
    )
    if (typeof activeBufferId !== "undefined" && activeBufferId === id) {
      const nextActive = await resolveNextActiveBuffer({
        snapshot: buffers,
        loadStored: async () =>
          (await bufferStore.getAll()).filter(
            (buffer) => !isPendingImportDeletion(buffer),
          ),
        removedId: id,
        recentIds: recentBufferIdsRef.current,
        previewId: temporaryBufferId,
      })
      await setActiveBuffer(nextActive ?? fallbackBuffer)
    } else {
      editorRef.current?.focus()
    }
  }

  const archiveBuffer: EditorContext["archiveBuffer"] = async (
    id,
    initiator = "user",
  ) => {
    // Snapshot before write — live query refresh makes post-update read unreliable.
    const target = buffers.find((b) => b.id === id)
    await updateBuffer(id, {
      archived: true,
      archivedAt: new Date().getTime(),
      position: -1,
      // A closed example notebook is the user's own from now on: it is listed
      // with the other closed notebooks and can be reopened, while the example
      // row opens a fresh copy. (A user's close deletes it instead; an agent's
      // archive must stay reversible.)
      ...(target?.templateId !== undefined ? { templateId: undefined } : {}),
    })
    await setActiveBufferOnRemoved(id)
    eventBus.publish(EventType.BUFFERS_UPDATED, {
      type: "archive",
      bufferId: id,
    })
    if (target && initiator === "user") {
      emitUserAction({
        kind: "user_archived_tab",
        bufferId: id,
        tabKind: tabKindOf(target),
        label: target.label,
      })
    }
    if (target?.notebookViewState) {
      releaseArchivedBuffer(id)
    }
  }

  const duplicateNotebook: EditorContext["duplicateNotebook"] = async (
    id,
    { activate = true, signal } = {},
  ) => {
    const source = buffers.find((b) => b.id === id)
    const sourceView = source?.notebookViewState
    if (!sourceView) return undefined

    const { view, controller } = await withBoundNotebookReadOnly(
      id,
      (v, ctrl) => Promise.resolve({ view: v, controller: ctrl }),
      signal,
    ).catch((error) => {
      if (signal?.aborted) throw error
      return { view: sourceView, controller: undefined }
    })
    // Persist any throttled live chart frame so the copy carries the frame the
    // source currently shows, not the last one on disk.
    try {
      await controller?.flushChartSnapshots?.()
    } catch {
      // Best-effort — a flush failure must never block the duplicate
    }
    const { notebookViewState, cellIdMap } =
      cloneNotebookViewStateWithCellIdMap(view)
    const sourceQueries = new Map(
      view.cells.map((cell) => [cell.id, getQueriesFromText(cell.value)]),
    )
    const duplicate = await addBuffer(
      {
        label: nextCopyLabel(source.label),
        notebookViewState,
      },
      { afterBufferId: id, activate: false, signal },
    )
    if (!duplicate?.id) return undefined
    const duplicateId = duplicate.id

    const resultsCopied = enqueueBufferTask(duplicateId, async () => {
      try {
        await copyNotebookSnapshots(id, duplicateId, cellIdMap, (snapshot) => {
          const queries = sourceQueries.get(snapshot.cellId)
          return (
            queries !== undefined &&
            snapshotResultsMatchQueries(snapshot.results, queries)
          )
        })
      } catch (error) {
        console.error("Failed to copy notebook result snapshots", error)
        toast.error(
          "The notebook was duplicated, but its saved results could not be copied.",
          { toastId: SNAPSHOT_COPY_ERROR_TOAST_ID },
        )
      }
    })

    if (activate) await setActiveBuffer(duplicate, { focus: true })
    else void resultsCopied.then(() => pruneToRecentNotebooks())
    return duplicate
  }

  const deleteBuffer: EditorContext["deleteBuffer"] = async (
    id,
    setActiveBuffer = true,
    initiator = "user",
  ) => {
    const target = buffers.find((b) => b.id === id)
    await bufferStore.delete(id)
    cleanupExecutionRefs(id)
    // Deleting the previewed tab ends the preview; don't keep pointing at a
    // row that no longer exists.
    if (id === temporaryBufferId) {
      setTemporaryBufferId(null)
    }
    if (setActiveBuffer) {
      await setActiveBufferOnRemoved(id)
    }
    eventBus.publish(EventType.BUFFERS_UPDATED, {
      type: "delete",
      bufferId: id,
    })
    // The AI diff tab is not a user tab and agents never see it in
    // <workspace>: its removal is not a user deletion, whatever path closed it.
    if (target && initiator === "user" && !target.isPreviewBuffer) {
      emitUserAction({
        kind: "user_deleted_tab",
        bufferId: id,
        tabKind: tabKindOf(target),
        label: target.label,
      })
    }
    if (target?.notebookViewState) {
      void deleteNotebookSnapshots(id)
      removeNotebookBufferLayouts(id)
    }
    forgetBuffer(id)
    // Deleting an open tab leaves a gap in the positions; a new tab would
    // land in the middle of the bar because addBuffer positions by count.
    if (target && !target.archived && !target.isTemporary) {
      await updateBuffersPositions(positionsWithout(buffers, id))
    }
  }

  const previewBuffer: EditorContext["previewBuffer"] = async (id) => {
    const buffer = buffers.find((b) => b.id === id)
    if (!buffer) return
    if (temporaryBufferId !== id) {
      if (temporaryBufferId !== null) {
        await updateBuffer(temporaryBufferId, { isTemporary: false })
      }
      await updateBuffer(id, { isTemporary: true })
    }
    await setActiveBuffer(
      { ...buffer, isTemporary: true },
      { focus: false, fromSearch: true },
    )
  }

  const discardPreview: EditorContext["discardPreview"] = async () => {
    if (temporaryBufferId === null) return
    await updateBuffer(temporaryBufferId, { isTemporary: false }, true)
  }

  const updateBuffersPositions: EditorContext["updateBuffersPositions"] =
    async (positions) => {
      await db.transaction("rw", db.buffers, async () => {
        for (const { id, position } of positions) {
          await db.buffers.update(id, { position })
        }
      })
    }

  const hasContent = (buffer: Buffer) =>
    buffer.value !== "" ||
    (buffer.metricsViewState?.metrics?.length ?? 0) > 0 ||
    buffer.notebookViewState != null

  const closeBuffer: EditorContext["closeBuffer"] = async (id) => {
    const buffer = buffers.find((b) => b.id === id)
    if (!buffer) return

    if (buffer.isTemporary) {
      await discardPreview()
      return
    }

    // The AI diff tab is not a user tab: it closes even next to a single tab,
    // and its removal is never reported to an agent as a user deletion.
    if (buffer.isPreviewBuffer) {
      await deleteBuffer(id, true, "agent")
      return
    }

    if (sortPinnedBuffers(buffers).length === 1) return

    // Notebooks opened from an example dashboard are not kept in history: the
    // example row recreates its notebook on demand.
    if (buffer.templateId !== undefined) {
      await deleteBuffer(id, true)
      return
    }

    if (hasContent(buffer)) {
      void trackEvent(ConsoleEvent.TAB_ARCHIVE, { type: bufferTypeOf(buffer) })
      await archiveBuffer(id)
    } else {
      await deleteBuffer(id)
    }
    await updateBuffersPositions(positionsWithout(buffers, id))
  }

  const keepBufferOpen: EditorContext["keepBufferOpen"] = async (id) => {
    const buffer = buffers.find((b) => b.id === id)
    if (!buffer) return
    const keptFields = {
      archived: false,
      archivedAt: undefined,
      isTemporary: false,
      position: nextOpenPosition(buffers),
    }
    await updateBuffer(id, keptFields)
    await setActiveBuffer({ ...buffer, ...keptFields }, { focus: true })
    // The kept tab is usually already active, so setActiveBuffer returned early
    // without focusing. Focus explicitly: the "Keep open" button that held focus
    // has just unmounted, and the first keystrokes would otherwise be lost.
    if (!buffer.notebookViewState && !buffer.metricsViewState) {
      editorRef.current?.focus()
    }
  }

  const restoreBuffer: EditorContext["restoreBuffer"] = async (id) => {
    if (id === temporaryBufferId) {
      await keepBufferOpen(id)
      return
    }
    const buffer = buffers.find((b) => b.id === id)
    if (!buffer) return
    const restoredFields = {
      archived: false,
      archivedAt: undefined,
      // Fresh read: the render-time list can miss a just-finished restore.
      position: nextOpenPosition(await bufferStore.getAll()),
    }
    await updateBuffer(id, restoredFields)
    await setActiveBuffer({ ...buffer, ...restoredFields })
  }

  const reorderBuffer: EditorContext["reorderBuffer"] = async (id, toIndex) => {
    const positions = positionsAfterMove(buffers, id, toIndex)
    if (positions.length > 0) {
      await updateBuffersPositions(positions)
    }
  }

  const clearArchivedBuffers: EditorContext["clearArchivedBuffers"] =
    async () => {
      for (const buffer of closedBuffersToDelete(buffers)) {
        await deleteBuffer(buffer.id as number)
      }
    }

  // The template's cells start fresh (results are stripped on parse); charts
  // bootstrap themselves on mount, grid cells are run here so the dashboard
  // fills in without a click per cell.
  const runNotebookCells = async (bufferId: number) => {
    try {
      const cells = await withBoundNotebook(
        bufferId,
        async (controller) => (await controller.readView()).cells,
      )
      for (const cell of cells) {
        if (cell.type === "markdown" || cell.mode === "draw") continue
        await withBoundNotebook(bufferId, (controller) =>
          controller.runCell(cell.id),
        )
      }
    } catch (error) {
      console.error("Could not run the example dashboard:", error)
    }
  }

  // First run of an imported notebook's cells: only the ones the import
  // planned, through the auto-run gate so a write statement can never slip
  // through even if the plan was stale.
  const runImportedNotebookCells: EditorContext["runImportedNotebookCells"] =
    async (bufferId, cellIds) => {
      for (const cellId of cellIds) {
        try {
          await withBoundNotebook(bufferId, (controller) =>
            controller.runCell(cellId, undefined, undefined, {
              kind: "autoRun",
            }),
          )
        } catch (error) {
          console.error("Could not run an imported cell:", error)
        }
      }
    }

  const openExampleDashboard: EditorContext["openExampleDashboard"] = async (
    example,
  ) => {
    const open = buffers.find(
      (b) => b.templateId === example.id && !b.archived && !b.isTemporary,
    )
    if (open) {
      await setActiveBuffer(open)
      return
    }
    try {
      const { notebookViewState } = await fetchExampleDashboard(example.path)
      const created = await addBuffer({
        label: example.title,
        notebookViewState,
        templateId: example.id,
      })
      if (created?.id !== undefined) {
        void runNotebookCells(created.id)
      }
    } catch (error) {
      console.error(error)
      toast.error(
        error instanceof Error
          ? `Could not open the example dashboard: ${error.message}`
          : "Could not open the example dashboard",
      )
    }
  }

  // Schema tree "Query": a notebook named after the table with a cell reading
  // its newest rows every second. A notebook with that name is reused: the
  // cell holding this query is focused, or, without one, the cell is appended
  // and run. A user notebook that happens to share the name keeps its cells.
  const openTableNotebook: EditorContext["openTableNotebook"] = async ({
    name,
    designatedTimestamp,
  }) => {
    const cell = buildTablePreviewCell(name, designatedTimestamp)
    const createTableNotebook = async () => {
      const created = await addBuffer({
        label: name,
        notebookViewState: { cells: [cell] },
      })
      if (created?.id !== undefined) {
        void runNotebookCells(created.id)
      }
    }
    // Fresh read: the schema rows are virtualized and may call in with a
    // render snapshot that predates the tab created by the previous click.
    const candidates = (await bufferStore.getAll()).filter(
      (b) =>
        b.label === name &&
        b.notebookViewState != null &&
        !b.archived &&
        b.id !== temporaryBufferId &&
        b.id !== undefined,
    )
    if (candidates.length === 0) {
      await createTableNotebook()
      return
    }
    const sql = cell.value.trim()
    const isQueryCell = (c: NotebookCell) =>
      c.type !== "markdown" && c.value.trim() === sql
    const views = await Promise.all(
      candidates.map((b) =>
        withBoundNotebookReadOnly(b.id as number, (view) =>
          Promise.resolve(view),
        ),
      ),
    )
    const withCellIndex = views.findIndex((view) =>
      view.cells.some(isQueryCell),
    )
    if (withCellIndex !== -1) {
      const target = candidates[withCellIndex]
      const existing = views[withCellIndex].cells.find(isQueryCell)
      await setActiveBuffer(target)
      if (existing) revealCellForEditing(target.id as number, existing.id)
      return
    }

    const target = candidates[0]
    const bufferId = target.id as number
    const cellId = cell.id
    // The table query's own name, refresh and colouring ride on the new cell.
    const presentation: Partial<NotebookCell> = {
      name: cell.name,
      autoRefresh: cell.autoRefresh,
      paneView: cell.paneView,
      highlightConfig: cell.highlightConfig,
    }
    try {
      await withBoundNotebook(bufferId, (controller) =>
        controller.mutate((parts) => {
          const added = addCellTransition(parts, bufferId, {
            id: cellId,
            value: cell.value,
          })
          return {
            ...added,
            parts: {
              ...added.parts,
              cells: added.parts.cells.map((c) =>
                c.id === cellId ? { ...c, ...presentation } : c,
              ),
            },
          }
        }),
      )
    } catch (error) {
      if (error instanceof NotebookToolError && error.code === "cell_limit") {
        await createTableNotebook()
        return
      }
      console.error(error)
      toast.error(
        error instanceof Error
          ? `Failed to add cell: ${error.message}`
          : "Failed to add cell",
      )
      return
    }
    emitUserAction({ kind: "user_added_cell", bufferId, cellId })
    await setActiveBuffer(target)
    revealCellForEditing(bufferId, cellId)
    try {
      await withBoundNotebook(bufferId, (controller) =>
        controller.runCell(cellId),
      )
    } catch (error) {
      console.error("Could not run the table query:", error)
    }
  }

  const closePreviewBuffer: EditorContext["closePreviewBuffer"] = async () => {
    const previewBuffer = buffers.find((b) => b.isPreviewBuffer && !b.archived)
    if (previewBuffer && previewBuffer.id) {
      // The diff buffer belongs to the AI suggestion flow, not to the user's
      // tabs — never report its removal as a user deletion.
      await deleteBuffer(previewBuffer.id, true, "agent")
    }
  }

  const applyAISQLChange: EditorContext["applyAISQLChange"] = (options) => {
    const { newSQL, queryKey } = options

    if (!editorRef.current) {
      return { success: false }
    }

    const model = editorRef.current.getModel()
    if (!model) {
      return { success: false }
    }

    let finalQueryStartOffset: number = 0
    let replaceRange: IRange | null = null
    let shouldReplace = false

    if (queryKey) {
      try {
        const { queryText, startOffset, endOffset } = parseQueryKey(queryKey)
        const currentEditorText = model.getValue()
        const queryInEditor = currentEditorText.slice(startOffset, endOffset)
        const normalizedQueryInEditor = normalizeQueryText(queryInEditor)
        const normalizedOriginalQuery = normalizeQueryText(queryText)

        if (normalizedQueryInEditor === normalizedOriginalQuery) {
          const startPosition = model.getPositionAt(startOffset)

          let extendedEndOffset = endOffset
          const textAfterQuery = currentEditorText.slice(
            endOffset,
            endOffset + 10,
          )
          const semicolonMatch = textAfterQuery.match(/^(\s*;)/)
          if (semicolonMatch) {
            extendedEndOffset = endOffset + semicolonMatch[0].length
          }

          const endPosition = model.getPositionAt(extendedEndOffset)
          replaceRange = {
            startLineNumber: startPosition.lineNumber,
            startColumn: startPosition.column,
            endLineNumber: endPosition.lineNumber,
            endColumn: endPosition.column,
          }
          finalQueryStartOffset = startOffset
          shouldReplace = true
        }
      } catch {
        // Invalid queryKey or query not found — fall back to appending.
      }
    }

    if (!shouldReplace || !replaceRange) {
      const lineNumber = model.getLineCount()
      const column = model.getLineMaxColumn(lineNumber)
      finalQueryStartOffset = model.getOffsetAt({ lineNumber, column })
      replaceRange = {
        startLineNumber: lineNumber,
        startColumn: column,
        endLineNumber: lineNumber,
        endColumn: column,
      }
    }

    // Apply the edit with proper semicolon handling
    // normalizeSql ensures: removes trailing semicolon, formats, then adds single semicolon
    const sqlWithSemicolon = normalizeSql(newSQL)
    const isAppend =
      replaceRange.startColumn === replaceRange.endColumn &&
      replaceRange.startLineNumber === replaceRange.endLineNumber
    editorRef.current.executeEdits("accept-ai-change", [
      {
        range: replaceRange,
        text: isAppend ? "\n" + sqlWithSemicolon + "\n" : sqlWithSemicolon,
        forceMoveMarkers: true,
      },
    ])

    // Recalculate positions after edit
    const finalModel = editorRef.current.getModel()
    if (!finalModel) {
      return { success: false }
    }

    const actualQueryStartOffset = isAppend
      ? finalQueryStartOffset + 1
      : finalQueryStartOffset
    const normalizedQuery = normalizeQueryText(sqlWithSemicolon)
    const actualQueryEndOffset = actualQueryStartOffset + normalizedQuery.length

    const finalStartPosition = finalModel.getPositionAt(actualQueryStartOffset)
    const finalEndPosition = finalModel.getPositionAt(actualQueryEndOffset)

    // Apply highlighting decoration
    const highlightRange = {
      startLineNumber: finalStartPosition.lineNumber,
      startColumn: finalStartPosition.column,
      endLineNumber: finalEndPosition.lineNumber,
      endColumn: finalEndPosition.column,
    }

    const decorationId = finalModel.deltaDecorations(
      [],
      [
        {
          range: highlightRange,
          options: {
            isWholeLine: false,
            className: "aiQueryHighlight",
          },
        },
      ],
    )

    // Set cursor to beginning of the query and focus the editor
    editorRef.current.setPosition(finalStartPosition)
    editorRef.current.revealPositionNearTop(finalStartPosition)
    editorRef.current.focus()

    setTimeout(() => {
      if (!finalModel.isDisposed()) {
        finalModel.deltaDecorations(decorationId, [])
      }
    }, 1000)

    // Return the final query key for caller to update conversation state
    const finalQueryKey = createQueryKey(
      normalizedQuery,
      actualQueryStartOffset,
    )

    return {
      success: true,
      finalQueryKey,
      queryStartOffset: actualQueryStartOffset,
    }
  }

  // Parks an edit reveal for the cell; the notebook and its editor drain it
  // once mounted, so the cursor lands in the cell even on a cold mount.
  const revealCellForEditing = (bufferId: number, cellId: string) => {
    requestCellReveal({
      bufferId,
      cellId,
      range: CELL_START_RANGE,
      notebookField: "cell",
      cellType: "sql",
      mode: "edit",
    })
    eventBus.publish(EventType.NOTEBOOK_REVEAL_CELL)
  }

  const openNotebookWithCell = async (value: string) => {
    const cell = createCell(0, value)
    const notebook = await addBuffer({
      notebookViewState: { cells: [cell] },
    })
    if (notebook?.id === undefined) return
    revealCellForEditing(notebook.id, cell.id)
  }

  // Mirrors the notebook's "Add cell" button: the new cell lands at the end,
  // full width in grid mode, then takes focus with the cursor in its editor.
  // A notebook at its cell limit gets a fresh notebook whose first cell holds
  // the query.
  const appendNotebookCell = async (bufferId: number, value: string) => {
    try {
      const cellId = await withBoundNotebook(bufferId, (controller) =>
        controller.mutate((parts) =>
          addCellTransition(parts, bufferId, { id: generateId(), value }),
        ),
      )
      emitUserAction({ kind: "user_added_cell", bufferId, cellId })
      revealCellForEditing(bufferId, cellId)
    } catch (error) {
      if (error instanceof NotebookToolError && error.code === "cell_limit") {
        await openNotebookWithCell(value)
        return
      }
      console.error(error)
      toast.error(
        error instanceof Error
          ? `Failed to add cell: ${error.message}`
          : "Failed to add cell",
      )
    }
  }

  return (
    <EditorContext.Provider
      value={{
        editorRef,
        monacoRef,
        insertTextAtCursor: (text) => {
          if (editorRef?.current) {
            insertTextAtCursor(editorRef.current, text)
          }
        },
        appendQuery: (text) => {
          const targetBuffer = activeBufferRef.current
          switch (appendQueryTarget(targetBuffer)) {
            case "notebook-cell":
              if (targetBuffer.id !== undefined) {
                void appendNotebookCell(targetBuffer.id, text)
              }
              return
            case "new-notebook":
              void openNotebookWithCell(text)
              return
            case "new-sql-tab":
              void addBuffer({ value: text }, { shouldSelectAll: true })
              return
            case "editor":
              if (editorRef?.current) {
                appendQuery(editorRef.current, text)
              }
          }
        },
        tabsDisabled,
        setTabsDisabled,
        buffers,
        activeBuffer,
        setActiveBuffer,
        addBuffer,
        deleteBuffer,
        archiveBuffer,
        duplicateNotebook,
        updateBuffer,
        updateBuffersPositions,
        closeBuffer,
        restoreBuffer,
        keepBufferOpen,
        reorderBuffer,
        clearArchivedBuffers,
        openExampleDashboard,
        openTableNotebook,
        runImportedNotebookCells,
        previewBuffer,
        discardPreview,
        queryParamProcessedRef,
        isNavigatingFromSearchRef,
        showPreviewBuffer,
        closePreviewBuffer,
        applyAISQLChange,
        executionRefs,
        cleanupExecutionRefs,
        highlightQuery,
        editorReadyTrigger: (editor) => {
          if (!activeBuffer.isTemporary && !isNavigatingFromSearchRef.current) {
            editor.focus()
          }

          if (activeBuffer.editorViewState) {
            editor.restoreViewState(activeBuffer.editorViewState)
          }
        },
      }}
    >
      {children}
    </EditorContext.Provider>
  )
}

export const useEditor = () => useContext(EditorContext)
