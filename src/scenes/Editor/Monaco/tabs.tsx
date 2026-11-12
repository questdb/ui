import React, {
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import styled, { css } from "styled-components"
import { TabBar, type TabProperties } from "../../../components/TabBar"
import { QuestContext, useEditor, MAX_TABS } from "../../../providers"
import { History, LineChart, Trash } from "../../../components/icons"
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
import {
  cellsShowingResults,
  importHoldNote,
  planImportRuns,
} from "../../../utils/notebooks/importRunPlan"
import { createValidateWithGlobals } from "../Notebook/declareUtils"
import { ImportSummaryDialog, SkippedTab } from "./ImportSummaryDialog"
import { ClearHistoryDialog } from "../ClearHistoryDialog"
import { EditorSettingsModal } from "../../../components/EditorSettingsModal"
import {
  Box,
  DropdownMenu,
  ForwardRef,
  IconButton,
  Text,
} from "../../../components"
import { fetchUserLocale, getLocaleFromLanguage } from "../../../utils"
import { format, formatDistance } from "date-fns"
import {
  type Buffer,
  bufferTypeOf,
  MAX_BUFFER_NAME_LENGTH,
} from "../../../store/buffers"
import {
  sortClosedBuffers,
  sortOpenBuffers,
} from "../../../utils/buffers/tabOrder"
import { acceptDeleteClick } from "../../../utils/buffers/deleteClickGuard"
import { trackEvent } from "../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../modules/ConsoleEventTracker/events"

const Root = styled(Box).attrs({
  align: "center",
  justifyContent: "space-between",
})<{ $tabsDisabled: boolean }>`
  width: 100%;
  display: flex;
  position: relative;
  z-index: 12;
  isolation: isolate;
  background: transparent;
  border-bottom: 1px solid ${({ theme }) => theme.color.borderSubtle};
  box-shadow: ${({ theme }) =>
    theme.mode === "light"
      ? `0 1px 2px ${theme.color.shadowSubtle}, 0 2px 6px ${theme.color.shadowSoft}`
      : `0 8px 20px ${theme.color.shadowSoft}`};
  padding-right: 1rem;
  gap: 0.4rem;

  &::before {
    position: absolute;
    inset: 0;
    z-index: -1;
    background: ${({ theme }) => theme.color.surfaceTabRail};
    backdrop-filter: blur(16px) saturate(135%);
    -webkit-backdrop-filter: blur(16px) saturate(135%);
    content: "";
    pointer-events: none;
  }

  ${({ $tabsDisabled }) =>
    $tabsDisabled &&
    css`
      opacity: 0.5;
      pointer-events: none;
    `}
`

const HistoryButton = styled(IconButton)`
  flex: 0 0 auto;
  width: 4rem;
  height: 4rem;
  padding: 0;
  border-radius: 0.7rem;

  &[aria-pressed="true"] {
    background: ${({ theme }) => theme.color.surfaceRaised};
    border-color: ${({ theme }) => theme.color.borderDefault};
    box-shadow:
      inset 0 1px 0 ${({ theme }) => theme.color.borderSubtle},
      0 4px 12px ${({ theme }) => theme.color.shadowSoft};
  }
`

const DropdownMenuContent = styled(DropdownMenu.Content)`
  margin-top: 0.5rem;
`

const ArchivedBuffersList = styled.div`
  max-height: 70vh;
  overflow-y: auto;
`

const ArchivedBufferRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding-right: 0.4rem;

  > [role="menuitem"] {
    flex: 1;
    min-width: 0;
  }
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
    return "chrome-tab-favicon--notebook"
  }
  if (buffer.metricsViewState) {
    return "chrome-tab-favicon--metrics"
  }
  if (buffer.isPreviewBuffer) {
    return "chrome-tab-favicon--preview"
  }
  return "chrome-tab-favicon--sql"
}

