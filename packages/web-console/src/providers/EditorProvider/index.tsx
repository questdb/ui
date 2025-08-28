import type { Monaco } from "@monaco-editor/react"
import type { editor } from "monaco-editor"
import React, {
  createContext,
  MutableRefObject,
  PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react"
import {
  appendQuery,
  AppendQueryOptions,
  clearModelMarkers,
  insertTextAtCursor,
  QuestDBLanguageName,
} from "../../scenes/Editor/Monaco/utils"
import type { Buffer } from "../../store/buffers"
import {
  bufferStore,
  BufferType,
  fallbackBuffer,
  makeBuffer,
  makeFallbackBuffer,
} from "../../store/buffers"
import { db } from "../../store/db"
import { eventBus } from "../../modules/EventBus"
import { EventType } from "../../modules/EventBus/types"

import { useLiveQuery } from "dexie-react-hooks"

type IStandaloneCodeEditor = editor.IStandaloneCodeEditor

export type EditorContext = {
  editorRef: MutableRefObject<IStandaloneCodeEditor | null>
  monacoRef: MutableRefObject<Monaco | null>
  insertTextAtCursor: (text: string) => void
  appendQuery: (query: string, options?: AppendQueryOptions) => void
  buffers: Buffer[]
  activeBuffer: Buffer
  setActiveBuffer: (buffer: Buffer, options?: { focus?: boolean; fromSearch?: boolean }) => Promise<void>
  addBuffer: (
    buffer?: Partial<Buffer>,
    options?: { shouldSelectAll?: boolean },
  ) => Promise<Buffer>
  deleteBuffer: (id: number) => Promise<void>
  archiveBuffer: (id: number) => Promise<void>
  deleteAllBuffers: () => Promise<void>
  updateBuffer: (id: number, buffer?: Partial<Buffer>, setNewActiveBuffer?: boolean) => Promise<void>
  updateBuffersPositions: (positions: { id: number; position: number }[]) => Promise<void>
  editorReadyTrigger: (editor: IStandaloneCodeEditor) => void
  inFocus: boolean
  setTemporaryBuffer: (buffer: Buffer) => Promise<void>
  temporaryBufferId: number | null
  queryParamProcessedRef: MutableRefObject<boolean>
  isNavigatingFromSearchRef: MutableRefObject<boolean>
}

const defaultValues = {
  editorRef: { current: null },
  monacoRef: { current: null },
  insertTextAtCursor: () => undefined,
  appendQuery: () => undefined,
  buffers: [],
  activeBuffer: fallbackBuffer,
  setActiveBuffer: () => Promise.resolve(),
  addBuffer: () => Promise.resolve(fallbackBuffer),
  deleteBuffer: () => Promise.resolve(),
  archiveBuffer: () => Promise.resolve(),
  deleteAllBuffers: () => Promise.resolve(),
  updateBuffer: () => Promise.resolve(),
  updateBuffersPositions: () => Promise.resolve(),
  editorReadyTrigger: () => undefined,
  inFocus: false,
  setTemporaryBuffer: () => Promise.resolve(),
  temporaryBufferId: null,
  queryParamProcessedRef: { current: false },
  isNavigatingFromSearchRef: { current: false },
}

const EditorContext = createContext<EditorContext>(defaultValues)

export const EditorProvider = ({ children }: PropsWithChildren<{}>) => {
  const editorRef = useRef<IStandaloneCodeEditor>(null)
  const monacoRef = useRef<Monaco>(null)
  const [temporaryBufferId, setTemporaryBufferId] = useState<number | null>(null)
  
  const rawBuffers = useLiveQuery(bufferStore.getAll, [])
  const buffers = useMemo(() => {
    if (!rawBuffers) return undefined
    return rawBuffers.map(buffer => ({
      ...buffer,
      isTemporary: buffer.id === temporaryBufferId
    }))
  }, [rawBuffers, temporaryBufferId])
  
  const activeBufferId = useLiveQuery(
    () => bufferStore.getActiveId(),
    [],
  )?.value

  const [activeBuffer, setActiveBufferState] = useState<Buffer>(fallbackBuffer)
  const [inFocus, setInFocus] = useState(false)
  const searchUpdateTimeoutRef = useRef<number | null>(null)
  const queryParamProcessedRef = useRef(false)
  const isNavigatingFromSearchRef = useRef(false)

  const ranOnce = useRef(false)
  
  const getNextPosition = useCallback(() => {
    if (!buffers) return 0
    const activeBuffers = buffers.filter(b => !b.archived || b.isTemporary)
    return Math.max(...activeBuffers.map(b => b.position), -1) + 1
  }, [buffers])
  
  // this effect should run only once, after mount and after `buffers` and `activeBufferId` are ready from the db
  useEffect(() => {
    if (!ranOnce.current && buffers && activeBufferId) {
      const buffer =
        buffers?.find((buffer) => buffer.id === activeBufferId) ?? buffers[0]
      const activeBuffers = buffers.filter(b => !b.archived)
      setActiveBufferState(buffer.archived ? activeBuffers[0] ?? fallbackBuffer : buffer)
      ranOnce.current = true
    }
  }, [buffers, activeBufferId])

  if (!buffers || !activeBufferId || activeBuffer === fallbackBuffer) {
    return null
  }

  const setActiveBuffer = async (buffer: Buffer, options?: { focus?: boolean; fromSearch?: boolean }) => {
    try {
      const currentActiveBufferId = (await bufferStore.getActiveId())?.value

      if (currentActiveBufferId) {
        if (buffer.id === currentActiveBufferId) {
          setActiveBufferState(buffer)
          return
        }
      }

      await bufferStore.setActiveId(buffer.id as number)
      setActiveBufferState(buffer)

      if (options?.fromSearch) {
        isNavigatingFromSearchRef.current = true
      }

      if (editorRef.current && monacoRef.current) {
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

  const addBuffer: EditorContext["addBuffer"] = async (
    newBuffer,
    { shouldSelectAll = false } = {},
  ) => {
    const fallbackBuffer = makeFallbackBuffer(
      newBuffer?.metricsViewState ? BufferType.METRICS : BufferType.SQL,
    )

    const currentDefaultTabNumbers = (
      await db.buffers
        .filter((buffer) =>
          buffer.label.startsWith(fallbackBuffer.label) &&
            newBuffer?.metricsViewState
            ? buffer.metricsViewState !== undefined
            : true,
        )
        .toArray()
    )
      .map((buffer) =>
        buffer.label.slice(fallbackBuffer.label.length + /* whitespace */ 1),
      )
      .filter(Boolean)
      .map((n) => parseInt(n, 10))
      .sort()

    const nextNumber = () => {
      for (let i = 0; i <= currentDefaultTabNumbers.length; i++) {
        const nextNumber = i + 1
        if (!currentDefaultTabNumbers.includes(nextNumber)) {
          return nextNumber
        }
      }
    }

    const position = buffers.filter((b) => !b.archived && !b.isTemporary).length

    const buffer = makeBuffer({
      ...newBuffer,
      label: newBuffer?.label ?? `${fallbackBuffer.label} ${nextNumber()}`,
      position,
    })
    const id = await db.buffers.add(buffer)
    
    await setActiveBuffer(buffer, { focus: true })
    
    // Select all text if requested (model is already created by setActiveBuffer)
    if (shouldSelectAll && editorRef.current) {
      const model = editorRef.current.getModel()
      if (model) {
        editorRef.current.setSelection(model.getFullModelRange())
      }
    }

    return { id, ...buffer }
  }

  const deleteAllBuffers = async () => {
    await bufferStore.deleteAll()
    eventBus.publish(EventType.BUFFERS_UPDATED, { type: 'deleteAll' })
  }

  const updateBuffer: EditorContext["updateBuffer"] = async (id, payload, setNewActiveBuffer = false) => {
    const editorViewState = editorRef.current?.saveViewState()
    const bufferType = await bufferStore.getBufferTypeById(id)
    let newPosition = null

    if (payload && 'isTemporary' in payload) {
      if (payload.isTemporary) { // archived -> temporary
        setTemporaryBufferId(id)
      } else if (id === temporaryBufferId) {
        if (payload?.archived === false) { // temporary -> permanent
          newPosition = getNextPosition()
        } else { // temporary -> archived
          newPosition = -1
        }
        setTemporaryBufferId(null)
      }
    }
    
    const { isTemporary, ...dbPayload } = payload || {}
    let effectivePayload = {
      ...dbPayload,
      ...(newPosition !== null ? { position: newPosition } : {})
    }

    if (Object.keys(effectivePayload).length > 0) {
      await bufferStore.update(id, {
        ...effectivePayload,
        ...(editorViewState && bufferType === BufferType.SQL
          ? { editorViewState }
          : {}),
      })
    }
    if (setNewActiveBuffer) {
      await setActiveBufferOnRemoved(id)
    }
    if (searchUpdateTimeoutRef.current) {
      window.clearTimeout(searchUpdateTimeoutRef.current)
    }

    const searchUpdateKeys = ['value', 'label', 'archived']
    const keys = Object.keys(payload || {})
    if (searchUpdateKeys.some(key => keys.includes(key))) {
      searchUpdateTimeoutRef.current = window.setTimeout(() => {
        let metaUpdate = !(keys.length === 1 && keys[0] === 'value')
        let contentUpdate = keys.includes('value')
        eventBus.publish(EventType.BUFFERS_UPDATED, {
          type: 'update',
          metaUpdate,
          contentUpdate,
          bufferId: id,
        })
        searchUpdateTimeoutRef.current = null
      }, 300)
    }
  }

  const setActiveBufferOnRemoved = async (id: number) => {
    // set new active buffer only when removing currently active buffer
    const activeBufferId = (await bufferStore.getActiveId())?.value
    if (typeof activeBufferId !== "undefined" && activeBufferId === id) {
      const nextActive = await db.buffers
        .toCollection()
        .filter((buffer) => {
          return !buffer.archived && !(buffer.id === temporaryBufferId || buffer.id === id)
        })
        .last()
      await setActiveBuffer(nextActive ?? fallbackBuffer)
    } else {
      editorRef.current?.focus()
    }
  }

  const archiveBuffer: EditorContext["archiveBuffer"] = async (id) => {
    await updateBuffer(id, {
      archived: true,
      archivedAt: new Date().getTime(),
      position: -1,
    })
    await setActiveBufferOnRemoved(id)
    eventBus.publish(EventType.BUFFERS_UPDATED, { type: 'archive', bufferId: id })
  }

  const deleteBuffer: EditorContext["deleteBuffer"] = async (id) => {
    await bufferStore.delete(id)
    await setActiveBufferOnRemoved(id)
    eventBus.publish(EventType.BUFFERS_UPDATED, { type: 'delete', bufferId: id })
  }

  const setTemporaryBuffer: EditorContext["setTemporaryBuffer"] = async (buffer) => {
    if (temporaryBufferId !== null && temporaryBufferId !== buffer.id) {
      await updateBuffer(temporaryBufferId, { isTemporary: false })
    }
    await updateBuffer(buffer.id as number, {
      isTemporary: true,
    })
    
    await setActiveBuffer({ ...buffer, isTemporary: true }, { focus: false, fromSearch: true })
  }

  const updateBuffersPositions: EditorContext["updateBuffersPositions"] = async (positions) => {
    await db.transaction('rw', db.buffers, async () => {
      for (const { id, position } of positions) {
        await db.buffers.update(id, { position })
      }
    })
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
        appendQuery: (text, options) => {
          if (editorRef?.current) {
            appendQuery(editorRef.current, text, options)
          }
        },
        inFocus,
        buffers,
        activeBuffer,
        setActiveBuffer,
        addBuffer,
        deleteBuffer,
        archiveBuffer,
        deleteAllBuffers,
        updateBuffer,
        updateBuffersPositions,
        setTemporaryBuffer,
        temporaryBufferId,
        queryParamProcessedRef,
        isNavigatingFromSearchRef,
        editorReadyTrigger: (editor) => {
          if (!activeBuffer.isTemporary && !isNavigatingFromSearchRef.current) {
            editor.focus()
            setInFocus(true)
          }
          
          editor.onDidFocusEditorWidget(() => setInFocus(true))
          editor.onDidBlurEditorWidget(() => setInFocus(false))
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
