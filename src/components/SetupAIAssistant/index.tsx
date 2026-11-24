import React, { useState, useRef } from "react"
import { Button } from "../Button"
import { Box } from "../Box"
import { AISparkle } from "../AISparkle"
import { AIAssistantPromo } from "./AIAssistantPromo"
import { ConfigurationModal } from "./ConfigurationModal"
import { SettingsModal } from "./SettingsModal"
import { useAIStatus } from "../../providers/AIStatusProvider"
import { isAiAssistantConfigured } from "../../utils/ai"
import { useLocalAgent } from "../../utils/localAgent/LocalAgentContext"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import { useOpenConnectCodingAgent } from "../ConnectCodingAgent"

export const SetupAIAssistant = () => {
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [showPromo, setShowPromo] = useState(false)
  const configureButtonRef = useRef<HTMLElement>(null)
  const { aiAssistantSettings } = useAIStatus()
  const localAgent = useLocalAgent()
  const openConnectCodingAgent = useOpenConnectCodingAgent()
  const isConfigured =
    isAiAssistantConfigured(aiAssistantSettings) || localAgent !== null
  const configureButtonVariantProps = isConfigured
    ? ({ variant: "secondary" } as const)
    : ({
        variant: "gradient",
        gradientStyle: "vertical",
        gradientWeight: "thick",
      } as const)

  const handleSettingsClick = () => {
    if (isConfigured) {
      void trackEvent(ConsoleEvent.AI_SETTINGS_OPEN)
      setSettingsModalOpen(true)
      return
    }
    if (showPromo) {
      setShowPromo(false)
      return
    }
    void trackEvent(ConsoleEvent.AI_PROMO_OPEN)
    setShowPromo(true)
  }

  return (
    <>
      <Box gap="1.2rem" align="center">
        <div ref={configureButtonRef as React.RefObject<HTMLDivElement | null>}>
          <Button
            size="md"
            {...configureButtonVariantProps}
            onClick={handleSettingsClick}
            prefixIcon={<AISparkle size={16} variant="hollow" />}
            data-hook="ai-assistant-settings-button"
            title="AI Assistant Settings"
          >
            {isConfigured ? "AI Settings" : "Configure"}
          </Button>
        </div>
      </Box>
      <AIAssistantPromo
        triggerRef={configureButtonRef}
        showPromo={showPromo}
        setShowPromo={setShowPromo}
        onConnectAgentClick={() => openConnectCodingAgent("ai_promo")}
        onSetupClick={() => {
          void trackEvent(ConsoleEvent.AI_CONFIGURATION_OPEN)
          setShowPromo(false)
          setConfigModalOpen(true)
        }}
      />
      <ConfigurationModal
        open={configModalOpen}
        onOpenChange={setConfigModalOpen}
      />
      {settingsModalOpen && (
        <SettingsModal open onOpenChange={setSettingsModalOpen} />
      )}
    </>
  )
}
