import React, { useEffect, useLayoutEffect, useState } from "react"
import styled from "styled-components"
import { Tabs as ReactChromeTabs } from "../../../components/ReactChromeTabs"
import { useEditor } from "../../../providers"

type Tab = {
  id: string
  title: string
  favicon: string
  active: boolean
}

let _id = 1
function uniqId() {
  return _id++
}

function createNewTab() {
  const id = uniqId()
  return {
    id: `tab-id-${id}`,
    title: `New Tabs ${id}`,
    active: true,
  }
}

const Root = styled.div`
  width: 100%;
  display: flex;
`

export const Tabs = () => {
  const {
    activeBuffer,
    buffers,
    setActiveBuffer,
    addBuffer,
    deleteBuffer,
    updateBuffer,
  } = useEditor()

  const [tabs, setTabs] = useState<Tab[]>([])
  const [tabsVisible, setTabsVisible] = useState(false)

  const active = (id: string) => {
    const activeBuffer = buffers.find((buffer) => buffer.id === parseInt(id))
    if (activeBuffer) {
      setActiveBuffer(activeBuffer)
    }
  }

  const close = (id: string) => {
    deleteBuffer(parseInt(id))
  }

  const reorder = (tabId: string, fromIndex: number, toIndex: number) => {
    const beforeTab = tabs.find((tab) => tab.id === tabId)
    if (!beforeTab) {
      return
    }
    let newTabs = tabs.filter((tab) => tab.id !== tabId)
    newTabs.splice(toIndex, 0, beforeTab)
    setTabs(newTabs)
  }

  useLayoutEffect(() => {
    setTabsVisible(true)
  }, [])

  if (!tabsVisible) {
    return null
  }

  return (
    <Root>
      <ReactChromeTabs
        darkMode={true}
        onTabClose={close}
        onTabReorder={reorder}
        onTabActive={active}
        onNewTab={addBuffer}
        tabs={buffers.map(
          (buffer) =>
            ({
              id: buffer.id?.toString(),
              favicon: "/assets/icon-file.svg",
              title: buffer.label,
              active: activeBuffer.id === buffer.id,
            } as Tab),
        )}
      />
    </Root>
  )
}
