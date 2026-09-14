import React, { useContext, useMemo, useRef, useState } from "react"
import styled from "styled-components"
import { AtIcon, ClipboardTextIcon } from "@phosphor-icons/react"
import {
  Button,
  Dialog,
  ForwardRef,
  LoadingSpinner,
  Overlay,
  Text,
} from "../../../../../components"
import { CopyButton } from "../../../../../components/CopyButton"
import { toast } from "../../../../../components/Toast"
import { QuestContext } from "../../../../../providers/QuestProvider"
import { trackEvent } from "../../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../../modules/ConsoleEventTracker/events"
import type {
  DeclareEntry,
  NotebookVariable,
} from "../../../../../store/notebook"
import { readFromClipboard } from "../../../../../utils/copyToClipboard"
import {
  parseDeclareBlock,
  renderDeclareBlock,
  renderDeclareValidationQuery,
} from "../../declareUtils"
import {
  useNotebookActions,
  useNotebookBufferId,
  useNotebookState,
} from "../../NotebookProvider"
import { classifyOptionQuery } from "../options/classifyOptionQuery"
import {
  useGlobalVariablesActions,
  useGlobalVariablesState,
} from "../globals/GlobalVariablesProvider"
import { queryPrecheck } from "../queryChecks"
import { effectiveVariables, type VariableScope } from "../scope"
import { TIME_VARIABLE_NAMES } from "../timeRange"
import { isQueryList } from "../options/fetchVariableOptions"
import {
  changedVariableNames,
  redefinedVariableNames,
  variablesEqual,
} from "../variableChanges"
import {
  PROBLEM_MESSAGES,
  draftProblem,
  draftsFromVariables,
  draftsInScope,
  createVariable,
  newDraftKey,
  orderDraftsByScope,
  redefinedAtOrAbove,
  variablesFromDrafts,
  type DraftProblem,
  type VariableDraft,
} from "../variableDrafts"
import {
  draftDeclareEntries,
  prepareDrafts,
  type DraftStep,
  type ScopedListOptions,
} from "./prepareDrafts"
import { VariableForm } from "./VariableForm"
import { VariableList } from "./VariableList"

const Trigger = styled(Button).attrs({ variant: "secondary" })`
  svg {
    transform: translateY(1px);
  }
`

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

const FooterMessage = styled(Text).attrs({ size: "sm" })`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const FooterGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
`

