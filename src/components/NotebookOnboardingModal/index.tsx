import React, { useEffect, useRef, useState } from "react"
import * as RadixDialog from "@radix-ui/react-dialog"
import styled, { css, useTheme } from "styled-components"
import { XIcon } from "@phosphor-icons/react"
import { Overlay } from "../Overlay"
import { ForwardRef } from "../ForwardRef"
import { IconButton } from "../IconButton"
import { useLocalStorage } from "../../providers/LocalStorageProvider"
import { useEditor } from "../../providers/EditorProvider"
import { createDefaultNotebookViewState } from "../../store/notebook"
import { shouldShowNotebookModal } from "../../utils/notebookOnboarding"
import { trackEvent } from "../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../modules/ConsoleEventTracker/events"
import { PRIMARY_BUTTON_HOOK } from "./shared"
import { Step1 } from "./Step1"
import { Step2 } from "./Step2"
import { AgentTranscript } from "./AgentTranscript"
import { withAlpha } from "../../theme"

const dialogShow = css`
  @keyframes onboardingShow {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`

const Content = styled(RadixDialog.Content)<{ $tall?: boolean }>`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 101;
  display: flex;
  width: 90vw;
  max-width: 100rem;
  min-height: ${({ $tall }) =>
    $tall ? "min(66.6rem, 85vh)" : "min(41.6rem, 85vh)"};
  max-height: 85vh;
  overflow: hidden;
  background: ${({ theme }) => theme.color.onboardingSurface};
  border: 1px solid ${({ theme }) => theme.color.borderDefault};
  border-radius: 0.75rem;
  box-shadow: 0 0.7rem 3rem -1rem ${({ theme }) => theme.color.shadowOverlay};

  ${dialogShow}

  &[data-state="open"] {
    animation: onboardingShow 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  &:focus {
    outline: none;
  }
`

const RightColumn = styled.div`
  position: relative;
  flex-shrink: 0;
  align-self: stretch;
  width: 52rem;
  background: ${({ theme }) => theme.color.onboardingSurface};
  border-left: 1px solid ${({ theme }) => theme.color.onboardingDivider};

  @media (max-width: 860px) {
    display: none;
  }
`

const HeroImage = styled.img`
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
`

const TerminalWrap = styled.div`
  display: flex;
  height: 100%;
  padding: 2rem;
`

const GradientOverlay = styled.div`
  position: absolute;
  top: 2rem;
  bottom: 2rem;
  left: 55%;
  right: 0;
  background: ${({ theme }) =>
    `linear-gradient(to right, ${withAlpha(theme.color.onboardingSurface, 0)}, ${theme.color.onboardingSurface})`};
  pointer-events: none;
`

const CloseButton = styled(IconButton).attrs({
  label: "Close",
  variant: "ghost",
  size: "sm",
})`
  position: absolute;
  top: 0.9rem;
  right: 0.9rem;
  z-index: 1;
  padding: 0.8rem;
`

const HiddenTitle = styled(RadixDialog.Title)`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`

export const NotebookOnboardingModal = () => {
  const theme = useTheme()
  const { notebookOnboarding, updateNotebookOnboarding } = useLocalStorage()
  const { addBuffer } = useEditor()
  const [open, setOpen] = useState(() =>
    shouldShowNotebookModal(notebookOnboarding),
  )
  const [step, setStep] = useState<0 | 1>(0)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      void trackEvent(ConsoleEvent.NOTEBOOK_ONBOARDING_OPEN)
      updateNotebookOnboarding({ showNotebookPromo: false })
    }
  }, [open, updateNotebookOnboarding])

  useEffect(() => {
    if (open) {
      contentRef.current
        ?.querySelector<HTMLElement>(`[data-hook="${PRIMARY_BUTTON_HOOK}"]`)
        ?.focus()
    }
  }, [open, step])

  const createNotebook = () => {
    updateNotebookOnboarding({ showMcpPromo: false })
    void addBuffer({
      notebookViewState: createDefaultNotebookViewState(),
    }).then((buffer) => {
      if (buffer) {
        void trackEvent(ConsoleEvent.NOTEBOOK_CREATE, {
          source: "onboarding_modal",
          step,
        })
        void trackEvent(ConsoleEvent.NOTEBOOK_TAB_OPEN, {
          source: "onboarding_modal",
        })
      }
    })
    setOpen(false)
  }

  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          void trackEvent(ConsoleEvent.NOTEBOOK_ONBOARDING_CLOSE, { step })
          setOpen(false)
        }
      }}
    >
      <RadixDialog.Portal>
        <ForwardRef>
          <Overlay primitive={RadixDialog.Overlay} />
        </ForwardRef>
        <Content
          ref={contentRef}
          aria-describedby={undefined}
          $tall={step === 1}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <HiddenTitle>
            {step === 0 ? "Introducing Notebooks" : "QuestDB MCP Connection"}
          </HiddenTitle>
          <CloseButton
            title="Close"
            onClick={() => {
              void trackEvent(ConsoleEvent.NOTEBOOK_ONBOARDING_CLOSE, { step })
              setOpen(false)
            }}
          >
            <XIcon
              size={16}
              color={theme.color.onboardingClose}
              weight="bold"
            />
          </CloseButton>
          {step === 0 ? (
            <Step1
              onCreateNotebook={createNotebook}
              onNext={() => {
                void trackEvent(ConsoleEvent.NOTEBOOK_ONBOARDING_STEP, {
                  step: 1,
                })
                setStep(1)
              }}
            />
          ) : (
            <Step2 onCreateNotebook={createNotebook} />
          )}
          <RightColumn>
            {step === 0 ? (
              <HeroImage
                src="assets/onboarding/intro-notebooks-hero.png"
                alt="Notebooks preview"
              />
            ) : (
              <>
                <TerminalWrap>
                  <AgentTranscript />
                </TerminalWrap>
                <GradientOverlay />
              </>
            )}
          </RightColumn>
        </Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
