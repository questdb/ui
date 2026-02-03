import React, { useLayoutEffect, useState, useMemo } from "react"
import styled, { css } from "styled-components"
import { Tabs as ReactChromeTabs } from "../../../components/ReactChromeTabs"
import { useEditor } from "../../../providers"
import { File, History, LineChart, Trash } from "@styled-icons/boxicons-regular"
import {
  DotsThreeVerticalIcon,
  DownloadSimpleIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react"
import { toast } from "../../../components/Toast"
import { db } from "../../../store/db"
import {
  validateBufferSchema,
  sanitizeBuffer,
  findDuplicates,
} from "./importTabs"
import { ImportSummaryDialog, SkippedTab } from "./ImportSummaryDialog"
import {
  Box,
  Button,
  DropdownMenu,
  ForwardRef,
  Text,
} from "../../../components"
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
})<{ $tabsDisabled: boolean }>`
  width: 100%;
  display: flex;
  background: ${({ theme }) => theme.color.backgroundLighter};
  padding-right: 1rem;
  ${({ $tabsDisabled }) =>
    $tabsDisabled &&
    css`
      opacity: 0.5;
      pointer-events: none;
    `}
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

const ArchivedBuffersList = styled.div`
  max-height: 70vh;
  overflow-y: auto;
`

const mapTabIconToType = (buffer: Buffer) => {
  if (buffer.metricsViewState) {
    return "assets/icon-chart.svg"
  }
  if (buffer.isPreviewBuffer) {
    return "assets/icon-compare.svg"
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
    updateBuffersPositions,
    deleteBuffer,
    archiveBuffer,
    tabsDisabled,
  } = useEditor()
  const [tabsVisible, setTabsVisible] = useState(false)
  const userLocale = useMemo(fetchUserLocale, [])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [importSummaryOpen, setImportSummaryOpen] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [skippedTabs, setSkippedTabs] = useState<SkippedTab[]>([])

  const handleExportTabs = async () => {
    const allBuffers = await db.buffers.toArray()
    const exportData = allBuffers
      .filter((b) => !b.isTemporary && !b.isPreviewBuffer)
      .map(({ id: _id, ...rest }) => rest)

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `questdb-tabs-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportTabs = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json"
    input.style.display = "none"
    input.dataset.hook = "editor-tabs-import-input"
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      const MAX_FILE_SIZE_MB = 500
      const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast.error(
          `File size exceeds ${MAX_FILE_SIZE_MB}MB limit. Please split your tabs into smaller files.`,
        )
        return
      }

      try {
        const text = await file.text()
        const data: unknown = JSON.parse(text)

        const validationResult = validateBufferSchema(data)
        if (validationResult !== true) {
          toast.error(`Invalid file format: ${validationResult}`)
          return
        }

        const sanitizedData = (data as Record<string, unknown>[]).map(
          sanitizeBuffer,
        )

        let importedCount = 0
        const skipped: SkippedTab[] = []

        await db.transaction("rw", db.buffers, async () => {
          const existingBuffers = await db.buffers.toArray()

          const duplicateIndices = findDuplicates(
            existingBuffers,
            sanitizedData,
          )

          // Collect skipped tab information
          duplicateIndices.forEach((index) => {
            skipped.push({
              label: sanitizedData[index].label,
              reason: "Duplicate",
              isMetricsTab: !!sanitizedData[index].metricsViewState,
            })
          })

          const newTabs = sanitizedData.filter(
            (_, index) => !duplicateIndices.has(index),
          )
          importedCount = newTabs.length

          if (newTabs.length === 0) {
            return
          }

          const maxPosition = Math.max(
            ...existingBuffers.map((b) => b.position),
            0,
          )
          let activeTabCount = 0

          for (const tab of newTabs) {
            const isArchived = tab.archived === true
            await db.buffers.add({
              ...tab,
              position: isArchived ? -1 : maxPosition + activeTabCount + 1,
            })
            if (!isArchived) {
              activeTabCount++
            }
          }
        })

        // Show dialog only if there are skipped tabs, otherwise show toast
        if (skipped.length > 0) {
          setImportedCount(importedCount)
          setSkippedTabs(skipped)
          setImportSummaryOpen(true)
        } else if (importedCount > 0) {
          toast.success(
            `Imported ${importedCount} tab${importedCount === 1 ? "" : "s"} successfully.`,
          )
        } else {
          toast.info("All tabs already exist. Nothing imported.")
        }
      } catch (err) {
        console.error("Import error:", err)
        if (err instanceof SyntaxError) {
          toast.error("Failed to parse JSON file.")
        } else if (err instanceof Error && err.name === "QuotaExceededError") {
          toast.error("Storage quota exceeded. Please free up space.")
        } else {
          toast.error("Failed to import tabs.")
        }
      } finally {
        input.remove()
      }
    }
    document.body.appendChild(input)
    input.click()
  }

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
        (buffer) =>
          (!buffer.archived || buffer.isTemporary) &&
          buffer.id !== parseInt(excludedId),
      )
      .sort((a, b) => a.position - b.position)

    const positions = sortedActiveBuffers
      .map((buffer, index) => ({
        id: buffer.id as number,
        position: index,
      }))
      .filter((p) => p.id !== undefined)

    if (positions.length > 0) {
      await updateBuffersPositions(positions)
    }
  }

  const close = async (id: string) => {
    const buffer = buffers.find((buffer) => buffer.id === parseInt(id))
    if (
      !buffer ||
      buffers.filter((buffer) => !buffer.archived || buffer.isTemporary)
        .length === 1
    ) {
      return
    }

    if (buffer.isPreviewBuffer) {
      await deleteBuffer(parseInt(id), true)
      await repositionActiveBuffers(id)
      return
    }

    if (buffer.isTemporary) {
      await updateBuffer(parseInt(id), { isTemporary: false }, true)
      return
    }

    if (
      buffer?.value !== "" ||
      (buffer.metricsViewState?.metrics &&
        buffer.metricsViewState.metrics.length > 0)
    ) {
      await archiveBuffer(parseInt(id))
    } else {
      await deleteBuffer(parseInt(id))
    }
    await repositionActiveBuffers(id)
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
    const newTabs = buffers
      .filter(
        (tab) =>
          tab.id !== parseInt(tabId) && (!tab.archived || tab.isTemporary),
      )
      .sort((a, b) => {
        if (a.isTemporary) {
          return 1
        }
        if (b.isTemporary) {
          return -1
        }
        return a.position - b.position
      })
    newTabs.splice(toIndex, 0, beforeTab)

    const positions = newTabs.map((tab, index) => ({
      id: tab.id as number,
      position: index,
    }))
    await updateBuffersPositions(positions)
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
    <Root
      $tabsDisabled={tabsDisabled}
      data-hook={`editor-tabs${tabsDisabled ? "-disabled" : ""}`}
    >
      <ReactChromeTabs
        darkMode
        onTabClose={close}
        onTabReorder={reorder}
        onTabActive={active}
        onTabRename={rename}
        onNewTab={addBuffer}
        tabs={buffers
          .filter((buffer) => !buffer.archived || buffer.isTemporary)
          .sort((a, b) => {
            if (a.isTemporary) {
              return 1
            }
            if (b.isTemporary) {
              return -1
            }
            return a.position - b.position
          })
          .map((buffer) => {
            const classNames = []
            if (buffer.metricsViewState) {
              classNames.push("metrics-tab")
            }
            if (buffer.isTemporary) {
              classNames.push("temporary-tab")
            }
            if (buffer.isPreviewBuffer) {
              classNames.push("preview-tab")
            }

            const className =
              classNames.length > 0 ? classNames.join(" ") : undefined

            return {
              id: buffer.id?.toString(),
              favicon: mapTabIconToType(buffer),
              title: buffer.label,
              active: activeBuffer.id === buffer.id,
              className,
            } as Tab
          })}
      />
      <DropdownMenu.Root modal={false} onOpenChange={setHistoryOpen}>
        <DropdownMenu.Trigger asChild>
          <ForwardRef>
            <HistoryButton
              skin="transparent"
              data-hook="editor-tabs-history-button"
              {...(historyOpen ? { className: "active" } : {})}
            >
              <History size="20px" />
            </HistoryButton>
          </ForwardRef>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenuContent data-hook="editor-tabs-history">
            {archivedBuffers.length === 0 ? (
              <div style={{ padding: "0 1rem" }}>
                <Text color="gray2">History is empty</Text>
              </div>
            ) : (
              <ArchivedBuffersList>
                {archivedBuffers.map((buffer) => (
                  <DropdownMenu.Item
                    data-hook="editor-tabs-history-item"
                    key={buffer.id}
                    onClick={async () => {
                      await updateBuffer(buffer.id as number, {
                        archived: false,
                        archivedAt: undefined,
                        position: buffers.filter(
                          (b) => !b.archived || b.isTemporary,
                        ).length,
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
                              title: format(
                                new Date(buffer.archivedAt),
                                "P pppp",
                                {
                                  locale: getLocaleFromLanguage(userLocale),
                                },
                              ),
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
              </ArchivedBuffersList>
            )}
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
      <DropdownMenu.Root modal={false} onOpenChange={setMenuOpen}>
        <DropdownMenu.Trigger asChild>
          <ForwardRef>
            <HistoryButton
              skin="transparent"
              data-hook="editor-tabs-menu-button"
              {...(menuOpen ? { className: "active" } : {})}
            >
              <DotsThreeVerticalIcon size={20} weight="bold" />
            </HistoryButton>
          </ForwardRef>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenuContent data-hook="editor-tabs-menu">
            <DropdownMenu.Item
              onClick={handleImportTabs}
              data-hook="editor-tabs-menu-import"
            >
              <UploadSimpleIcon size={18} />
              <Text color="foreground">Import tabs</Text>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onClick={handleExportTabs}
              data-hook="editor-tabs-menu-export"
            >
              <DownloadSimpleIcon size={18} />
              <Text color="foreground">Export tabs</Text>
            </DropdownMenu.Item>
          </DropdownMenuContent>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <ImportSummaryDialog
        open={importSummaryOpen}
        onOpenChange={setImportSummaryOpen}
        importedCount={importedCount}
        skippedTabs={skippedTabs}
      />
    </Root>
  )
}
