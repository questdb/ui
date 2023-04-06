import React from "react"
import { FileCheckStatus as FileStatusType } from "../../../utils"
import { Badge, BadgeType } from "@questdb/react-components"

const mapStatusToLabel = (
  status: FileStatusType | undefined,
): { label: string; type: BadgeType } | undefined => {
  if (!status) {
    return undefined
  }

  switch (status) {
    case FileStatusType.EXISTS:
      return {
        label: "Table already exists",
        type: BadgeType.WARNING,
      }
      break
    case FileStatusType.DOES_NOT_EXIST:
      return {
        label: "Ready to upload",
        type: BadgeType.SUCCESS,
      }
  }
}

export const FileStatus = ({ status }: { status: string | undefined }) => {
  const mappedStatus = mapStatusToLabel(status as FileStatusType)
  return mappedStatus ? (
    <Badge type={mappedStatus.type}>{mappedStatus.label}</Badge>
  ) : (
    <></>
  )
}
