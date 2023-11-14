import { SchemaRequest } from "./SchemaEditor/types"

export const MOCK__getSchemaRequest = (): SchemaRequest => {
  return {
    columns: [
      {
        file_column_name: "source_column_1",
        file_column_index: 0,
        column_type: "TIMESTAMP",
        table_column_name: "destination_column_1",
        formats: [
          {
            pattern: "yyyy-MM-dd'T'HH:mm:ss*SSSZZZZ",
            locale: null,
            utf8: false,
          },
          {
            pattern: "abcd",
            locale: null,
            utf8: false,
          },
        ],
      },
      {
        file_column_name: "source_column_2",
        file_column_index: 1,
        column_type: "DATE",
        table_column_name: "destination_column_2",
        formats: [
          {
            pattern: "yyyy-MM-dd'T'HH:mm:ss*SSSZZZZ",
            locale: null,
            utf8: false,
          },
        ],
      },
      {
        file_column_name: "source_column_3",
        file_column_index: 2,
        column_type: "GEOHASH",
        table_column_name: "destination_column_3",
        precision: "5"
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
