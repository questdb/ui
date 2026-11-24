import { useCallback, useEffect, useRef, useState } from "react"
import type { MCPBridgeClient } from "../../utils/mcp/MCPBridgeClient"
import {
  createNotebookFreshness,
  type NotebookFreshness,
} from "../../utils/notebooks/notebookFreshness"
import {
  LocalAgentChannel,
  registerLocalAgentChannel,
  unregisterLocalAgentChannel,
} from "../../utils/localAgent/localAgentChannel"
import { localAgentPreferencesOf } from "../../utils/localAgent/localAgentSettings"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import type { AiAssistantSettings } from "../LocalStorageProvider/types"

type LocalAgentConnectionOptions = {
  isEnabled: boolean
  aiAssistantSettings: AiAssistantSettings
}

// Owns the local agent channel of the paired bridge: it exists while the
// bridge is connected and announces an agent, and it keeps the bridge in sync
// with the user's agent preferences.
export const useLocalAgentConnection = ({
  isEnabled,
  aiAssistantSettings,
}: LocalAgentConnectionOptions) => {
  const [channel, setChannel] = useState<LocalAgentChannel | null>(null)
  // Each agent conversation reads and edits notebooks on its own, so each
  // gets its own freshness baseline.
  const freshnessByConversation = useRef(new Map<string, NotebookFreshness>())

  const freshnessFor = useCallback((conversationId: string) => {
    const existing = freshnessByConversation.current.get(conversationId)
    if (existing) return existing
    const created = createNotebookFreshness()
    freshnessByConversation.current.set(conversationId, created)
    return created
  }, [])

  const attachClient = useCallback(
    (client: MCPBridgeClient) => {
      let current: LocalAgentChannel | null = null
      let left: { agentId: string; turns: Map<string, string> } | null = null

      const release = () => {
        if (!current) return
        left = { agentId: current.info.id, turns: current.unfinishedTurns() }
        unregisterLocalAgentChannel(current)
        current.dispose()
        current = null
        freshnessByConversation.current.clear()
        setChannel(null)
      }

      // A reconnect to the same bridge keeps the channel and its running
      // turns: the bridge holds their updates and delivers them on reconnect.
      const offHelloAck = client.on("helloAck", (ack) => {
        if (current && ack.agent && current.info.id === ack.agent.id) {
          current.resume()
          return
        }
        release()
        if (!ack.agent || !isEnabled) return
        current = new LocalAgentChannel(client, {
          info: ack.agent,
          onNotebookRead: (conversationId, read) =>
            freshnessFor(conversationId).recordRead(
              read.bufferId,
              read.readSeq,
            ),
        })
        if (left?.agentId === ack.agent.id) current.stopTurnsLeftBy(left.turns)
        left = null
        registerLocalAgentChannel(current)
        setChannel(current)
        void trackEvent(ConsoleEvent.LOCAL_AGENT_CONNECTED, {
          agent: ack.agent.id,
        })
      })
      const offStatus = client.on("status", (status) => {
        if (status === "disconnected") release()
      })

      return () => {
        offHelloAck()
        offStatus()
        release()
      }
    },
    [isEnabled, freshnessFor],
  )

  const agentId = channel?.info.id
  const { model, effort } = localAgentPreferencesOf(
    aiAssistantSettings,
    agentId,
  )

  useEffect(() => {
    channel?.sendPreferences({ model, effort })
  }, [channel, model, effort])

  return { channel, attachClient, freshnessFor }
}
