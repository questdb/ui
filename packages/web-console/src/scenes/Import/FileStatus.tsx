import React, { useState } from "react"
import { FileCheckStatus as FileStatusType, CSVUploadResult } from "../../utils"
import { Badge } from "@questdb/react-components"
import { Box } from "../../components/Box"
import styled from "styled-components"
import { ChevronDown } from "@styled-icons/boxicons-solid"
import { Error as ErrorIcon } from "@styled-icons/boxicons-regular"
import { CheckboxCircle } from "@styled-icons/remix-fill"
import { Text } from "../../components/Text"
import { ColorShape } from "../../types/styled"
import { ProcessedFile } from "./ImportCSVFiles/types"
import { ProcessedParquet } from "./ImportParquet/types"

export enum BadgeType {
  SUCCESS = "success",
  INFO = "info",
  WARNING = "warning",
  ERROR = "error",
}

const CheckboxCircleIcon = styled(CheckboxCircle)`
  color: ${({ theme }) => theme.color.green};
`

const ChevronIcon = styled(ChevronDown)<{ $expanded?: boolean; $color?: keyof ColorShape }>`
  transform: rotate(${({ $expanded }) => $expanded ? "180deg" : "0deg"});
  cursor: pointer;
  position: relative;
  z-index: 1;
  color: ${({ $color, theme }) => theme.color[$color ?? "gray2"]};
`

const ExclamationCircleIcon = styled(ErrorIcon)`
  color: ${({ theme }) => theme.color.red};
`

const StyledBadge = styled(Badge)`
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 3rem;
  height: unset;
`

const StyledBox = styled(Box)`
  gap: 0.5rem;
  white-space: nowrap;
  height: 3rem;
`

const FileTextBox = styled(Box)`
  padding: 0.5rem 0;
  text-align: left;
  width: 350px;
`

const mapStatusToLabel = (
  file: ProcessedFile | ProcessedParquet,
):
  | {
      label: string
      type: BadgeType
      icon?: React.ReactNode
    }
  | undefined => {
  // For Parquet files
  if ('file_name' in file) {
    if (file.isUploading) {
      return {
        label: "Uploading...",
        type: BadgeType.WARNING,
      }
    }
    if (file.uploaded) {
      return {
        label: "Imported",
        type: BadgeType.SUCCESS,
        icon: <CheckboxCircleIcon size="16px" />,
      }
    }
    if (file.error) {
      return {
        label: "Upload error",
        type: BadgeType.ERROR,
        icon: <ExclamationCircleIcon size="16px" />,
      }
    }
    if (file.cancelled) {
      return {
        label: "Cancelled",
        type: BadgeType.ERROR,
        icon: <ExclamationCircleIcon size="16px" />,
      }
    }
    return {
      label: "Ready to upload",
      type: BadgeType.SUCCESS,
      icon: <CheckboxCircleIcon size="16px" />,
    }
  }
  // For CSV files
  else if (!file.isUploading && file.uploaded && file.uploadResult) {
    let label = "Imported"
    const csvResult = file.uploadResult as CSVUploadResult
    label += ` ${csvResult.rowsImported.toLocaleString()} row${
      csvResult.rowsImported > 1 ||
      csvResult.rowsImported === 0
        ? "s"
        : ""
    }`
    return {
      label,
      type: BadgeType.SUCCESS,
      icon: <CheckboxCircleIcon size="16px" />,
    }
  }

  if (file.error) {
    return {
      label: "Upload error",
      type: BadgeType.ERROR,
      icon: <ExclamationCircleIcon size="16px" />,
    }
  }

  if (file.isUploading) {
    return {
      label: `Uploading: ${(file.uploadProgress || 0).toFixed(2)}%`,
      type: BadgeType.WARNING,
    }
  }

  if ('status' in file) {
    switch (file.status) {
    case FileStatusType.EXISTS:
      return {
        label: "Table already exists",
        type: BadgeType.WARNING,
      }
    case FileStatusType.RESERVED_NAME:
      return {
        label: "Reserved table name",
        type: BadgeType.ERROR,
      }
    case FileStatusType.DOES_NOT_EXIST:
      return {
        label: "Ready to upload",
        type: BadgeType.SUCCESS,
      }
    }
  }
}

const mapStatusToColor = (type: BadgeType): keyof ColorShape => {
  switch (type) {
    case BadgeType.SUCCESS:
      return "green"
    case BadgeType.ERROR:
      return "red"
    case BadgeType.WARNING:
      return "orange"
    case BadgeType.INFO:
      return "cyan"
    default:
      return "gray2"
  }
}

export const FileStatus = ({ file }: { file: ProcessedFile | ProcessedParquet }) => {
  const [expanded, setExpanded] = useState(false)
  const mappedStatus = mapStatusToLabel(file)
  const statusDetails = file.error

  if (!mappedStatus) {
    return null
  }

  return (
    <Box gap="1rem" align="flex-start" flexDirection="column" data-hook="import-file-status">
      <StyledBadge type={mappedStatus.type}>
        <StyledBox>
          {mappedStatus.icon} {mappedStatus.label}
          {statusDetails && <ChevronIcon size="16px" $expanded={expanded} onClick={() => setExpanded(!expanded)} $color={mapStatusToColor(mappedStatus.type)} />}
        </StyledBox>
        {expanded && statusDetails && (
          <FileTextBox flexDirection="column" gap="1rem" align="flex-start">
            <Text color="red" size="sm">
              {statusDetails}
            </Text>
          </FileTextBox>
        )}
      </StyledBadge>
    </Box>
  )
}
