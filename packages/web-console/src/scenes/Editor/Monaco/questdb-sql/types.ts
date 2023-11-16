export enum CompletionItemKind {
  Function = 1,
  Class = 5,
  Operator = 11,
  Keyword = 17,
}

export type Column = {
  table_name: string
  column_name: string
  column_type: string
}
