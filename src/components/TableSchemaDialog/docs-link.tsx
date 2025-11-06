import React from "react"
import { Button } from "@questdb/react-components"
import { Information } from "@styled-icons/remix-line"
import { PopperHover } from "../../components/PopperHover"
import { Tooltip } from "../Tooltip"

export const DocsLink = ({
  url,
  text,
  tooltipText = "Documentation",
}: {
  url: string
  text?: string
  tooltipText?: string
}) => (
  <PopperHover
    placement="bottom"
    trigger={
      <a href={url} target="_blank" rel="noopener noreferrer">
        <Button skin="transparent" type="button">
          <Information size="14" />
          {text && <span>{text}</span>}
        </Button>
      </a>
    }
  >
    <Tooltip>{tooltipText}</Tooltip>
  </PopperHover>
)
