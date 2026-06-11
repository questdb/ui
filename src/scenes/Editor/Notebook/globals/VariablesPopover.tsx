import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import styled from "styled-components"
import {
  AtIcon,
  ClipboardTextIcon,
  DotsSixVerticalIcon,
  PlusIcon,
  XIcon,
} from "@phosphor-icons/react"
import { CheckboxCircle } from "@styled-icons/remix-fill"
import { Button, Popover } from "../../../../components"
import { CopyButton } from "../../../../components/CopyButton"
import { Input } from "../../../../components/Input"
import { toast } from "../../../../components/Toast"
import { QuestContext } from "../../../../providers/QuestProvider"
import { color } from "../../../../utils"
import {
  canReadFromClipboard,
  readFromClipboard,
} from "../../../../utils/copyToClipboard"
import type { NotebookVariable } from "../../../../store/notebook"
import { signalUserEdit } from "../../../../utils/notebookAIBridge"
import { useNotebookActions, useNotebookState } from "../NotebookProvider"
import {
  isValidVariableName,
  normalizeVariables,
  parseDeclareBlock,
  renderDeclareBlock,
  renderDeclareValidationQuery,
  stripLeadingAt,
  validateVariableShape,
} from "../declareUtils"

const Trigger = styled(Button).attrs({ skin: "secondary" })`
  svg {
    transform: translateY(1px);
  }
`

const Body = styled.div`
  display: flex;
  flex-direction: column;
  width: min(56rem, calc(100vw - 4rem));
  background: ${color("backgroundDarker")};
`

const Subtitle = styled.div`
  font-size: 1.4rem;
  padding: 1.2rem 1.6rem 0;
  color: ${color("pinkLighter")};
  font-family: ${({ theme }) => theme.fontMonospace};
`

const SubtitleStrong = styled.span`
  font-family: ${({ theme }) => theme.fontMonospace};
  color: ${color("foreground")};
`

const RowList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1rem 1.6rem;
  max-height: 40vh;
  overflow-y: auto;
`

const Row = styled.div<{ $dragging?: boolean; $dragInProgress?: boolean }>`
  display: grid;
  grid-template-columns: auto auto 14rem auto 1fr auto;
  gap: 0.6rem;
  align-items: center;
  padding: 0.2rem 0.4rem;
  margin: 0 -0.4rem;
  border-radius: 0.4rem;
  border-left: 2px solid transparent;
  transition:
    background-color 0.12s ease,
    opacity 0.12s ease,
    border-color 0.12s ease,
    box-shadow 0.12s ease;

  ${({ $dragging, theme }) =>
    $dragging &&
    `
    opacity: 0.55;
    background-color: ${theme.color.backgroundDarker};
    border-left-color: ${theme.color.pink};
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  `}

  /* Reveal the handle on hover */
  &:hover [data-hook="drag-handle"] {
    opacity: 1;
  }

  /* While any drag is in flight, keep all handles fully visible so the user
     can see exactly where they're about to drop. */
  ${({ $dragInProgress }) =>
    $dragInProgress && `& [data-hook="drag-handle"] { opacity: 1; }`}
`

const DragHandle = styled.button.attrs({ "data-hook": "drag-handle" })`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.8rem;
  height: 2.4rem;
  padding: 0;
  border: 0;
  border-radius: 0.4rem;
  background: transparent;
  color: ${color("gray2")};
  cursor: grab;
  opacity: 0.35;
  transition:
    opacity 0.15s ease,
    color 0.15s ease,
    background-color 0.15s ease,
    transform 0.1s ease;

  &:hover {
    color: ${color("foreground")};
    background: ${color("selection")};
    transform: scale(1.08);
  }

  &:active {
    cursor: grabbing;
    transform: scale(0.96);
    background: ${color("backgroundDarker")};
  }

  &:focus-visible {
    outline: 2px solid ${color("pink")};
    outline-offset: 1px;
    opacity: 1;
  }
`

const AtLabel = styled.span`
  font-family: ${({ theme }) => theme.fontMonospace};
  color: ${color("purple")};
  font-size: 1.4rem;
  user-select: none;
`

const AssignSymbol = styled.span`
  font-family: ${({ theme }) => theme.fontMonospace};
  color: ${color("pinkLighter")};
  font-size: 1.4rem;
  user-select: none;
`

const NameInput = styled(Input)`
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.3rem;
`

const ValueInput = styled(Input)`
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.3rem;
`

const DeleteButton = styled(Button).attrs({ skin: "transparent" })`
  padding: 0.4rem;
  color: ${color("gray2")};
