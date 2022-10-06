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
import { v4 as uuid } from "uuid"

type IStandaloneCodeEditor = editor.IStandaloneCodeEditor

type Buffer = {
  id: string
  label: string
  value: string
}

type ContextProps = {
  editorRef: MutableRefObject<IStandaloneCodeEditor | null> | null
  monacoRef: MutableRefObject<Monaco | null> | null
  insertTextAtCursor: (text: string) => void
  getValue: () => void
  appendQuery: (query: string) => void
  buffers: Buffer[]
  activeBuffer: Buffer
  setActiveBuffer: (buffer: Buffer) => void
  addBuffer: () => void
  deleteBuffer: (id: string) => void
  renameBuffer: (id: string, label: string) => void
}

const makeBuffer = (label: string): Buffer => ({
  id: uuid(),
  label,
  value: "",
})

const defaultBuffer = makeBuffer("Untitled")

const defaultValues = {
  editorRef: null,
  monacoRef: null,
  insertTextAtCursor: () => undefined,
  getValue: () => undefined,
  appendQuery: () => undefined,
  buffers: [],
  activeBuffer: defaultBuffer,
  setActiveBuffer: () => undefined,
  addBuffer: () => undefined,
  deleteBuffer: () => undefined,
  renameBuffer: () => undefined,
}

const EditorContext = createContext<ContextProps>(defaultValues)

export const EditorProvider = ({ children }: PropsWithChildren<{}>) => {
  const editorRef = useRef<IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const [activeBuffer, setActiveBuffer] = useState<Buffer>(defaultBuffer)
  const [buffers, setBuffers] = useState<Buffer[]>([defaultBuffer])

  const addBuffer = () => {
    setBuffers([...buffers, makeBuffer(`Untitled ${buffers.length + 1}`)])
  }

  const deleteBuffer = (id: Buffer["id"]) =>
    setBuffers(buffers.filter((buffer) => buffer.id !== id))

  const renameBuffer = (id: string, label: string) => {
    setBuffers(
      buffers.map((buffer) =>
        buffer.id === id ? { ...buffer, label } : buffer,
      ),
    )
  }

  /*
    To avoid re-rendering components that subscribe to this context
    we don't set value via a useState hook
   */
  const getValue = () => editorRef.current?.getValue()

  useEffect(() => {
    setActiveBuffer(buffers[buffers.length - 1])
  }, [buffers, setActiveBuffer])

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
        renameBuffer,
      }}
    >
      {children}
    </EditorContext.Provider>
  )
}

export const useEditor = () => useContext(EditorContext)
