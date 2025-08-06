import React, { useLayoutEffect, useState, useMemo } from "react"
import styled from "styled-components"
import { Tabs as ReactChromeTabs } from "../../../components/ReactChromeTabs"
import { useEditor } from "../../../providers"
import {
  File,
  History,
  LineChart,
  Show,
  Trash,
} from "@styled-icons/boxicons-regular"
import {
  Box,
  Button,
  DropdownMenu,
  ForwardRef,
} from "@questdb/react-components"
import { Text } from "../../../components"
import { fetchUserLocale, getLocaleFromLanguage } from "../../../utils"
import { format, formatDistance } from "date-fns"
import type { Buffer } from "../../../store/buffers"

type Tab = {
  id: string
  title: string
  favicon: string
  active: boolean
  className?: string
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

const HistoryButton = styled(Button)`
  &.active {
    background: ${({ theme }) => theme.color.comment};
  }
`

const DropdownMenuContent = styled(DropdownMenu.Content)`
  margin-top: 0.5rem;
  z-index: 100;
  background: ${({ theme }) => theme.color.backgroundDarker};
`

const mapTabIconToType = (buffer: Buffer) => {
  if (buffer.metricsViewState) {
    return "assets/icon-chart.svg"
  }
  return "assets/icon-file.svg"
}

export const Tabs = () => {
  const {
    activeBuffer,
    buffers,
    setActiveBuffer,
    addBuffer,
    updateBuffer,
    deleteBuffer,
    archiveBuffer,
  } = useEditor()
  const [tabsVisible, setTabsVisible] = useState(false)
  const userLocale = useMemo(fetchUserLocale, [])
  const [historyOpen, setHistoryOpen] = useState(false)

  const archivedBuffers = buffers
    .filter(
      (buffer) =>
        buffer.archived && buffer.archivedAt && buffer.position === -1,
    )
    .sort((a, b) =>
      a.archivedAt && b.archivedAt ? b.archivedAt - a.archivedAt : 0,
    )

  const active = async (id: string) => {
    const activeBuffer = buffers.find((buffer) => buffer.id === parseInt(id))
    if (activeBuffer) {
      await setActiveBuffer(activeBuffer)
    }
  }

  const repositionActiveBuffers = async (excludedId: string) => {
    const sortedActiveBuffers = buffers
      .filter(
        (buffer) => (!buffer.archived || buffer.isTemporary) && buffer.id !== parseInt(excludedId),
      )
      .sort((a, b) => a.position - b.position)

    for (const buffer of sortedActiveBuffers) {
      const index = sortedActiveBuffers.indexOf(buffer)
      if (buffer.id) {
        await updateBuffer(buffer.id, { position: index })
      }
    }
  }

  const close = async (id: string) => {
    const buffer = buffers.find((buffer) => buffer.id === parseInt(id))
    if (!buffer || buffers.filter((buffer) => !buffer.archived || buffer.isTemporary).length === 1) {
      return
    }
    
    if (buffer.isTemporary) {
      await updateBuffer(parseInt(id), { isTemporary: false })
      await repositionActiveBuffers(id)
      return
    }
    
    buffer?.value !== "" ||
    (buffer.metricsViewState?.metrics &&
      buffer.metricsViewState.metrics.length > 0)
      ? await archiveBuffer(parseInt(id))
      : await deleteBuffer(parseInt(id))
    await repositionActiveBuffers(id)
    if (archivedBuffers.length >= 10) {
      await Promise.all(
        archivedBuffers
          .slice(9)
          .map((buffer) => deleteBuffer(buffer.id as number)),
      )
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
    let newTabs = buffers
      .filter((tab) => tab.id !== parseInt(tabId) && (!tab.archived || tab.isTemporary))
      .sort((a, b) => a.position - b.position)
    newTabs.splice(toIndex, 0, beforeTab)
    newTabs.forEach(async (tab, index) => {
      await updateBuffer(tab.id as number, { position: index })
    })
  }

  const rename = async (id: string, title: string) => {
    await updateBuffer(parseInt(id), { label: title })
  }

  const removeAllArchived = async () => {
    for (const buffer of archivedBuffers) {
      await deleteBuffer(buffer.id as number)
    }
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
        limit={40}
        darkMode={true}
        onTabClose={close}
        onTabReorder={reorder}
        onTabActive={active}
        onTabRename={rename}
        onNewTab={addBuffer}
        tabs={buffers
          .filter((buffer) => !buffer.archived || buffer.isTemporary)
          .sort((a, b) => a.position - b.position)
          .map(
            (buffer) => {
              const classNames = []
              if (buffer.metricsViewState) {
                classNames.push("metrics-tab")
              }
              if (buffer.isTemporary) {
                classNames.push("temporary-tab")
              }
              
              const className = classNames.length > 0 ? classNames.join(" ") : undefined
              
              return {
                id: buffer.id?.toString(),
                favicon: mapTabIconToType(buffer),
                title: buffer.label,
                active: activeBuffer.id === buffer.id,
                className,
              } as Tab
            }
          )}
      />
      <DropdownMenu.Root modal={false} onOpenChange={setHistoryOpen}>
        <DropdownMenu.Trigger asChild>
          <ForwardRef>
            <HistoryButton
              skin="transparent"
              data-hook="editor-tabs-history-button"
              prefixIcon={<History size="20px" />}
              {...(historyOpen ? { className: "active" } : {})}
            >
              History
            </HistoryButton>
          </ForwardRef>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenuContent data-hook="editor-tabs-history">
            {archivedBuffers.length === 0 && (
              <div style={{ padding: "0 1rem" }}>
                <Text color="gray2">History is empty</Text>
              </div>
            )}
            {archivedBuffers.map((buffer) => (
              <DropdownMenu.Item
                data-hook="editor-tabs-history-item"
                key={buffer.id}
                onClick={async () => {
                  await updateBuffer(buffer.id as number, {
                    archived: false,
                    archivedAt: undefined,
                    position: buffers.filter(b => !b.archived || b.isTemporary).length,
                  })
                  await setActiveBuffer(buffer)
                }}
              >
                <Box
                  align="flex-start"
                  justifyContent="flex-start"
                  gap="0.5rem"
                  title={buffer.label}
                >
                  {buffer.metricsViewState ? (
                    <LineChart size="18px" />
                  ) : (
                    <File size="18px" />
                  )}
                  <Box
                    flexDirection="column"
                    align="flex-start"
                    gap="0"
                    {...(buffer.archivedAt
                      ? {
                          title: format(new Date(buffer.archivedAt), "P pppp", {
                            locale: getLocaleFromLanguage(userLocale),
                          }),
                        }
                      : {})}
                  >
                    <Text color="foreground" ellipsis>
                      {buffer.label.substring(0, 30)}
                      {buffer.label.length > 30 ? "..." : ""}
                    </Text>
                    {buffer.archivedAt && (
                      <Text color="gray2">
                        {formatDistance(
                          buffer.archivedAt,
                          new Date().getTime(),
                          {
                            locale: getLocaleFromLanguage(userLocale),
                          },
                        )}
                        {" ago"}
                      </Text>
                    )}
                  </Box>
                </Box>
              </DropdownMenu.Item>
            ))}
            {archivedBuffers.length > 0 && (
              <>
                <DropdownMenu.Divider />
                <DropdownMenu.Item
                  onClick={removeAllArchived}
                  data-hook="editor-tabs-history-clear"
                >
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
