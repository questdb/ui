import React, {
  createContext,
  MutableRefObject,
  PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import type { editor } from "monaco-editor"
import { Monaco } from "@monaco-editor/react"
import {
  AppendQueryOptions,
  insertTextAtCursor,
  appendQuery,
  QuestDBLanguageName,
  clearModelMarkers,
} from "../../scenes/Editor/Monaco/utils"
import {
  fallbackBuffer,
  makeBuffer,
  bufferStore,
  makeFallbackBuffer,
  BufferType,
} from "../../store/buffers"
import { db } from "../../store/db"
import type { Buffer } from "../../store/buffers"

import { useLiveQuery } from "dexie-react-hooks"

type IStandaloneCodeEditor = editor.IStandaloneCodeEditor

export type EditorContext = {
  editorRef: MutableRefObject<IStandaloneCodeEditor | null>
  monacoRef: MutableRefObject<Monaco | null>
  insertTextAtCursor: (text: string) => void
  appendQuery: (query: string, options?: AppendQueryOptions) => void
  buffers: Buffer[]
  activeBuffer: Buffer
  setActiveBuffer: (buffer: Buffer) => Promise<void>
  addBuffer: (
    buffer?: Partial<Buffer>,
    options?: { shouldSelectAll?: boolean },
  ) => Promise<Buffer>
  deleteBuffer: (id: number) => Promise<void>
  archiveBuffer: (id: number) => Promise<void>
  deleteAllBuffers: () => Promise<void>
  updateBuffer: (id: number, buffer?: Partial<Buffer>) => Promise<void>
  editorReadyTrigger: (editor: IStandaloneCodeEditor) => void
  inFocus: boolean
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
  editorReadyTrigger: () => undefined,
  inFocus: false,
}

const EditorContext = createContext<EditorContext>(defaultValues)

export const EditorProvider = ({ children }: PropsWithChildren<{}>) => {
  const editorRef = useRef<IStandaloneCodeEditor>(null)
  const monacoRef = useRef<Monaco>(null)
  const buffers = useLiveQuery(bufferStore.getAll, [])
  const activeBufferId = useLiveQuery(
    () => bufferStore.getActiveId(),
    [],
  )?.value

  const [activeBuffer, setActiveBufferState] = useState<Buffer>(fallbackBuffer)
  const [inFocus, setInFocus] = useState(false)

  const ranOnce = useRef(false)
  // this effect should run only once, after mount and after `buffers` and `activeBufferId` are ready from the db
  useEffect(() => {
    if (!ranOnce.current && buffers && activeBufferId) {
      const buffer =
        buffers?.find((buffer) => buffer.id === activeBufferId) ?? buffers[0]
      setActiveBufferState(buffer)
      ranOnce.current = true
    }
  }, [buffers, activeBufferId])

  if (!buffers || !activeBufferId || activeBuffer === fallbackBuffer) {
    return null
  }

  const setActiveBuffer = async (buffer: Buffer) => {
    try {
      const currentActiveBufferId = (await bufferStore.getActiveId())?.value
      if (currentActiveBufferId) {
        if (buffer.id === currentActiveBufferId) {
          return
        }
        await updateBuffer(activeBuffer.id as number)
      }

      await bufferStore.setActiveId(buffer.id as number)
      setActiveBufferState(buffer)

      if (editorRef.current && monacoRef.current) {
        const model = monacoRef.current.editor.createModel(
          buffer.value,
          QuestDBLanguageName,
        )
        editorRef.current.setModel(model)
        editorRef.current.focus()
        clearModelMarkers(monacoRef.current, editorRef.current)

        if (buffer.editorViewState) {
          editorRef.current.restoreViewState(buffer.editorViewState)
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

    const buffer = makeBuffer({
      ...newBuffer,
      label: newBuffer?.label ?? `${fallbackBuffer.label} ${nextNumber()}`,
      position: buffers.filter((b) => !b.archived).length,
    })
    const id = await db.buffers.add(buffer)
    await setActiveBuffer(buffer)
    if (
      editorRef.current &&
      monacoRef.current &&
      typeof buffer.value === "string" &&
      !buffer.metricsViewState
    ) {
      const model = monacoRef.current?.editor.createModel(
        buffer.value,
        QuestDBLanguageName,
      )
      editorRef.current.setModel(model)

      if (shouldSelectAll) {
        editorRef.current?.setSelection(model.getFullModelRange())
      }
    }

    return { id, ...buffer }
  }

  const deleteAllBuffers = async () => {
    await bufferStore.deleteAll()
  }

  const updateBuffer: EditorContext["updateBuffer"] = async (id, payload) => {
    const editorViewState = editorRef.current?.saveViewState()
    await bufferStore.update(id, {
      ...payload,
      ...(editorViewState && !payload?.metricsViewState
        ? { editorViewState }
        : {}),
    })
  }

  const setActiveBufferOnRemoved = async (id: number) => {
    // set new active buffer only when removing currently active buffer
    const activeBufferId = (await bufferStore.getActiveId())?.value
    if (typeof activeBufferId !== "undefined" && activeBufferId === id) {
      const nextActive = await db.buffers
        .toCollection()
        .filter((buffer) => {
          return !buffer.archived
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
  }

  const deleteBuffer: EditorContext["deleteBuffer"] = async (id) => {
    await bufferStore.delete(id)
    await setActiveBufferOnRemoved(id)
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
        editorReadyTrigger: (editor) => {
          editor.focus()
          setInFocus(true)
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
