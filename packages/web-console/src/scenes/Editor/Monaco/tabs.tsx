import React, { useLayoutEffect, useState } from "react"
import styled from "styled-components"
import { Tabs as ReactChromeTabs } from "../../../components/ReactChromeTabs"
import { useEditor } from "../../../providers"

type Tab = {
  id: string
  title: string
  favicon: string
  active: boolean
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
    deleteAllBuffers,
  } = useEditor()
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

  const reorder = (tabId: string, _fromIndex: number, toIndex: number) => {
    const beforeTab = buffers.find((tab) => tab.id === parseInt(tabId))
    if (!beforeTab) {
      return
    }
    deleteAllBuffers()
    let newTabs = buffers.filter((tab) => tab.id !== parseInt(tabId))
    newTabs.splice(toIndex, 0, beforeTab)
    newTabs.forEach((tab) => {
      addBuffer(tab)
    })
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
