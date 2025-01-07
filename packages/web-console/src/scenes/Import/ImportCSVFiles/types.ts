import { UploadResult, UploadModeSettings } from "utils"
import { SchemaColumn } from "../../../components/TableSchemaDialog/types"

export type ProcessedFile = {
  id: string
  fileObject: File
  status: string
  table_name: string
  settings: UploadModeSettings
  schema: SchemaColumn[]
  partitionBy: string
  timestamp: string
  ttlValue: number
  ttlUnit: string
  isUploading: boolean
  uploaded: boolean
  uploadResult?: UploadResult
  uploadProgress: number
  error?: string
  exists: boolean
}

export type WriteMode = "append" | "overwrite"

// TODO: Refactor @questdb/react-components/Badge to ditch enum as prop value
export enum BadgeType {
  SUCCESS = "success",
  INFO = "info",
  WARNING = "warning",
  ERROR = "error",
}