`

const AddRow = styled.div`
  padding: 0 1.6rem 1rem;
`

const Footer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.6rem 1.2rem;
  border-top: 1px solid ${color("background")};
  gap: 0.8rem;
`

const FooterLeft = styled.div`
  display: flex;
  gap: 0.8rem;
  align-items: center;
`

const FooterRight = styled.div`
  display: flex;
  gap: 0.8rem;
  align-items: center;
`

const AddButton = styled(Button).attrs({
  skin: "transparent",
  prefixIcon: <PlusIcon size={14} />,
})``

const ImportButton = styled(Button)`
  position: relative;
`

const ImportedTick = styled(CheckboxCircle)`
  position: absolute;
  top: 0;
  right: 0;
  transform: translate(50%, -50%);
  color: ${({ theme }) => theme.color.green};
`

const InlineHint = styled.div`
  font-size: 1.2rem;
  color: ${color("red")};
  padding-left: 2.4rem;
  grid-column: 3 / span 4;
`

type Draft = {
  key: string
  name: string
  value: string
  // One-shot "@-was-stripped" hint per row.
  showStripHint?: boolean
}

let DRAFT_KEY = 0
const newKey = () => `v${++DRAFT_KEY}`

const draftsFromVariables = (vars: unknown): Draft[] => {
  const normalized = normalizeVariables(vars)
  if (normalized.length === 0) return [{ key: newKey(), name: "", value: "" }]
  return normalized.map(({ name, value }) => ({ key: newKey(), name, value }))
}

const isDuplicate = (drafts: Draft[], idx: number): boolean => {
  const name = drafts[idx].name
  if (!name) return false
  // Flag only the LAST occurrence of a duplicated name. Earlier rows stay
  // clean; user fixes/removes the most recent conflict.
  const hasPrior = drafts.slice(0, idx).some((d) => d.name === name)
  if (!hasPrior) return false
  const hasLater = drafts.slice(idx + 1).some((d) => d.name === name)
  return !hasLater
}

const hasInvalidShape = (draft: Draft): boolean => {
  if (draft.value === "") return false
  return (
    validateVariableShape({ name: draft.name, value: draft.value }) !== null
  )
}

const isRowInvalid = (drafts: Draft[], idx: number): boolean => {
  const d = drafts[idx]
  if (d.name === "") return false // empty rows are just pending, not invalid
  if (!isValidVariableName(d.name)) return true
  if (isDuplicate(drafts, idx)) return true
  return hasInvalidShape(d)
}

const buildPersistList = (drafts: Draft[]): NotebookVariable[] => {
  const seen = new Set<string>()
  const out: NotebookVariable[] = []
  for (const d of drafts) {
    if (!d.name) continue
    if (!isValidVariableName(d.name)) continue
    if (seen.has(d.name)) continue
    seen.add(d.name)
    out.push({ name: d.name, value: d.value })
  }
  return out
}

const variablesEqual = (
  a: NotebookVariable[] | undefined,
  b: NotebookVariable[],
): boolean => {
  const aa = a ?? []
  if (aa.length !== b.length) return false
  for (let i = 0; i < b.length; i += 1) {
    if (aa[i].name !== b[i].name || aa[i].value !== b[i].value) return false
  }
  return true
}

