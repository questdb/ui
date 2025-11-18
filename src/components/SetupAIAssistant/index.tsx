import React, { useState, useRef } from "react"
import styled from "styled-components"
import { Button } from "../Button"
import { Box } from "../Box"
import { AIAssistantPromo } from "./AIAssistantPromo"
import { ConfigurationModal } from "./ConfigurationModal"
import { SettingsModal } from "./SettingsModal"
import { ModelDropdown } from "./ModelDropdown"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { StoreKey } from "../../utils/localStorage/types"
import { useAIStatus } from "../../providers/AIStatusProvider"

const SettingsButton = styled(Button)`
  padding: 0.6rem;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.cyan};
  }
`

export const SetupAIAssistant = () => {
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [showPromo, setShowPromo] = useState(false)
  const configureButtonRef = useRef<HTMLElement>(null)
  const { aiAssistantSettings, updateSettings } = useLocalStorage()
  const { isConfigured } = useAIStatus()

  const handleSettingsClick = () => {
    if (isConfigured) {
      setSettingsModalOpen(true)
    } else {
      setConfigModalOpen(true)
      setShowPromo(false)
      updateSettings(StoreKey.AI_ASSISTANT_SETTINGS, {
        ...aiAssistantSettings,
        aiAssistantPromo: false,
      })
    }
  }

  return (
    <>
      <Box gap="0.8rem" align="center">
        <ModelDropdown />
        <div ref={configureButtonRef as React.RefObject<HTMLDivElement>}>
          <SettingsButton
            skin={isConfigured ? "secondary" : "gradient"}
            gradientStyle="vertical"
            gradientWeight="thick"
            onClick={handleSettingsClick}
            prefixIcon={
              <img
                src="../../assets/ai-sparkle-hollow.svg"
                width="16px"
                height="16px"
                alt="AI Sparkle Hollow"
              />
            }
            data-hook="ai-assistant-settings-button"
            title="AI Assistant Settings"
          >
            {isConfigured ? "Settings" : "Configure"}
          </SettingsButton>
        </div>
      </Box>
      <AIAssistantPromo
        triggerRef={configureButtonRef}
        showPromo={showPromo}
        setShowPromo={setShowPromo}
        onSetupClick={() => setConfigModalOpen(true)}
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
