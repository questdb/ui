import React from "react"
import { Button } from "@questdb/react-components"
import { Book } from "styled-icons/boxicons-regular"
import { PopperHover } from "../../components/PopperHover"
import { Tooltip } from "../Tooltip"

export const DocsLink = ({ url, text }: { url: string; text?: string }) => (
  <PopperHover
    placement="bottom"
    trigger={
      <a href={url} target="_blank" rel="noopener noreferrer">
        <Button skin="transparent" type="button">
          <Book size="14" />
          {text && <span>{text}</span>}
        </Button>
      </a>
    }
  >
    <Tooltip>Documentation</Tooltip>
  </PopperHover>
)
