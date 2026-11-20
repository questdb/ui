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
  nextCopyLabel,
} from "../../scenes/Editor/Notebook/notebookUtils"
import { snapshotResultsMatchQueries } from "../../scenes/Editor/Notebook/statementIdentity"
import { NotebookToolError } from "../../utils/notebooks/notebookToolError"
import type { ConversationId } from "../AIConversationProvider/types"
import { normalizeSql } from "../../utils/formatSql"
import type { Buffer, PreviewContent } from "../../store/buffers"
import {
  type BufferPosition,
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
import {
  readExampleLink,
  clearExampleLinkParams,
  planExampleStartup,
} from "../../utils/examples/exampleLink"
import { examplePersonalizationReason } from "../../utils/examples/examplePersonalization"
import { stripCellResults } from "../../scenes/Editor/Notebook/notebookUtils"
import { getValue, setValue } from "../../utils/localStorage"
import { StoreKey } from "../../utils/localStorage/types"
import { tabKindOf } from "../../utils/ai/workspaceInfo"
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
import { ExampleDashboardLoading } from "./ExampleDashboardLoading"
import {
  createNotebookOpeners,
  exampleErrorMessage,
  runCellsAutomatically,
  runNotebookAutomatically,
} from "./notebookOpeners"
import { db } from "../../store/db"
import {
  copyNotebookSnapshots,
  deleteNotebookSnapshots,
  pruneToRecentNotebooks,
} from "../../store/notebookResults"
import { removeNotebookBufferLayouts } from "../../scenes/Editor/Notebook/notebookColumnLayoutStore"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"
import {
  emitUserAction,
  getBufferActionSeq,
} from "../../utils/notebooks/notebookAIBridge"
import {
  getController,
  forgetBuffer,
  releaseArchivedBuffer,
  withBoundNotebookReadOnly,
} from "../../utils/notebooks/notebookController"
import { enqueueBufferTask } from "../../utils/notebooks/notebookBufferQueue"
import { aiConversationStore } from "../../store/aiConversations"
import { isMonitoringDashboard } from "../../utils/monitoring/identity"

import { useLiveQuery } from "dexie-react-hooks"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"

export const MAX_TABS = 100

const SNAPSHOT_COPY_ERROR_TOAST_ID = "notebook-snapshot-copy-error"

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

export type RemoveBufferOptions = {
  // An agent's removal is not reported back to it as a user action, and a tab
  // that no longer exists is an error for it.
  initiator?: "user" | "agent"
  // Whether the editor takes focus once the tab is gone. Off for callers that
  // keep keyboard focus themselves (the Tabs panel).
  focus?: boolean
}

export type DeleteBufferOptions = RemoveBufferOptions & {
  // Whether another tab is activated when the deleted tab was the active one.
  activateNext?: boolean
}

export type EditorContext = {
  editorRef: MutableRefObject<IStandaloneCodeEditor | null>
  monacoRef: MutableRefObject<Monaco | null>
  insertTextAtCursor: (text: string) => void
  appendQuery: (query: string) => void
  tabsDisabled: boolean
  // Live read for async flows that outlive the component that started them.
  isTabsDisabled: () => boolean
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
  deleteBuffer: (id: number, options?: DeleteBufferOptions) => Promise<void>
  archiveBuffer: (id: number, options?: RemoveBufferOptions) => Promise<void>
  duplicateNotebook: (
    id: number,
    options?: { activate?: boolean; signal?: AbortSignal },
  ) => Promise<Buffer | undefined>
  updateBuffer: (
    id: number,
    buffer?: Partial<Buffer>,
    setNewActiveBuffer?: boolean,
  ) => Promise<void>
  closeBuffer: (id: number, options?: { focus?: boolean }) => Promise<void>
  restoreBuffer: (id: number, options?: { focus?: boolean }) => Promise<void>
  keepBufferOpen: (id: number, options?: { focus?: boolean }) => Promise<void>
  reorderBuffer: (id: number, toIndex: number) => Promise<void>
  clearArchivedBuffers: () => Promise<void>
  openExampleDashboard: (example: ExampleDashboard) => Promise<void>
  // Ids of the example dashboards whose file is being fetched.
  openingExampleIds: string[]
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
  isTabsDisabled: () => false,
  setTabsDisabled: () => undefined,
  buffers: [],
  activeBuffer: fallbackBuffer,
  setActiveBuffer: () => Promise.resolve(),
  addBuffer: () => Promise.resolve(fallbackBuffer),
  deleteBuffer: () => Promise.resolve(),
  archiveBuffer: () => Promise.resolve(),
  duplicateNotebook: () => Promise.resolve(undefined),
  updateBuffer: () => Promise.resolve(),
  closeBuffer: () => Promise.resolve(),
  restoreBuffer: () => Promise.resolve(),
  keepBufferOpen: () => Promise.resolve(),
  reorderBuffer: () => Promise.resolve(),
  clearArchivedBuffers: () => Promise.resolve(),
  openExampleDashboard: () => Promise.resolve(),
  openingExampleIds: [],
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

type ExampleFetchResult =
  | { ok: true; content: ExampleDashboardContent }
  | { ok: false; error: unknown }

const isPendingImportDeletion = (buffer: Buffer) =>
  (buffer as Record<string, unknown>)._markedForDeletion === true

// The stored tabs without the rows a running import is about to delete.
const loadStoredBuffers = async () =>
  (await bufferStore.getAll()).filter(
    (buffer) => !isPendingImportDeletion(buffer),
  )

const EditorContext = createContext<EditorContext>(defaultValues)

// The editor context value changes on every buffer write (each keystroke in the
// SQL editor). Layout-level consumers that only need to know which tab is
// active read this narrow, memoized summary instead.
export type ActiveBufferSummary = {
  id: number | undefined
  isNotebook: boolean
}

const ActiveBufferSummaryContext = createContext<ActiveBufferSummary>({
  id: undefined,
  isNotebook: false,
})

export const EditorProvider: React.FC = ({ children }) => {
  const editorRef = useRef<IStandaloneCodeEditor>(null)
  const monacoRef = useRef<Monaco>(null)
  const executionRefs = useRef<ExecutionRefs>({})
  const [loadedMonaco, setLoadedMonaco] = useState<Monaco | null>(null)
  const [temporaryBufferId, setTemporaryBufferId] = useState<number | null>(
    null,
  )
  const [tabsDisabled, setTabsDisabledState] = useState(false)
  const tabsDisabledRef = useRef(false)
  const setTabsDisabled = useCallback((disabled: boolean) => {
    tabsDisabledRef.current = disabled
    setTabsDisabledState(disabled)
  }, [])
  const isTabsDisabled = useCallback(() => tabsDisabledRef.current, [])
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
  const activeIsNotebook = !!activeBuffer.notebookViewState
  const activeBufferSummary = useMemo<ActiveBufferSummary>(
    () => ({ id: activeBuffer.id, isNotebook: activeIsNotebook }),
    [activeBuffer.id, activeIsNotebook],
  )
  const activeBufferRef = useRef(activeBuffer)
  const focusEditorOnMountRef = useRef(true)
  const recentBufferIdsRef = useRef<number[]>([])
  const bufferSwitchQueueRef = useRef<Promise<void>>(Promise.resolve())
  const bufferRemovalQueueRef = useRef<Promise<void>>(Promise.resolve())
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
  const [exampleLink] = useState(() =>
    readExampleLink({
      search: window.location.search,
      consoleConfig,
      autoOpened: getValue(StoreKey.EXAMPLE_DASHBOARD_AUTO_OPENED) !== "",
    }),
  )
  const startupExample = exampleLink.fetchExample
  const autoOpenRef = useRef<Promise<ExampleFetchResult> | null>(null)
  if (autoOpenRef.current === null && startupExample) {
    autoOpenRef.current = fetchExampleDashboard(startupExample.path).then(
      (content): ExampleFetchResult => ({ ok: true, content }),
      (error: unknown): ExampleFetchResult => ({ ok: false, error }),
    )
  }
  const [autoOpenedId, setAutoOpenedId] = useState<number | null>(null)
  // The first example is being fetched for a first-time visitor: a spinner
  // stands in for the console until the tab exists or the fetch fails.
  const [loadingFirstExample, setLoadingFirstExample] = useState(false)

  // One request per example or table at a time: a double-click must not create
  // two tabs while the first is still being fetched or written.
  const exampleRequestsRef = useRef(new Map<string, Promise<void>>())
  const [openingExampleIds, setOpeningExampleIds] = useState<string[]>([])
  const tableNotebookRequestsRef = useRef(new Map<string, Promise<void>>())

  // A notebook whose example is no longer configured (the operator removed or
  // renamed it) becomes a regular notebook: listed with the user's tabs and
  // kept in history when closed.
  const exampleIds = useMemo(
    () =>
      new Set(
        hasExampleDashboards(consoleConfig)
          ? consoleConfig.exampleDashboards.map((example) => example.id)
          : [],
      ),
    [consoleConfig],
  )
  useEffect(() => {
    if (!rawBuffers) return
    const stale = rawBuffers.filter(
      (buffer) =>
        typeof buffer.id === "number" &&
        buffer.templateId !== undefined &&
        !exampleIds.has(buffer.templateId) &&
        !isMonitoringDashboard(buffer),
    )
    if (stale.length === 0) return
    void db
      .transaction("rw", db.buffers, async () => {
        for (const buffer of stale) {
          await db.buffers.update(buffer.id as number, {
            templateId: undefined,
          })
        }
      })
      .catch((error: unknown) => {
        console.error("Could not detach removed example dashboards:", error)
      })
  }, [rawBuffers, exampleIds])

  useSchemaCompletionProvider(loadedMonaco)

  const cleanupExecutionRefs = useCallback((bufferId: number) => {
    delete executionRefs.current[bufferId.toString()]
  }, [])

  const setActiveBuffer = useCallback(
    (buffer: Buffer, options?: { focus?: boolean; fromSearch?: boolean }) => {
      const switchBuffer = async () => {
        try {
          const currentActiveBufferId = (await bufferStore.getActiveId())?.value

          // Already active only if it is also the tab on screen: the stored id
          // alone can lag behind (see activateStored).
          if (currentActiveBufferId) {
            if (
              buffer.id === currentActiveBufferId &&
              activeBufferRef.current.id === buffer.id
            ) {
              activeBufferRef.current = buffer
              setActiveBufferState(buffer)
              return
            }
          }

          const previousBufferId = activeBufferRef.current.id
          const previousBuffer =
            typeof previousBufferId === "number"
              ? await bufferStore.getById(previousBufferId)
              : undefined

          await bufferStore.setActiveId(buffer.id as number)
          const recentIds = recentBufferIdsRef.current.filter(
            (id) => id !== buffer.id,
          )
          recentBufferIdsRef.current =
            previousBuffer &&
            !previousBuffer.archived &&
            !previousBuffer.isTemporary
              ? pushRecentBuffer(recentIds, previousBuffer.id as number)
              : recentIds
          activeBufferRef.current = buffer
          focusEditorOnMountRef.current = options?.focus !== false
          setActiveBufferState(buffer)

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
      }
      const request = bufferSwitchQueueRef.current.then(switchBuffer)
      bufferSwitchQueueRef.current = request
      return request
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
      const bufferType = bufferTypeOf(newBuffer ?? {})
      const fallback = makeFallbackBuffer(bufferType)
      const created = await db.transaction("rw", db.buffers, async () => {
        const storedBuffers = await loadStoredBuffers()
        if (signal?.aborted) {
          throw new DOMException("Aborted", "AbortError")
        }
        if (storedBuffers.length >= MAX_TABS) return undefined

        const currentDefaultTabNumbers = storedBuffers
          .filter((buffer) => {
            if (!buffer.label.startsWith(fallback.label)) return false
            if (newBuffer?.notebookViewState)
              return buffer.notebookViewState !== undefined
            if (newBuffer?.metricsViewState)
              return buffer.metricsViewState !== undefined
            return true
          })
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

        const activeBuffers = sortPinnedBuffers(storedBuffers)
        const insertAfter =
          afterBufferId !== undefined
            ? activeBuffers.find((b) => b.id === afterBufferId)
            : undefined
        const position = insertAfter
          ? insertAfter.position + 1
          : nextOpenPosition(storedBuffers)

        const buffer = makeBuffer({
          ...newBuffer,
          label: newBuffer?.label ?? `${fallback.label} ${nextNumber()}`,
          position,
        })

        if (insertAfter) {
          const toShift = activeBuffers.filter(
            (b) => typeof b.id === "number" && b.position >= position,
          )
          for (const b of toShift) {
            if (signal?.aborted) {
              throw new DOMException("Aborted", "AbortError")
            }
            await db.buffers.update(b.id as number, {
              position: b.position + 1,
            })
          }
        }
        if (signal?.aborted) {
          throw new DOMException("Aborted", "AbortError")
        }
        const id = await db.buffers.add(buffer)
        return { buffer: { ...buffer, id }, count: storedBuffers.length + 1 }
      })
      if (!created) {
        toast.error(
          `Tab limit reached (${MAX_TABS}). Delete closed tabs from the Tabs panel to free up space.`,
        )
        return undefined
      }

      const { buffer, count } = created
      void trackEvent(ConsoleEvent.TAB_ADD, { type: bufferType, count })

      const shouldActivate = activate && !tabsDisabledRef.current
      if (shouldActivate) {
        await setActiveBuffer(buffer, { focus: true })
      }

      if (
        shouldActivate &&
        shouldSelectAll &&
        editorRef.current &&
        !newBuffer?.notebookViewState
      ) {
        const model = editorRef.current.getModel()
        if (model) {
          editorRef.current.setSelection(model.getFullModelRange())
        }
      }

      return buffer
    },
    [setActiveBuffer],
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
      // The stored id can point at a closed tab (the page was reloaded during
      // its preview). Store the tab actually shown, or the next switch to the
      // closed tab is taken for a no-op and keeps this tab's editor model.
      if (
        typeof nextBuffer.id === "number" &&
        nextBuffer.id !== activeBufferId
      ) {
        void bufferStore.setActiveId(nextBuffer.id)
      }
    }

    clearExampleLinkParams()
    const startup = planExampleStartup(exampleLink, buffers, MAX_TABS)
    if (startup.kind === "stored") {
      if (startup.error) toast.error(startup.error)
      if (startup.markAutoOpened)
        setValue(StoreKey.EXAMPLE_DASHBOARD_AUTO_OPENED, "true")
      activateStored()
      return
    }
    if (startup.kind === "reuse") {
      const open = startup.buffer
      activeBufferRef.current = open
      setActiveBufferState(open)
      void bufferStore.setActiveId(open.id as number)
      void trackEvent(ConsoleEvent.TAB_PANEL_EXAMPLE_OPEN, {
        id: startup.example.id,
        source: "link",
        reused: true,
      })
      return
    }
    const pending = autoOpenRef.current
    if (!pending) {
      activateStored()
      return
    }
    // First visit on a showcase deployment, or a template link: create the
    // example tab and make it the active one. A spinner shows while the file is
    // fetched; a file that cannot be loaded is reported once and the visitor
    // gets the stored tab.
    const { example, source, markAutoOpened } = startup
    setLoadingFirstExample(true)
    void trackEvent(ConsoleEvent.TAB_PANEL_EXAMPLE_OPEN, {
      id: example.id,
      source,
      reused: false,
    })
    void pending.then(async (result) => {
      if (!result.ok) {
        void trackEvent(ConsoleEvent.NOTEBOOK_EXAMPLE_LOAD, {
          templateId: example.id,
          source,
          outcome: "error",
        })
        console.error("Could not load the example dashboard:", result.error)
        toast.error(exampleErrorMessage(example.title, result.error))
        if (markAutoOpened)
          setValue(StoreKey.EXAMPLE_DASHBOARD_AUTO_OPENED, "true")
        activateStored()
        setLoadingFirstExample(false)
        return
      }
      try {
        const buffer = makeBuffer({
          label: example.title,
          notebookViewState: result.content.notebookViewState,
          templateId: example.id,
          position: nextOpenPosition(buffers),
        })
        const id = await db.buffers.add(buffer)
        await bufferStore.setActiveId(id)
        if (markAutoOpened)
          setValue(StoreKey.EXAMPLE_DASHBOARD_AUTO_OPENED, "true")
        const created = { ...buffer, id }
        activeBufferRef.current = created
        setActiveBufferState(created)
        setAutoOpenedId(id)
        void trackEvent(ConsoleEvent.NOTEBOOK_EXAMPLE_LOAD, {
          templateId: example.id,
          source,
          outcome: "success",
        })
      } catch (error) {
        void trackEvent(ConsoleEvent.NOTEBOOK_EXAMPLE_LOAD, {
          templateId: example.id,
          source,
          outcome: "error",
        })
        console.error("Could not open the example dashboard:", error)
        toast.error(exampleErrorMessage(example.title, error))
        activateStored()
      }
      setLoadingFirstExample(false)
    })
  }, [buffers, activeBufferId])

  // The notebook has to be mounted (the provider renders children only once an
  // active buffer exists and the loading spinner is gone) before its cells can
  // be run.
  useEffect(() => {
    if (
      loadingFirstExample ||
      autoOpenedId === null ||
      activeBuffer.id !== autoOpenedId
    ) {
      return
    }
    void runNotebookAutomatically(autoOpenedId)
    setAutoOpenedId(null)
  }, [autoOpenedId, activeBuffer.id, loadingFirstExample])

  if (loadingFirstExample && startupExample) {
    return <ExampleDashboardLoading title={startupExample.title} />
  }

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
        if (payload.archived !== false) {
          newPosition = -1
        } else if (payload.position === undefined) {
          newPosition = nextOpenPosition(buffers)
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
    const effectivePayload = {
      ...(isPreviewContentWrite ? previewSafePayload : dbPayload),
      ...(newPosition !== null ? { position: newPosition } : {}),
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

  const setActiveBufferOnRemoved = async (
    id: number,
    focus = true,
    snapshot: Buffer[] = buffers,
  ) => {
    const activeBufferId = (await bufferStore.getActiveId())?.value
    recentBufferIdsRef.current = recentBufferIdsRef.current.filter(
      (recentId) => recentId !== id,
    )
    if (typeof activeBufferId !== "undefined" && activeBufferId === id) {
      const nextActive = await resolveNextActiveBuffer({
        snapshot,
        loadStored: loadStoredBuffers,
        removedId: id,
        recentIds: recentBufferIdsRef.current,
        previewId: temporaryBufferId,
      })
      await setActiveBuffer(nextActive ?? fallbackBuffer, { focus })
    } else if (focus) {
      editorRef.current?.focus()
    }
  }

  const enqueueBufferRemoval = (
    id: number,
    initiator: "user" | "agent",
    remove: (target: Buffer, snapshot: Buffer[]) => Promise<void>,
  ) => {
    const result = bufferRemovalQueueRef.current.then(async () => {
      const stored = await loadStoredBuffers()
      const target = stored.find((buffer) => buffer.id === id)
      if (!target) {
        if (initiator === "agent") {
          throw new NotebookToolError("deleted", `Tab ${id} no longer exists.`)
        }
        return
      }
      if (
        !target.archived &&
        !target.isPreviewBuffer &&
        sortPinnedBuffers(stored).length <= 1
      ) {
        const error = new NotebookToolError(
          "last_tab",
          "Cannot close or delete the only open tab. Create another tab first.",
        )
        if (initiator === "agent") throw error
        toast.error(error.message)
        return
      }
      await remove(target, stored)
    })
    bufferRemovalQueueRef.current = result.catch(() => undefined)
    return result
  }

  const archiveBuffer: EditorContext["archiveBuffer"] = (
    id,
    { initiator = "user", focus } = {},
  ) =>
    enqueueBufferRemoval(id, initiator, async (target, snapshot) => {
      if (target.archived) return
      await updateBuffer(id, {
        archived: true,
        archivedAt: new Date().getTime(),
        position: -1,
        // An explicitly archived example becomes a recoverable personal copy.
        // The example menu can then open a fresh copy of the template.
        ...(target.templateId !== undefined ? { templateId: undefined } : {}),
      })
      await setActiveBufferOnRemoved(id, focus, snapshot)
      await compactPositionsAfterRemoval(target, snapshot)
      eventBus.publish(EventType.BUFFERS_UPDATED, {
        type: "archive",
        bufferId: id,
      })
      if (initiator === "user") {
        emitUserAction({
          kind: "user_archived_tab",
          bufferId: id,
          tabKind: tabKindOf(target),
          label: target.label,
        })
      }
      if (target.notebookViewState) {
        releaseArchivedBuffer(id)
      }
    })

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
    if (source.templateId !== undefined) {
      void trackEvent(ConsoleEvent.NOTEBOOK_EXAMPLE_COPY, {
        templateId: source.templateId,
      })
    }

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

  const deleteBufferNow = async (
    target: Buffer,
    snapshot: Buffer[],
    {
      activateNext = true,
      initiator = "user",
      focus,
    }: DeleteBufferOptions = {},
  ) => {
    const id = target.id as number
    await bufferStore.delete(id)
    cleanupExecutionRefs(id)
    // Deleting the previewed tab ends the preview; don't keep pointing at a
    // row that no longer exists.
    if (id === temporaryBufferId) {
      setTemporaryBufferId(null)
    }
    if (activateNext) {
      await setActiveBufferOnRemoved(id, focus, snapshot)
    }
    eventBus.publish(EventType.BUFFERS_UPDATED, {
      type: "delete",
      bufferId: id,
    })
    // The AI diff tab is not a user tab and agents never see it in
    // <workspace>: its removal is not a user deletion, whatever path closed it.
    if (initiator === "user" && !target.isPreviewBuffer) {
      emitUserAction({
        kind: "user_deleted_tab",
        bufferId: id,
        tabKind: tabKindOf(target),
        label: target.label,
      })
    }
    if (target.notebookViewState) {
      void deleteNotebookSnapshots(id)
      removeNotebookBufferLayouts(id)
    }
    forgetBuffer(id)
    await compactPositionsAfterRemoval(target, snapshot)
  }

  const deleteBuffer: EditorContext["deleteBuffer"] = (id, options = {}) =>
    enqueueBufferRemoval(id, options.initiator ?? "user", (target, snapshot) =>
      deleteBufferNow(target, snapshot, options),
    )

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

  const updateBuffersPositions = async (positions: BufferPosition[]) => {
    await db.transaction("rw", db.buffers, async () => {
      for (const { id, position } of positions) {
        await db.buffers.update(id, { position })
      }
    })
  }

  // Removing an open tab leaves a gap in the positions; a new tab would land
  // in the middle of the bar because addBuffer positions by count.
  const compactPositionsAfterRemoval = async (
    removed: Buffer,
    snapshot: Buffer[],
  ) => {
    if (removed.archived || removed.isTemporary) return
    await updateBuffersPositions(
      positionsWithout(snapshot, removed.id as number),
    )
  }

  const hasContent = (buffer: Buffer) =>
    buffer.value !== "" ||
    (buffer.metricsViewState?.metrics?.length ?? 0) > 0 ||
    buffer.notebookViewState != null

  const closeBuffer: EditorContext["closeBuffer"] = async (
    id,
    options = {},
  ) => {
    const buffer = buffers.find((b) => b.id === id)
    if (!buffer) return

    if (buffer.isTemporary) {
      await discardPreview()
      return
    }

    // The AI diff tab is not a user tab: it closes even next to a single tab,
    // and its removal is never reported to an agent as a user deletion.
    if (buffer.isPreviewBuffer) {
      await deleteBuffer(id, { ...options, initiator: "agent" })
      return
    }

    if (sortPinnedBuffers(buffers).length === 1) return

    const isTemplate = (target: Buffer) =>
      target.templateId !== undefined &&
      (exampleIds.has(target.templateId) || isMonitoringDashboard(target))
    if (isTemplate(buffer)) {
      // Keep the live handle if a tab switch unmounts it while close waits for
      // another removal. Its refs still contain any not-yet-persisted edit.
      const liveAtClose = getController(id)
      const actionSeq = getBufferActionSeq(id)
      let archive = false
      await enqueueBufferRemoval(id, "user", async (_target, snapshot) => {
        await enqueueBufferTask(id, async () => {
          // Pending document writes must settle before deciding: the render's
          // buffer snapshot may still carry a link that an edit just removed.
          const current = await bufferStore.getById(id)
          if (!current || current.archived) return
          if (!isTemplate(current)) {
            archive = true
            return
          }
          try {
            const live = getController(id) ?? liveAtClose
            const view = await live?.readView()
            if (
              view &&
              examplePersonalizationReason(current, { notebookViewState: view })
            ) {
              // Save the authoritative live document, without its result data,
              // so closing before the debounce fires cannot discard an edit.
              await bufferStore.update(id, {
                notebookViewState: {
                  ...view,
                  // The live view carries no focus; keep the stored one.
                  focusedCellId:
                    view.focusedCellId ??
                    current.notebookViewState?.focusedCellId,
                  cells: stripCellResults(view.cells),
                },
              })
              archive = true
              return
            }
            if (getBufferActionSeq(id) !== actionSeq) {
              archive = true
              return
            }
            // An AI chat about the notebook keeps it to point at.
            if (await aiConversationStore.hasNotebookConversation(id)) {
              archive = true
              return
            }
          } catch {
            // If the live document cannot be checked, keep the tab recoverable.
            archive = true
            return
          }
          await deleteBufferNow(current, snapshot, options)
        })
      })
      if (!archive) return
    }

    if (hasContent(buffer)) {
      void trackEvent(ConsoleEvent.TAB_ARCHIVE, { type: bufferTypeOf(buffer) })
      await archiveBuffer(id, options)
    } else {
      await deleteBuffer(id, options)
    }
  }

  const keepBufferOpen: EditorContext["keepBufferOpen"] = async (
    id,
    { focus = true } = {},
  ) => {
    const buffer = buffers.find((b) => b.id === id)
    if (!buffer) return
    const keptFields = {
      archived: false,
      archivedAt: undefined,
      isTemporary: false,
      position: nextOpenPosition(buffers),
    }
    await updateBuffer(id, keptFields)
    await setActiveBuffer({ ...buffer, ...keptFields }, { focus })
    // The kept tab is usually already active, so setActiveBuffer returned early
    // without focusing. Focus explicitly: the "Keep open" button that held focus
    // has just unmounted, and the first keystrokes would otherwise be lost.
    if (focus && !buffer.notebookViewState && !buffer.metricsViewState) {
      editorRef.current?.focus()
    }
  }

  const restoreBuffer: EditorContext["restoreBuffer"] = async (
    id,
    { focus = true } = {},
  ) => {
    if (id === temporaryBufferId) {
      await keepBufferOpen(id, { focus })
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
    await setActiveBuffer({ ...buffer, ...restoredFields }, { focus })
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

  const {
    appendNotebookCell,
    openNotebookWithCell,
    openExampleDashboard,
    openTableNotebook,
  } = createNotebookOpeners({
    buffers,
    temporaryBufferId,
    tabsDisabled,
    activeBufferRef,
    addBuffer,
    setActiveBuffer,
    exampleRequests: exampleRequestsRef.current,
    tableNotebookRequests: tableNotebookRequestsRef.current,
    setOpeningExampleIds,
  })

  const closePreviewBuffer: EditorContext["closePreviewBuffer"] = async () => {
    const previewBuffer = buffers.find((b) => b.isPreviewBuffer && !b.archived)
    if (previewBuffer && previewBuffer.id) {
      // The diff buffer belongs to the AI suggestion flow, not to the user's
      // tabs — never report its removal as a user deletion.
      await deleteBuffer(previewBuffer.id, { initiator: "agent" })
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
        isTabsDisabled,
        setTabsDisabled,
        buffers,
        activeBuffer,
        setActiveBuffer,
        addBuffer,
        deleteBuffer,
        archiveBuffer,
        duplicateNotebook,
        updateBuffer,
        closeBuffer,
        restoreBuffer,
        keepBufferOpen,
        reorderBuffer,
        clearArchivedBuffers,
        openExampleDashboard,
        openingExampleIds,
        openTableNotebook,
        runImportedNotebookCells: runCellsAutomatically,
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
          if (
            focusEditorOnMountRef.current &&
            !activeBuffer.isTemporary &&
            !isNavigatingFromSearchRef.current
          ) {
            editor.focus()
          }

          if (activeBuffer.editorViewState) {
            editor.restoreViewState(activeBuffer.editorViewState)
          }
        },
      }}
    >
      <ActiveBufferSummaryContext.Provider value={activeBufferSummary}>
        {children}
      </ActiveBufferSummaryContext.Provider>
    </EditorContext.Provider>
  )
}

export const useEditor = () => useContext(EditorContext)

export const useActiveBufferSummary = () =>
  useContext(ActiveBufferSummaryContext)
