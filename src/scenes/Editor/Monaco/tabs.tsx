import React, { useLayoutEffect, useState, useMemo } from "react"
import styled, { css } from "styled-components"
import { Tabs as ReactChromeTabs } from "../../../components/ReactChromeTabs"
import { useEditor, MAX_TABS } from "../../../providers"
import { History, LineChart, Trash } from "@styled-icons/boxicons-regular"
import {
  DotsThreeVerticalIcon,
  DownloadSimpleIcon,
  UploadSimpleIcon,
  NotebookIcon,
  FileTextIcon,
  GearSixIcon,
} from "@phosphor-icons/react"
import { createDefaultNotebookViewState } from "../../../store/notebook"
import { toast } from "../../../components/Toast"
import { db } from "../../../store/db"
import {
  validateBufferItem,
  sanitizeBuffer,
  createBufferContentKey,
} from "./importTabs"
import { migrateBuffer, getCurrentDbVersion } from "../../../store/migrations"
import { importInto, peakImportFile } from "dexie-export-import"
import { exportBuffers } from "./exportTabs"
import { ImportSummaryDialog, SkippedTab } from "./ImportSummaryDialog"
import { EditorSettingsModal } from "../../../components/EditorSettingsModal"
import {
  Box,
  Button,
  DropdownMenu,
  ForwardRef,
  Text,
} from "../../../components"
import { fetchUserLocale, getLocaleFromLanguage } from "../../../utils"
import { format, formatDistance } from "date-fns"
import { type Buffer, MAX_BUFFER_NAME_LENGTH } from "../../../store/buffers"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"

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
`

const ArchivedBuffersList = styled.div`
  max-height: 70vh;
  overflow-y: auto;
`

// Invisible trigger we reposition to anchor Radix's menu at the chrome-tabs "+".
const NewTabAnchor = styled(DropdownMenu.Trigger)`
  position: fixed;
  width: 0;
  height: 0;
  padding: 0;
  border: 0;
  opacity: 0;
  pointer-events: none;
