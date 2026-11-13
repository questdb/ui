import React from "react"
import styled from "styled-components"
import { LoadingSpinner } from "../../components/LoadingSpinner"
import { Text } from "../../components/Text"

const Root = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.2rem;
  width: 100%;
  height: 100vh;
  background: ${({ theme }) => theme.color.surfaceBase};
`

// Stands in for the console while a first-time visitor's example dashboard is
// fetched (showcase deployments only).
export const ExampleDashboardLoading = ({ title }: { title: string }) => (
  <Root role="status" aria-live="polite" data-hook="example-dashboard-loading">
    <LoadingSpinner size="3.2rem" />
    <Text color="contentSecondary">Loading {title}…</Text>
  </Root>
)
