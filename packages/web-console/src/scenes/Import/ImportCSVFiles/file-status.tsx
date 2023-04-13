import React from "react"
import { FileCheckStatus as FileStatusType } from "../../../utils"
import { Badge } from "@questdb/react-components"
import { BadgeType, ProcessedFile } from "./types"
import { Box } from "../../../components/Box"
import { Text } from "../../../components/Text"

const mapStatusToLabel = (
  file: ProcessedFile,
): { label: string; type: BadgeType; description?: string } | undefined => {
  if (file.uploaded) {
    return {
      label: "Uploaded",
      type: BadgeType.SUCCESS,
    }
  }

  if (file.error) {
    return {
      label: "Upload error",
      type: BadgeType.ERROR,
      description: file.error,
    }
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
    <Box gap="1rem" align="flex-end" flexDirection="column">
      <Badge type={mappedStatus.type}>{mappedStatus.label}</Badge>
      {mappedStatus.description && (
        <Text color="red" size="sm">
          {mappedStatus.description}
        </Text>
      )}
    </Box>
  ) : (
    <></>
  )
}
