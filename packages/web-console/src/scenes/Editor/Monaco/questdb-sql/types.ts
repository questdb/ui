export enum CompletionItemKind {
  Function = 1,
  Class = 5,
  Operator = 11,
  Keyword = 17,
}

export type InformationSchemaColumn = {
  table_name: string
  ordinal_position: number
  column_name: string
  data_type: string
}
