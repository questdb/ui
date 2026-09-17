import type { VariableStep as DraftStep } from "../prepareVariables"
import React, { useMemo, useRef, useState } from "react"
import styled from "styled-components"
import {
  AtIcon,
  ClipboardTextIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import {
  Button,
  Dialog,
  ForwardRef,
  LoadingSpinner,
  Overlay,
  Text,
  Tooltip,
} from "../../../../../components"
import { CopyButton } from "../../../../../components/CopyButton"
import { toast } from "../../../../../components/Toast"
import { trackEvent } from "../../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../../modules/ConsoleEventTracker/events"
import type { NotebookVariable } from "../../../../../store/notebook"
import { GlobalsChangedError } from "../../../../../store/notebookGlobals"
import { readFromClipboard } from "../../../../../utils/copyToClipboard"
import { signalUserEdit } from "../../../../../utils/notebooks/notebookAIBridge"
import { parseDeclareBlock, renderDeclareBlock } from "../../declareUtils"
import {
  useNotebookActions,
  useNotebookBufferId,
  useNotebookVariablesState,
} from "../../NotebookProvider"
import { listOptionsState } from "../declareEntries"
import { useGlobalVariablesState } from "../globals/GlobalVariablesProvider"
import { globalNameConflict } from "../globals/globalNameConflict"
import { effectiveVariables, type VariableScope } from "../scope"
import { sameTimeRange, TIME_VARIABLE_NAMES } from "../timeRange"
import { variablesEqual } from "../variableChanges"
import {
  VARIABLES_UPDATED_MESSAGE,
  VariablesUpdatedError,
  type VariableApplyBaseline,
} from "../variableApplyConflict"
import {
  PROBLEM_MESSAGES,
  draftProblem,
  isBlockingDraftProblem,
  draftsFromVariables,
  draftsInScope,
  createVariable,
  newDraftKey,
  orderDraftsByScope,
  variablesFromDrafts,
  type DraftProblem,
  type VariableDraft,
} from "../variableDrafts"
import {
  draftDeclareEntries,
  type ScopedListOptions,
} from "./draftDeclareEntries"
import { FooterMessage } from "./FooterMessage"
import { VariableForm } from "./VariableForm"
import { VariableList } from "./VariableList"

const ErrorIcon = styled(WarningCircleIcon)`
  color: ${({ theme }) => theme.color.statusDanger};
`

const Trigger = styled(Button).attrs({ variant: "secondary" })``

const Content = styled(Dialog.Content).attrs({ maxwidth: "104rem" })`
  display: flex;
  flex-direction: column;
  padding-bottom: 0;
`

const Panes = styled.div`
  display: grid;
  grid-template-columns: 32rem minmax(0, 1fr);
  height: min(64vh, 60rem);
  min-height: 0;
`

const ListPane = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid ${({ theme }) => theme.color.borderSubtle};
  background: ${({ theme }) => theme.color.surfaceBase};
`

const FormPane = styled.div`
  min-height: 0;
  overflow-y: auto;
  padding: 2rem;
`

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  height: 100%;
  text-align: center;
`

const Footer = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 1.6rem;
  padding: 1.2rem 2rem;
  border-top: 1px solid ${({ theme }) => theme.color.borderSubtle};
`

const FooterStatus = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.8rem;
  min-width: 0;
`

const FooterGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
`

export const VariablesDialog: React.FC = () => {
  const { settings, listOptions, variableErrors, variablesPending } =
    useNotebookVariablesState()
  const { applyVariables } = useNotebookActions()
  const bufferId = useNotebookBufferId()
  const {
    variables: currentGlobals,
    listOptions: globalListOptions,
    errors: globalErrors,
    revision: globalRevision,
  } = useGlobalVariablesState()
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState<VariableDraft[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState<string | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [baseline, setBaseline] = useState<VariableApplyBaseline>({
    localVariables: [],
    timeRange: undefined,
    globalRevision: 0,
  })
  const [baselineGlobals, setBaselineGlobals] = useState<NotebookVariable[]>([])
  const [conflictDetected, setConflictDetected] = useState(false)
  const committingRef = useRef(false)
  const prefetchAbortRef = useRef<AbortController | null>(null)
  const draftEditSignaledRef = useRef(false)

  const currentLocal = settings.variables ?? []
  const hasVariableErrors =
    Object.keys(globalErrors).length > 0 ||
    Object.keys(variableErrors).length > 0

  const problems = useMemo(
    () =>
      Object.fromEntries(
        drafts.map((draft, index) => [
          draft.key,
          submitted ? draftProblem(drafts, index) : null,
        ]),
      ) as Record<string, DraftProblem | null>,
    [drafts, submitted],
  )

  const localVariables = useMemo(
    () => variablesFromDrafts(draftsInScope(drafts, "notebook")),
    [drafts],
  )
  const globalVariables = useMemo(
    () => variablesFromDrafts(draftsInScope(drafts, "global")),
    [drafts],
  )
  const builtInCount = settings.timeRange ? TIME_VARIABLE_NAMES.length : 0
  const variableCount =
    effectiveVariables(currentGlobals, currentLocal).length + builtInCount
  const firstProblem = drafts.find((draft) => problems[draft.key] !== null)
  const variablesUpdated =
    conflictDetected ||
    (open &&
      (globalRevision !== baseline.globalRevision ||
        !variablesEqual(currentGlobals, baselineGlobals) ||
        !variablesEqual(currentLocal, baseline.localVariables) ||
        !sameTimeRange(settings.timeRange, baseline.timeRange)))
  const footerMessage =
    (variablesUpdated ? VARIABLES_UPDATED_MESSAGE : applyError) ??
    (firstProblem
      ? `@${firstProblem.variable.name || "unnamed"}: ${
          PROBLEM_MESSAGES[problems[firstProblem.key] as DraftProblem]
        }`
      : null)
  const localDirty = !variablesEqual(baseline.localVariables, localVariables)
  const globalDirty = !variablesEqual(baselineGlobals, globalVariables)
  const canApply = (localDirty || globalDirty) && !variablesUpdated
  const busy = progress !== null
  const selectedIndex = drafts.findIndex((draft) => draft.key === selectedKey)
  const selectedDraft = selectedIndex >= 0 ? drafts[selectedIndex] : null
  const scopedListOptions: ScopedListOptions = {
    global: globalListOptions,
    notebook: listOptions,
  }

  const entriesFor = (
    list: VariableDraft[],
    options: ScopedListOptions = scopedListOptions,
  ) => draftDeclareEntries(list, settings.timeRange, options)

  const declareBlock = renderDeclareBlock(entriesFor(drafts))

  const openWith = () => {
    const next = [
      ...draftsFromVariables(currentGlobals, "global"),
      ...draftsFromVariables(currentLocal, "notebook"),
    ]
    setDrafts(next)
    setBaseline({
      localVariables: currentLocal,
      timeRange: settings.timeRange,
      globalRevision,
    })
    setBaselineGlobals(currentGlobals)
    setConflictDetected(false)
    draftEditSignaledRef.current = false
    setSelectedKey(next[0]?.key ?? null)
    setServerErrors(
      Object.fromEntries(
        next.flatMap((draft) => {
          const error = (
            draft.scope === "global" ? globalErrors : variableErrors
          )[draft.variable.name]
          return error ? [[draft.key, error]] : []
        }),
      ),
    )
    setApplyError(null)
    setSubmitted(false)
  }

  const signalDraftEdit = () => {
    if (draftEditSignaledRef.current) return
    draftEditSignaledRef.current = true
    signalUserEdit(bufferId)
  }

  const handleOpenChange = (next: boolean) => {
    if (committingRef.current) return
    if (next) {
      void trackEvent(ConsoleEvent.NOTEBOOK_VARIABLES_OPEN)
      openWith()
    } else {
      prefetchAbortRef.current?.abort()
    }
    setOpen(next)
  }

  const updateDraft = (
    key: string,
    update: (draft: VariableDraft) => VariableDraft,
  ) => {
    signalDraftEdit()
    setDrafts((prev) =>
      orderDraftsByScope(prev.map((d) => (d.key === key ? update(d) : d))),
    )
    setServerErrors({})
    setApplyError(null)
  }

  const handleAdd = () => {
    signalDraftEdit()
    setSubmitted(false)
    const draft: VariableDraft = {
      key: newDraftKey(),
      variable: createVariable("expression"),
      scope: "notebook",
    }
    setDrafts((prev) => [...prev, draft])
    setSelectedKey(draft.key)
  }

  const handleDelete = (key: string) => {
    signalDraftEdit()
    const next = drafts.filter((d) => d.key !== key)
    setDrafts(next)
    if (selectedKey === key) setSelectedKey(next[0]?.key ?? null)
    setServerErrors({})
  }

  const handleMove = (key: string, scope: VariableScope, toIndex: number) => {
    signalDraftEdit()
    setDrafts((prev) => {
      const moving = prev.find((d) => d.key === key)
      if (!moving) return prev
      const section = draftsInScope(prev, scope)
      const fromIndex = section.findIndex((d) => d.key === key)
      const clamped = Math.max(0, Math.min(toIndex, section.length))
      const adjusted =
        fromIndex >= 0 && fromIndex < clamped ? clamped - 1 : clamped
      if (fromIndex === adjusted) return prev
      const others = section.filter((d) => d.key !== key)
      const nextSection = [
        ...others.slice(0, adjusted),
        { ...moving, scope },
        ...others.slice(adjusted),
      ]
      const otherScope: VariableScope =
        scope === "global" ? "notebook" : "global"
      const otherSection = draftsInScope(prev, otherScope).filter(
        (d) => d.key !== key,
      )
      return scope === "global"
        ? [...nextSection, ...otherSection]
        : [...otherSection, ...nextSection]
    })
  }

  const failFor = (name: string, error: string) => {
    const draft = drafts.find((d) => d.variable.name === name)
    if (draft) {
      setServerErrors({ [draft.key]: error })
      setSelectedKey(draft.key)
    }
    setApplyError(`@${name}: ${error}`)
  }

  const stepMessage = ({ kind, name }: DraftStep) =>
    kind === "committing"
      ? "Saving variables..."
      : kind === "validating"
        ? `Validating @${name}...`
        : `Loading values for @${name}...`

  const handleApply = async () => {
    if (variablesUpdated) return
    committingRef.current = false
    setSubmitted(true)
    const failingIndex = drafts.findIndex((_, index) =>
      isBlockingDraftProblem(draftProblem(drafts, index)),
    )
    if (failingIndex >= 0) {
      setSelectedKey(drafts[failingIndex].key)
      return
    }
    const controller = new AbortController()
    prefetchAbortRef.current = controller
    setProgress("Validating variables...")
    try {
      if (globalDirty) {
        const conflict = await globalNameConflict(globalVariables, bufferId)
        if (controller.signal.aborted) return
        if (conflict) {
          failFor(conflict, PROBLEM_MESSAGES.duplicateName)
          return
        }
      }
      await applyVariables(
        localVariables,
        globalVariables,
        baseline,
        controller.signal,
        (step) => {
          committingRef.current = step.kind === "committing"
          setProgress(stepMessage(step))
        },
      )
      if (controller.signal.aborted) return
      setServerErrors({})
      void trackEvent(ConsoleEvent.NOTEBOOK_VARIABLES_APPLY, {
        variableCount: localVariables.length + globalVariables.length,
        globalCount: globalVariables.length,
        kinds: [...globalVariables, ...localVariables]
          .map((v) => v.kind)
          .join(","),
      })
      setOpen(false)
    } catch (error) {
      if (
        error instanceof GlobalsChangedError ||
        error instanceof VariablesUpdatedError
      ) {
        setConflictDetected(true)
        setApplyError(VARIABLES_UPDATED_MESSAGE)
      } else if (!controller.signal.aborted) {
        setApplyError(
          error instanceof Error ? error.message : "Could not update variables",
        )
      }
    } finally {
      committingRef.current = false
      setProgress(null)
    }
  }

  const handleImport = async () => {
    try {
      const parsed = parseDeclareBlock(await readFromClipboard())
      if (parsed.length === 0) {
        toast.error("No DECLARE block found in clipboard")
        return
      }
      void trackEvent(ConsoleEvent.NOTEBOOK_VARIABLES_IMPORT, {
        importedCount: parsed.length,
      })
      signalDraftEdit()
      setDrafts((prev) => {
        const next = prev.slice()
        for (const { name, value } of parsed) {
          const index = next.findIndex(
            (d) => d.scope === "notebook" && d.variable.name === name,
          )
          const variable: NotebookVariable = { name, kind: "expression", value }
          if (index >= 0) {
            next[index] = { ...next[index], variable }
          } else {
            next.push({ key: newDraftKey(), variable, scope: "notebook" })
          }
        }
        return next
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read clipboard")
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Tooltip
        content={hasVariableErrors ? "Some variables cannot be applied" : null}
      >
        <Dialog.Trigger asChild>
          <Trigger
            prefixIcon={
              hasVariableErrors ? (
                <ErrorIcon
                  size={16}
                  aria-label="Variable errors"
                  data-hook="variable-errors"
                />
              ) : (
                <AtIcon size={16} />
              )
            }
            aria-busy={variablesPending}
            title={
              variablesPending && !hasVariableErrors
                ? "Checking variables..."
                : undefined
            }
            data-hook="notebook-variables"
          >
            Variables{variableCount > 0 ? ` (${variableCount})` : ""}
            {variablesPending && <LoadingSpinner />}
          </Trigger>
        </Dialog.Trigger>
      </Tooltip>
      <Dialog.Portal>
        <ForwardRef>
          <Overlay primitive={Dialog.Overlay} />
        </ForwardRef>
        <Content
          data-hook="variables-dialog"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title>Variables</Dialog.Title>
          <Panes>
            <ListPane>
              <VariableList
                drafts={drafts}
                selectedKey={selectedKey}
                problems={problems}
                errors={serverErrors}
                timeRange={settings.timeRange}
                onSelect={setSelectedKey}
                onAdd={handleAdd}
                onDelete={handleDelete}
                onMove={handleMove}
              />
            </ListPane>
            <FormPane>
              {selectedDraft ? (
                <VariableForm
                  key={selectedDraft.key}
                  draft={selectedDraft}
                  problem={problems[selectedDraft.key]}
                  serverError={serverErrors[selectedDraft.key]}
                  entriesAbove={entriesFor(drafts.slice(0, selectedIndex))}
                  declaredAbove={drafts
                    .slice(0, selectedIndex)
                    .map((d) => d.variable.name)}
                  hasTimeRange={settings.timeRange !== undefined}
                  savedOptions={listOptionsState(
                    selectedDraft.scope === "global"
                      ? globalListOptions
                      : listOptions,
                    selectedDraft.variable.name,
                  )}
                  onChange={(variable) =>
                    updateDraft(selectedDraft.key, (d) => ({ ...d, variable }))
                  }
                  onScopeChange={(scope) =>
                    updateDraft(selectedDraft.key, (d) => ({ ...d, scope }))
                  }
                />
              ) : (
                <EmptyState>
                  <Text color="contentPrimary" size="md">
                    No variables yet
                  </Text>
                  <Text color="contentSecondary" size="sm">
                    Add one and reference it as @name in any cell.
                  </Text>
                  <Button variant="secondary" onClick={handleAdd}>
                    Add variable
                  </Button>
                </EmptyState>
              )}
            </FormPane>
          </Panes>
          <Footer>
            <FooterGroup>
              <Button
                variant="secondary"
                prefixIcon={<ClipboardTextIcon size={16} />}
                onClick={handleImport}
                title="Import a DECLARE block from the clipboard"
              >
                Import from clipboard
              </Button>
              <CopyButton
                text={declareBlock}
                disabled={declareBlock === ""}
                disabledTooltip="Add a variable or a time range first"
                title="Copy the DECLARE block cells receive"
              />
            </FooterGroup>
            <FooterStatus>
              {busy && <LoadingSpinner size="14px" />}
              <FooterMessage
                message={progress ?? footerMessage}
                color={busy ? "contentSecondary" : "statusDanger"}
              />
            </FooterStatus>
            <FooterGroup>
              <Button
                variant="secondary"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleApply}
                disabled={!canApply || busy}
                disabledTooltip={
                  variablesUpdated
                    ? VARIABLES_UPDATED_MESSAGE
                    : busy
                      ? "Applying variables"
                      : "No changes to apply"
                }
                data-hook="variables-apply"
              >
                Apply
              </Button>
            </FooterGroup>
          </Footer>
        </Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
