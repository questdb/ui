import { createContext, useContext, useSyncExternalStore } from "react"
import type { LocalAgentChannel, LocalAgentSnapshot } from "./localAgentChannel"

export const LocalAgentContext = createContext<LocalAgentChannel | null>(null)
export const LocalAgentSchemaAccessContext = createContext(false)
export const useLocalAgentSchemaAccess = () =>
  useContext(LocalAgentSchemaAccessContext)

const subscribeToNothing = () => () => undefined
const noSnapshot = () => null

export const useLocalAgentChannel = (): LocalAgentChannel | null =>
  useContext(LocalAgentContext)

// The paired agent's live state, or null when no agent bridge is paired.
export const useLocalAgent = (): LocalAgentSnapshot | null => {
  const channel = useLocalAgentChannel()
  return useSyncExternalStore(
    channel?.subscribe ?? subscribeToNothing,
    channel?.getSnapshot ?? noSnapshot,
  )
}

const notReady = () => false

export const useLocalAgentTransportReady = (): boolean => {
  const channel = useLocalAgentChannel()
  return useSyncExternalStore(
    channel?.subscribeToTransport ?? subscribeToNothing,
    channel?.isTransportReady ?? notReady,
  )
}
