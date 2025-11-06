export type Action = "add" | "import"

export type SchemaColumn = {
  name: string
  type: string
  pattern?: string
  precision?: string
}

export type SchemaFormValues = {
  name: string
  schemaColumns: SchemaColumn[]
  partitionBy: string
  timestamp: string
  ttlValue: number
  ttlUnit: string
  walEnabled?: string
}
