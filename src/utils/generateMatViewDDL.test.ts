import { describe, it, expect } from "vitest"
import { generateMatViewDDL } from "./generateMatViewDDL"

describe("generateMatViewDDL", () => {
  it("handles a simple trades table (DAY partition, DOUBLE price/amount)", () => {
    const ddl = `CREATE TABLE 'trades' (
      symbol SYMBOL,
      side SYMBOL,
      price DOUBLE,
      amount DOUBLE,
      timestamp TIMESTAMP
    ) timestamp(timestamp) PARTITION BY DAY;`

    const result = generateMatViewDDL(ddl)
    expect(result).toMatch(/CREATE MATERIALIZED VIEW/i)
    expect(result).toMatch(/\btrades_1h\b/)
    expect(result).toMatch(/REFRESH IMMEDIATE/i)
    expect(result).not.toMatch(/REFRESH EVERY/i)
    expect(result).toMatch(/SAMPLE BY 1h/i)
    expect(result).toMatch(/PARTITION BY MONTH/i)
    expect(result).toMatch(/last\(\s*price\s*\)\s+AS\s+last_price/i)
    expect(result).toMatch(/sum\(\s*amount\s*\)\s+AS\s+sum_amount/i)
  })

  it("handles HOUR partition → 5m sample and array types excluded", () => {
    const ddl = `CREATE TABLE 'market_data' (
      timestamp TIMESTAMP,
      symbol SYMBOL,
      bids DOUBLE[][],
      asks DOUBLE[][]
    ) timestamp(timestamp) PARTITION BY HOUR TTL 3 DAYS;`

    const result = generateMatViewDDL(ddl)
    expect(result).toMatch(/SAMPLE BY 5m/i)
    expect(result).toMatch(/PARTITION BY MONTH/i)
    // Source TTL 3 DAYS is below MONTH partition unit → floored to 1M, bumped → 1 YEARS.
    expect(result).toMatch(/TTL\s+1\s+YEAR\b/i)
    expect(result).not.toMatch(/bids/i)
    expect(result).not.toMatch(/asks/i)
  })

  it("handles TIMESTAMP_NS designated timestamp + UUID + DEDUP source", () => {
    const ddl = `CREATE TABLE 'fx_trades' (
      timestamp TIMESTAMP_NS,
      symbol SYMBOL,
      ecn SYMBOL,
      trade_id UUID,
      side SYMBOL,
      passive BOOLEAN,
      price DOUBLE,
      quantity DOUBLE,
      counterparty SYMBOL,
      order_id UUID
    ) timestamp(timestamp) PARTITION BY HOUR TTL 1 MONTH
    DEDUP UPSERT KEYS(timestamp, trade_id);`

    const result = generateMatViewDDL(ddl)
    // Designated TIMESTAMP_NS passes through (no last() wrap).
    expect(result).toMatch(/\btimestamp\b/i)
    expect(result).not.toMatch(/last\(\s*timestamp\s*\)/i)
    expect(result).toMatch(/SAMPLE BY 5m/i)
    // UUIDs go through last() like any other value type.
    expect(result).toMatch(/last\(\s*trade_id\s*\)\s+AS\s+last_trade_id/i)
    expect(result).toMatch(/last\(\s*order_id\s*\)\s+AS\s+last_order_id/i)
    expect(result).toMatch(/last\(\s*price\s*\)/i)
    expect(result).toMatch(/sum\(\s*quantity\s*\)/i)
    // Source TTL 1 MONTH → next TTL-ladder rung is 1 YEAR.
    expect(result).toMatch(/TTL\s+1\s+YEAR\b/i)
  })

  it("handles array-only table gracefully (only timestamp + array)", () => {
    const ddl = `CREATE TABLE 'myarray' (
      timestamp TIMESTAMP,
      myarr DOUBLE[][]
    ) timestamp(timestamp) PARTITION BY DAY;`

    // Only the designated timestamp survives — empty SELECT body is degenerate
    // but the function must still not throw.
    expect(() => generateMatViewDDL(ddl)).not.toThrow()
  })

  it("handles LONG256/SHORT/VARCHAR/BOOLEAN/DEDUP telemetry table", () => {
    const ddl = `CREATE TABLE 'telemetry_users2' (
      timestamp TIMESTAMP,
      id LONG256,
      event SHORT,
      origin SHORT,
      ip VARCHAR,
      type SYMBOL,
      country SYMBOL,
      city SYMBOL,
      organization SYMBOL,
      domain SYMBOL,
      cloud_provider BOOLEAN,
      version SYMBOL,
      os SYMBOL,
      package SYMBOL
    ) timestamp(timestamp) PARTITION BY MONTH
    DEDUP UPSERT KEYS(timestamp, id, event, origin, ip, type, country, city, organization, domain, cloud_provider, version, os, package);`

    const result = generateMatViewDDL(ddl)
    // LONG256 supports last() in QuestDB.
    expect(result).toMatch(/last\(\s*id\s*\)\s+AS\s+last_id/i)
    // MONTH source → 7d sample → YEAR partition per docs' default inference.
    expect(result).toMatch(/SAMPLE BY 7d/i)
    expect(result).toMatch(/PARTITION BY YEAR/i)
    expect(result).toMatch(/\btype\b/)
    expect(result).toMatch(/\bcountry\b/)
    expect(result).toMatch(/last\(\s*cloud_provider\s*\)/i)
    expect(result).toMatch(/last\(\s*ip\s*\)/i)
    expect(result).toMatch(/last\(\s*event\s*\)/i)
  })

  it("handles health_test_lag (ts designated, DAY, DOUBLE/SYMBOL)", () => {
    const ddl = `CREATE TABLE 'health_test_lag' (
      ts TIMESTAMP,
      value DOUBLE,
      sensor SYMBOL
    ) timestamp(ts) PARTITION BY DAY;`

    const result = generateMatViewDDL(ddl)
    expect(result).toMatch(/SAMPLE BY 1h/i)
    expect(result).toMatch(/last\(\s*value\s*\)/i)
    expect(result).toMatch(/\bsensor\b/)
    // Designated TIMESTAMP passes through (no last() wrap).
    expect(result).toMatch(/\bts\b/)
    expect(result).not.toMatch(/last\(\s*ts\s*\)/i)
  })

  it("handles core_price with price/volume naming patterns + HOUR partition", () => {
    const ddl = `CREATE TABLE 'core_price' (
      timestamp TIMESTAMP,
      symbol SYMBOL,
      ecn SYMBOL,
      bid_price DOUBLE,
      bid_volume LONG,
      ask_price DOUBLE,
      ask_volume LONG,
      reason SYMBOL,
      indicator1 DOUBLE,
      indicator2 DOUBLE
    ) timestamp(timestamp) PARTITION BY HOUR;`

    const result = generateMatViewDDL(ddl)
    expect(result).toMatch(/SAMPLE BY 5m/i)
    expect(result).toMatch(/sum\(\s*bid_volume\s*\)/i)
    expect(result).toMatch(/sum\(\s*ask_volume\s*\)/i)
    expect(result).toMatch(/last\(\s*bid_price\s*\)/i)
    expect(result).toMatch(/last\(\s*ask_price\s*\)/i)
    expect(result).toMatch(/last\(\s*indicator1\s*\)/i)
  })

  it("handles console_events with LONG256/UUID/VARCHAR + secondary TIMESTAMP", () => {
    const ddl = `CREATE TABLE 'console_events' (
      version SYMBOL,
      console_version SYMBOL,
      client_os SYMBOL,
      browser SYMBOL,
      event_name SYMBOL,
      id LONG256,
      client_id UUID,
      browser_version VARCHAR,
      payload VARCHAR,
      created TIMESTAMP,
      timestamp TIMESTAMP
    ) timestamp(timestamp) PARTITION BY DAY;`

    const result = generateMatViewDDL(ddl)
    // LONG256 and UUID both go through last().
    expect(result).toMatch(/last\(\s*id\s*\)\s+AS\s+last_id/i)
    expect(result).toMatch(/last\(\s*client_id\s*\)\s+AS\s+last_client_id/i)
    expect(result).toMatch(/last\(\s*payload\s*\)/i)
    expect(result).toMatch(/last\(\s*browser_version\s*\)/i)
    expect(result).toMatch(/last\(\s*created\s*\)/i)
    expect(result).toMatch(/\bevent_name\b/)
  })

  it("handles GEOHASH columns via last()", () => {
    const ddl = `CREATE TABLE 'sometable2' (
      timestamp TIMESTAMP,
      foo INT,
      bar BOOLEAN,
      baz GEOHASH(5c)
    ) timestamp(timestamp) PARTITION BY DAY TTL 5 DAYS;`

    const result = generateMatViewDDL(ddl)
    expect(result).toMatch(/last\(\s*baz\s*\)\s+AS\s+last_baz/i)
    expect(result).toMatch(/last\(\s*foo\s*\)/i)
    expect(result).toMatch(/last\(\s*bar\s*\)/i)
    // Source TTL 5 DAYS is below MONTH partition unit → floored to 1M, bumped → 1 YEARS.
    expect(result).toMatch(/TTL\s+1\s+YEAR\b/i)
  })

  it("handles non-designated TIMESTAMP / TIMESTAMP_NS via last()", () => {
    const ddl = `CREATE TABLE 'events' (
      ts TIMESTAMP,
      created_at TIMESTAMP,
      observed_at TIMESTAMP_NS,
      payload VARCHAR
    ) timestamp(ts) PARTITION BY DAY;`
    const result = generateMatViewDDL(ddl)
    // Designated timestamp passes through.
    expect(result).toMatch(/\bts\b/)
    expect(result).not.toMatch(/last\(\s*ts\s*\)/i)
    // Non-designated TIMESTAMP and TIMESTAMP_NS → last().
    expect(result).toMatch(/last\(\s*created_at\s*\)\s+AS\s+last_created_at/i)
    expect(result).toMatch(/last\(\s*observed_at\s*\)\s+AS\s+last_observed_at/i)
  })

  it("handles mytrades with TIMESTAMP_NS designated + STRING column", () => {
    const ddl = `CREATE TABLE 'mytrades' (
      mystring STRING,
      myts TIMESTAMP_NS,
      mysymbol SYMBOL
    ) timestamp(myts) PARTITION BY DAY;`

    const result = generateMatViewDDL(ddl)
    // Designated TIMESTAMP_NS passes through (no last() wrap).
    expect(result).toMatch(/\bmyts\b/)
    expect(result).not.toMatch(/last\(\s*myts\s*\)/i)
    expect(result).toMatch(/last\(\s*mystring\s*\)/i)
    expect(result).toMatch(/\bmysymbol\b/)
  })

  it("throws on non-CREATE-TABLE / non-CREATE-MATERIALIZED-VIEW input", () => {
    expect(() => generateMatViewDDL("SELECT 1;")).toThrow()
  })

  describe("view naming", () => {
    const ddl = `CREATE TABLE 'trades' (
      symbol SYMBOL,
      price DOUBLE,
      timestamp TIMESTAMP
    ) timestamp(timestamp) PARTITION BY DAY;`

    it("uses {table}_{interval} when name is free", () => {
      expect(generateMatViewDDL(ddl)).toMatch(/\btrades_1h\b/)
    })

    it("appends _2 when {table}_{interval} is taken", () => {
      const result = generateMatViewDDL(ddl, ["trades_1h"])
      expect(result).toMatch(/\btrades_1h_2\b/)
      expect(result).not.toMatch(/\btrades_1h\b(?!_)/)
    })

    it("appends _3 when both base and _2 are taken", () => {
      const result = generateMatViewDDL(ddl, ["trades_1h", "trades_1h_2"])
      expect(result).toMatch(/\btrades_1h_3\b/)
    })

    it("treats existing names case-insensitively", () => {
      const result = generateMatViewDDL(ddl, ["TRADES_1H"])
      expect(result).toMatch(/\btrades_1h_2\b/)
    })

    it("ignores existing names that don't collide", () => {
      const result = generateMatViewDDL(ddl, [
        "other_view",
        "trades_5m",
        "trades_1d",
      ])
      expect(result).toMatch(/\btrades_1h\b/)
    })

    it("replaces a trailing-period suffix on the source table name", () => {
      // `my_table_5m` (DAY → 1h sample) → `my_table_1h`, not `my_table_5m_1h`.
      const tableDDL = `CREATE TABLE 'my_table_5m' (
        symbol SYMBOL,
        price DOUBLE,
        timestamp TIMESTAMP
      ) timestamp(timestamp) PARTITION BY DAY;`
      const result = generateMatViewDDL(tableDDL)
      expect(result).toMatch(/\bmy_table_1h\b/)
      expect(result).not.toMatch(/\bmy_table_5m_1h\b/)
    })
  })

  describe("from materialized view source", () => {
    const mv5m = `CREATE MATERIALIZED VIEW 'btc_trades_5m' WITH BASE 'btc_trades' AS (
      SELECT
        symbol,
        last(price) AS last_price,
        sum(amount) AS sum_amount,
        timestamp
      FROM btc_trades
      SAMPLE BY 5m
    ) PARTITION BY MONTH;`

    it("bumps sample-by, re-roots FROM, rewrites aggregate args to layer-1 aliases", () => {
      const result = generateMatViewDDL(mv5m)
      expect(result).toMatch(/CREATE MATERIALIZED VIEW/i)
      expect(result).toMatch(/\bbtc_trades_30m\b/)
      expect(result).toMatch(/SAMPLE BY 30m/i)
      expect(result).toMatch(/PARTITION BY MONTH/i)
      expect(result).toMatch(/REFRESH IMMEDIATE/i)
      expect(result).toMatch(/FROM\s+btc_trades_5m/i)
      expect(result).not.toMatch(/FROM\s+btc_trades\b(?!_)/i)
      expect(result).toMatch(/WITH BASE\s+btc_trades_5m/i)
      expect(result).toMatch(/last\(\s*last_price\s*\)\s+AS\s+last_price/i)
      expect(result).toMatch(/sum\(\s*sum_amount\s*\)\s+AS\s+sum_amount/i)
      expect(result).toMatch(/\bsymbol\b/)
    })

    it("appends new period when source name has no period token", () => {
      const ddl = `CREATE MATERIALIZED VIEW 'btc_trades_mv' WITH BASE 'btc_trades' AS (
        SELECT symbol, last(price) AS last_price, timestamp
        FROM btc_trades SAMPLE BY 1m
      ) PARTITION BY WEEK;`
      const result = generateMatViewDDL(ddl)
      expect(result).toMatch(/\bbtc_trades_mv_5m\b/)
      expect(result).toMatch(/SAMPLE BY 5m/i)
    })

    it("replaces embedded period token in the middle of the name", () => {
      const ddl = `CREATE MATERIALIZED VIEW 'trades_5m_raw' WITH BASE 'trades' AS (
        SELECT symbol, last(price) AS last_price, timestamp
        FROM trades SAMPLE BY 5m
      ) PARTITION BY MONTH;`
      const result = generateMatViewDDL(ddl)
      expect(result).toMatch(/\btrades_30m_raw\b/)
      expect(result).not.toMatch(/\btrades_5m_raw_30m\b/)
    })

    it("steps off-ladder source 4h → 6h", () => {
      const ddl = `CREATE MATERIALIZED VIEW 'trades_4h' WITH BASE 'trades' AS (
        SELECT symbol, last(price) AS last_price, timestamp
        FROM trades SAMPLE BY 4h
      ) PARTITION BY YEAR;`
      const result = generateMatViewDDL(ddl)
      expect(result).toMatch(/SAMPLE BY 6h/i)
      expect(result).toMatch(/\btrades_6h\b/)
    })

    it("steps 2m → 5m, 45s → 1m for other off-ladder inputs", () => {
      const ddl2m = `CREATE MATERIALIZED VIEW 'x' AS (
        SELECT timestamp FROM base SAMPLE BY 2m
      );`
      expect(generateMatViewDDL(ddl2m)).toMatch(/SAMPLE BY 5m/i)

      const ddl45s = `CREATE MATERIALIZED VIEW 'x' AS (
        SELECT timestamp FROM base SAMPLE BY 45s
      );`
      expect(generateMatViewDDL(ddl45s)).toMatch(/SAMPLE BY 1m/i)
    })

    it("caps at 1y when source is 1M", () => {
      const ddl = `CREATE MATERIALIZED VIEW 'yearly_1M' AS (
        SELECT timestamp FROM base SAMPLE BY 1M
      ) PARTITION BY YEAR;`
      const result = generateMatViewDDL(ddl)
      // QuestDB rejects `1Y` (uppercase) — pin the casing explicitly.
      expect(result).toContain("SAMPLE BY 1y")
      expect(result).not.toContain("SAMPLE BY 1Y")
      expect(result).toMatch(/\byearly_1y\b/)
      expect(result).toMatch(/PARTITION BY YEAR/i)
    })

    it("steps Ny → (N+1)y above the ladder cap", () => {
      const ddl1y = `CREATE MATERIALIZED VIEW 'long_1y' AS (
        SELECT timestamp FROM base SAMPLE BY 1y
      ) PARTITION BY YEAR;`
      expect(generateMatViewDDL(ddl1y)).toMatch(/SAMPLE BY 2y/i)

      const ddl3y = `CREATE MATERIALIZED VIEW 'long_3y' AS (
        SELECT timestamp FROM base SAMPLE BY 3y
      ) PARTITION BY YEAR;`
      const result3y = generateMatViewDDL(ddl3y)
      expect(result3y).toMatch(/SAMPLE BY 4y/i)
      expect(result3y).toMatch(/\blong_4y\b/)
    })

    it("steps non-year units past the cap to the smallest Ny greater than the source", () => {
      const ddl400d = `CREATE MATERIALIZED VIEW 'big_400d' AS (
        SELECT timestamp FROM base SAMPLE BY 400d
      ) PARTITION BY YEAR;`
      expect(generateMatViewDDL(ddl400d)).toMatch(/SAMPLE BY 2y/i)

      const ddl2000d = `CREATE MATERIALIZED VIEW 'big_2000d' AS (
        SELECT timestamp FROM base SAMPLE BY 2000d
      ) PARTITION BY YEAR;`
      expect(generateMatViewDDL(ddl2000d)).toMatch(/SAMPLE BY 6y/i)
    })

    it("strips WHERE — source mat view already applied it at layer 1", () => {
      const ddl = `CREATE MATERIALIZED VIEW 'trades_5m' WITH BASE 'trades' AS (
        SELECT symbol, last(price) AS last_price, timestamp
        FROM trades
        WHERE symbol = 'BTC-USD' AND amount > 100
        SAMPLE BY 5m
      ) PARTITION BY MONTH;`
      const result = generateMatViewDDL(ddl)
      expect(result).not.toMatch(/\bWHERE\b/i)
      expect(result).not.toMatch(/BTC-USD/)
      expect(result).not.toMatch(/amount/)
    })

    it("strips GROUP BY — references base-table columns not in the chain", () => {
      const ddl = `CREATE MATERIALIZED VIEW 'trades_5m' WITH BASE 'trades' AS (
        SELECT symbol, last(price) AS last_price, timestamp
        FROM trades
        SAMPLE BY 5m
        GROUP BY symbol, side, timestamp
      ) PARTITION BY MONTH;`
      const result = generateMatViewDDL(ddl)
      expect(result).not.toMatch(/GROUP\s+BY/i)
      expect(result).not.toMatch(/\bside\b/)
    })

    it("strips LATEST ON — references base-table columns not in the chain", () => {
      const ddl = `CREATE MATERIALIZED VIEW 'trades_5m' WITH BASE 'trades' AS (
        SELECT symbol, last(price) AS last_price, timestamp
        FROM trades
        SAMPLE BY 5m
        LATEST ON ts PARTITION BY symbol
      ) PARTITION BY MONTH;`
      const result = generateMatViewDDL(ddl)
      expect(result).not.toMatch(/LATEST\s+ON/i)
    })

    it("preserves SAMPLE BY ALIGN TO option on the clause", () => {
      // FILL isn't supported in mat views per docs, so we only test ALIGN TO.
      const ddl = `CREATE MATERIALIZED VIEW 'trades_5m' WITH BASE 'trades' AS (
        SELECT symbol, last(price) AS last_price, timestamp
        FROM trades
        SAMPLE BY 5m ALIGN TO CALENDAR
      ) PARTITION BY MONTH;`
      const result = generateMatViewDDL(ddl)
      expect(result).toMatch(/SAMPLE BY 30m/i)
      expect(result).toMatch(/ALIGN TO CALENDAR/i)
    })

    it("throws when source matview has no SAMPLE BY", () => {
      const ddl = `CREATE MATERIALIZED VIEW 'no_sample' AS (
        SELECT symbol, last(price) AS last_price, timestamp FROM trades
      ) PARTITION BY MONTH;`
      expect(() => generateMatViewDDL(ddl)).toThrow(/SAMPLE BY/i)
    })

    it("avoids collisions via existingNames", () => {
      const result = generateMatViewDDL(
        `CREATE MATERIALIZED VIEW 'btc_trades_5m' AS (
          SELECT timestamp FROM btc_trades SAMPLE BY 5m
        ) PARTITION BY MONTH;`,
        ["btc_trades_30m"],
      )
      expect(result).toMatch(/\bbtc_trades_30m_2\b/)
    })

    it("preserves REFRESH EVERY 1m DEFERRED START '…' verbatim", () => {
      const ddl = `CREATE MATERIALIZED VIEW 'bbo_1s' WITH BASE 'market_data' REFRESH EVERY 1m DEFERRED START '2025-06-01T00:00:00.000000Z' AS (
        SELECT timestamp, symbol, last(bid) AS bid FROM market_data SAMPLE BY 1s
      ) PARTITION BY DAY;`
      const result = generateMatViewDDL(ddl)
      expect(result).toMatch(/REFRESH\s+EVERY\s+1m/i)
      expect(result).toMatch(/DEFERRED/i)
      expect(result).toMatch(/START\s+'2025-06-01T00:00:00\.000000Z'/i)
    })

    it("preserves REFRESH MANUAL", () => {
      const ddl = `CREATE MATERIALIZED VIEW 'x' REFRESH MANUAL AS (
        SELECT timestamp FROM base SAMPLE BY 5m
      ) PARTITION BY MONTH;`
      const result = generateMatViewDDL(ddl)
      expect(result).toMatch(/REFRESH\s+MANUAL/i)
    })

    it("defaults to REFRESH IMMEDIATE when source has no refresh clause", () => {
      const ddl = `CREATE MATERIALIZED VIEW 'x' AS (
        SELECT timestamp FROM base SAMPLE BY 5m
      ) PARTITION BY MONTH;`
      const result = generateMatViewDDL(ddl)
      expect(result).toMatch(/REFRESH\s+IMMEDIATE/i)
    })

    it("sets WITH BASE to the source mat view, not the source's own base", () => {
      const ddl = `CREATE MATERIALIZED VIEW 'trades_5m' WITH BASE 'trades' AS (
        SELECT symbol, last(price) AS last_price, timestamp FROM trades SAMPLE BY 5m
      ) PARTITION BY MONTH;`
      const result = generateMatViewDDL(ddl)
      expect(result).toMatch(/WITH BASE\s+trades_5m/i)
      expect(result).not.toMatch(/WITH BASE\s+trades\b(?!_)/i)
    })

    it("rewrites aggregates with array-subscript args (Alex's bbo_1s demo)", () => {
      const ddl = `CREATE MATERIALIZED VIEW 'bbo_1s' WITH BASE 'market_data' REFRESH IMMEDIATE AS (
        SELECT timestamp, symbol,
          last(bids[1][1]) AS bid,
          last(asks[1][1]) AS ask
        FROM market_data
        SAMPLE BY 1s
      ) PARTITION BY DAY;`
      const result = generateMatViewDDL(ddl)
      expect(result).toMatch(/last\(\s*bid\s*\)\s+AS\s+bid/i)
      expect(result).toMatch(/last\(\s*ask\s*\)\s+AS\s+ask/i)
      expect(result).not.toMatch(/bids\s*\[/)
      expect(result).not.toMatch(/asks\s*\[/)
    })

    it("collapses CAST expressions into bare column references at the chain level", () => {
      const ddl = `CREATE MATERIALIZED VIEW 'core_price_1s' WITH BASE 'core_price' AS (
        SELECT timestamp,
          cast(CUSIP as Symbol) Cusip,
          cast(Currency as symbol) Currency,
          last(price) AS price
        FROM core_price
        SAMPLE BY 1s
      ) PARTITION BY DAY;`
      const result = generateMatViewDDL(ddl)
      expect(result).toMatch(/\bCusip\b/)
      expect(result).toMatch(/\bCurrency\b/)
      expect(result).not.toMatch(/cast\s*\(/i)
      expect(result).toMatch(/last\(\s*price\s*\)\s+AS\s+price/i)
    })

    it("falls back to last() for implicit-alias non-decomposable avg(amount) avg", () => {
      const ddl = `CREATE MATERIALIZED VIEW 'btc_trades_mv' WITH BASE 'btc_trades' AS (
        SELECT timestamp, avg(amount) avg FROM btc_trades SAMPLE BY 1m
      ) PARTITION BY WEEK;`
      const result = generateMatViewDDL(ddl)
      expect(result).toMatch(/last\(\s*avg\s*\)\s+AS\s+avg/i)
      expect(result).not.toMatch(/avg\(\s*amount\s*\)/i)
      expect(result).not.toMatch(/avg\(\s*avg\s*\)/i)
    })

    it("preserves trailing args for self-chainable multi-arg aggregates only", () => {
      const ddl = `CREATE MATERIALIZED VIEW 'metrics_5m' AS (
        SELECT timestamp,
          string_agg(tag, ',') AS tags,
          approx_percentile(latency_ms, 0.99, 2) AS p99,
          approx_median(latency_ms, 3) AS p50
        FROM metrics SAMPLE BY 5m
      ) PARTITION BY MONTH;`
      const result = generateMatViewDDL(ddl)
      expect(result).toMatch(/string_agg\(\s*tags\s*,\s*','\s*\)\s+AS\s+tags/i)
      expect(result).toMatch(/last\(\s*p99\s*\)\s+AS\s+p99/i)
      expect(result).toMatch(/last\(\s*p50\s*\)\s+AS\s+p50/i)
      expect(result).not.toMatch(/approx_percentile\(/i)
      expect(result).not.toMatch(/approx_median\(/i)
    })

    it("rewrites count(x) AS n to sum(n) AS n (sum-of-bucket-counts = total)", () => {
      const ddl = `CREATE MATERIALIZED VIEW 'trades_5m' WITH BASE 'trades' AS (
        SELECT timestamp, symbol, count(price) AS n FROM trades SAMPLE BY 5m
      ) PARTITION BY MONTH;`
      const result = generateMatViewDDL(ddl)
      expect(result).toMatch(/sum\(\s*n\s*\)\s+AS\s+n/i)
      expect(result).not.toMatch(/count\(/i)
    })

    it("rewrites count(*) and count() to sum(alias) too", () => {
      const ddl = `CREATE MATERIALIZED VIEW 'trades_5m' WITH BASE 'trades' AS (
        SELECT timestamp, count(*) AS rows_total, count() AS rows_alt
        FROM trades SAMPLE BY 5m
      ) PARTITION BY MONTH;`
      const result = generateMatViewDDL(ddl)
      expect(result).toMatch(/sum\(\s*rows_total\s*\)\s+AS\s+rows_total/i)
      expect(result).toMatch(/sum\(\s*rows_alt\s*\)\s+AS\s+rows_alt/i)
      expect(result).not.toMatch(/count\(/i)
    })

    it("drops count(DISTINCT …) — can't decompose from a scalar", () => {
      const ddl = `CREATE MATERIALIZED VIEW 'metrics_5m' WITH BASE 'metrics' AS (
        SELECT timestamp,
          count(distinct host) AS hosts,
          sum(distinct latency_ms) AS sum_distinct_latency
        FROM metrics SAMPLE BY 5m
      ) PARTITION BY MONTH;`
      const result = generateMatViewDDL(ddl)
      // count(DISTINCT) column is gone entirely.
      expect(result).not.toMatch(/\bhosts\b/)
      expect(result).not.toMatch(/count\(/i)
      // sum(DISTINCT …) is preserved (sum is in PRESERVED_AGGREGATES).
      expect(result).toMatch(
        /sum\(\s*DISTINCT\s+sum_distinct_latency\s*\)\s+AS\s+sum_distinct_latency/i,
      )
    })

    it("replaces non-decomposable aggregates with last()", () => {
      const ddl = `CREATE MATERIALIZED VIEW 'metrics_5m' WITH BASE 'metrics' AS (
        SELECT timestamp,
          avg(latency_ms) AS latency_avg,
          stddev(latency_ms) AS latency_sd,
          approx_percentile(latency_ms, 0.99) AS latency_p99,
          last(host) AS host
        FROM metrics
        SAMPLE BY 5m
      ) PARTITION BY MONTH;`
      const result = generateMatViewDDL(ddl)
      expect(result).toMatch(/last\(\s*latency_avg\s*\)\s+AS\s+latency_avg/i)
      expect(result).toMatch(/last\(\s*latency_sd\s*\)\s+AS\s+latency_sd/i)
      expect(result).toMatch(/last\(\s*latency_p99\s*\)\s+AS\s+latency_p99/i)
      // last is in PRESERVED_AGGREGATES → host stays as last(host).
      expect(result).toMatch(/last\(\s*host\s*\)\s+AS\s+host/i)
    })

    it("drops trailing base-column args when falling back to last()", () => {
      const ddl = `CREATE MATERIALIZED VIEW 'obs_5m' WITH BASE 'obs' AS (
        SELECT timestamp, symbol,
          weighted_avg(price, weight) AS wavg,
          arg_max(price, qty) AS argmax_price,
          haversine_dist_deg(lat, lon, timestamp) AS distance
        FROM obs SAMPLE BY 5m
      ) PARTITION BY MONTH;`
      const result = generateMatViewDDL(ddl)
      // Trailing base-table columns (weight, qty, lon) are dropped with the original fn.
      expect(result).toMatch(/last\(\s*wavg\s*\)\s+AS\s+wavg/i)
      expect(result).toMatch(/last\(\s*argmax_price\s*\)\s+AS\s+argmax_price/i)
      expect(result).toMatch(/last\(\s*distance\s*\)\s+AS\s+distance/i)
      expect(result).not.toMatch(/\bweight\b/)
      expect(result).not.toMatch(/\bqty\b/)
      expect(result).not.toMatch(/\blon\b/)
    })
  })

  describe("TTL ladder", () => {
    // TTL of the new mat view = next ladder rung strictly greater than
    // max(source TTL, new partition unit). The floor avoids a degenerate
    // "TTL == partition" view that retains only a single partition.

    // Source SAMPLE BY 30s → new SAMPLE BY 1m → new PARTITION BY DAY,
    // so the visible ladder above 1d is 7d, 1M, 1y.
    const mvDay = (
      ttl: string,
    ) => `CREATE MATERIALIZED VIEW 'src_30s' WITH BASE 'base' AS (
      SELECT timestamp, last(price) AS price FROM base SAMPLE BY 30s
    ) PARTITION BY DAY TTL ${ttl};`

    // Source SAMPLE BY 5m → new SAMPLE BY 30m → new PARTITION BY MONTH,
    // used to verify the floor-at-partition behavior.
    const mvMonth = (
      ttl: string,
    ) => `CREATE MATERIALIZED VIEW 'src_5m' WITH BASE 'base' AS (
      SELECT timestamp, last(price) AS price FROM base SAMPLE BY 5m
    ) PARTITION BY MONTH TTL ${ttl};`

    it("source has no TTL → output has no TTL", () => {
      const ddl = `CREATE MATERIALIZED VIEW 'src_5m' WITH BASE 'base' AS (
        SELECT timestamp, last(price) AS price FROM base SAMPLE BY 5m
      ) PARTITION BY MONTH;`
      expect(generateMatViewDDL(ddl)).not.toMatch(/TTL\s+\d/i)
    })

    it("partition DAY, 1 DAYS → 7 DAYS", () => {
      expect(generateMatViewDDL(mvDay("1 DAYS"))).toMatch(/TTL\s+7\s+DAYS/i)
    })

    it("partition DAY, 1 WEEKS (7d) → 1 MONTHS", () => {
      expect(generateMatViewDDL(mvDay("1 WEEKS"))).toMatch(/TTL\s+1\s+MONTH\b/i)
    })

    it("partition DAY, 3 MONTHS → 1 YEARS", () => {
      expect(generateMatViewDDL(mvDay("3 MONTHS"))).toMatch(/TTL\s+1\s+YEAR\b/i)
    })

    it("partition DAY, 1 YEARS → 2 YEARS (step in whole years above the cap)", () => {
      expect(generateMatViewDDL(mvDay("1 YEARS"))).toMatch(/TTL\s+2\s+YEARS/i)
    })

    it("partition DAY, 5 YEARS → 6 YEARS", () => {
      expect(generateMatViewDDL(mvDay("5 YEARS"))).toMatch(/TTL\s+6\s+YEARS/i)
    })

    it("partition MONTH floors sub-month source TTL: 2 HOURS → 1 YEARS", () => {
      expect(generateMatViewDDL(mvMonth("2 HOURS"))).toMatch(/TTL\s+1\s+YEAR\b/i)
    })

    it("partition MONTH floors sub-month source TTL: 7 DAYS → 1 YEARS", () => {
      expect(generateMatViewDDL(mvMonth("7 DAYS"))).toMatch(/TTL\s+1\s+YEAR\b/i)
    })

    it("partition MONTH, 3 MONTHS → 1 YEARS (source already above partition unit)", () => {
      expect(generateMatViewDDL(mvMonth("3 MONTHS"))).toMatch(
        /TTL\s+1\s+YEAR\b/i,
      )
    })

    it("partition DAY floors sub-day source TTL: 2 HOURS → 7 DAYS", () => {
      expect(generateMatViewDDL(mvDay("2 HOURS"))).toMatch(/TTL\s+7\s+DAYS/i)
    })

    it("accepts singular-unit TTL from QuestDB's SHOW CREATE output", () => {
      // Server emits TTL 1 YEAR for value=1; parser only takes plural — the
      // generator must normalise before parsing.
      const ddl = `CREATE MATERIALIZED VIEW 'src_5m' WITH BASE 'base' AS (
        SELECT timestamp, last(price) AS price FROM base SAMPLE BY 5m
      ) PARTITION BY MONTH TTL 1 YEAR;`
      expect(() => generateMatViewDDL(ddl)).not.toThrow()
      const result = generateMatViewDDL(ddl)
      expect(result).toMatch(/TTL\s+2\s+YEARS/i)
    })

    it("applies to table → mat view path too", () => {
      const ddl = `CREATE TABLE 'trades' (
        symbol SYMBOL, price DOUBLE, amount DOUBLE, timestamp TIMESTAMP
      ) timestamp(timestamp) PARTITION BY DAY TTL 1 YEARS;`
      expect(generateMatViewDDL(ddl)).toMatch(/TTL\s+2\s+YEARS/i)
    })

    it("emits singular time units for value 1, plural otherwise (matches SHOW CREATE)", () => {
      // value 1 → singular unit (no trailing S)
      const singular = generateMatViewDDL(mvDay("1 WEEKS"))
      expect(singular).toMatch(/TTL\s+1\s+MONTH\b/i)
      expect(singular).not.toMatch(/TTL\s+1\s+MONTHS\b/i)
      // value > 1 → plural unit stays plural
      expect(generateMatViewDDL(mvDay("1 DAYS"))).toMatch(/TTL\s+7\s+DAYS\b/i)
    })
  })

  describe("STORAGE POLICY wins over TTL when source has both", () => {
    it("source has STORAGE POLICY only → matview has STORAGE POLICY, no TTL", () => {
      const ddl = `CREATE TABLE 'trades' (price DOUBLE, ts TIMESTAMP)
        timestamp(ts) PARTITION BY DAY
        STORAGE POLICY(TO PARQUET 3 DAYS);`
      const result = generateMatViewDDL(ddl)
      expect(result).not.toMatch(/\bTTL\s+\d/i)
      expect(result).toMatch(/STORAGE\s+POLICY/i)
    })

    it("source has TTL only → matview has TTL, no STORAGE POLICY", () => {
      const ddl = `CREATE TABLE 'trades' (price DOUBLE, ts TIMESTAMP)
        timestamp(ts) PARTITION BY DAY TTL 7 DAYS;`
      const result = generateMatViewDDL(ddl)
      // PARTITION BY DAY → matview PARTITION BY MONTH (1h SAMPLE BY rung).
      // Source 7 DAYS floors to 1 MONTH → bumped → 1 YEARS.
      expect(result).toMatch(/TTL\s+1\s+YEAR\b/i)
      expect(result).not.toMatch(/STORAGE\s+POLICY/i)
    })
  })

  describe("STORAGE POLICY propagation", () => {
    // QuestDB Enterprise (PartitionBy.validateTtlGranularity) requires each
    // STORAGE POLICY clause to be an integer multiple of the matview partition
    // size, and toParquet ≤ dropNative ≤ dropLocal ≤ dropRemote. The generator
    // projects every clause into the matview partition's natural unit (DAYS
    // for DAY, MONTHS for MONTH, YEARS for YEAR), preserves monotonic order,
    // and ladder-bumps the terminal clause so the matview outlives the source.
    // Behavior is edition-agnostic.
    const tableWithPolicy = (policy: string) => `CREATE TABLE 'trades' (
      symbol SYMBOL, price DOUBLE, ts TIMESTAMP
    ) timestamp(ts) PARTITION BY DAY STORAGE POLICY(${policy});`

    it("projects sub-month TO PARQUET to partition unit and ladder-bumps the terminal", () => {
      // Source PARTITION BY DAY → matview PARTITION BY MONTH (1h SAMPLE BY rung).
      // 3 DAYS rounds up to 1 MONTHS; terminal bump → next ladder rung → 1 YEARS.
      const result = generateMatViewDDL(tableWithPolicy("TO PARQUET 3 DAYS"))
      expect(result).toMatch(
        /STORAGE\s+POLICY\(\s*TO\s+PARQUET\s+1\s+YEAR\s*\)/i,
      )
    })

    it("all four clauses: each projected to MONTH partition, terminal bumped", () => {
      const result = generateMatViewDDL(
        tableWithPolicy(
          "TO PARQUET 3 DAYS, DROP NATIVE 10 DAYS, DROP LOCAL 1 MONTHS, DROP REMOTE 1 YEARS",
        ),
      )
      // 3d, 10d, 1M all round up to 1 MONTHS (≤-ordering allows equal).
      expect(result).toMatch(/TO\s+PARQUET\s+1\s+MONTH\b/i)
      expect(result).toMatch(/DROP\s+NATIVE\s+1\s+MONTH\b/i)
      expect(result).toMatch(/DROP\s+LOCAL\s+1\s+MONTH\b/i)
      // Terminal 1 YEARS (= 13 partition units after rounding) bumps to 2 YEARS.
      expect(result).toMatch(/DROP\s+REMOTE\s+2\s+YEARS/i)
    })

    it("three clauses: non-terminals projected, terminal ladder-bumped", () => {
      const result = generateMatViewDDL(
        tableWithPolicy(
          "TO PARQUET 3 DAYS, DROP NATIVE 10 DAYS, DROP LOCAL 1 MONTHS",
        ),
      )
      expect(result).toMatch(/TO\s+PARQUET\s+1\s+MONTH\b/i)
      expect(result).toMatch(/DROP\s+NATIVE\s+1\s+MONTH\b/i)
      // Terminal 1 MONTHS bumps one rung up the ladder → 1 YEARS.
      expect(result).toMatch(/DROP\s+LOCAL\s+1\s+YEAR\b/i)
    })

    it("non-terminal clauses below the matview partition are all rounded up to 1 partition", () => {
      // 3d, 10d both round up to 1 MONTHS for a MONTH-partitioned matview.
      // Verifies compliance with validateTtlGranularity for MONTH partition
      // (which rejects any hour-based value).
      const result = generateMatViewDDL(
        tableWithPolicy(
          "TO PARQUET 3 DAYS, DROP NATIVE 10 DAYS, DROP LOCAL 1 YEARS",
        ),
      )
      expect(result).toMatch(/PARTITION\s+BY\s+MONTH/i)
      expect(result).toMatch(/TO\s+PARQUET\s+1\s+MONTH\b/i)
      expect(result).toMatch(/DROP\s+NATIVE\s+1\s+MONTH\b/i)
      // Terminal 1 YEARS (13 partition units after rounding) bumps to 2 YEARS.
      expect(result).toMatch(/DROP\s+LOCAL\s+2\s+YEARS/i)
    })

    it("all-1-year clauses: stay at 1 YEARS span, terminal bumps to 2 YEARS", () => {
      // 1y rounds to 13 partition units (1y = 365d ÷ 30d ≈ 12.16 → ceil 13).
      // ≤-ordering allows the equal 13-month spans for non-terminals; terminal
      // bumps off the ladder to 2 YEARS.
      const result = generateMatViewDDL(
        tableWithPolicy(
          "TO PARQUET 1 YEARS, DROP NATIVE 1 YEARS, DROP LOCAL 1 YEARS, DROP REMOTE 1 YEARS",
        ),
      )
      expect(result).toMatch(/TO\s+PARQUET\s+13\s+MONTHS/i)
      expect(result).toMatch(/DROP\s+NATIVE\s+13\s+MONTHS/i)
      expect(result).toMatch(/DROP\s+LOCAL\s+13\s+MONTHS/i)
      expect(result).toMatch(/DROP\s+REMOTE\s+2\s+YEARS/i)
    })

    it("source with STORAGE POLICY only: TTL absent, clauses projected to partition multiples", () => {
      const ddl = `CREATE TABLE 'trades' (
        symbol SYMBOL, price DOUBLE, ts TIMESTAMP
      ) timestamp(ts) PARTITION BY DAY STORAGE POLICY(TO PARQUET 3 DAYS, DROP NATIVE 10 DAYS);`
      const result = generateMatViewDDL(ddl)
      expect(result).not.toMatch(/\bTTL\s+\d/i)
      expect(result).toMatch(/TO\s+PARQUET\s+1\s+MONTH\b/i)
      // DROP NATIVE is the terminal clause; 1 MONTHS bumps to 1 YEARS.
      expect(result).toMatch(/DROP\s+NATIVE\s+1\s+YEAR\b/i)
    })

    it("source materialized view with STORAGE POLICY propagates to derived matview", () => {
      const ddl = `CREATE MATERIALIZED VIEW 'src_5m' WITH BASE 'base' AS (
        SELECT timestamp, last(price) AS price FROM base SAMPLE BY 5m
      ) PARTITION BY MONTH STORAGE POLICY(TO PARQUET 7 DAYS, DROP NATIVE 14 DAYS);`
      const result = generateMatViewDDL(ddl)
      // Matview partition stays MONTH (5m → 30m → MONTH). Both clauses round
      // up to 1 MONTHS; terminal bumps to 1 YEARS.
      expect(result).toMatch(/TO\s+PARQUET\s+1\s+MONTH\b/i)
      expect(result).toMatch(/DROP\s+NATIVE\s+1\s+YEAR\b/i)
    })

    it("source has no STORAGE POLICY → output has none", () => {
      const ddl = `CREATE TABLE 'trades' (
        symbol SYMBOL, price DOUBLE, ts TIMESTAMP
      ) timestamp(ts) PARTITION BY DAY;`
      expect(generateMatViewDDL(ddl)).not.toMatch(/STORAGE\s+POLICY/i)
    })

    it("user repro: PARTITION BY DAY source with mixed-unit policy projects to MONTH matview", () => {
      // Regression test for the failure: QuestDB Enterprise rejected
      // `PARTITION BY MONTH STORAGE POLICY(TO PARQUET 3 DAYS, ...)` because
      // day-based values aren't integer multiples of MONTH.
      const ddl = `CREATE TABLE 'abc' (col1 DOUBLE, ts TIMESTAMP) timestamp(ts) PARTITION BY DAY STORAGE POLICY(TO PARQUET 3 DAYS, DROP NATIVE 10 DAYS, DROP LOCAL 1 YEARS);`
      const result = generateMatViewDDL(ddl)
      expect(result).toMatch(/PARTITION\s+BY\s+MONTH/i)
      // Every clause must be a months-based value (validateTtlGranularity).
      expect(result).not.toMatch(
        /STORAGE\s+POLICY[^)]*\d+\s+(?:HOURS|DAYS|WEEKS)\b/i,
      )
    })
  })
})
