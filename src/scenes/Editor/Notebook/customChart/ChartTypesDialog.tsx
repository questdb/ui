import React, { useEffect, useMemo, useRef, useState } from "react"
import styled from "styled-components"
import { PlusIcon, TrashIcon, WarningIcon } from "@phosphor-icons/react"
import {
  AlertDialog,
  Box,
  Button,
  Checkbox,
  Dialog,
  ForwardRef,
  Input,
  Overlay,
  SelectableCardButton,
  Text,
} from "../../../../components"
import type {
  NotebookCell,
  NotebookChartType,
} from "../../../../store/notebook"
import { CodeEditorField } from "../CellChart/CodeEditorField"
import { CheckboxRow } from "../CellChart/chartSettingsStyles"
import {
  escapeInCodeEditor,
  tabPastCodeEditor,
} from "../CellChart/codeEditorKeys"
import { cellsUsingChartType } from "./chartTypeUsage"
import {
  MAX_CHART_TYPES,
  draftOfTypes,
  hasErrors,
  newTypeDraft,
  typeErrors,
  typesChanged,
  typesToSave,
  type ChartTypeDraft,
} from "./chartTypesDraft"

// A column of a fixed height: the body takes what the title, notices and
// buttons leave, so the buttons stay inside the dialog.
const Content = styled(Dialog.Content)`
  && {
    display: flex;
    flex-direction: column;
    height: min(85vh, 80rem);
  }
`

const Body = styled.div`
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: 22rem minmax(0, 1fr);
  gap: 2rem;
  padding: 2rem 2rem 0;
  min-height: 0;
`

const Side = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  min-height: 0;
`

const List = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  min-height: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
`

const TypeButton = styled(SelectableCardButton)`
  && {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
    height: auto;
    padding: 0.8rem 1rem;
    text-align: left;
    width: 100%;
    white-space: normal;
  }
`

const TypeName = styled.span`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  max-width: 100%;
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.3rem;
  color: ${({ theme }) => theme.color.contentPrimary};

  & > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  & > svg {
    flex-shrink: 0;
  }
`

const TypeDescription = styled.span`
  max-width: 100%;
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const Editor = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  min-height: 0;
  overflow-y: auto;
  padding-right: 0.4rem;
`

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`

const Label = styled.span`
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const ErrorText = styled.span`
  font-size: 1.2rem;
  color: ${({ theme }) => theme.color.statusDanger};
`

const Notice = styled(Box).attrs({ gap: "0.8rem", align: "center" })`
  flex: 0 0 auto;
  margin: 1.2rem 2rem 0;
  line-height: 1.5;
  padding: 0.8rem 1.2rem;
  border-radius: 0.4rem;
  font-size: 1.2rem;
  background: ${({ theme }) => theme.color.surfaceRaised};
  color: ${({ theme }) => theme.color.contentSecondary};
`

const Code = styled.code`
  padding: 0 0.3rem;
  border-radius: 0.3rem;
  font-family: ${({ theme }) => theme.fontMonospace};
  color: ${({ theme }) => theme.color.contentPrimary};
  background: ${({ theme }) => theme.color.interactionNeutral};
`

const Empty = styled(Box).attrs({
  flexDirection: "column",
  align: "center",
  justifyContent: "center",
  gap: "1.2rem",
})`
  grid-column: 1 / -1;
  text-align: center;
  color: ${({ theme }) => theme.color.contentSecondary};
`

const Footer = styled(Dialog.ActionButtons)`
  justify-content: space-between;
  align-items: center;
`

const cellLabel = (cell: NotebookCell, cells: NotebookCell[]) =>
  cell.name?.trim() || `Cell ${cells.indexOf(cell) + 1}`

const usersText = (users: NotebookCell[], cells: NotebookCell[]) =>
  users.map((c) => cellLabel(c, cells)).join(", ")

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  types: NotebookChartType[] | undefined
  cells: NotebookCell[]
  onSave: (types: NotebookChartType[], renames: Record<string, string>) => void
}

/**
 * The notebook's chart types: JavaScript drawing functions that custom chart
 * options use by name. Edits a draft of all of them and saves it at once.
 */
