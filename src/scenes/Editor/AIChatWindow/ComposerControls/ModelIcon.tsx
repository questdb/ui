import React from "react"
import { ChatsCircleIcon, PlugsIcon } from "@phosphor-icons/react"
import { AnthropicIcon } from "../../../../components/SetupAIAssistant/AnthropicIcon"
import { OpenAIIcon } from "../../../../components/SetupAIAssistant/OpenAIIcon"

// A coding agent in the AI Assistant has no provider; it is shown with the
// glyph every surface uses for it.
export const ModelIcon = ({ provider }: { provider: string | null }) => {
  switch (provider) {
    case null:
      return <ChatsCircleIcon size={16} />
    case "anthropic":
      return <AnthropicIcon width="16" height="16" color="currentColor" />
    case "openai":
      return <OpenAIIcon width="16" height="16" color="currentColor" />
    default:
      return <PlugsIcon size={16} />
  }
}
