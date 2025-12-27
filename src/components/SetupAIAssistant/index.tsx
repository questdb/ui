import React, { useState, useRef } from "react"
import styled from "styled-components"
import { Button } from "../Button"
import { Box } from "../Box"
import { AISparkle } from "../AISparkle"
import { AIAssistantPromo } from "./AIAssistantPromo"
import { ConfigurationModal } from "./ConfigurationModal"
import { SettingsModal } from "./SettingsModal"
import { ModelDropdown } from "./ModelDropdown"
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
  const { isConfigured } = useAIStatus()

  const handleSettingsClick = () => {
    if (isConfigured) {
      setSettingsModalOpen(true)
    } else {
      if (showPromo) {
        setShowPromo(false)
        setConfigModalOpen(true)
      } else {
        // First click: show promo
        setShowPromo(true)
      }
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
            prefixIcon={<AISparkle size={16} variant="hollow" />}
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
        onSetupClick={() => {
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
