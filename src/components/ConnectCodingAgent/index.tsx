import React, { createContext, useCallback, useContext, useState } from "react"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import { ConnectCodingAgentDialog } from "./ConnectCodingAgentDialog"

export type ConnectCodingAgentSource =
  | "ai_promo"
  | "model_picker"
  | "mcp_popover"

type OpenConnectCodingAgent = (source: ConnectCodingAgentSource) => void

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

  const openDialog = useCallback((source: ConnectCodingAgentSource) => {
    void trackEvent(ConsoleEvent.LOCAL_AGENT_SETUP_OPEN, { source })
    setOpen(true)
  }, [])

  return (
    <ConnectCodingAgentContext.Provider value={openDialog}>
      {children}
      <ConnectCodingAgentDialog open={open} onOpenChange={setOpen} />
    </ConnectCodingAgentContext.Provider>
  )
}
