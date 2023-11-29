export type InformationSchemaColumn = {
  table_name: string
  ordinal_position: number
  column_name: string
  data_type: string
}

export enum CompletionItemPriority {
  High = "1",
  MediumHigh = "2",
  Medium = "3",
  MediumLow = "4",
  Low = "5",
}