export const VariablesPopover: React.FC = () => {
  const { quest } = useContext(QuestContext)
  const { settings } = useNotebookState()
  const { updateSettings } = useNotebookActions()
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [validating, setValidating] = useState(false)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const [importedFlash, setImportedFlash] = useState(false)
  const importedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draggingKeyRef = useRef<string | null>(null)
  const cancelledRef = useRef(false)

  useEffect(
    () => () => {
      if (importedTimeoutRef.current) clearTimeout(importedTimeoutRef.current)
    },
    [],
  )

  useEffect(() => {
    if (open) setDrafts(draftsFromVariables(settings.variables))
  }, [open])

  const handleAdd = useCallback(() => {
    const key = newKey()
    setDrafts((prev) => [...prev, { key, name: "", value: "" }])
  }, [])

  const handleDelete = useCallback((idx: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== idx))
    setServerErrors({})
  }, [])

  const moveDraftToIndex = useCallback((key: string, toIndex: number) => {
    setDrafts((prev) => {
      const idx = prev.findIndex((d) => d.key === key)
      if (idx < 0) return prev
      const clamped = Math.max(0, Math.min(toIndex, prev.length))
      const adjusted = idx < clamped ? clamped - 1 : clamped
      if (idx === adjusted) return prev
      const next = prev.slice()
      const [moved] = next.splice(idx, 1)
      next.splice(adjusted, 0, moved)
      return next
    })
    setServerErrors({})
  }, [])

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLButtonElement>, key: string) => {
      draggingKeyRef.current = key
      setDraggingKey(key)
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData("text/plain", key)
    },
    [],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, idx: number) => {
      const key = draggingKeyRef.current
      if (!key) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
      const rect = e.currentTarget.getBoundingClientRect()
      const toIndex = e.clientY > rect.top + rect.height / 2 ? idx + 1 : idx
      moveDraftToIndex(key, toIndex)
    },
    [moveDraftToIndex],
  )

  const handleDragEnd = useCallback(() => {
    draggingKeyRef.current = null
    setDraggingKey(null)
  }, [])

  const handleNameChange = useCallback((idx: number, raw: string) => {
    setDrafts((prev) => {
      const next = prev.slice()
      const stripped = stripLeadingAt(raw)
      const showStripHint = raw !== stripped
      next[idx] = {
        ...next[idx],
        name: stripped,
        showStripHint: showStripHint || next[idx].showStripHint,
      }
      return next
    })
    setServerErrors({})
  }, [])

  const handleValueChange = useCallback((idx: number, raw: string) => {
    setDrafts((prev) => {
      const next = prev.slice()
      next[idx] = { ...next[idx], value: raw }
      return next
    })
    setServerErrors({})
  }, [])

  const handleEnterOnValue = (idx: number) => {
    const isLast = idx === drafts.length - 1
    if (isLast) {
      handleAdd()
    } else {
      setDrafts((p) => p.slice())
    }
  }

  const validateOnServer = async (
    list: NotebookVariable[],
  ): Promise<boolean> => {
    const nextErrors: Record<string, string> = {}
    for (let i = 0; i < list.length; i += 1) {
      const shapeError = validateVariableShape(list[i])
      if (shapeError) {
        const draft = drafts.find((d) => d.name === list[i].name)
        if (draft) {
          nextErrors[draft.key] =
            "Value must be a single expression — wrap in parentheses if you need commas."
        }
        setServerErrors(nextErrors)
        return false
      }
      const prefix = list.slice(0, i + 1)
      const result = await quest.validateQuery(
        renderDeclareValidationQuery(prefix),
      )
      if ("error" in result) {
        const draft = drafts.find((d) => d.name === list[i].name)
        if (draft) nextErrors[draft.key] = result.error
        setServerErrors(nextErrors)
        return false
      }
    }
    setServerErrors({})
    return true
  }

  const handleApply = async () => {
    const list = buildPersistList(drafts)
    cancelledRef.current = false
    setValidating(true)
    try {
      if (!(await validateOnServer(list))) return
      if (cancelledRef.current) return
      if (!variablesEqual(normalizeVariables(settings.variables), list)) {
        signalUserEdit()
        updateSettings({ variables: list })
      }
      setOpen(false)
    } finally {
      setValidating(false)
    }
  }

  const handleCancel = () => {
    cancelledRef.current = true
    setOpen(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) cancelledRef.current = true
    setOpen(next)
  }

  const handleImport = async () => {
    try {
      const text = await readFromClipboard()
      const parsed = parseDeclareBlock(text)
      if (parsed.length === 0) {
        toast.error("No DECLARE block found in clipboard")
        return
      }
      setDrafts((prev) => {
        const next = prev.filter((d) => d.name !== "" || d.value !== "")
        for (const { name, value } of parsed) {
          const idx = next.findIndex((d) => d.name === name)
          if (idx >= 0) {
            next[idx] = { ...next[idx], value }
          } else {
            next.push({ key: newKey(), name, value })
          }
        }
        return next.length > 0 ? next : [{ key: newKey(), name: "", value: "" }]
      })
      setImportedFlash(true)
      if (importedTimeoutRef.current) clearTimeout(importedTimeoutRef.current)
      importedTimeoutRef.current = setTimeout(
        () => setImportedFlash(false),
        2000,
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read clipboard")
    }
  }

  const declareBlock = useMemo(
    () => renderDeclareBlock(buildPersistList(drafts)),
    [drafts],
  )

  const clipboardReadable = useMemo(() => canReadFromClipboard(), [])

  const count = useMemo(
    () => normalizeVariables(settings.variables).length,
    [settings.variables],
  )

  const { canApply, hasInvalid, hasValid } = useMemo(() => {
    let invalid = false
    let valid = false
    for (let i = 0; i < drafts.length; i++) {
      if (isRowInvalid(drafts, i) || Boolean(serverErrors[drafts[i].key])) {
        invalid = true
      } else if (drafts[i].name !== "") valid = true
    }
    const list = buildPersistList(drafts)
    const dirty = !variablesEqual(normalizeVariables(settings.variables), list)
    return {
      hasInvalid: invalid,
      hasValid: valid,
      canApply: !invalid && dirty,
    }
  }, [drafts, serverErrors, settings.variables])

  return (
    <Popover
      open={open}
      onOpenChange={handleOpenChange}
      align="end"
      trigger={
        <Trigger prefixIcon={<AtIcon size={14} />}>
          Variables
          {count > 0 ? ` (${count})` : ""}
        </Trigger>
      }
    >
      <Body>
        <Subtitle>DECLARE</Subtitle>
        <RowList>
          {drafts.map((d, idx) => {
            const clientInvalid = isRowInvalid(drafts, idx)
            const serverError = serverErrors[d.key]
            const invalid = clientInvalid || Boolean(serverError)
            return (
              <React.Fragment key={d.key}>
                <Row
                  $dragging={draggingKey === d.key}
                  $dragInProgress={draggingKey !== null}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={handleDragEnd}
                >
                  <DragHandle
                    type="button"
                    draggable
                    title="Drag to reorder"
                    aria-label={`Drag ${d.name || "variable"} to reorder`}
                    onDragStart={(e) => handleDragStart(e, d.key)}
                    onDragEnd={handleDragEnd}
                  >
                    <DotsSixVerticalIcon size={15} />
                  </DragHandle>
                  <AtLabel>@</AtLabel>
                  <NameInput
                    value={d.name}
                    placeholder="name"
                    variant={invalid ? "error" : undefined}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => handleNameChange(idx, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        ;(
                          e.currentTarget.nextElementSibling
                            ?.nextElementSibling as HTMLInputElement | null
                        )?.focus()
                      }
                    }}
                  />
                  <AssignSymbol>:=</AssignSymbol>
                  <ValueInput
                    value={d.value}
                    placeholder="value (e.g. 'string', 95, 1h, now())"
                    variant={invalid ? "error" : undefined}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => handleValueChange(idx, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleEnterOnValue(idx)
                      }
                    }}
                  />
                  {drafts.length > 1 ? (
                    <DeleteButton
                      title="Delete variable"
                      aria-label="Delete variable"
                      onClick={() => handleDelete(idx)}
                    >
                      <XIcon size={13} />
                    </DeleteButton>
                  ) : (
                    <span />
                  )}
                </Row>
                {d.showStripHint && (
                  <InlineHint>
                    <SubtitleStrong>@</SubtitleStrong> is added automatically —
                    just type the name.
                  </InlineHint>
                )}
                {(invalid || serverError) && d.name !== "" && (
                  <InlineHint>
                    {serverError
                      ? serverError
                      : isDuplicate(drafts, idx)
                        ? "Name already used"
                        : !isValidVariableName(d.name)
                          ? "Names start with a letter, underscore, or Unicode character; then letters, digits, underscores, or Unicode characters."
                          : hasInvalidShape(d)
                            ? "Value must be a single expression — wrap in parentheses if you need commas."
                            : "Value failed QuestDB validation."}
                  </InlineHint>
                )}
              </React.Fragment>
            )
          })}
        </RowList>
        <AddRow>
          <AddButton onClick={handleAdd}>Add variable</AddButton>
        </AddRow>
        <Footer>
          <FooterLeft>
            <ImportButton
              skin="secondary"
              prefixIcon={<ClipboardTextIcon size={16} />}
              onClick={handleImport}
              title="Import DECLARE block from clipboard"
              disabled={!clipboardReadable}
            >
              Import from clipboard
              {importedFlash && <ImportedTick size="14px" />}
            </ImportButton>
            <CopyButton
              text={declareBlock}
              disabled={!hasValid}
              disabledTooltip={
                !hasValid ? "Add at least one variable first" : undefined
              }
              title="Copy DECLARE block to clipboard"
            />
          </FooterLeft>
          <FooterRight>
            <Button skin="secondary" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              skin="primary"
              onClick={handleApply}
              disabled={!canApply || validating}
              disabledTooltip={
                hasInvalid
                  ? "Fix invalid rows before applying"
                  : validating
                    ? "Validating variables"
                    : !canApply
                      ? "No changes to apply"
                      : undefined
              }
            >
              {validating ? "Validating..." : "Apply"}
            </Button>
          </FooterRight>
        </Footer>
      </Body>
    </Popover>
  )
}
