import { CSVUploadResult, UploadModeSettings } from "utils"
import { SchemaColumn } from "../../../components/TableSchemaDialog/types"

export type ProcessedCSV = {
  id: string
  fileObject: File
  status: string
  isUploading: boolean
  uploaded: boolean
  uploadProgress: number
  error?: string
  table_name: string
  table_owner: string
  settings: UploadModeSettings
  schema: SchemaColumn[]
  partitionBy: string
  timestamp: string
  ttlValue: number
  ttlUnit: string
  uploadResult?: CSVUploadResult
  exists: boolean
}
