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

type IStandaloneCodeEditor = editor.IStandaloneCodeEditor

type File = {
  name: string
  value: string
}

type ContextProps = {
  editorRef: MutableRefObject<IStandaloneCodeEditor | null> | null
  monacoRef: MutableRefObject<Monaco | null> | null
  insertTextAtCursor: (text: string) => void
  getValue: () => void
  appendQuery: (query: string) => void
  files: File[]
  activeFile: File
  setActiveFile: (file: File) => void
  addNewFile: () => void
  deleteFile: (name: string) => void
  renameFile: (oldName: string, newName: string) => void
}

const defaultFile = {
  name: "File 1",
  value: "",
}

const defaultValues = {
  editorRef: null,
  monacoRef: null,
  insertTextAtCursor: (text: string) => undefined,
  getValue: () => undefined,
  appendQuery: (query: string) => undefined,
  files: [defaultFile],
  activeFile: defaultFile,
  setActiveFile: (file: File) => undefined,
  addNewFile: () => undefined,
  deleteFile: (name: string) => undefined,
  renameFile: (oldName: string, newName: string) => undefined,
}

const EditorContext = createContext<ContextProps>(defaultValues)

export const EditorProvider = ({ children }: PropsWithChildren<{}>) => {
  const editorRef = useRef<IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const [activeFile, setActiveFile] = useState<File>(defaultFile)

  const [files, setFiles] = useState<File[]>([
    defaultFile,
    { name: "File 2", value: "" },
  ])

  const addNewFile = () => {
    setFiles([...files, { name: `File ${files.length + 1}`, value: "" }])
  }

  const deleteFile = (name: string) => {
    setFiles(files.filter((file) => file.name !== name))
  }

  const renameFile = (oldName: string, newName: string) => {
    setFiles(
      files.map((file) => {
        file.value = editorRef.current?.getModel()?.getValue() ?? ""
        return file.name === oldName ? { ...file, name: newName } : file
      }),
    )
  }

  /*
    To avoid re-rendering components that subscribe to this context
    we don't set value via a useState hook
   */
  const getValue = () => {
    return editorRef.current?.getValue()
  }

  useEffect(() => {
    setActiveFile(files[files.length - 1])
  }, [files, setActiveFile])

  useEffect(() => {
    editorRef.current?.focus()
  }, [activeFile])

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
        files,
        activeFile,
        setActiveFile,
        addNewFile,
        deleteFile,
        renameFile,
      }}
    >
      {children}
    </EditorContext.Provider>
  )
}

export const useEditor = () => {
  return useContext(EditorContext)
}
