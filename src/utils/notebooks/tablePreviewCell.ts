import { createCell, type NotebookCell } from "../../store/notebook"

const SIMPLE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

const quoteTable = (name: string) =>
  SIMPLE_IDENTIFIER.test(name) ? name : `'${name.replace(/'/g, "''")}'`

// QuestDB reads a single-quoted token in ORDER BY as a string literal, not a
// column, so column names need double quotes.
const quoteColumn = (name: string) =>
  SIMPLE_IDENTIFIER.test(name) ? name : `"${name.replace(/"/g, '""')}"`

// The query behind the schema tree's "Query" action. Tables with a designated
// timestamp are read newest-first, so a 1 s refresh shows the rows arriving;
// anything else is plain `SELECT * FROM t`.
export const tablePreviewSql = (
  name: string,
  designatedTimestamp?: string,
): string =>
  designatedTimestamp
    ? `SELECT * FROM ${quoteTable(name)} ORDER BY ${quoteColumn(designatedTimestamp)} DESC`
    : `SELECT * FROM ${quoteTable(name)}`

export const buildTablePreviewCell = (
  name: string,
  designatedTimestamp?: string,
): NotebookCell => ({
  ...createCell(0, tablePreviewSql(name, designatedTimestamp)),
  name: `Latest rows of ${name}`,
  autoRefresh: "1s",
  paneView: "editor_result",
  // Fixed-value colouring only: rows by `side` (the one convention column in
  // the demo tables, harmless when a table has no such column). Rules that
  // depend on the data's range (heat scales, flashing new rows) look fine on
  // one day and wrong on another, so none of those here.
  highlightConfig: {
    identityColumns: designatedTimestamp ? [designatedTimestamp] : [],
    rules: [
      {
        id: "side-buy",
        kind: "value",
        enabled: true,
        display: "always",
        target: { kind: "column", name: "side" },
        appliesTo: "row",
        condition: { op: "eq", value: "buy" },
        color: "dataPositive",
      },
      {
        id: "side-sell",
        kind: "value",
        enabled: true,
        display: "always",
        target: { kind: "column", name: "side" },
        appliesTo: "row",
        condition: { op: "eq", value: "sell" },
        color: "dataNegative",
      },
    ],
  },
})
