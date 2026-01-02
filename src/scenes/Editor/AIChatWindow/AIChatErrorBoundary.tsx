import React, { Component, type ReactNode } from "react"
import styled from "styled-components"
import { WarningCircleIcon, ArrowClockwiseIcon } from "@phosphor-icons/react"
import { Text, Button } from "../../../components"
import { color } from "../../../utils"

type Props = Readonly<{
  children: ReactNode
  onReset?: () => void
}>

type State = {
  hasError: boolean
  error: Error | null
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  width: 100%;
  height: 100%;
  padding: 2rem;
  background: ${color("chatBackground")};
  border-left: 0.2rem ${color("backgroundDarker")} solid;
`

const IconWrapper = styled.div`
  color: ${color("red")};
  margin-bottom: 1rem;
`

const ErrorTextLine = styled(Text)`
  margin-top: 0.5rem;
`

const RetryButton = styled(Button)`
  margin-top: 1.5rem;
  gap: 0.5rem;
`

export class AIChatErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("AIChatWindow error:", error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
    this.props.onReset?.()
  }

  render() {
    if (this.state.hasError) {
      return (
        <Wrapper>
          <IconWrapper>
            <WarningCircleIcon size={48} weight="light" />
          </IconWrapper>
          <Text color="foreground">Something went wrong</Text>
          {this.state.error && (
            <ErrorTextLine color="gray2" size="sm">
              {this.state.error.message}
            </ErrorTextLine>
          )}
          <RetryButton skin="secondary" onClick={this.handleRetry}>
            <ArrowClockwiseIcon size={16} />
            Try again
          </RetryButton>
        </Wrapper>
      )
    }

    return this.props.children
  }
}
