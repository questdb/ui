import React from "react"
import styled from "styled-components"
import {
  Checkbox,
  Input,
  SelectMenuControl,
  Text,
} from "../../../../components"
import type {
  CellInteractions,
  NotebookVariable,
} from "../../../../store/notebook"
import {
  CheckboxRow,
  Field,
  FieldGroup,
  FieldLabel,
} from "../CellChart/chartSettingsStyles"
import { isVariableName } from "../../../../store/notebookFormat"
import {
  renderDeclareValidationQuery,
  validateVariableShape,
} from "../declareUtils"

// Which notebook variables a cell's result sets: a click sets one from the
// clicked item, a drag across a time chart sets two from the window. Each
// picks a variable of the notebook, or creates one with a value it starts
// with; new ones are added to the notebook when the drawer saves.

const NEW = "\u0000new"

export type VariableSlot = "click" | "from" | "to"

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1rem;
  border: 1px solid ${({ theme }) => theme.color.interactionNeutral};
  border-radius: 0.6rem;
`

const Row = styled.div`
  display: flex;
  gap: 0.8rem;
  & > * {
    flex: 1 1 0;
    min-width: 0;
  }
`

const Hint = styled(Text)`
  line-height: 1.45;
`

const FieldError = styled.span`
  font-size: 1.1rem;
  color: ${({ theme }) => theme.color.statusDanger};