export const ChartTypesDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  types,
  cells,
  onSave,
}) => {
  const [drafts, setDrafts] = useState<ChartTypeDraft[]>(() =>
    draftOfTypes(types),
  )
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<"discard" | "delete" | null>(null)
  // The saved types the draft started from; a change by someone else (an
  // agent) while the dialog is open is offered, not forced.
  const [base, setBase] = useState(types)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const next = draftOfTypes(types)
    setDrafts(next)
    setBase(types)
    setSelectedKey(next[0]?.key ?? null)
    setConfirm(null)
    // Opening starts from the saved types; later changes are offered below.
  }, [open])

  const dirty = typesChanged(drafts, base)
  const changedElsewhere = open && types !== base
  useEffect(() => {
    // Nothing edited yet: just show what is saved now.
    if (changedElsewhere && !dirty) {
      const next = draftOfTypes(types)
      setDrafts(next)
      setBase(types)
      setSelectedKey((key) =>
        next.some((d) => d.key === key) ? key : (next[0]?.key ?? null),
      )
    }
  }, [changedElsewhere, dirty, types])

  const selected = drafts.find((d) => d.key === selectedKey) ?? null
  const errorsByKey = useMemo(
    () => new Map(drafts.map((d) => [d.key, typeErrors(d, drafts)])),
    [drafts],
  )
  const invalid = drafts.filter((d) => hasErrors(errorsByKey.get(d.key) ?? {}))
  const usersOf = (draft: ChartTypeDraft) =>
    draft.original === null ? [] : cellsUsingChartType(cells, draft.original)

  const update = (patch: Partial<ChartTypeDraft>) =>
    setDrafts((list) =>
      list.map((d) => (d.key === selectedKey ? { ...d, ...patch } : d)),
    )

  const add = () => {
    const draft = newTypeDraft(drafts)
    setDrafts([...drafts, draft])
    setSelectedKey(draft.key)
    requestAnimationFrame(() => nameRef.current?.select())
  }

  const remove = (draft: ChartTypeDraft) => {
    const rest = drafts.filter((d) => d.key !== draft.key)
    setDrafts(rest)
    setSelectedKey(rest[0]?.key ?? null)
    setConfirm(null)
  }

  const close = () => {
    setConfirm(null)
    onOpenChange(false)
  }
  const requestClose = () => (dirty ? setConfirm("discard") : close())

  const save = () => {
    if (invalid.length > 0) {
      setSelectedKey(invalid[0].key)
      return
    }
    const { types: next, renames } = typesToSave(drafts)
    onSave(next, renames)
    close()
  }

  const selectedErrors = selected ? (errorsByKey.get(selected.key) ?? {}) : {}
  const selectedUsers = selected ? usersOf(selected) : []

  return (
    <>
      <Dialog.Root
        open={open}
        onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}
      >
        <Dialog.Portal>
          <ForwardRef>
            <Overlay primitive={Dialog.Overlay} />
          </ForwardRef>
          <Content
            maxwidth="100rem"
            data-hook="chart-types-dialog"
            aria-describedby={undefined}
            onEscapeKeyDown={(e) => {
              // Escape inside the code editor is the editor's.
              if (escapeInCodeEditor(document.activeElement)) e.preventDefault()
            }}
            onKeyDown={(e) => tabPastCodeEditor(e, e.currentTarget)}
          >
            <Dialog.Title>Chart types</Dialog.Title>
            <Notice>
              <WarningIcon size={16} aria-hidden />
              <span>
                JavaScript drawing functions (ECharts custom series) that custom
                chart options in this notebook use by name, as{" "}
                <Code>{`{"type": "custom", "renderItem": "name"}`}</Code>. They
                run in this page: keep only code you trust.
              </span>
            </Notice>
            {changedElsewhere && dirty && (
              <Notice role="status">
                The chart types changed while you were editing.
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const next = draftOfTypes(types)
                    setDrafts(next)
                    setBase(types)
                    setSelectedKey(next[0]?.key ?? null)
                  }}
                >
                  Load the new version
                </Button>
              </Notice>
            )}
            <Body>
              {drafts.length === 0 ? (
                <Empty>
                  <Text color="contentSecondary">
                    No chart types yet. An agent adds them with
                    define_chart_type, or write one here.
                  </Text>
                  <Button
                    variant="secondary"
                    prefixIcon={<PlusIcon size={16} />}
                    onClick={add}
                  >
                    New chart type
                  </Button>
                </Empty>
              ) : (
                <>
                  <Side>
                    <List aria-label="Chart types">
                      {drafts.map((d) => {
                        const users = usersOf(d)
                        const broken = hasErrors(errorsByKey.get(d.key) ?? {})
                        return (
                          <li key={d.key}>
                            <TypeButton
                              $selected={d.key === selectedKey}
                              onClick={() => setSelectedKey(d.key)}
                            >
                              <TypeName>
                                <span>{d.name || "(no name)"}</span>
                                {broken && (
                                  <WarningIcon
                                    size={14}
                                    weight="fill"
                                    aria-label="Has errors"
                                  />
                                )}
                              </TypeName>
                              {d.description.trim() && (
                                <TypeDescription title={d.description}>
                                  {d.description}
                                </TypeDescription>
                              )}
                              <Text color="contentSecondary" size="xs">
                                {users.length === 0
                                  ? "Not used"
                                  : `Used by ${users.length} cell${users.length === 1 ? "" : "s"}`}
                              </Text>
                              {!d.allowed && (
                                <Text color="statusWarning" size="xs">
                                  Not allowed to run
                                </Text>
                              )}
                            </TypeButton>
                          </li>
                        )
                      })}
                    </List>
                    <Button
                      variant="secondary"
                      prefixIcon={<PlusIcon size={16} />}
                      onClick={add}
                      disabled={drafts.length >= MAX_CHART_TYPES}
                      title={
                        drafts.length >= MAX_CHART_TYPES
                          ? `A notebook holds at most ${MAX_CHART_TYPES} chart types.`
                          : undefined
                      }
                    >
                      New chart type
                    </Button>
                  </Side>
                  {selected && (
                    <Editor key={selected.key}>
                      <Field>
                        <Label>Name (what options write in renderItem)</Label>
                        <Input
                          ref={nameRef}
                          name="chart-type-name"
                          value={selected.name}
                          aria-invalid={selectedErrors.name !== undefined}
                          onChange={(e) => update({ name: e.target.value })}
                        />
                        {selectedErrors.name && (
                          <ErrorText>{selectedErrors.name}</ErrorText>
                        )}
                        {selected.original !== null &&
                          selected.original !== selected.name &&
                          selectedUsers.length > 0 && (
                            <Text color="contentSecondary" size="xs">
                              Saving renames it in{" "}
                              {usersText(selectedUsers, cells)}.
                            </Text>
                          )}
                      </Field>
                      <Field>
                        <Label>Description</Label>
                        <Input
                          name="chart-type-description"
                          value={selected.description}
                          placeholder="What it draws, and the columns it reads"
                          maxLength={500}
                          onChange={(e) =>
                            update({ description: e.target.value })
                          }
                        />
                      </Field>
                      <Field as="div">
                        <Label>renderItem (JavaScript)</Label>
                        <CodeEditorField
                          value={selected.renderItem}
                          onChange={(renderItem) => update({ renderItem })}
                          language="javascript"
                          ariaLabel={`Source of chart type ${selected.name}`}
                          height="30rem"
                          invalid={selectedErrors.source !== undefined}
                        />
                        {selectedErrors.source && (
                          <ErrorText role="alert">
                            {selectedErrors.source}
                          </ErrorText>
                        )}
                      </Field>
                      <Field as="div">
                        <CheckboxRow>
                          <Checkbox
                            checked={selected.allowed}
                            onChange={(e) =>
                              update({ allowed: e.target.checked })
                            }
                          />
                          Allow this code to run
                        </CheckboxRow>
                        <Text color="contentSecondary" size="xs">
                          {selected.allowed
                            ? "It runs in the console with your rights whenever a chart uses it."
                            : "It came from an import or from an agent without the write permission, so it does not run. It would run with your rights: allow it only once you have read it."}
                        </Text>
                      </Field>
                      <Box justifyContent="space-between" align="center">
                        <Text color="contentSecondary" size="sm">
                          {selectedUsers.length === 0
                            ? "No cell uses it yet."
                            : `Used by ${usersText(selectedUsers, cells)}.`}
                        </Text>
                        <Button
                          variant="secondary"
                          prefixIcon={<TrashIcon size={16} />}
                          onClick={() =>
                            selectedUsers.length > 0
                              ? setConfirm("delete")
                              : remove(selected)
                          }
                        >
                          Delete
                        </Button>
                      </Box>
                    </Editor>
                  )}
                </>
              )}
            </Body>
            <Footer>
              <Text color="contentSecondary" size="sm">
                {invalid.length > 0
                  ? `Fix ${invalid.map((d) => d.name || "(no name)").join(", ")} to save.`
                  : ""}
              </Text>
              <Box gap="0.8rem">
                <Button variant="secondary" onClick={requestClose}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={save}
                  disabled={!dirty || invalid.length > 0}
                >
                  Save
                </Button>
              </Box>
            </Footer>
          </Content>
        </Dialog.Portal>
      </Dialog.Root>

      <AlertDialog.Root
        open={confirm !== null}
        onOpenChange={(next) => !next && setConfirm(null)}
      >
        <AlertDialog.Portal>
          <ForwardRef>
            <Overlay primitive={AlertDialog.Overlay} />
          </ForwardRef>
          <AlertDialog.Content maxwidth="44rem">
            <AlertDialog.Title>
              {confirm === "delete"
                ? `Delete ${selected?.name ?? "chart type"}?`
                : "Discard your changes?"}
            </AlertDialog.Title>
            <AlertDialog.Description>
              {confirm === "delete"
                ? `${usersText(selectedUsers, cells)} draw${selectedUsers.length === 1 ? "s" : ""} with it and will show an error until their option changes.`
                : "Your edits to the chart types are not saved."}
            </AlertDialog.Description>
            <AlertDialog.ActionButtons>
              <AlertDialog.Cancel asChild>
                <Button variant="secondary">Keep editing</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  variant="danger"
                  onClick={() =>
                    confirm === "delete" && selected
                      ? remove(selected)
                      : close()
                  }
                >
                  {confirm === "delete" ? "Delete" : "Discard"}
                </Button>
              </AlertDialog.Action>
            </AlertDialog.ActionButtons>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  )
}
