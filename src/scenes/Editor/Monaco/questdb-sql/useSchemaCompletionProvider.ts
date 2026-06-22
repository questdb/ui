import { useEffect } from "react"
import { useSelector } from "react-redux"
import type { Monaco } from "@monaco-editor/react"
import { createSchemaCompletionProvider } from "./createSchemaCompletionProvider"
import { QuestDBLanguageName } from "../utils"
import { selectors } from "../../../../store"

export const useSchemaCompletionProvider = (monaco: Monaco | null) => {
  const tables = useSelector(selectors.query.getTables)
  const columns = useSelector(selectors.query.getColumns)

  useEffect(() => {
    if (!monaco) return
    const handle = monaco.languages.registerCompletionItemProvider(
      QuestDBLanguageName,
      createSchemaCompletionProvider(tables, columns),
    )
    return () => handle.dispose()
  }, [monaco, tables, columns])
}
