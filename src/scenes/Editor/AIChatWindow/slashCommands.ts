import type { AgentCommand } from "../../../utils/localAgent/protocol"
import {
  filterModelGroups,
  type EffortControl,
  type EffortChoice,
  type ModelGroup,
  type ModelOption,
} from "./ComposerControls/modelOptions"

export type SlashCommand = AgentCommand & {
  // The console's own commands run in the console; an agent's go to it as
  // the message.
  source: "console" | "agent"
}

const MODEL_COMMAND: SlashCommand = {
  name: "model",
  description: "Switch the model",
  hint: "[name]",
  source: "console",
}

const EFFORT_COMMAND: SlashCommand = {
  name: "effort",
  description: "Set the reasoning effort",
  hint: "[level]",
  source: "console",
}

// The commands the composer offers: the console's own first, then the
// agent's, without those the console's replace or that have no use here.
export const availableCommands = (
  agentCommands: AgentCommand[],
  hasEffort: boolean,
): SlashCommand[] => {
  const own = hasEffort ? [MODEL_COMMAND, EFFORT_COMMAND] : [MODEL_COMMAND]
  const hidden = new Set([MODEL_COMMAND.name, EFFORT_COMMAND.name])
  return [
    ...own,
    ...agentCommands
      .filter((command) => !hidden.has(command.name.toLowerCase()))
      .map((command) => ({ ...command, source: "agent" as const })),
  ]
}

// The command being typed, while the message is still just "/" and a name.
export const typedCommandQuery = (input: string): string | null =>
  /^\/([\w:.-]*)$/.exec(input)?.[1] ?? null

export const matchingCommands = (
  commands: SlashCommand[],
  query: string,
): SlashCommand[] => {
  const typed = query.toLowerCase()
  const starts = commands.filter((command) =>
    command.name.toLowerCase().startsWith(typed),
  )
  const contains = commands.filter(
    (command) =>
      !command.name.toLowerCase().startsWith(typed) &&
      command.name.toLowerCase().includes(typed),
  )
  return [...starts, ...contains]
}

// A message that is a known command, with what follows its name.
export const parseCommand = (
  input: string,
  commands: SlashCommand[],
): { command: SlashCommand; args: string } | null => {
  const match = /^\/([\w:.-]+)(?:\s+([\s\S]*))?$/.exec(input.trim())
  if (!match) return null
  const command = commands.find(
    (candidate) => candidate.name.toLowerCase() === match[1].toLowerCase(),
  )
  return command ? { command, args: (match[2] ?? "").trim() } : null
}

export type Resolved<T> = { ok: true; value: T } | { ok: false; error: string }

const quoted = (text: string) => `“${text}”`

const listOf = (names: string[], limit = 3, last = "and"): string =>
  names.length > limit
    ? `${names.slice(0, limit).join(", ")} and ${names.length - limit} more`
    : names.length > 1
      ? `${names.slice(0, -1).join(", ")} ${last} ${names[names.length - 1]}`
      : names.join("")

// The model a /model argument names: its exact name or id, else the one model
// every word of it matches.
export const resolveModel = (
  groups: ModelGroup[],
  query: string,
): Resolved<ModelOption> => {
  const typed = query.trim().toLowerCase()
  const options = groups.flatMap((group) =>
    group.options.map((option) => ({ group, option })),
  )
  const describe = ({
    group,
    option,
  }: {
    group: ModelGroup
    option: ModelOption
  }) => `${option.label} (${group.label})`
  const exact = options.filter(
    ({ group, option }) =>
      option.label.toLowerCase() === typed ||
      option.selection.model?.toLowerCase() === typed ||
      `${group.label} ${option.label}`.toLowerCase() === typed,
  )
  const found =
    exact.length > 0
      ? exact
      : filterModelGroups(groups, query).flatMap((group) =>
          group.options.map((option) => ({ group, option })),
        )
  if (found.length === 1) return { ok: true, value: found[0].option }
  if (found.length === 0)
    return {
      ok: false,
      error: `No model matches ${quoted(query.trim())}. Type /model to pick one from the list.`,
    }
  return {
    ok: false,
    error: `${quoted(query.trim())} matches several models: ${listOf(found.map(describe))}. Be more specific.`,
  }
}

// The effort level an /effort argument names, by its name or value.
export const resolveEffort = (
  control: EffortControl | null,
  query: string,
): Resolved<EffortChoice> => {
  if (!control) return { ok: false, error: "This model has no effort setting." }
  const typed = query.trim().toLowerCase()
  const choices = control.choices
  const found =
    choices.filter(
      (choice) =>
        choice.label.toLowerCase() === typed ||
        choice.value.toLowerCase() === typed,
    )[0] ??
    (choices.filter((choice) => choice.label.toLowerCase().startsWith(typed))
      .length === 1
      ? choices.find((choice) => choice.label.toLowerCase().startsWith(typed))
      : undefined)
  return found
    ? { ok: true, value: found }
    : {
        ok: false,
        error: `No effort level ${quoted(query.trim())}. Choose ${listOf(
          choices.map((choice) => choice.label),
          choices.length,
          "or",
        )}.`,
      }
}
