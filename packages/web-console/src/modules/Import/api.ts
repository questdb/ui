import { SchemaRequest } from "./SchemaEditor/types"

export const MOCK__getSchemaRequest = (): SchemaRequest => {
  return {
    columns: [
      {
        file_column_name: "source_column",
        file_column_index: 0,
        column_type: "TIMESTAMP",
        table_column_name: "destination_column",
        formats: [
          {
            pattern: "yyyy-MM-dd'T'HH:mm:ss*SSSZZZZ",
            locale: null,
            utf8: false,
          },
        ],
      },
    ],
    formats: {
      TIMESTAMP: [
        {
          pattern: "yyyy-MM-dd'T'HH:mm:ss*SSSZZZZ",
          locale: null,
          utf8: false,
        },
        {
          pattern: "yyyy-MM-dd'T'HH:mm:ss*SSSZZZZ",
          locale: null,
          utf8: false,
        },
      ],
    },
  }
}
