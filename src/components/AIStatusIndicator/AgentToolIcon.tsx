import React from "react"
import {
  FileTextIcon,
  GlobeIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  TerminalIcon,
  WrenchIcon,
} from "@phosphor-icons/react"

type AgentToolIconProps = {
  kind: string | undefined
  color: string
}

// One glyph per ACP tool kind; anything else is a generic tool.
export const AgentToolIcon = ({ kind, color }: AgentToolIconProps) => {
  const props = { size: 14, color }
  switch (kind) {
    case "execute":
      return <TerminalIcon {...props} />
    case "read":
      return <FileTextIcon {...props} />
    case "edit":
    case "delete":
    case "move":
      return <PencilSimpleIcon {...props} />
    case "search":
      return <MagnifyingGlassIcon {...props} />
    case "fetch":
      return <GlobeIcon {...props} />
    default:
      return <WrenchIcon {...props} />
  }
}
