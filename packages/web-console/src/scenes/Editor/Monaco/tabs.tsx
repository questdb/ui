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
import { Text } from "../../../components"

type Tab = {
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
    activeBuffer,
    buffers,
    setActiveBuffer,
    addBuffer,
    deleteBuffer,
    deleteAllBuffers,
    updateBuffer,
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

  const rename = (id: string, title: string) => {
    updateBuffer(parseInt(id), { label: title })
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
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <ForwardRef>
            <Button skin="transparent" prefixIcon={<History size="20px" />}>
              History
            </Button>
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