`

const mapTabIconToType = (buffer: Buffer) => {
  if (buffer.notebookViewState) {
    return "assets/icon-notebook.svg"
  }
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
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(false)
  const [newTabMenuPos, setNewTabMenuPos] = useState<{
    x: number
    y: number
  } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [importSummaryOpen, setImportSummaryOpen] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [skippedTabs, setSkippedTabs] = useState<SkippedTab[]>([])

  const handleExportTabs = async () => {
    void trackEvent(ConsoleEvent.TAB_EXPORT)
    try {
      await exportBuffers()
    } catch (err) {
      console.error("Export error:", err)
      toast.error(
        `Failed to export tabs: ${err instanceof Error ? err.message : "Unknown error"}`,
      )
    }
  }

  const handleImportTabs = () => {
    void trackEvent(ConsoleEvent.TAB_IMPORT)
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json"
    input.style.display = "none"
    input.dataset.hook = "editor-tabs-import-input"
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const blob = new Blob([await file.arrayBuffer()])

        let importVersion: number
        try {
          const { formatName, data } = await peakImportFile(blob)

          if (formatName !== "dexie") {
            toast.error(
              `Invalid file format: Expected Dexie export but got "${formatName || "unknown"}"`,
            )
            return
          }

          if (!data || typeof data.databaseVersion !== "number") {
            toast.error(
              "Invalid file format: Missing or invalid database version information",
            )
            return
          }

          importVersion = data.databaseVersion

          const buffersTable = data.tables?.find(
            (t: { name: string }) => t.name === "buffers",
          )
          const importTabCount = buffersTable?.rowCount ?? 0
          const existingTabCount = await db.buffers.count()

          if (existingTabCount + importTabCount > MAX_TABS) {
            toast.error(
              `Cannot import: importing ${importTabCount} tab${importTabCount === 1 ? "" : "s"} would exceed the ${MAX_TABS} tab limit (${existingTabCount} existing). Please clear history before importing.`,
            )
            return
          }
        } catch (err) {
          console.error("Failed to peak import file:", err)
          toast.error(
            `Failed to read file metadata: ${err instanceof Error ? err.message : "Unknown error"}`,
          )
          return
        }

        const currentVersion = getCurrentDbVersion()

        const existingBuffers = await db.buffers.toArray()
        const existingContentKeys = new Map<string, boolean>(
          existingBuffers.map((b) => [
            createBufferContentKey(b),
            b.archived === true,
          ]),
        )
        const maxPosition = Math.max(
          ...existingBuffers.map((b) => b.position),
          0,
        )

        let importedCount = 0
        const skipped: SkippedTab[] = []
        const idsToDelete: number[] = []

        await importInto(db, blob, {
          acceptVersionDiff: true,
          acceptMissingTables: true,
          filter: (table, value) => {
            if (table !== "buffers") return false
            const buffer = value as Buffer
            return !buffer.isTemporary && !buffer.isPreviewBuffer
          },
          transform: (table, value: Record<string, unknown>, key?: unknown) => {
            if (table !== "buffers") {
              return { value, key }
            }

            const buffer = value as Buffer

            // Migrate if importing from an older version
            let migratedValue: Buffer = buffer
            if (importVersion < currentVersion) {
              migratedValue = migrateBuffer(
                buffer,
                importVersion,
                currentVersion,
              )
            }

            // Validate against current schema
            const validationResult = validateBufferItem(
              migratedValue as Record<string, unknown>,
            )
            if (validationResult !== true) {
              skipped.push({
                label:
                  typeof migratedValue.label === "string"
                    ? migratedValue.label
                    : "Untitled",
                reason: validationResult,
                isMetricsTab: !!migratedValue.metricsViewState,
              })
              return {
                value: {
                  ...migratedValue,
                  // Drop the source id; keeping it risks a primary-key
                  // collision that aborts the whole import transaction. This
                  // row is deleted post-import anyway.
                  id: undefined,
                  position: -1,
                  _markedForDeletion: true,
                },
              }
            }

            const sanitized = sanitizeBuffer(
              migratedValue as Record<string, unknown>,
            )

            // Duplicate detection on post-migration, post-sanitization data
            const contentKey = createBufferContentKey(sanitized)
            if (existingContentKeys.has(contentKey)) {
              skipped.push({
                label: sanitized.label,
                reason: "Duplicate",
                isMetricsTab: !!sanitized.metricsViewState,
                isExistingArchived: existingContentKeys.get(contentKey),
              })
              // transform cannot skip rows; mark for post-import deletion.
              // Use position -1 to avoid interfering with existing tab order
              // during the brief window before bulkDelete runs.
              return {
                value: { ...sanitized, position: -1, _markedForDeletion: true },
              }
            }
            existingContentKeys.set(contentKey, sanitized.archived === true)

            const isArchived = sanitized.archived === true
            sanitized.position = isArchived
              ? -1
              : maxPosition + importedCount + 1

            if (!isArchived) {
              importedCount++
            }

            return { value: sanitized }
          },
        })

        const allBuffersAfterImport = await db.buffers.toArray()
        for (const b of allBuffersAfterImport) {
          const record = b as Record<string, unknown>
          if (record._markedForDeletion && b.id !== undefined) {
            idsToDelete.push(b.id)
          }
        }
        if (idsToDelete.length > 0) {
          await db.buffers.bulkDelete(idsToDelete)
        }

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
        if (err instanceof Error) {
          if (err.name === "QuotaExceededError") {
            toast.error("Storage quota exceeded. Please free up space.")
          } else {
            toast.error(`Failed to import tabs: ${err.message}`)
          }
        } else {
          toast.error("Failed to import tabs: Unknown error")
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
        buffer.metricsViewState.metrics.length > 0) ||
      buffer.notebookViewState != null
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
    void trackEvent(ConsoleEvent.TAB_RENAME)
    await updateBuffer(parseInt(id), {
      label: title.slice(0, MAX_BUFFER_NAME_LENGTH),
    })
  }

  const removeAllArchived = async () => {
    for (const buffer of archivedBuffers) {
      await deleteBuffer(buffer.id as number)
    }
  }

  const handleNewTab = () => {
    if (tabsDisabled) return
    const btn = document.querySelector(".chrome-tabs .new-tab-button-wrapper")
    if (btn) {
      const rect = btn.getBoundingClientRect()
      setNewTabMenuPos({ x: rect.left, y: rect.top + 40 })
    }
    setNewTabMenuOpen(true)
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
        limit={
          MAX_TABS - buffers.filter((b) => b.archived && !b.isTemporary).length
        }
        onTabClose={close}
        onTabReorder={reorder}
        onTabActive={active}
        onTabRename={rename}
        onNewTab={handleNewTab}
        tabs={buffers
          .filter(
            (buffer) =>
              !(buffer as Record<string, unknown>)._markedForDeletion &&
              (!buffer.archived || buffer.isTemporary),
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
          .map((buffer) => {
            const classNames = []
            if (buffer.notebookViewState) {
              classNames.push("notebook-tab")
            }
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
      <DropdownMenu.Root
        modal={false}
        onOpenChange={(open) => {
          if (open) {
            void trackEvent(ConsoleEvent.TAB_HISTORY_OPEN)
          }
          setHistoryOpen(open)
        }}
      >
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
              <div style={{ padding: "0.5rem 1.4rem" }}>
                <Text color="gray2">History is empty</Text>
              </div>
            ) : (
              <ArchivedBuffersList>
                {archivedBuffers.map((buffer) => (
                  <DropdownMenu.Item
                    data-hook="editor-tabs-history-item"
                    key={buffer.id}
                    title={buffer.label}
                    onClick={async () => {
                      void trackEvent(ConsoleEvent.TAB_HISTORY_RESTORE)
                      await updateBuffer(buffer.id as number, {
                        archived: false,
                        archivedAt: undefined,
                        position: buffers.filter(
                          (b) => !b.archived || b.isTemporary,
                        ).length,
                      })
                      await setActiveBuffer(buffer)
                    }}
                    icon={
                      buffer.metricsViewState ? (
                        <LineChart size="16px" />
                      ) : buffer.notebookViewState ? (
                        <NotebookIcon size="16px" />
                      ) : (
                        <FileTextIcon size="16px" />
                      )
                    }
                    subtitle={
                      buffer.archivedAt ? (
                        <span
                          title={format(new Date(buffer.archivedAt), "P pppp", {
                            locale: getLocaleFromLanguage(userLocale),
                          })}
                        >
                          {formatDistance(
                            buffer.archivedAt,
                            new Date().getTime(),
                            {
                              locale: getLocaleFromLanguage(userLocale),
                            },
                          )}
                          {" ago"}
                        </span>
                      ) : undefined
                    }
                  >
                    <Text color="foreground" ellipsis>
                      {buffer.label.substring(0, 30)}
                      {buffer.label.length > 30 ? "..." : ""}
                    </Text>
                  </DropdownMenu.Item>
                ))}
              </ArchivedBuffersList>
            )}
            {archivedBuffers.length > 0 && (
              <>
                <DropdownMenu.Divider />
                <DropdownMenu.Item
                  onClick={() => {
                    void trackEvent(ConsoleEvent.TAB_HISTORY_CLEAR)
                    void removeAllArchived()
                  }}
                  data-hook="editor-tabs-history-clear"
                  icon={<Trash size="16px" />}
                >
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
              icon={<UploadSimpleIcon size={16} />}
            >
              <Text color="foreground">Import tabs</Text>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onClick={handleExportTabs}
              data-hook="editor-tabs-menu-export"
              icon={<DownloadSimpleIcon size={16} />}
            >
              <Text color="foreground">Export tabs</Text>
            </DropdownMenu.Item>
            <DropdownMenu.Divider />
            <DropdownMenu.Item
              onClick={() => setSettingsOpen(true)}
              data-hook="editor-tabs-menu-settings"
            >
              <GearSixIcon size={18} />
              <Text color="foreground">Editor settings</Text>
            </DropdownMenu.Item>
          </DropdownMenuContent>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <EditorSettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ImportSummaryDialog
        open={importSummaryOpen}
        onOpenChange={setImportSummaryOpen}
        importedCount={importedCount}
        skippedTabs={skippedTabs}
      />
      <DropdownMenu.Root open={newTabMenuOpen} onOpenChange={setNewTabMenuOpen}>
        <NewTabAnchor
          aria-label="Open new tab menu"
          style={{
            left: newTabMenuPos?.x ?? 0,
            top: newTabMenuPos?.y ?? 0,
          }}
        />
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="bottom"
            align="start"
            sideOffset={4}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <DropdownMenu.Item
              onSelect={() => {
                void addBuffer()
              }}
              data-hook="new-tab-editor"
              icon={<FileTextIcon size={16} />}
            >
              New editor
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() => {
                void addBuffer({
                  notebookViewState: createDefaultNotebookViewState(),
                })
              }}
              data-hook="new-tab-notebook"
              icon={<NotebookIcon size={16} />}
            >
              New notebook
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </Root>
  )
}
