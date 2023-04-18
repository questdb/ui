import { UploadResult, UploadModeSettings } from "utils"

export type SchemaColumn = {
  name: string
  type: string
  pattern?: string
}

export type ProcessedFile = {
  fileObject: File
  status: string
  table_name: string
  settings: UploadModeSettings
  schema: SchemaColumn[]
  partitionBy: string
  timestamp: string
  uploaded: boolean
  uploadResult?: UploadResult
  error?: string
}

export type WriteMode = "append" | "overwrite"

// TODO: Refactor @questdb/react-components/Badge to ditch enum as prop value
export enum BadgeType {
  SUCCESS = "success",
  INFO = "info",
  WARNING = "warning",
  ERROR = "error",
}
