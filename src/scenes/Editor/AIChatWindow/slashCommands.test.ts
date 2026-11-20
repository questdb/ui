import { describe, expect, it } from "vitest"
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
    caption: "Local agent",
    provider: null,
    options: [
      option("Claude Opus 5.5", "anthropic/opus", "agent"),
      option("Claude Sonnet 5", "anthropic/sonnet", "agent"),
    ],
  },
]

describe("availableCommands", () => {
  it("puts the console's commands first, in place of the agent's of the same name", () => {
    expect(availableCommands(agentCommands, true).map((c) => c.name)).toEqual([
      "model",
      "effort",
      "review",
      "compact",
    ])
    expect(availableCommands([], false).map((c) => c.name)).toEqual(["model"])
  })
})

describe("the command being typed", () => {
  it("is read until the first space, and matches by start before anywhere", () => {
    expect(typedCommandQuery("/")).toBe("")
    expect(typedCommandQuery("/re")).toBe("re")
    expect(typedCommandQuery("/review now")).toBeNull()
    expect(typedCommandQuery("hello /re")).toBeNull()
    const commands = availableCommands(agentCommands, true)
    expect(matchingCommands(commands, "e").map((c) => c.name)).toEqual([
      "effort",
      "model",
      "review",
    ])
  })

  it("runs only as a known command, so a path is still a message", () => {
    const commands = availableCommands(agentCommands, true)
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
