import { keywords } from "@questdb/sql-parser"
import {
  createCell,
  type AutoRefresh,
  type NotebookCell,
} from "../../store/notebook"

const SIMPLE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

const KEYWORDS = new Set(keywords.map((keyword) => keyword.toLowerCase()))

// QuestDB rejects SQL keywords used as bare table or column names ("table and
// column names that are SQL keywords have to be enclosed in double quotes"),
// so a name is left bare only when it is a plain identifier and no keyword.
// Double quotes work for both: a single-quoted token in ORDER BY would be read
// as a string literal, not a column.
const quoteIdentifier = (name: string) =>
  SIMPLE_IDENTIFIER.test(name) && !KEYWORDS.has(name.toLowerCase())
    ? name
    : `"${name.replace(/"/g, '""')}"`

// The table notebook refreshes on Auto: the refresh engine adapts the interval
// to how long the query takes. It is the notebook's default, not a per-cell
// override, so the cell shows no override marker.
export const TABLE_PREVIEW_AUTO_REFRESH: AutoRefresh = true

// The query behind the schema tree's "Query" action. Tables with a designated
// timestamp are read newest-first, so an Auto refresh shows the rows arriving;
// anything else is plain `SELECT * FROM t`.
export const tablePreviewSql = (
  name: string,
  designatedTimestamp?: string,
): string =>
  designatedTimestamp
    ? `SELECT * FROM ${quoteIdentifier(name)} ORDER BY ${quoteIdentifier(designatedTimestamp)} DESC`
    : `SELECT * FROM ${quoteIdentifier(name)}`

export const buildTablePreviewCell = (
  name: string,
  designatedTimestamp?: string,
): NotebookCell => ({
  ...createCell(0, tablePreviewSql(name, designatedTimestamp)),
  name: `Latest rows of ${name}`,
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
