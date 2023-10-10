import React from "react"
import { FileCheckStatus as FileStatusType } from "../../../utils"
import { Badge } from "@questdb/react-components"
import { BadgeType, ProcessedFile } from "./types"
import { Box } from "../../../components/Box"
import styled from "styled-components"
import { CheckboxCircle } from "@styled-icons/remix-fill"

const CheckboxCircleIcon = styled(CheckboxCircle)`
  color: ${({ theme }) => theme.color.green};
`

const mapStatusToLabel = (
  file: ProcessedFile,
):
  | {
      label: string
      type: BadgeType
      icon?: React.ReactNode
    }
  | undefined => {
  if (!file.isUploading && file.uploaded && file.uploadResult) {
    return {
      label: `Imported ${file.uploadResult.rowsImported.toLocaleString()} row${
        file.uploadResult.rowsImported > 1 ||
        file.uploadResult.rowsImported === 0
          ? "s"
          : ""
      }`,
      type: BadgeType.SUCCESS,
      icon: <CheckboxCircleIcon size="16px" />,
    }
  }

  if (file.error) {
    return {
      label: "Upload error",
      type: BadgeType.ERROR,
    }
  }

  if (file.isUploading) {
    return {
      label: `Uploading: ${file.uploadProgress.toFixed(2)}%`,
      type: BadgeType.WARNING,
    }
  }

  switch (file.status) {
    case FileStatusType.EXISTS:
      return {
        label: "Table already exists",
        type: BadgeType.WARNING,
      }
      break
    case FileStatusType.RESERVED_NAME:
      return {
        label: "Reserved table name",
        type: BadgeType.ERROR,
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
    <Box gap="1rem" align="flex-start" flexDirection="column">
      <Badge type={mappedStatus.type}>
        <Box gap="0.5rem">
          {mappedStatus.icon} {mappedStatus.label}
        </Box>
      </Badge>
    </Box>
  ) : (
    <></>
  )
}
