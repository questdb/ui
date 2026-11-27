import { describe, expect, it } from "vitest"
import type {
  AgentConfig,
  AgentConfigSetting,
} from "../../../utils/localAgent/protocol"
import type { ModelGroup } from "./ComposerControls/modelOptions"
import {
  availableCommands,
  matchingCommands,
  parseCommand,
  resolveEffort,
  resolveModel,
  typedCommandQuery,
} from "./slashCommands"

const agentCommands = [
  { name: "review", description: "Review changes", hint: "[focus]" },
  { name: "model", description: "Switch the model", hint: null },
  { name: "compact", description: "Summarize", hint: null },
]

const option = (
  label: string,
  model: string,
  kind: "api" | "agent" = "api",
) => ({
  key: model,
  label,
  detail: null,
  selection:
    kind === "api"
      ? { kind: "api" as const, model }
      : { kind: "agent" as const, agentId: "pi", model },
})

const groups: ModelGroup[] = [
  {
    key: "openai",
    label: "OpenAI",
    caption: null,
    provider: "openai",
    options: [
      option("GPT-5", "openai:gpt-5"),
      option("GPT-5 mini", "openai:gpt-5-mini"),
    ],
  },
  {
    key: "agent:pi",
    label: "Pi",
    caption: "Agent",
    provider: null,
    options: [
      option("Claude Opus 5.5", "anthropic/opus", "agent"),
      option("Claude Sonnet 5", "anthropic/sonnet", "agent"),
    ],
  },
]

const setting = (id: string, values: string[]): AgentConfigSetting => ({
  id,
  current: values[0],
  choices: values.map((value) => ({
    value,
    name: value,
    description: null,
    group: null,
  })),
})

describe("availableCommands", () => {
  it("puts the console's commands first, in place of the agent's of the same name", () => {
    expect(
      availableCommands(agentCommands, true, null).map((c) => c.name),
    ).toEqual(["model", "effort", "review", "compact"])
    expect(availableCommands([], false, null).map((c) => c.name)).toEqual([
      "model",
    ])
  })
})

// Commands Pi lists, its /thinking among them; its thinking level is the
// option the bridge reads as the effort.
const piCommands = [
  { name: "compact", description: "Compact the context", hint: "[focus]" },
  { name: "thinking", description: "Set the thinking level", hint: "[level]" },
  { name: "session", description: "Show session info", hint: null },
  { name: "export", description: "Export the session", hint: "[path]" },
]
const piLevels = ["off", "minimal", "low", "medium", "high", "xhigh"]

describe("Pi's commands", () => {
  it.each(["thought_level", "thinkingLevel"])(
    "leave out /thinking, which the console's effort undoes, and run it as /effort (effort option %s)",
    (effortId) => {
      // Given
      const config: AgentConfig = {
        model: setting("model", ["anthropic/opus"]),
        effort: setting(effortId, piLevels),
      }

      // When
      const commands = availableCommands(piCommands, true, config)

      // Then
      expect(commands.map((c) => `${c.source} /${c.name}`)).toEqual([
        "console /model",
        "console /effort",
        "agent /compact",
        "agent /session",
        "agent /export",
      ])
      expect(parseCommand("/thinking high", commands)).toMatchObject({
        command: { name: "effort", source: "console" },
        args: "high",
      })
      expect(parseCommand("/Thinking", commands)).toMatchObject({
        command: { name: "effort", source: "console" },
        args: "",
      })
    },
  )

  it("keep /thinking as Pi's own when Pi reports no effort option", () => {
    // Given
    const config: AgentConfig = { model: null, effort: null }

    // When
    const runnable = availableCommands(piCommands, true, config)

    // Then
    expect(runnable.map((c) => c.name)).toContain("thinking")
    expect(parseCommand("/thinking high", runnable)).toMatchObject({
      command: { name: "thinking", source: "agent" },
      args: "high",
    })
  })
})

// For each setting of the agent the console controls (every key of
// AgentConfig), the names an agent's own command for it can have: the
// console command's, the option's id, and a known alias.
const agentSettingCommands: Record<
  keyof AgentConfig,
  { optionId: string; agentCommand: string }[]
