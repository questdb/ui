import { UploadResult, UploadModeSettings } from "utils"

export type SchemaColumn = {
  name: string
  type: string
  pattern: string | undefined
  precision: string | undefined
}

export type ProcessedFile = {
  fileObject: File
  status: string
  table_name: string
  settings: UploadModeSettings
  schema: SchemaColumn[]
  partitionBy: string
  timestamp: string
  isUploading: boolean
  uploaded: boolean
  uploadResult?: UploadResult
  uploadProgress: number
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
