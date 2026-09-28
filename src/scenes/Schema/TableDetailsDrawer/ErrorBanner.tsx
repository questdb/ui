import React from "react"
import styled from "styled-components"
import { Button } from "../../../components"
import { ErrorBanner as BaseErrorBanner } from "../../../components/ErrorBanner"
import { DocumentationLink } from "./DocumentationLink"
import { SchemaAIButton } from "./SchemaAIButton"

type Props = {
  title: string
  description?: string
  onAskAI?: () => void
  docsUrl?: string
  showResumeButton?: boolean
  onResume?: () => void
}

const ResumeButton = styled(Button).attrs({ variant: "gradient" })``

export const ErrorBanner = ({
  title,
  description,
  onAskAI,
  docsUrl,
  showResumeButton,
  onResume,
}: Props) => {
  const hasActions = Boolean(
    onAskAI || docsUrl || (showResumeButton && onResume),
  )

  return (
    <BaseErrorBanner
      title={title}
      description={description}
      data-hook="table-details-error"
      actions={
        hasActions ? (
          <>
            {showResumeButton && onResume && (
              <ResumeButton
                variant="gradient"
                onClick={onResume}
                data-hook="table-details-resume-wal-button"
              >
                Resume WAL
              </ResumeButton>
            )}
            {onAskAI && (
              <SchemaAIButton
                onClick={onAskAI}
                data-hook="table-details-error-ask-ai"
              >
                Ask AI
              </SchemaAIButton>
            )}
            {docsUrl && (
              <DocumentationLink
                href={docsUrl}
                data-hook="table-details-error-docs-link"
              >
                View explanation in docs
              </DocumentationLink>
            )}
          </>
        ) : undefined
      }
    />
  )
}
