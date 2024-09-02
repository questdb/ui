/*******************************************************************************
 *     ___                  _   ____  ____
 *    / _ \ _   _  ___  ___| |_|  _ \| __ )
 *   | | | | | | |/ _ \/ __| __| | | |  _ \
 *   | |_| | |_| |  __/\__ \ |_| |_| | |_) |
 *    \__\_\\__,_|\___||___/\__|____/|____/
 *
 *  Original work Copyright (c) 2013 Adam Schwartz
 *  Derived work Copyright (c) 2024 QuestDB
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 ******************************************************************************/

import React, {
  CSSProperties,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react"
import ChromeTabsClz, { TabProperties } from "./chrome-tabs"

export type Listeners = {
  onTabActive?: (tabId: string) => void
  onTabClose?: (tabId: string) => void
  onTabReorder?: (tabId: string, fromIdex: number, toIndex: number) => void
  onDragBegin?: () => void
  onDragEnd?: () => void
  onContextMenu?: (tabId: string, event: MouseEvent) => void
  onNewTab?: () => void
}

const ChromeTabsWrapper = forwardRef<
  HTMLDivElement,
  { className?: string; darkMode?: boolean }
>((props, ref) => {
  const classList = ["chrome-tabs"]
  if (props.darkMode) {
    classList.push("chrome-tabs-dark-theme")
  }
  if (props.className) {
    classList.push(props.className)
  }
  return (
    <div
      ref={ref}
      className={classList.join(" ")}
      style={{ "--tab-content-margin": "9px" } as CSSProperties}
    >
      <div className="chrome-tabs-content"></div>
    </div>
  )
})

export function useChromeTabs(listeners: Listeners) {
  const ref = useRef<HTMLDivElement>(null)
  const chromeTabsRef = useRef<ChromeTabsClz | null>(null)

  useEffect(() => {
    const chromeTabs = new ChromeTabsClz()
    chromeTabsRef.current = chromeTabs
    chromeTabs.init(ref.current as HTMLDivElement)
  }, [])

  // activated
  useEffect(() => {
    const listener = ({ detail }: any) => {
      const tabEle = detail.tabEl as HTMLDivElement
      const tabId = tabEle.getAttribute("data-tab-id") as string
      listeners.onTabActive?.(tabId)
    }
    const ele = chromeTabsRef.current?.el
    ele?.addEventListener("tabClick", listener)
    return () => {
      ele?.removeEventListener("tabClick", listener)
    }
  }, [listeners.onTabActive])

  useEffect(() => {
    const ele = chromeTabsRef.current?.el
    const listener = ({ detail }: any) => {
      const { tabEl: tabEle, originIndex, destinationIndex } = detail
      const tabId = tabEle.getAttribute("data-tab-id") as string
      listeners.onTabReorder?.(tabId, originIndex, destinationIndex)
    }
    ele?.addEventListener("tabReorder", listener)
    return () => {
      ele?.removeEventListener("tabReorder", listener)
    }
  }, [listeners.onTabReorder])

  useEffect(() => {
    const ele = chromeTabsRef.current?.el
    const listener = ({ detail }: any) => {
      const tabEle = detail.tabEl as HTMLDivElement
      const tabId = tabEle.getAttribute("data-tab-id") as string
      listeners.onTabClose?.(tabId)
    }
    ele?.addEventListener("tabClose", listener)
    return () => {
      ele?.removeEventListener("tabClose", listener)
    }
  }, [listeners.onTabClose])

  useEffect(() => {
    const listener = () => {
      listeners.onDragBegin?.()
    }
    const ele = chromeTabsRef.current?.el
    ele?.addEventListener("dragBegin", listener)
    return () => {
      ele?.removeEventListener("dragBegin", listener)
    }
  }, [listeners.onDragBegin])

  useEffect(() => {
    const ele = chromeTabsRef.current?.el
    const listener = ({ detail }: any) => {
      const tabEle = detail.tabEl as HTMLDivElement
      if (!tabEle) {
        return
      }
      const tabId = tabEle.getAttribute("data-tab-id") as string
      listeners.onContextMenu?.(tabId, detail.event)
    }
    ele?.addEventListener("contextmenu", listener)
    return () => {
      ele?.removeEventListener("contextmenu", listener)
    }
  }, [listeners.onContextMenu])

  useEffect(() => {
    const listener = () => {
      listeners.onDragEnd?.()
    }
    const ele = chromeTabsRef.current?.el
    ele?.addEventListener("dragEnd", listener)
    return () => {
      ele?.removeEventListener("dragEnd", listener)
    }
  }, [listeners.onDragEnd])

  useEffect(() => {
    const listener = () => {
      listeners.onNewTab?.()
    }
    const ele = chromeTabsRef.current?.el
    ele?.addEventListener("newTab", listener)
    return () => {
      ele?.removeEventListener("newTab", listener)
    }
  }, [listeners.onNewTab])

  const addTab = useCallback((tab: TabProperties) => {
    chromeTabsRef.current?.addTab(tab)
  }, [])

  const removeTab = useCallback((tabId: string) => {
    const ele = ref.current?.querySelector(
      `[data-tab-id="${tabId}"]`,
    ) as HTMLDivElement
    if (ele) {
      chromeTabsRef.current?.removeTab(ele)
    }
  }, [])

  const activeTab = useCallback((tabId: string) => {
    const ele = ref.current?.querySelector(
      `[data-tab-id="${tabId}"]`,
    ) as HTMLDivElement
    if (ele !== chromeTabsRef.current?.activeTabEl) {
      chromeTabsRef.current?.setCurrentTab(ele)
    }
  }, [])

  const updateTab = useCallback((tabId: string, tab: TabProperties) => {
    const ele = ref.current?.querySelector(
      `[data-tab-id="${tabId}"]`,
    ) as HTMLDivElement
    if (ele) {
      chromeTabsRef.current?.updateTab(ele, { ...tab })
    } else {
      chromeTabsRef.current?.addTab(tab)
    }
  }, [])

  const ChromeTabs = useCallback(function ChromeTabs(props: {
    className?: string
    darkMode?: boolean
  }) {
    return <ChromeTabsWrapper {...props} ref={ref} />
  },
  [])

  return {
    ChromeTabs,
    addTab,
    updateTab,
    removeTab,
    activeTab,
  }
}
