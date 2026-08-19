import React from "react"
import { Information } from "../icons"
import { Button, Tooltip } from "../../components"

export const DocsLink = ({
  url,
  text,
  tooltipText = "Documentation",
}: {
  url: string
  text?: string
  tooltipText?: string
}) => (
  <Tooltip placement="bottom" content={tooltipText}>
    <a href={url} target="_blank" rel="noopener noreferrer">
      <Button variant="ghost" type="button">
        <Information size="14" />
        {text && <span>{text}</span>}
      </Button>
    </a>
  </Tooltip>
)
