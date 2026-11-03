import React, { useEffect, useRef } from "react"
import styled from "styled-components"
import { Box, Button, CenteredLayout, Text } from "."
import { CloseOutline, Refresh } from "./icons"

const Heading = styled.h1`
  margin: 0;
  font-size: 2rem;
  color: ${({ theme }) => theme.color.contentPrimary};
  outline: none;
`

const ErrorIcon = styled(CloseOutline)`
  color: ${({ theme }) => theme.color.statusDanger};
  flex-shrink: 0;
`

export const ConnectionErrorView = ({
  title = "Could not connect to QuestDB",
  error,
  status,
  pending = false,
  onRetry,
  retryLabel = "Retry connection",
  onSignIn,
  preloadedImages,
}: {
  title?: string
  error: React.ReactNode
  status?: string
  pending?: boolean
  onRetry: () => void
  retryLabel?: string
  onSignIn?: () => void
  preloadedImages?: Record<string, string>
}) => {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  return (
    <CenteredLayout preloadedImages={preloadedImages}>
      <Box flexDirection="column" gap="2rem" align="center" padding="2.4rem">
        <Heading ref={heading} tabIndex={-1}>
          {title}
        </Heading>
        <div role="alert">
          <Box align="center" gap="0.2rem">
            <ErrorIcon size="18px" aria-hidden="true" />
            {typeof error === "string" ? (
              <Text color="statusDanger" size="md">
                {error}
              </Text>
            ) : (
              error
            )}
          </Box>
        </div>
        {status && (
          <div role="status">
            <Text color="contentSecondary">{status}</Text>
          </div>
        )}
        <Box gap="1rem">
          {/* Keep focus on Retry while it runs; the handler also guards re-entry. */}
          <Button
            aria-disabled={pending}
            aria-busy={pending}
            onClick={onRetry}
            prefixIcon={<Refresh size="18px" />}
          >
            {retryLabel}
          </Button>
          {onSignIn && <Button onClick={onSignIn}>Sign in again</Button>}
        </Box>
      </Box>
    </CenteredLayout>
  )
}