`

export type InteractionsDraft = {
  interactions?: CellInteractions
  // Variables created in this drawer, by the slot that uses them.
  created: Partial<Record<VariableSlot, NotebookVariable>>
}

const slotName = (
  interactions: CellInteractions | undefined,
  slot: VariableSlot,
): string | undefined =>
  slot === "click" ? interactions?.click?.variable : interactions?.brush?.[slot]

const activeSlots = (
  interactions: CellInteractions | undefined,
): VariableSlot[] => [
  ...(interactions?.click ? (["click"] as const) : []),
  ...(interactions?.brush ? (["from", "to"] as const) : []),
]

const VALUE_SHAPE_ERROR =
  "Must be a single expression: wrap it in parentheses if it needs commas."

/** What blocks a save, by slot, or null. */
export const interactionErrors = (
  draft: InteractionsDraft,
  variables: NotebookVariable[],
): Partial<Record<VariableSlot, string>> | null => {
  const errors: Partial<Record<VariableSlot, string>> = {}
  const slots = activeSlots(draft.interactions)
  for (const slot of slots) {
    const created = draft.created[slot]
    const name = slotName(draft.interactions, slot)
    if (!name) {
      errors[slot] = created ? "Name the variable." : "Choose a variable."
    } else if (!isVariableName(name)) {
      errors[slot] = "Letters, digits and _, starting with a letter or _."
    } else if (created) {
      const clash = slots.some(
        (other) =>
          other !== slot &&
          draft.created[other] !== undefined &&
          slotName(draft.interactions, other) === name,
      )
      if (variables.some((v) => v.name === name))
        errors[slot] = `@${name} already exists: pick it from the list.`
      else if (clash) errors[slot] = `Another new variable is named @${name}.`
      else if (created.value.trim() === "")
        errors[slot] = "Give the new variable a value to start with."
      else if (validateVariableShape({ name, value: created.value }))
        errors[slot] = VALUE_SHAPE_ERROR
    }
  }
  if (
    draft.interactions?.brush &&
    !errors.to &&
    draft.interactions.brush.from &&
    draft.interactions.brush.from === draft.interactions.brush.to
  )
    errors.to = "Choose a different variable from the start's."
  return Object.keys(errors).length > 0 ? errors : null
}

/** The new variables a save adds: the ones still in use, once by name. */
export const newVariablesInUse = (
  draft: InteractionsDraft,
): NotebookVariable[] => {
  const out: NotebookVariable[] = []
  for (const slot of activeSlots(draft.interactions)) {
    const created = draft.created[slot]
    const name = slotName(draft.interactions, slot)
    if (created && name && !out.some((v) => v.name === name))
      out.push({ name, value: created.value.trim() })
  }
  return out
}

/** The notebook's variables with the new ones added; existing ones kept. */
export const withNewVariables = (
  variables: NotebookVariable[],
  created: NotebookVariable[],
): NotebookVariable[] => {
  const out = [...variables]
  for (const c of created) if (!out.some((v) => v.name === c.name)) out.push(c)
  return out
}

const failureText = (e: unknown): string => {
  if (e instanceof Error) return e.message
  if (typeof e === "object" && e !== null && "status" in e) {
    const { status, statusText } = e as {
      status: unknown
      statusText?: unknown
    }
    return `${String(status)} ${typeof statusText === "string" ? statusText : ""}`.trim()
  }
  return "the database did not answer."
}

type ValidateQuery = (
  query: string,
) => Promise<{ error: string } | Record<string, unknown>>

/**
 * Asks the server whether the new variables declare cleanly after the
 * notebook's: every SELECT of the notebook carries them. Errors by slot.
 */
export const serverInteractionErrors = async (
  draft: InteractionsDraft,
  variables: NotebookVariable[],
  validateQuery: ValidateQuery,
): Promise<Partial<Record<VariableSlot, string>> | null> => {
  const created = newVariablesInUse(draft)
  const slotOf = (name: string) =>
    activeSlots(draft.interactions).find(
      (s) => draft.created[s] && slotName(draft.interactions, s) === name,
    )
  for (let i = 0; i < created.length; i += 1) {
    let error: string | null = null
    try {
      const result = await validateQuery(
        renderDeclareValidationQuery([
          ...variables,
          ...created.slice(0, i + 1),
        ]),
      )
      if ("error" in result && typeof result.error === "string")
        error = result.error
    } catch (e) {
      error = `Could not check it with the database: ${failureText(e)}`
    }
    if (error !== null) {
      const slot = slotOf(created[i].name)
      return slot ? { [slot]: error } : null
    }
  }
  return null
}

type VariableFieldProps = {
  slot: VariableSlot
  label: string
  draft: InteractionsDraft
  variables: NotebookVariable[]
  error?: string
  // What a new variable starts with, as a SQL expression.
  valueHint: string
  // How a variable not in the notebook yet comes to be.
  undeclaredNote: string
  onPick: (name: string) => void
  onCreate: (created: NotebookVariable) => void
}

const VariableField: React.FC<VariableFieldProps> = ({
  slot,
  label,
  draft,
  variables,
  error,
  valueHint,
  undeclaredNote,
  onPick,
  onCreate,
}) => {
  const created = draft.created[slot]
  const name = slotName(draft.interactions, slot) ?? ""
  const undeclared =
    !created && name !== "" && !variables.some((v) => v.name === name)
  return (
    <FieldGroup>
      <Field as="div">
        <FieldLabel>{label}</FieldLabel>
        <SelectMenuControl
          name={`${slot}-variable`}
          ariaLabel={label}
          value={created ? NEW : name}
          placeholder="Choose a variable"
          onValueChange={(next) => {
            if (next === NEW) onCreate({ name: "", value: "" })
            else onPick(next)
          }}
          options={[
            ...variables.map((v) => ({
              label: `@${v.name}`,
              value: v.name,
              description: v.value,
            })),
            ...(undeclared
              ? [
                  {
                    label: `@${name}`,
                    value: name,
                    description: undeclaredNote,
                  },
                ]
              : []),
            { label: "New variable…", value: NEW },
          ]}
        />
      </Field>
      {created && (
        <Row>
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input
              name={`${slot}-new-name`}
              placeholder="e.g. symbol"
              value={name}
              aria-invalid={error !== undefined}
              onChange={(e) =>
                onCreate({
                  name: e.target.value.replace(/^@/, ""),
                  value: created.value,
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel>Starts as (SQL)</FieldLabel>
            <Input
              name={`${slot}-new-value`}
              placeholder={valueHint}
              value={created.value}
              onChange={(e) => onCreate({ name, value: e.target.value })}
            />
          </Field>
        </Row>
      )}
      {error && <FieldError role="alert">{error}</FieldError>}
    </FieldGroup>
  )
}

type Props = {
  draft: InteractionsDraft
  onChange: (draft: InteractionsDraft) => void
  variables: NotebookVariable[]
  columns: { name: string }[]
  // What a click picks when no column is chosen.
  clickTarget: "item" | "cell"
  // Drag to set a time window: only for preset charts over time; null hides
  // it (grids).
  brush: { available: true } | { available: false; reason: string } | null
  errors: Partial<Record<VariableSlot, string>> | null
}

/** A cell's clicks and drags, and the variables they set. */
export const InteractionsEditor: React.FC<Props> = ({
  draft,
  onChange,
  variables,
  columns,
  clickTarget,
  brush,
  errors,
}) => {
  const { click, brush: drag } = draft.interactions ?? {}

  const setInteractions = (next: CellInteractions, created = draft.created) =>
    onChange({
      interactions: next.click || next.brush ? next : undefined,
      created,
    })

  // The slot's variable is `name`: picked (created dropped) or new.
  const setSlot = (
    slot: VariableSlot,
    name: string,
    newVariable: NotebookVariable | undefined,
  ) => {
    const created = { ...draft.created }
    if (newVariable) created[slot] = newVariable
    else delete created[slot]
    const interactions = { ...draft.interactions }
    if (slot === "click" && interactions.click)
      interactions.click = { ...interactions.click, variable: name }
    if (slot !== "click" && interactions.brush)
      interactions.brush = { ...interactions.brush, [slot]: name }
    setInteractions(interactions, created)
  }

  const fieldProps = (slot: VariableSlot) => ({
    slot,
    draft,
    variables,
    error: errors?.[slot],
    onPick: (name: string) => setSlot(slot, name, undefined),
    onCreate: (created: NotebookVariable) =>
      setSlot(slot, created.name, created),
  })

  return (
    <>
      <Hint color="contentSecondary" size="xs">
        {brush
          ? "Clicks and drags on this cell set notebook variables."
          : "Clicks on this grid set a notebook variable."}{" "}
        Cells whose SQL uses @variable refresh with the new value.
      </Hint>

      <Section>
        <CheckboxRow>
          <Checkbox
            checked={click !== undefined}
            onChange={(e) => {
              const created = { ...draft.created }
              if (!e.target.checked) delete created.click
              setInteractions(
                {
                  ...draft.interactions,
                  click: e.target.checked ? { variable: "" } : undefined,
                },
                created,
              )
            }}
          />
          A click sets a variable
        </CheckboxRow>
        {click && (
          <>
            <VariableField
              {...fieldProps("click")}
              label="Variable"
              valueHint="e.g. 'BTC'"
              undeclaredNote="Created on the first click"
            />
            <Field as="div">
              <FieldLabel>Set it to</FieldLabel>
              <SelectMenuControl
                name="click-column"
                ariaLabel="Set it to"
                value={click.column ?? ""}
                onValueChange={(column) =>
                  setInteractions({
                    ...draft.interactions,
                    click: {
                      variable: click.variable,
                      ...(column ? { column } : {}),
                    },
                  })
                }
                options={[
                  {
                    label:
                      clickTarget === "cell"
                        ? "The clicked cell's value"
                        : "The clicked item's name (bar, slice, node, tile)",
                    value: "",
                  },
                  ...columns.map((c) => ({
                    label: `The ${c.name} of the clicked row`,
                    value: c.name,
                  })),
                ]}
              />
            </Field>
            <Hint color="contentSecondary" size="xs">
              {clickTarget === "item"
                ? "Text is quoted for SQL; numbers are set as they are."
                : click.column
                  ? "The row whose value the variable holds stays highlighted."
                  : "Choose a column to keep the selected row highlighted."}
            </Hint>
          </>
        )}
      </Section>

      {brush && (
        <Section>
          <CheckboxRow>
            <Checkbox
              checked={drag !== undefined}
              disabled={!brush.available && drag === undefined}
              onChange={(e) => {
                const created = { ...draft.created }
                if (!e.target.checked) {
                  delete created.from
                  delete created.to
                }
                setInteractions(
                  {
                    ...draft.interactions,
                    brush: e.target.checked ? { from: "", to: "" } : undefined,
                  },
                  created,
                )
              }}
            />
            Dragging across the chart sets a time window
          </CheckboxRow>
          {!brush.available && (
            <Hint color="contentSecondary" size="xs">
              {brush.reason}
            </Hint>
          )}
          {drag && (
            <>
              <VariableField
                {...fieldProps("from")}
                label="Start of the window"
                valueHint="e.g. dateadd('h', -1, now())"
                undeclaredNote="Created on the first drag"
              />
              <VariableField
                {...fieldProps("to")}
                label="End of the window"
                valueHint="e.g. now()"
                undeclaredNote="Created on the first drag"
              />
              <Hint color="contentSecondary" size="xs">
                Both are set to timestamps, e.g. WHERE ts BETWEEN @from AND @to.
              </Hint>
            </>
          )}
        </Section>
      )}
    </>
  )
}
