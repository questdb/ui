import React from "react"
import { FileCheckStatus as FileStatusType } from "../../../utils"
import { Badge } from "@questdb/react-components"
import { BadgeType, ProcessedFile } from "./types"

const mapStatusToLabel = (
  file: ProcessedFile,
): { label: string; type: BadgeType } | undefined => {
  if (file.uploaded) {
    return {
      label: "Uploaded",
      type: BadgeType.SUCCESS,
    }
  }

  if (!file.status) {
    return undefined
  }

  switch (file.status) {
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

export const FileStatus = ({ file }: { file: ProcessedFile }) => {
  const mappedStatus = mapStatusToLabel(file)
  return mappedStatus ? (
    <Badge type={mappedStatus.type}>{mappedStatus.label}</Badge>
  ) : (
    <></>
  )
}
