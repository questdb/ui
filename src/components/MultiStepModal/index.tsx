import React, { ReactNode, useState, createContext, useContext } from "react"
import * as RadixDialog from "@radix-ui/react-dialog"
import styled, { css } from "styled-components"
import { ArrowLeft } from "@styled-icons/remix-line"
import { Overlay } from "../Overlay"
import { Box } from "../Box"
import { Button } from "../Button"
import { Text } from "../Text"
import { LoadingSpinner } from "../LoadingSpinner"
import { ForwardRef } from "../ForwardRef"

type NavigationContextType = {
  handleNext: () => void | Promise<void>
  handlePrevious: () => void
  handleClose: () => void
  currentStep: number
  isFirstStep: boolean
  isLastStep: boolean
}

const NavigationContext = createContext<NavigationContextType | null>(null)

export const useModalNavigation = (): NavigationContextType => {
  const context = useContext(NavigationContext)
  if (!context) {
    return {
      handleNext: () => {},
      handlePrevious: () => {},
      handleClose: () => {},
      currentStep: 0,
      isFirstStep: true,
      isLastStep: false,
    }
  }
  return context
}

const dialogShow = css`
  @keyframes dialogShow {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`

const dialogHide = css`
  @keyframes dialogHide {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
`

const StyledContent = styled(RadixDialog.Content)<{ maxwidth?: string }>`
  background-color: ${({ theme }) => theme.color.backgroundDarker};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: 0 0.7rem 3rem -1rem ${({ theme }) => theme.color.black};
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 90vw;
  max-width: ${({ maxwidth }) => maxwidth ?? "50rem"};
  max-height: 85vh;
  padding: 0;
  border: 0.1rem solid ${({ theme }) => theme.color.selection};
  z-index: 101;
  display: flex;
  flex-direction: column;

  ${dialogShow}
  ${dialogHide}

  &[data-state="open"] {
    animation: dialogShow 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  &[data-state="closed"] {
    animation: dialogHide 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  &:focus {
    outline: none;
  }
`

const StepIndicatorContainer = styled(Box).attrs({
  gap: "1rem",
  align: "center",
})`
  backdrop-filter: blur(0.6rem);
  background: rgba(255, 255, 255, 0.06);
  padding: 0.4rem;
  border-radius: 10rem;
  box-shadow: 0 0.1rem 0.2rem rgba(0, 0, 0, 0.08);
  width: fit-content;
`

const StepBadge = styled.div`
  backdrop-filter: blur(0.6rem);
  padding: 0.2rem 0.8rem;
  border-radius: 10rem;
  background: rgba(255, 255, 255, 0.16);
`

const StepBadgeText = styled(Text)`
  font-size: 1.2rem;
  font-weight: 500;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.cyan};
  padding: 0.2rem 0.8rem;
`

const StepBadgeLabel = styled(RadixDialog.Title)`
  font-size: 1.2rem;
  font-weight: 400;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.white};
  margin: 0;
`

const Content = styled.div`
  flex: 1;
  overflow-y: auto;
`

const FooterSection = styled(Box).attrs({
  flexDirection: "column",
  gap: "1.2rem",
})`
  padding: 2.4rem;
  width: 100%;
  border-top: 0.1rem solid ${({ theme }) => theme.color.selection};
`

const FooterButtons = styled(Box).attrs({
  justifyContent: "flex-end",
  align: "center",
  gap: "1.6rem",
})`
  width: 100%;
`

const ValidationError = styled(Text)`
  color: ${({ theme }) => theme.color.red};
  font-size: 1.3rem;
  text-align: right;
  width: 100%;
`

const CancelButton = styled(Button)`
  flex: 1;
  padding: 1.1rem 1.2rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 1.4rem;
  font-weight: 500;
  width: 100%;
  height: 4rem;
`

const NextButton = styled(Button)`
  padding: 1.1rem 1.2rem;
  font-size: 1.4rem;
  font-weight: 500;
  flex: 1;
  height: 4rem;
  width: 100%;
`

export type Step = {
  id: string
  title: string
  stepName: string
  content: ReactNode | (() => ReactNode)
  validate?: () => string | boolean | Promise<string | boolean>
}

type MultiStepModalProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  steps: Step[]
  maxWidth?: string
  onComplete?: () => void | Promise<void>
  onCancel?: () => void
  canProceed?: (stepIndex: number) => boolean | Promise<boolean>
  completeButtonText?: string
  onStepChange?: (stepIndex: number, direction: "next" | "previous") => void
  showValidationError?: boolean
}

