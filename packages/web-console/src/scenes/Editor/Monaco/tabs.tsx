import React, { useLayoutEffect, useState } from "react"
import styled from "styled-components"
import { Tabs as ReactChromeTabs } from "../../../components/ReactChromeTabs"
import { useEditor } from "../../../providers"
import { File, History } from "@styled-icons/boxicons-regular"
import {
  Box,
  Button,
  DropdownMenu,
  ForwardRef,
} from "@questdb/react-components"
import { Text, PopperHover, Tooltip } from "../../../components"

type TabProperties = {
  id: string
  title: string
  favicon: string
  active: boolean
}

const Root = styled(Box).attrs({
  align: "center",
  justifyContent: "space-between",
})`
  width: 100%;
  display: flex;
  background: ${({ theme }) => theme.color.backgroundLighter};
  padding-right: 1rem;
`

export const Tabs = () => {
  const {
    activeTab,
    tabs,
    setActiveTab,
    addTab,
    deleteTab,
    deleteAllTabs,
    updateTab,
  } = useEditor()
  const [tabsVisible, setTabsVisible] = useState(false)

  const active = (id: string) => {
    const activeTab = tabs.find((tab) => tab.id === parseInt(id))
    if (activeTab) {
      setActiveTab(activeTab)
    }
  }

  const close = (id: string) => {
    deleteTab(parseInt(id))
  }

  const reorder = (tabId: string, _fromIndex: number, toIndex: number) => {
    const beforeTab = tabs.find((tab) => tab.id === parseInt(tabId))
    if (!beforeTab) {
      return
    }
    deleteAllTabs()
    let newTabs = tabs.filter((tab) => tab.id !== parseInt(tabId))
    newTabs.splice(toIndex, 0, beforeTab)
    newTabs.forEach((tab) => {
      addTab(tab)
    })
  }

  const rename = (id: string, title: string) => {
    updateTab(parseInt(id), { name: title })
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
        onTabRename={rename}
        onNewTab={addTab}
        tabs={tabs.map(
          (tab) =>
            ({
              id: tab.id?.toString(),
              favicon: "/assets/icon-file.svg",
              title: tab.name,
              active: activeTab.id === tab.id,
            } as TabProperties),
        )}
      />
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <ForwardRef>
            <PopperHover
              delay={350}
              placement="right"
              trigger={
                <Button skin="transparent">
                  <History size="20px" />
                </Button>
              }
            >
              <Tooltip>History</Tooltip>
            </PopperHover>
          </ForwardRef>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.Item>
              <Box align="flex-start" justifyContent="flex-start" gap="0.5rem">
                <File size="18px" />
                <Box flexDirection="column" align="flex-start" gap="0">
                  <Text color="foreground">Closed tab 2</Text>
                  <Text color="gray2">09.09.2024, 15:50</Text>
                </Box>
              </Box>
            </DropdownMenu.Item>
            <DropdownMenu.Item>
              <Box align="flex-start" justifyContent="flex-start" gap="0.5rem">
                <File size="18px" />
                <Box flexDirection="column" align="flex-start" gap="0">
                  <Text color="foreground">Closed tab 1</Text>
                  <Text color="gray2">09.09.2024, 13:22</Text>
                </Box>
              </Box>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </Root>
  )
}
