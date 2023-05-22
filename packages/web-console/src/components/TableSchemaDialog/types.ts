export type Action = "add" | "import"

export type SchemaColumn = {
  name: string
  type: string
  pattern: string | undefined
  precision: string | undefined
}

export type SchemaFormValues = {
  name: string
  schemaColumns: SchemaColumn[]
  partitionBy: string
  timestamp: string
  walEnabled: string | undefined
}