export const MultiStepModal = ({
  open,
  onOpenChange,
  steps,
  maxWidth,
  onComplete,
  onCancel,
  canProceed,
  completeButtonText = "Complete",
  onStepChange,
  showValidationError = true,
}: MultiStepModalProps) => {
  const [currentStep, setCurrentStep] = useState(0)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isValidating, setIsValidating] = useState(false)

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && onCancel) {
      onCancel()
    }
    onOpenChange?.(isOpen)
    if (!isOpen) {
      setCurrentStep(0)
      setValidationError(null)
      setIsValidating(false)
    }
  }

  const handleNext = async () => {
    const currentStepData = steps[currentStep]
    const canProceedResult = canProceed ? await canProceed(currentStep) : true
    if (!canProceedResult) {
      return
    }

    if (currentStepData?.validate) {
      setValidationError(null)
      setIsValidating(true)
      try {
        const validationResult = await currentStepData.validate()

        if (typeof validationResult === "string") {
          setValidationError(validationResult)
          return
        } else if (validationResult === false) {
          setValidationError("Validation failed")
          return
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Validation failed"
        setValidationError(errorMessage)
        return
      } finally {
        setIsValidating(false)
      }
    }

    if (currentStep < steps.length - 1) {
      setValidationError(null)
      const newStep = currentStep + 1
      onStepChange?.(newStep, "next")
      setCurrentStep(newStep)
    } else {
      await onComplete?.()
      handleOpenChange(false)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      setValidationError(null)
      setIsValidating(false)
      const newStep = currentStep - 1
      onStepChange?.(newStep, "previous")
      setCurrentStep(newStep)
    }
  }

  const handleClose = () => {
    handleOpenChange(false)
  }

  const isLastStep = currentStep === steps.length - 1
  const isFirstStep = currentStep === 0

  const navigationContextValue: NavigationContextType = {
    handleNext,
    handlePrevious,
    handleClose,
    currentStep,
    isFirstStep,
    isLastStep,
  }

  return (
    <RadixDialog.Root open={open} onOpenChange={handleOpenChange}>
      <RadixDialog.Portal>
        <ForwardRef>
          <Overlay primitive={RadixDialog.Overlay} />
        </ForwardRef>
        <StyledContent
          maxwidth={maxWidth}
          aria-describedby={`step-${currentStep}-description`}
        >
          <NavigationContext.Provider value={navigationContextValue}>
            {steps.length > 1 && (
              <Box
                flexDirection="column"
                gap="1.6rem"
                style={{
                  padding: "2.4rem",
                  paddingBottom: "1.6rem",
                  width: "100%",
                }}
              >
                <StepIndicatorContainer>
                  <StepBadgeText>
                    Step {currentStep + 1} of {steps.length}
                  </StepBadgeText>
                  <StepBadge>
                    <StepBadgeLabel>
                      {steps[currentStep]?.stepName ||
                        steps[currentStep]?.title}
                    </StepBadgeLabel>
                  </StepBadge>
                </StepIndicatorContainer>
              </Box>
            )}
            <Content key={steps[currentStep]?.id}>
              {typeof steps[currentStep]?.content === "function"
                ? steps[currentStep]?.content()
                : steps[currentStep]?.content}
            </Content>
            <FooterSection>
              {showValidationError && validationError && (
                <ValidationError>{validationError}</ValidationError>
              )}
              <FooterButtons>
                <CancelButton
                  onClick={isFirstStep ? handleClose : handlePrevious}
                  skin="transparent"
                >
                  {!isFirstStep && <ArrowLeft size="1.4rem" />}
                  {isFirstStep ? "Cancel" : "Back"}
                </CancelButton>
                <NextButton
                  skin="primary"
                  disabled={
                    isValidating ||
                    (canProceed ? !(canProceed(currentStep) as boolean) : false)
                  }
                  onClick={handleNext}
                >
                  {isValidating ? (
                    <Box gap="0.8rem" align="center">
                      <LoadingSpinner size="1.6rem" />
                      <span>Validating...</span>
                    </Box>
                  ) : isLastStep ? (
                    completeButtonText
                  ) : (
                    "Next"
                  )}
                </NextButton>
              </FooterButtons>
            </FooterSection>
          </NavigationContext.Provider>
        </StyledContent>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
