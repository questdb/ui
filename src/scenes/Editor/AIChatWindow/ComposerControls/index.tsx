import React, { useState } from "react"
import styled from "styled-components"
import { SlidersHorizontalIcon } from "@phosphor-icons/react"
import { IconButton } from "../../../../components/IconButton"
import { SettingsModal } from "../../../../components/SetupAIAssistant/SettingsModal"
import { trackEvent } from "../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../modules/ConsoleEventTracker/events"
import { EffortPicker } from "./EffortPicker"
import { ModelPicker } from "./ModelPicker"
import { useComposerModel } from "./useComposerModel"
import { TokenUsage, type TokenUsageCounts } from "./TokenUsage"
import { ContextUsage } from "./ContextUsage"
import { useOpenConnectCodingAgent } from "../../../../components/ConnectCodingAgent"
import { getValue, setValue } from "../../../../utils/localStorage"
import { StoreKey } from "../../../../utils/localStorage/types"
import type { ContextUsage as ContextUsageCounts } from "../../../../utils/ai/aiAssistant"

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  margin-left: -0.4rem;
`

// Same size and right inset as the send button above it, so the two line up.
const SettingsButton = styled(IconButton)`
  margin-right: 0.8rem;
`

const Pickers = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  flex: 1;
`

// /model or /effort without a name opens its picker; each request is new.
export type PickerRequest = { picker: "model" | "effort"; nonce: number }

type ComposerControlsProps = {
  disabled: boolean
  contextUsage?: ContextUsageCounts | null
  // Every answer's tokens, added up.
  chatTokens?: TokenUsageCounts | null
  pickerRequest?: PickerRequest | null
  // Called once a model or effort is chosen, to put focus back in the input.
  onPicked?: () => void
}

export const ComposerControls = ({
  disabled,
  contextUsage = null,
  chatTokens = null,
  pickerRequest = null,
  onPicked,
}: ComposerControlsProps) => {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [inviteDismissed, setInviteDismissed] = useState(
    () => getValue(StoreKey.LOCAL_AGENT_INVITE_DISMISSED) === "true",
  )
  const model = useComposerModel()
  const openConnectCodingAgent = useOpenConnectCodingAgent()

  const dismissInvite = () => {
    void trackEvent(ConsoleEvent.LOCAL_AGENT_INVITE_DISMISS)
    setValue(StoreKey.LOCAL_AGENT_INVITE_DISMISSED, "true")
    setInviteDismissed(true)
  }

  const openSettings = () => {
    void trackEvent(ConsoleEvent.AI_SETTINGS_OPEN)
    setSettingsOpen(true)
  }

  return (
    <Row data-hook="chat-composer-controls">
      <Pickers>
        <ModelPicker
          groups={model.groups}
          selectedKey={model.selectedKey}
          triggerLabel={model.triggerLabel}
          triggerProvider={model.triggerProvider}
          agent={model.agent}
          agentInvite={
            model.agent || inviteDismissed
              ? null
              : {
                  onConnect: () => openConnectCodingAgent("model_picker"),
                  onDismiss: dismissInvite,
                }
          }
          disabled={disabled}
          onSelect={model.selectModel}
          onRestartAgent={model.restartAgent}
          onDone={onPicked}
          openSignal={
            pickerRequest?.picker === "model" ? pickerRequest.nonce : null
          }
        />
        {model.effort && (
          <EffortPicker
            control={model.effort}
            disabled={disabled}
            onChange={model.selectEffort}
            onDone={onPicked}
            openSignal={
              pickerRequest?.picker === "effort" ? pickerRequest.nonce : null
            }
          />
        )}
      </Pickers>
      {/* An agent shows how full its context is; an API model, the tokens
          the chat spent on the user's key. */}
      {model.usesAgent
        ? contextUsage && <ContextUsage usage={contextUsage} />
        : chatTokens && <TokenUsage usage={chatTokens} />}
      <SettingsButton
        label="Assistant settings"
        variant="secondary"
        onClick={openSettings}
        data-hook="chat-assistant-settings"
      >
        <SlidersHorizontalIcon size={16} />
      </SettingsButton>
      {settingsOpen && <SettingsModal open onOpenChange={setSettingsOpen} />}
    </Row>
  )
}