> = {
  model: [
    { optionId: "model", agentCommand: "model" },
    { optionId: "llm", agentCommand: "llm" },
  ],
  effort: [
    { optionId: "thought_level", agentCommand: "effort" },
    { optionId: "reasoning", agentCommand: "Reasoning" },
    { optionId: "thinkingLevel", agentCommand: "thinking" },
  ],
}

describe("an agent's own command for a setting the console controls", () => {
  it.each(
    Object.entries(agentSettingCommands).flatMap(([name, cases]) =>
      cases.map((names) => ({ setting: name as keyof AgentConfig, ...names })),
    ),
  )(
    "runs the agent's $agentCommand (option $optionId) as the console's $setting",
    ({ setting: name, optionId, agentCommand }) => {
      // Given
      const config: AgentConfig = { model: null, effort: null }
      config[name] = setting(optionId, ["a", "b"])
      const commands = [
        { name: agentCommand, description: "The agent's", hint: null },
        { name: "review", description: "Review changes", hint: null },
      ]

      // When
      const runnable = availableCommands(commands, true, config)

      // Then
      expect(runnable.map((c) => `${c.source} /${c.name}`)).toEqual([
        "console /model",
        "console /effort",
        "agent /review",
      ])
      expect(parseCommand(`/${agentCommand} b`, runnable)).toMatchObject({
        command: { name, source: "console" },
        args: "b",
      })
    },
  )
})

describe("the command being typed", () => {
  it("is read until the first space, and matches by start before anywhere", () => {
    expect(typedCommandQuery("/")).toBe("")
    expect(typedCommandQuery("/re")).toBe("re")
    expect(typedCommandQuery("/review now")).toBeNull()
    expect(typedCommandQuery("hello /re")).toBeNull()
    const commands = availableCommands(agentCommands, true, null)
    expect(matchingCommands(commands, "e").map((c) => c.name)).toEqual([
      "effort",
      "model",
      "review",
    ])
  })

  it("runs only as a known command, so a path is still a message", () => {
    const commands = availableCommands(agentCommands, true, null)
    expect(parseCommand("/model gpt-5 mini", commands)).toMatchObject({
      command: { name: "model", source: "console" },
      args: "gpt-5 mini",
    })
    expect(parseCommand("/compact", commands)).toMatchObject({
      command: { source: "agent" },
      args: "",
    })
    expect(parseCommand("/tmp/data.csv has the rows", commands)).toBeNull()
  })
})

describe("resolveModel", () => {
  it("picks a model by its name, its id, or the one model every word matches", () => {
    expect(resolveModel(groups, "gpt-5")).toMatchObject({
      ok: true,
      value: { selection: { model: "openai:gpt-5" } },
    })
    expect(resolveModel(groups, "anthropic/sonnet")).toMatchObject({ ok: true })
    expect(resolveModel(groups, "opus")).toMatchObject({
      ok: true,
      value: { label: "Claude Opus 5.5" },
    })
  })

  it("says why it cannot pick one", () => {
    expect(resolveModel(groups, "claude")).toEqual({
      ok: false,
      error:
        "“claude” matches several models: Claude Opus 5.5 (Pi) and Claude Sonnet 5 (Pi). Be more specific.",
    })
    expect(resolveModel(groups, "llama")).toEqual({
      ok: false,
      error: "No model matches “llama”. Type /model to pick one from the list.",
    })
  })
})

describe("resolveEffort", () => {
  const control = {
    current: "low",
    choices: [
      { value: "low", label: "Low" },
      { value: "high", label: "High" },
    ],
  }

  it("picks a level by its name, its value, or the start of its name", () => {
    expect(resolveEffort(control, "HIGH")).toMatchObject({
      value: { value: "high" },
    })
    expect(resolveEffort(control, "lo")).toMatchObject({
      value: { value: "low" },
    })
  })

  it("says which levels there are, or that the model has none", () => {
    expect(resolveEffort(control, "medium")).toEqual({
      ok: false,
      error: "No effort level “medium”. Choose Low or High.",
    })
    expect(resolveEffort(null, "high")).toEqual({
      ok: false,
      error: "This model has no effort setting.",
    })
  })
})