export const VariablesDialog: React.FC = () => {
  const { quest } = useContext(QuestContext)
  const { settings, listOptions } = useNotebookState()
  const { applyVariables } = useNotebookActions()
  const bufferId = useNotebookBufferId()
  const { variables: currentGlobals, listOptions: globalListOptions } =
    useGlobalVariablesState()
  const globals = useGlobalVariablesActions()
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState<VariableDraft[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState<string | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const prefetchAbortRef = useRef<AbortController | null>(null)

  const currentLocal = settings.variables ?? []

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
  const footerMessage =
    applyError ??
    (firstProblem
      ? `@${firstProblem.variable.name || "unnamed"}: ${
          PROBLEM_MESSAGES[problems[firstProblem.key] as DraftProblem]
        }`
      : null)
  const localDirty = !variablesEqual(currentLocal, localVariables)
  const globalDirty = !variablesEqual(currentGlobals, globalVariables)
  const changed = [
    ...changedVariableNames(currentGlobals, globalVariables),
    ...changedVariableNames(currentLocal, localVariables),
  ]
  const redefined = [
    ...redefinedVariableNames(currentGlobals, globalVariables),
    ...redefinedVariableNames(currentLocal, localVariables),
  ]
  const canApply = localDirty || globalDirty
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
    setSelectedKey(next[0]?.key ?? null)
    setServerErrors({})
    setApplyError(null)
    setSubmitted(false)
  }

  const handleOpenChange = (next: boolean) => {
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
    setDrafts((prev) =>
      orderDraftsByScope(prev.map((d) => (d.key === key ? update(d) : d))),
    )
    setServerErrors({})
    setApplyError(null)
  }

  const handleAdd = () => {
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
    const next = drafts.filter((d) => d.key !== key)
    setDrafts(next)
    if (selectedKey === key) setSelectedKey(next[0]?.key ?? null)
    setServerErrors({})
  }

  const handleMove = (key: string, scope: VariableScope, toIndex: number) => {
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

  const queryProblem = async (
    index: number,
    entriesAbove: DeclareEntry[],
  ): Promise<string | null> => {
    const { variable } = drafts[index]
    if (!isQueryList(variable)) return null
    const { query } = variable.source
    const precheck = queryPrecheck(query, {
      declaredAbove: drafts.slice(0, index).map((d) => d.variable.name),
      hasTimeRange: settings.timeRange !== undefined,
    })
    if (precheck) return precheck
    if (!redefinedAtOrAbove(drafts, index, redefined)) return null
    const verdict = await classifyOptionQuery(query, entriesAbove, (sql) =>
      quest.validateQuery(sql),
    )
    return verdict.ok ? null : verdict.error
  }

  const validateDraft = async (
    index: number,
    known: ScopedListOptions,
  ): Promise<string | null> => {
    const problem = await queryProblem(
      index,
      entriesFor(drafts.slice(0, index), known),
    )
    if (problem) return problem
    if (!redefinedAtOrAbove(drafts, index, redefined)) return null
    const result = await quest.validateQuery(
      renderDeclareValidationQuery(
        entriesFor(drafts.slice(0, index + 1), known),
      ),
    )
    return "error" in result ? result.error : null
  }

  const stepMessage = ({ kind, name }: DraftStep) =>
    kind === "validating"
      ? `Validating @${name}...`
      : `Loading values for @${name}...`

  const handleApply = async () => {
    setSubmitted(true)
    const failingIndex = drafts.findIndex(
      (_, index) => draftProblem(drafts, index) !== null,
    )
    if (failingIndex >= 0) {
      setSelectedKey(drafts[failingIndex].key)
      return
    }
    const controller = new AbortController()
    prefetchAbortRef.current = controller
    setProgress("Validating variables...")
    try {
      const preparation = await prepareDrafts({
        quest,
        drafts,
        timeRange: settings.timeRange,
        changed,
        redefined,
        options: scopedListOptions,
        signal: controller.signal,
        validate: validateDraft,
        onStep: (step) => setProgress(stepMessage(step)),
      })
      if (controller.signal.aborted) return
      if (preparation.kind === "error") {
        failFor(preparation.name, preparation.error)
        return
      }
      setServerErrors({})
      void trackEvent(ConsoleEvent.NOTEBOOK_VARIABLES_APPLY, {
        variableCount: localVariables.length + globalVariables.length,
        globalCount: globalVariables.length,
        kinds: [...globalVariables, ...localVariables]
          .map((v) => v.kind)
          .join(","),
      })
      const { prefetched } = preparation
      if (globalDirty) {
        await globals.applyVariables(
          globalVariables,
          prefetched.global,
          bufferId,
        )
      }
      if (localDirty || Object.keys(prefetched.notebook).length > 0) {
        applyVariables(localVariables, prefetched.notebook)
      }
      setOpen(false)
    } finally {
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
      <Dialog.Trigger asChild>
        <Trigger
          prefixIcon={<AtIcon size={14} />}
          data-hook="notebook-variables"
        >
          Variables{variableCount > 0 ? ` (${variableCount})` : ""}
        </Trigger>
      </Dialog.Trigger>
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
                  savedOptions={
                    (selectedDraft.scope === "global"
                      ? globalListOptions
                      : listOptions)[selectedDraft.variable.name]
                  }
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
              {busy && (
                <LoadingSpinner size="14px" color="contentAccentStrong" />
              )}
              <FooterMessage
                color={busy ? "contentAccentStrong" : "statusDanger"}
                title={progress ?? footerMessage ?? undefined}
                data-hook="variables-footer-message"
              >
                {progress ?? footerMessage}
              </FooterMessage>
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
                  busy ? "Applying variables" : "No changes to apply"
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
