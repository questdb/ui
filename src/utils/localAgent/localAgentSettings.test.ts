import { describe, expect, it } from "vitest"
import type { AiAssistantSettings } from "../../providers/LocalStorageProvider/types"
import { LOCAL_AGENT_MODEL } from "./localAgentModel"
import { selectedApiModelOf, withApiModelSelected } from "./localAgentSettings"

const settings = (
  overrides: Partial<AiAssistantSettings>,
): AiAssistantSettings => ({
  modelValueFormat: 2,
  providers: {
    openai: {
      apiKey: "sk-test",
      enabledModels: ["openai:gpt-5.4", "openai:gpt-5-mini"],
      grantSchemaAccess: false,
    },
  },
  ...overrides,
})

describe("withApiModelSelected", () => {
  it.each<{
    selection: string
    before: Partial<AiAssistantSettings>
    after: Partial<AiAssistantSettings>
  }>([
    {
      selection: "an API model",
      before: { selectedModel: "openai:gpt-5.4" },
      after: { selectedModel: "openai:gpt-5-mini" },
    },
    {
      selection: "the local agent",
      before: {
        selectedModel: LOCAL_AGENT_MODEL,
        localAgent: {
          apiModel: "openai:gpt-5.4",
          preferences: { claude: { model: "opus" } },
        },
      },
      after: {
        selectedModel: LOCAL_AGENT_MODEL,
        localAgent: {
          apiModel: "openai:gpt-5-mini",
          preferences: { claude: { model: "opus" } },
        },
      },
    },
  ])(
    "makes the new API model the one that answers, keeping $selection selected",
    ({ before, after }) => {
      // When
      const next = withApiModelSelected(settings(before), "openai:gpt-5-mini")

      // Then
      expect(next).toEqual(settings(after))
      expect(selectedApiModelOf(next)).toBe("openai:gpt-5-mini")
    },
  )
})
