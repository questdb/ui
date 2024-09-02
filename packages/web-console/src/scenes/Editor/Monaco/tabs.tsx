import React, { useLayoutEffect, useState } from "react"
import styled from "styled-components"
import { Tabs as ReactChromeTabs } from "../../../components/ReactChromeTabs"

const fb =
  "https://raw.githubusercontent.com/pansinm/react-chrome-tabs/master/demo/images/facebook-favicon.ico"
const google =
  "https://raw.githubusercontent.com/pansinm/react-chrome-tabs/master/demo/images/google-favicon.ico"

let _id = 1
function uniqId() {
  return _id++
}

function createNewTab() {
  const id = uniqId()
  return {
    id: `tab-id-${id}`,
    title: `New Tabs ${id}`,
    favicon: id % 2 ? fb : google,
    active: true,
  }
}

const Root = styled.div`
  width: 100%;
  display: flex;
`

export const Tabs = () => {
  const [tabs, setTabs] = useState([
    { id: "abc", favicon: fb, title: "Tab Title", active: true },
  ])
  const [tabsVisible, setTabsVisible] = useState(false)

  const addTab = () => {
    setTabs([...tabs, createNewTab()])
  }

  const active = (id: string) => {
    setTabs(tabs.map((tab) => ({ ...tab, active: id === tab.id })))
  }

  const close = (id: string) => {
    setTabs(tabs.filter((tab) => tab.id !== id))
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
        onNewTab={addTab}
        tabs={tabs}
      />
    </Root>
  )
}
