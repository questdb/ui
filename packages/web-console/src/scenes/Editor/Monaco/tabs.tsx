import React, { useLayoutEffect, useState } from "react"
import styled from "styled-components"
import { Tabs as ReactChromeTabs } from "../../../components/ReactChromeTabs"
import { useEditor } from "../../../providers"
import { File, History, Trash } from "@styled-icons/boxicons-regular"
import {
  Box,
  Button,
  DropdownMenu,
  ForwardRef,
} from "@questdb/react-components"
import { Text, PopperHover, Tooltip } from "../../../components"

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

const DropdownMenuContent = styled(DropdownMenu.Content)`
  z-index: 100;
  background: ${({ theme }) => theme.color.backgroundDarker};
`

export const Tabs = () => {
  const {
    activeBuffer,
    buffers,
    setActiveBuffer,
    addBuffer,
    updateBuffer,
    deleteBuffer,
  } = useEditor()
  const [tabsVisible, setTabsVisible] = useState(false)

  const archivedBuffers = buffers
    .filter(
      (buffer) =>
        buffer.archived && buffer.archivedAt && buffer.position === -1,
    )
    .sort((a, b) =>
      a.archivedAt && b.archivedAt ? b.archivedAt - a.archivedAt : 0,
    )

  const active = (id: string) => {
    const activeBuffer = buffers.find((buffer) => buffer.id === parseInt(id))
    if (activeBuffer) {
      setActiveBuffer(activeBuffer)
    }
  }

  const repositionActiveBuffers = async (excludedId: string) => {
    buffers
      .filter(
        (buffer) => !buffer.archived && buffer.id !== parseInt(excludedId),
      )
      .sort((a, b) => a.position - b.position)
      .forEach(async (buffer, index) => {
        if (buffer.id) {
          await updateBuffer(buffer.id, { position: index })
        }
      })
  }

  const close = async (id: string) => {
    await updateBuffer(parseInt(id), {
      archived: true,
      archivedAt: new Date().getTime(),
      position: -1,
    })
    await repositionActiveBuffers(id)
    if (archivedBuffers.length >= 10) {
      deleteBuffer(archivedBuffers[archivedBuffers.length - 1].id as number)
    }
  }

  const reorder = async (
    tabId: string,
    _fromIndex: number,
    toIndex: number,
  ) => {
    const beforeTab = buffers.find((tab) => tab.id === parseInt(tabId))
    if (!beforeTab) {
      return
    }
    let newTabs = buffers.filter(
      (tab) => tab.id !== parseInt(tabId) && !tab.archived,
    )
    newTabs.splice(toIndex, 0, beforeTab)
    newTabs.forEach(async (tab, index) => {
      if (tab.id) {
        await updateBuffer(tab.id, { position: index })
      }
    })
    setActiveBuffer(newTabs[toIndex])
  }

  const rename = (id: string, title: string) => {
    updateBuffer(parseInt(id), { label: title })
  }

  const removeAllArchived = () => {
    archivedBuffers.forEach((buffer) => {
      deleteBuffer(buffer.id as number)
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
        onTabRename={rename}
        onNewTab={addBuffer}
        tabs={buffers
          .filter((buffer) => !buffer.archived)
          .sort((a, b) => a.position - b.position)
          .map(
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
            <PopperHover
              delay={350}
              placement="right"
              trigger={
                <Button skin="transparent">
                  <History size="20px" />
                </Button>
              }
            >
              <Tooltip>Recently closed tabs</Tooltip>
            </PopperHover>
          </ForwardRef>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenuContent>
            {archivedBuffers.length === 0 && (
              <div style={{ padding: "0 1rem" }}>
                <Text color="gray2">History is empty</Text>
              </div>
            )}
            {archivedBuffers.map((buffer) => (
              <DropdownMenu.Item
                key={buffer.id}
                onClick={() => {
                  updateBuffer(buffer.id as number, {
                    archived: false,
                    archivedAt: undefined,
                    position: buffers.length - 1,
                  })
                  setActiveBuffer(buffer)
                }}
              >
                <Box
                  align="flex-start"
                  justifyContent="flex-start"
                  gap="0.5rem"
                >
                  <File size="18px" />
                  <Box flexDirection="column" align="flex-start" gap="0">
                    <Text color="foreground">{buffer.label}</Text>
                    {buffer.archivedAt && (
                      <Text color="gray2">
                        {new Date(buffer.archivedAt).toLocaleString()}
                      </Text>
                    )}
                  </Box>
                </Box>
              </DropdownMenu.Item>
            ))}
            {archivedBuffers.length > 0 && (
              <>
                <DropdownMenu.Divider />
                <DropdownMenu.Item onClick={removeAllArchived}>
                  <Trash size="18px" />
                  <Text color="foreground">Clear history</Text>
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </Root>
  )
}
