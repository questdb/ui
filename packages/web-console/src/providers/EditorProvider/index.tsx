import React, {
  createContext,
  MutableRefObject,
  PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { editor } from "monaco-editor"
import { Monaco } from "@monaco-editor/react"
import {
  insertTextAtCursor,
  appendQuery,
} from "../../scenes/Editor/Monaco/utils"
import { makeBuffer } from "../../store/buffers"
import { db } from "../../store/db"
import type { Buffer } from "../../store/buffers"

import { useLiveQuery } from "dexie-react-hooks"

type IStandaloneCodeEditor = editor.IStandaloneCodeEditor

type ContextProps = {
  editorRef: MutableRefObject<IStandaloneCodeEditor | null> | null
  monacoRef: MutableRefObject<Monaco | null> | null
  insertTextAtCursor: (text: string) => void
  getValue: () => void
  appendQuery: (query: string) => void
  buffers: Buffer[]
  activeBuffer: Buffer
  setActiveBuffer: (buffer: Buffer) => void
  addBuffer: () => Promise<Buffer>
  deleteBuffer: (id: string) => void
  updateBuffer: (id: string, payload: Partial<Buffer>) => void
}

const fallbackBuffer = makeBuffer("SQL")

const defaultValues = {
  editorRef: null,
  monacoRef: null,
  insertTextAtCursor: () => undefined,
  getValue: () => undefined,
  appendQuery: () => undefined,
  buffers: [],
  activeBuffer: fallbackBuffer,
  setActiveBuffer: () => undefined,
  addBuffer: () => Promise.resolve(fallbackBuffer),
  deleteBuffer: () => undefined,
  updateBuffer: () => undefined,
}

const EditorContext = createContext<ContextProps>(defaultValues)

export const EditorProvider = ({ children }: PropsWithChildren<{}>) => {
  const editorRef = useRef<IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const buffers = useLiveQuery(() => db.buffers.toArray(), []) ?? [
    makeBuffer("SQL"),
  ]
  const [activeBuffer, setActiveBuffer] = useState<Buffer>(buffers[0])

  const addBuffer: ContextProps["addBuffer"] = async () => {
    const label = `Untitled ${buffers.length + 1}`
    const buffer = makeBuffer(label, label)
    await db.buffers.add(buffer)
    return buffer
  }

  const updateBuffer: ContextProps["updateBuffer"] = (id, payload) =>
    db.buffers.update(id, payload)

  const deleteBuffer: ContextProps["deleteBuffer"] = (id) =>
    db.buffers.delete(id)

  /*
    To avoid re-rendering components that subscribe to this context
    we don't set value via a useState hook
   */
  const getValue = () => editorRef.current?.getValue()

  useEffect(() => {
    editorRef.current?.focus()
  }, [activeBuffer])

  return (
    <EditorContext.Provider
      value={{
        editorRef,
        monacoRef,
        getValue,
        insertTextAtCursor: (text) => {
          if (editorRef?.current) {
            insertTextAtCursor(editorRef.current, text)
          }
        },
        appendQuery: (text) => {
          if (editorRef?.current) {
            appendQuery(editorRef.current, text)
          }
        },
        buffers,
        activeBuffer,
        setActiveBuffer,
        addBuffer,
        deleteBuffer,
        updateBuffer,
      }}
    >
      {children}
    </EditorContext.Provider>
  )
}

export const useEditor = () => useContext(EditorContext)
