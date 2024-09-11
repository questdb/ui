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
} from "../../scenes/Editor/Monaco/utils"
import {tabStore, tabContentStore, fallbackTab, fallbackTabContent, makeTab} from "../../store/tabs";
import { db } from "../../store/db"
import type { Tab, TabContent } from "../../store/tabs"

import { useLiveQuery } from "dexie-react-hooks"

type IStandaloneCodeEditor = editor.IStandaloneCodeEditor

export type EditorContext = {
  editorRef: MutableRefObject<IStandaloneCodeEditor | null>
  monacoRef: MutableRefObject<Monaco | null>
  insertTextAtCursor: (text: string) => void
  appendQuery: (query: string, options?: AppendQueryOptions) => void
  tabs: Tab[]
  activeTab: Tab
  activeTabContent: TabContent
  setActiveTab: (tab: Tab) => Promise<void>
  addTab: (
    tab?: Partial<Tab>,
    options?: { shouldSelectAll?: boolean },
  ) => Promise<Tab>
  deleteTab: (id: number) => Promise<void>
  deleteAllTabs: () => Promise<void>
  updateTab: (id: number, tab?: Partial<Tab>) => Promise<void>
  updateTabContent: (id: number, tabContent?: Partial<TabContent>) => Promise<void>
  editorReadyTrigger: (editor: IStandaloneCodeEditor) => void
  inFocus: boolean
}

const defaultValues = {
  editorRef: { current: null },
  monacoRef: { current: null },
  insertTextAtCursor: () => undefined,
  appendQuery: () => undefined,
  tabs: [],
  activeTab: fallbackTab,
  activeTabContent: fallbackTabContent,
  setActiveTab: () => Promise.resolve(),
  addTab: () => Promise.resolve(fallbackTab),
  deleteTab: () => Promise.resolve(),
  deleteAllTabs: () => Promise.resolve(),
  updateTab: () => Promise.resolve(),
  updateTabContent: () => Promise.resolve(),
  editorReadyTrigger: () => undefined,
  inFocus: false,
}

const EditorContext = createContext<EditorContext>(defaultValues)

export const EditorProvider = ({ children }: PropsWithChildren<{}>) => {
  const editorRef = useRef<IStandaloneCodeEditor>(null)
  const monacoRef = useRef<Monaco>(null)
  const tabs = useLiveQuery(tabStore.getAll, [])
  const activeTabId = useLiveQuery(
    () => tabStore.getActiveId(),
    [],
  )?.value
  debugger;
  const tabContent = useLiveQuery(() => tabContentStore.getById(activeTabId as number), [])
  if (!tabContent) {
    throw Error("Missing tab content for the active tab: " + activeTabId)
  }

  const [activeTab, setActiveTabState] = useState<Tab>(fallbackTab)
  const [activeTabContent, setActiveTabContentState] = useState<TabContent>(fallbackTabContent)
  const [inFocus, setInFocus] = useState(false)

  const ranOnce = useRef(false)
  // this effect should run only once, after mount and after `tabs` and `activeTabId` are ready from the db
  useEffect(() => {
    debugger;
    if (!ranOnce.current && tabs && activeTabId) {
      const tab = tabs?.find((tab) => tab.id === activeTabId) ?? tabs[0]
      setActiveTabState(tab)
      setActiveTabContentState(tabContent)
      ranOnce.current = true
    }
  }, [tabs, activeTabId])

  if (!tabs || !activeTabId || activeTab === fallbackTab) {
    return null
  }

  const setActiveTab = async (tab: Tab) => {
    const currentActiveTabId = (await tabStore.getActiveId())?.value
    if (currentActiveTabId) {
      if (tab.id === currentActiveTabId) {
        // early return if trying to set active an already active tab
        // but keep focus on editor
        // editorRef.current?.focus()
        return
      }

      // check if tab with activeTab.id exists, otherwise we might save editor state of a
      // tab which is being deleted
      await updateTab(activeTab.id as number)
    }
    await 
      tabStore.setActiveId(tab.id as number)
    setActiveTabState(tab)
    const tabContent = await tabContentStore.getById(tab.id as number)
    if (!tabContent) {
      throw Error("Missing tab content for tab: " + JSON.stringify(tab))
    }
    if (editorRef.current && monacoRef.current && tab) {
      const model = monacoRef.current.editor.createModel(
        tabContent.sql,
        QuestDBLanguageName,
      )

      editorRef.current.setModel(model)
      editorRef.current.focus()
    }
    if (tabContent.editorViewState) {
      editorRef.current?.restoreViewState(tabContent.editorViewState)
    }
  }

  const addTab: EditorContext["addTab"] = async (
    newTab,
    { shouldSelectAll = false } = {},
  ) => {
    const currentDefaultTabNumbers = (
      await db.tabs
        .filter((tab) => tab.name.startsWith(fallbackTab.name))
        .toArray()
    )
      .map((tab) =>
        tab.name.slice(fallbackTab.name.length + /* whitespace */ 1),
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

    const tab = makeTab({
      ...newTab,
      name: newTab?.name ?? `${fallbackTab.name} ${nextNumber()}`,
    })
    const id = await db.tabs.add(tab)
    await setActiveTab(tab)
    if (editorRef.current && monacoRef.current) {
      const model = monacoRef.current?.editor.createModel(
        "", //tabContent.sql,
        QuestDBLanguageName,
      )
      editorRef.current.setModel(model)

      if (shouldSelectAll) {
        editorRef.current?.setSelection(model.getFullModelRange())
      }
    }

    return { id, ...tab }
  }

  const deleteAllTabs = async () => {
    await tabStore.deleteAll()
  }

  const updateTab: EditorContext["updateTab"] = async (id, payload) => {
    await tabStore.update(id, {
      ...payload,
    })
  }

  const updateTabContent: EditorContext["updateTabContent"] = async (id, payload) => {
    const editorViewState = editorRef.current?.saveViewState()
    await tabContentStore.update(id, {
      ...payload,
      ...(editorViewState ? { editorViewState } : {}),
    })
  }

  const deleteTab: EditorContext["deleteTab"] = async (id) => {
    await tabStore.delete(id)
    await tabContentStore.delete(id)

    // set new active tab only when removing currently active tab
    const activeTabId = (await tabStore.getActiveId())?.value
    if (typeof activeTabId !== "undefined" && activeTabId === id) {
      const nextActive = await db.tabs.toCollection().last()
      await setActiveTab(nextActive ?? fallbackTab)
    } else {
      editorRef.current?.focus()
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
        appendQuery: (text, options) => {
          if (editorRef?.current) {
            appendQuery(editorRef.current, text, options)
          }
        },
        inFocus,
        tabs,
        activeTab,
        activeTabContent,
        setActiveTab,
        addTab,
        deleteTab,
        deleteAllTabs,
        updateTab,
        updateTabContent,
        editorReadyTrigger: async (editor) => {
          editor.focus()
          setInFocus(true)
          editor.onDidFocusEditorWidget(() => setInFocus(true))
          editor.onDidBlurEditorWidget(() => setInFocus(false))
          if (activeTabContent.editorViewState) {
            editor.restoreViewState(activeTabContent.editorViewState)
          }
        },
      }}
    >
      {children}
    </EditorContext.Provider>
  )
}

export const useEditor = () => useContext(EditorContext)