export const Tabs = () => {
  const {
    activeBuffer,
    buffers,
    setActiveBuffer,
    addBuffer,
    updateBuffer,
    deleteBuffer,
    closeBuffer,
    restoreBuffer,
    reorderBuffer,
    clearArchivedBuffers,
    tabsDisabled,
    runImportedNotebookCells,
  } = useEditor()
  const { quest } = useContext(QuestContext)
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
  const [clearHistoryOpen, setClearHistoryOpen] = useState(false)
  const [importSummaryOpen, setImportSummaryOpen] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [skippedTabs, setSkippedTabs] = useState<SkippedTab[]>([])
  const historyButtonRef = useRef<HTMLButtonElement>(null)

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
        // Cells that were showing a result in the source, per notebook; the
        // sanitiser drops that marker, so it is read here, before it does.
        const resultCellsByKey = new Map<string, string[]>()
        const existingIds = new Set(existingBuffers.map((b) => b.id))

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

            const rawNotebook = migratedValue.notebookViewState as
              | { cells?: unknown }
              | undefined
            const resultCells = cellsShowingResults(rawNotebook?.cells)
            if (resultCells.length > 0) {
              resultCellsByKey.set(contentKey, resultCells)
            }

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

        // Give imported notebooks back the results they were showing: each
        // read-only cell runs again; cells with DDL/DML, or that could not be
        // checked, are held and noted.
        const runs: Array<{ bufferId: number; cellIds: string[] }> = []
        let heldCount = 0
        let uncheckedCount = 0
        for (const b of allBuffersAfterImport) {
          if (b.id === undefined || existingIds.has(b.id)) continue
          if (idsToDelete.includes(b.id) || b.archived || !b.notebookViewState)
            continue
          const candidates = resultCellsByKey.get(createBufferContentKey(b))
          if (!candidates) continue
          const { variables } = b.notebookViewState.settings ?? {}
          const plan = await planImportRuns(
            b.notebookViewState.cells,
            candidates,
            createValidateWithGlobals(quest, () => variables),
          )
          heldCount += plan.held.length
          uncheckedCount += plan.unchecked.length
          if (plan.run.length > 0)
            runs.push({ bufferId: b.id, cellIds: plan.run })
        }
        const holdNote = importHoldNote({
          held: heldCount,
          unchecked: uncheckedCount,
        })

        // Show dialog only if there are skipped tabs, otherwise show toast
        if (skipped.length > 0) {
          setImportedCount(importedCount)
          setSkippedTabs(skipped)
          setImportSummaryOpen(true)
          if (holdNote) toast.info(holdNote)
        } else if (importedCount > 0) {
          toast.success(
            `Imported ${importedCount} tab${importedCount === 1 ? "" : "s"} successfully.${holdNote ? ` ${holdNote}` : ""}`,
          )
        } else {
          toast.info("All tabs already exist. Nothing imported.")
        }

        for (const { bufferId, cellIds } of runs) {
          void runImportedNotebookCells(bufferId, cellIds)
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

  const closedBuffers = sortClosedBuffers(buffers)

  const active = async (id: string) => {
    const activeBuffer = buffers.find((buffer) => buffer.id === parseInt(id))
    if (activeBuffer) {
      await setActiveBuffer(activeBuffer)
    }
  }

  const close = (id: string) => closeBuffer(parseInt(id))

  // `keepFocus`: the keyboard path keeps focus in the menu, so the editor
  // must not take it back. Only a previewed (active) entry needs a new
  // active tab.
  const deleteFromHistory = (buffer: Buffer, keepFocus = false) => {
    void trackEvent(ConsoleEvent.TAB_HISTORY_DELETE)
    void deleteBuffer(
      buffer.id as number,
      keepFocus ? buffer.isTemporary === true : true,
      "user",
      { focusEditor: !keepFocus },
    )
  }

  // Keyboard users delete a history entry with Delete/Backspace on the entry
  // itself (the menu's arrow keys never reach the trash button). Focus moves
  // to the next entry, or the previous one, or "Clear history", before the
  // deleted entry unmounts, so the menu keeps keyboard focus.
  const focusNeighbourHistoryItem = (item: HTMLElement) => {
    const menu = item.closest('[role="menu"]')
    if (!menu) return
    const items = Array.from(
      menu.querySelectorAll<HTMLElement>(
        '[data-hook="editor-tabs-history-item"]',
      ),
    )
    const index = items.indexOf(item)
    const neighbour =
      items[index + 1] ??
      items[index - 1] ??
      menu.querySelector<HTMLElement>('[data-hook="editor-tabs-history-clear"]')
    neighbour?.focus()
  }

  const reorder = (tabId: string, _fromIndex: number, toIndex: number) =>
    reorderBuffer(parseInt(tabId), toIndex)

  const rename = async (id: string, title: string) => {
    const buffer = buffers.find((buffer) => buffer.id === parseInt(id))
    void trackEvent(ConsoleEvent.TAB_RENAME, {
      ...(buffer ? { type: bufferTypeOf(buffer) } : {}),
    })
    await updateBuffer(parseInt(id), {
      label: title.slice(0, MAX_BUFFER_NAME_LENGTH),
    })
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

  useLayoutEffect(() => {
    const button = document.querySelector<HTMLButtonElement>(
      ".chrome-tabs .new-tab-button",
    )

    if (button) {
      const open = String(newTabMenuOpen)
      button.setAttribute("aria-expanded", open)
      button.setAttribute("aria-pressed", open)
    }
  }, [newTabMenuOpen])

  if (!tabsVisible) {
    return null
  }

  return (
    <Root
      $tabsDisabled={tabsDisabled}
      data-hook={`editor-tabs${tabsDisabled ? "-disabled" : ""}`}
    >
      <TabBar
        darkMode
        limit={
          MAX_TABS - buffers.filter((b) => b.archived && !b.isTemporary).length
        }
        onTabClose={close}
        onTabReorder={reorder}
        onTabActive={active}
        onTabRename={rename}
        onNewTab={handleNewTab}
        tabs={sortOpenBuffers(buffers).map((buffer) => {
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

          const tab: TabProperties = {
            id: String(buffer.id),
            faviconClass: mapTabIconToType(buffer),
            title: buffer.label,
            active: activeBuffer.id === buffer.id,
            className,
          }
          return tab
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
              ref={historyButtonRef}
              label="Tab history"
              variant="ghost"
              aria-pressed={historyOpen}
              aria-expanded={historyOpen}
              data-hook="editor-tabs-history-button"
            >
              <History size="20px" />
            </HistoryButton>
          </ForwardRef>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenuContent data-hook="editor-tabs-history">
            {closedBuffers.length === 0 ? (
              <div style={{ padding: "0.5rem 1.4rem" }}>
                <Text color="contentSecondary">History is empty</Text>
              </div>
            ) : (
              <ArchivedBuffersList>
                {closedBuffers.map((buffer) => (
                  <ArchivedBufferRow key={buffer.id}>
                    <DropdownMenu.Item
                      data-hook="editor-tabs-history-item"
                      title={buffer.label}
                      aria-keyshortcuts="Delete"
                      onClick={() => {
                        void trackEvent(ConsoleEvent.TAB_HISTORY_RESTORE)
                        void restoreBuffer(buffer.id as number)
                      }}
                      onKeyDown={(event: React.KeyboardEvent<HTMLElement>) => {
                        if (event.key !== "Delete" && event.key !== "Backspace")
                          return
                        event.preventDefault()
                        focusNeighbourHistoryItem(event.currentTarget)
                        deleteFromHistory(buffer, true)
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
                            title={format(
                              new Date(buffer.archivedAt),
                              "P pppp",
                              {
                                locale: getLocaleFromLanguage(userLocale),
                              },
                            )}
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
                      <Text color="contentPrimary" ellipsis>
                        {buffer.label.substring(0, 30)}
                        {buffer.label.length > 30 ? "..." : ""}
                      </Text>
                    </DropdownMenu.Item>
                    {/* Mouse only: Delete on the entry is the keyboard path,
                        and a menu cannot own a plain button. */}
                    <IconButton
                      label="Delete from history"
                      size="sm"
                      variant="dangerQuiet"
                      tabIndex={-1}
                      aria-hidden="true"
                      data-hook="editor-tabs-history-item-delete"
                      onClick={(event: React.MouseEvent) => {
                        event.stopPropagation()
                        if (!acceptDeleteClick()) return
                        deleteFromHistory(buffer)
                      }}
                    >
                      <Trash size="14px" />
                    </IconButton>
                  </ArchivedBufferRow>
                ))}
              </ArchivedBuffersList>
            )}
            {closedBuffers.length > 0 && (
              <>
                <DropdownMenu.Divider />
                <DropdownMenu.Item
                  onClick={() => setClearHistoryOpen(true)}
                  data-hook="editor-tabs-history-clear"
                  icon={<Trash size="16px" />}
                >
                  <Text color="contentPrimary">Clear history</Text>
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
              label="Editor options"
              variant="ghost"
              aria-pressed={menuOpen}
              aria-expanded={menuOpen}
              data-hook="editor-tabs-menu-button"
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
              <Text color="contentPrimary">Import tabs</Text>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onClick={handleExportTabs}
              data-hook="editor-tabs-menu-export"
              icon={<DownloadSimpleIcon size={16} />}
            >
              <Text color="contentPrimary">Export tabs</Text>
            </DropdownMenu.Item>
            <DropdownMenu.Divider />
            <DropdownMenu.Item
              onClick={() => setSettingsOpen(true)}
              data-hook="editor-tabs-menu-settings"
            >
              <GearSixIcon size={18} />
              <Text color="contentPrimary">Editor settings</Text>
            </DropdownMenu.Item>
          </DropdownMenuContent>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <EditorSettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ClearHistoryDialog
        open={clearHistoryOpen}
        count={closedBuffers.length}
        returnFocusRef={historyButtonRef}
        onDismiss={() => setClearHistoryOpen(false)}
        onConfirm={() => {
          void trackEvent(ConsoleEvent.TAB_HISTORY_CLEAR)
          void clearArchivedBuffers()
          setClearHistoryOpen(false)
        }}
      />
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
                void addBuffer({
                  notebookViewState: createDefaultNotebookViewState(),
                }).then((buffer) => {
                  if (buffer) {
                    void trackEvent(ConsoleEvent.NOTEBOOK_CREATE, {
                      source: "tab_menu",
                    })
                    void trackEvent(ConsoleEvent.NOTEBOOK_TAB_OPEN, {
                      source: "tab_menu",
                    })
                  }
                })
              }}
              data-hook="new-tab-notebook"
              icon={<NotebookIcon size={16} />}
            >
              New notebook
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() => {
                void addBuffer()
              }}
              data-hook="new-tab-editor"
              icon={<FileTextIcon size={16} />}
            >
              New editor
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </Root>
  )
}
