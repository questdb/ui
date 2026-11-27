import React, { createContext, useCallback, useContext, useState } from "react"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import { ConnectCodingAgentDialog } from "./ConnectCodingAgentDialog"
import type { ChatAgent } from "../../utils/localAgent/chatAgents"

export type ConnectCodingAgentSource =
  | "ai_promo"
  | "model_picker"
  | "mcp_popover"

type OpenConnectCodingAgent = (
  source: ConnectCodingAgentSource,
  // The agent to run, when the console knows the user's coding agent.
  chatAgent?: ChatAgent | null,
) => void

const ConnectCodingAgentContext = createContext<OpenConnectCodingAgent>(
  () => undefined,
)

export const useOpenConnectCodingAgent = (): OpenConnectCodingAgent =>
  useContext(ConnectCodingAgentContext)

export const ConnectCodingAgentProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [open, setOpen] = useState(false)
  const [chatAgent, setChatAgent] = useState<ChatAgent | null>(null)

  const openDialog = useCallback(
    (source: ConnectCodingAgentSource, agent: ChatAgent | null = null) => {
      void trackEvent(ConsoleEvent.LOCAL_AGENT_SETUP_OPEN, { source })
      setChatAgent(agent)
      setOpen(true)
    },
    [],
  )

  return (
    <ConnectCodingAgentContext.Provider value={openDialog}>
      {children}
      <ConnectCodingAgentDialog
        open={open}
        onOpenChange={setOpen}
        chatAgent={chatAgent}
      />
    </ConnectCodingAgentContext.Provider>
  )
}
