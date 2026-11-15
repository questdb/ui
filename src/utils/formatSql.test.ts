import "../test/stubBrowserGlobals"
import { beforeEach, describe, expect, it } from "vitest"
import { formatSql, normalizeSql } from "./formatSql"
import { parseToAst, toSql, tokenize } from "@questdb/sql-parser"
import { StoreKey } from "./localStorage/types"

const QUERY =
  "select symbol, count() from trades where price > 10 group by symbol"

beforeEach(() => {
  localStorage.clear()
})

describe("formatSql", () => {
  it("keeps keyword case when the capitalize setting is off", () => {
    // Given
    localStorage.setItem(StoreKey.CAPITALIZE_KEYWORDS_ON_FORMAT, "false")

    // When
    const formatted = formatSql(QUERY)

    // Then
    expect(formatted).toBe(
      "select symbol, count()\nfrom trades\nwhere price > 10\ngroup by symbol",
    )
  })

  it("uppercases keywords and keeps identifiers when the capitalize setting is on", () => {
    // Given
    localStorage.setItem(StoreKey.CAPITALIZE_KEYWORDS_ON_FORMAT, "true")

    // When
    const formatted = formatSql(QUERY)

    // Then
    expect(formatted).toBe(
      "SELECT symbol, count()\nFROM trades\nWHERE price > 10\nGROUP BY symbol",
    )
  })

  it("lets an explicit capitalize option override the setting", () => {
    // Given
    localStorage.setItem(StoreKey.CAPITALIZE_KEYWORDS_ON_FORMAT, "true")

    // When
    const formatted = formatSql("select a from t", { capitalize: false })

    // Then
    expect(formatted).toBe("select a\nfrom t")
  })
})

describe("normalizeSql", () => {
  it("returns an empty string for empty input", () => {
    expect(normalizeSql("")).toBe("")
  })

  it("replaces a trailing semicolon with a single one after formatting", () => {
    // Given
    const sql = "  select a from t;  "

    // When
    const normalized = normalizeSql(sql)

    // Then
    expect(normalized).toBe("select a\nfrom t;")
  })

  it("omits the semicolon when asked", () => {
    // Given
    const sql = "select a from t;"

    // When
    const normalized = normalizeSql(sql, false)

    // Then
    expect(normalized).toBe("select a\nfrom t")
  })
})

// Selected server examples from questdb/sql-parser PR #42's server-queries.json.
describe("released grammar through the console formatter", () => {
  it.each([
    [
      "grouping-sets",
      "SELECT a, b, grouping_id(a, b) g, sum(v) FROM t GROUP BY CUBE(a, b)",
    ],
    [
      "dedup-skip",
      "CREATE TABLE pt (s SYMBOL INDEX, v INT, ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY DAY WAL DEDUP SKIP KEYS(ts, s)",
    ],
    [
      "literal-escape-string",
      "SELECT x, count() FROM (SELECT dateadd(E'h', 1, ts) x FROM jan) SAMPLE BY 1d",
    ],
    [
      "single-quote-unescape",
      "insert into t values ( '1st ''', '2nd ''''', '3rd ''''''' );",
    ],
    [
      "bind-variables",
      "SELECT sym, val FROM t_bv_latest WHERE sym = $1 LATEST ON ts PARTITION BY sym",
    ],
    [
      "type-syntax",
      "select '2022-03-11T22:00:30.555555Z'::timestamp at time zone 'UTC'",
    ],
    [
      "window-frames",
      "select a,b, f(c) over (partition by b order by ts GROUPS unbounded preceding) from xyz",
    ],
    [
      "sample-by-fill-align",
      "SELECT ts, percentile_cont(v, 0.25) p FROM t SAMPLE BY 1h FILL(-1)",
    ],
    [
      "create-table-options",
      "create table weather_data_historical ( sensor_time timestamp not null, sensor_day symbol, min_temperature_out float, max_temperature_out float, avg_temperature_out float, snow_height float, rain_acc_24h float, max_wind_gust_speed float ) TIMESTAMP(sensor_time)",
    ],
    [
      "mat-view-create-options",
      "CREATE MATERIALIZED VIEW mv15 AS (SELECT ts, avg(x) FROM t15 SAMPLE BY 1m) TTL 5H",
    ],
    [
      "ent-resource-groups",
      "CREATE RESOURCE GROUP analytics WITH (memory_limit = '8M', cpu_weight = 200)",
    ],
    [
      "ent-users-groups",
      "alter table trades add column value double owned by group11",
    ],
    ["array-slice-spacing", "SELECT ARRAY[1,2][1: 2], ARRAY[1,2][: 2]"],
  ])("preserves %s with both capitalization settings", (_feature, sql) => {
    // Given
    const before = parseToAst(sql)
    expect(before.errors).toEqual([])

    for (const capitalize of [false, true]) {
      localStorage.setItem(
        StoreKey.CAPITALIZE_KEYWORDS_ON_FORMAT,
        String(capitalize),
      )

      // When
      const output = formatSql(sql)
      const after = parseToAst(output)

      // Then
      expect(after.errors).toEqual([])
      expect(toSql(after.ast)).toBe(toSql(before.ast))
      expect(formatSql(output)).toBe(output)
      if (!capitalize) {
        expect(tokenize(output).tokens.map((token) => token.image)).toEqual(
          tokenize(sql).tokens.map((token) => token.image),
        )
      }
    }
  })

  it.each([false, true])(
    "preserves case-sensitive values when capitalization is %s",
    (capitalize) => {
      // Given
      localStorage.setItem(
        StoreKey.CAPITALIZE_KEYWORDS_ON_FORMAT,
        String(capitalize),
      )
      const sql = "create user u with password P@ssw0rd"

      // When
      const output = formatSql(sql)

      // Then
      expect(output).toContain("P@ssw0rd")
      expect(toSql(parseToAst(output).ast)).toBe(toSql(parseToAst(sql).ast))
    },
  )
})
