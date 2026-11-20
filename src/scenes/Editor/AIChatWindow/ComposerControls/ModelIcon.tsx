import React from "react"
import { PlugsIcon, TerminalWindowIcon } from "@phosphor-icons/react"
import { AnthropicIcon } from "../../../../components/SetupAIAssistant/AnthropicIcon"
import { OpenAIIcon } from "../../../../components/SetupAIAssistant/OpenAIIcon"

// A local agent has no provider; it is shown with a terminal glyph.
export const ModelIcon = ({ provider }: { provider: string | null }) => {
  switch (provider) {
    case null:
      return <TerminalWindowIcon size={16} />
    case "anthropic":
      return <AnthropicIcon width="16" height="16" color="currentColor" />
    case "openai":
      return <OpenAIIcon width="16" height="16" color="currentColor" />
    default:
      return <PlugsIcon size={16} />
  }
}
