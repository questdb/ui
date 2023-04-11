export type SchemaColumn = {
  name: string
  type: string
  pattern?: string
}

export type ProcessedFile = {
  fileObject: File
  status?: string
  table_name?: string
  forceHeader: boolean
  overwrite: boolean
  schema?: SchemaColumn[]
}

export type WriteMode = "append" | "overwrite"

// TODO: Refactor @questdb/react-components/Badge to ditch enum as prop value
export enum BadgeType {
  SUCCESS = "success",
  INFO = "info",
  WARNING = "warning",
  ERROR = "error",
}
