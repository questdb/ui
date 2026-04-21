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
    // price matches PRICE pattern → last(price) AS last_price
    expect(result).toMatch(/last\(\s*price\s*\)\s+AS\s+last_price/i)
    // amount matches VOLUME pattern (amount) → sum(amount) AS sum_amount
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
    // Source TTL no longer propagated to the view
    expect(result).not.toMatch(/TTL/i)
    // arrays should NOT appear
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
    // Designated timestamp must survive even though TIMESTAMP_NS is excluded normally
    expect(result).toMatch(/timestamp/i)
    expect(result).toMatch(/SAMPLE BY 5m/i)
    // UUIDs dropped (high cardinality; bad group-by dim)
    expect(result).not.toMatch(/trade_id/i)
    expect(result).not.toMatch(/order_id/i)
    // price/quantity
    expect(result).toMatch(/last\(\s*price\s*\)/i)
    expect(result).toMatch(/sum\(\s*quantity\s*\)/i)
    // Source TTL no longer propagated to the view
    expect(result).not.toMatch(/TTL/i)
  })

  it("handles array-only table gracefully (only timestamp + array)", () => {
    const ddl = `CREATE TABLE 'myarray' (
      timestamp TIMESTAMP,
      myarr DOUBLE[][]
    ) timestamp(timestamp) PARTITION BY DAY;`

    // Only the designated timestamp survives — the mat view will lack a
    // SAMPLE BY bucket column content. Ensure the function at least does
    // not throw.
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
    // LONG256 excluded
    expect(result).not.toMatch(/\bid\b/i)
    // MONTH source → 7d sample → YEAR partition (docs' default inference)
    expect(result).toMatch(/SAMPLE BY 7d/i)
    expect(result).toMatch(/PARTITION BY YEAR/i)
    // Symbols kept
    expect(result).toMatch(/\btype\b/)
    expect(result).toMatch(/\bcountry\b/)
    // BOOLEAN → last()
    expect(result).toMatch(/last\(\s*cloud_provider\s*\)/i)
    // VARCHAR → last()
    expect(result).toMatch(/last\(\s*ip\s*\)/i)
    // SHORT (numeric, non-pattern) → last()
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
    expect(result).toMatch(/\bts\b/)
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
    // *_volume → sum(), *_price → last()
    expect(result).toMatch(/sum\(\s*bid_volume\s*\)/i)
    expect(result).toMatch(/sum\(\s*ask_volume\s*\)/i)
    expect(result).toMatch(/last\(\s*bid_price\s*\)/i)
    expect(result).toMatch(/last\(\s*ask_price\s*\)/i)
    // no-pattern doubles → last()
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
    // LONG256 excluded
    expect(result).not.toMatch(/\bid\b,/i)
    // UUID dropped (high cardinality)
    expect(result).not.toMatch(/client_id/i)
    // VARCHAR → last()
    expect(result).toMatch(/last\(\s*payload\s*\)/i)
    expect(result).toMatch(/last\(\s*browser_version\s*\)/i)
    // Non-designated TIMESTAMP → last()
    expect(result).toMatch(/last\(\s*created\s*\)/i)
    // Symbols kept as group-by dimensions
    expect(result).toMatch(/\bevent_name\b/)
  })

  it("handles GEOHASH columns (excluded by prefix)", () => {
    const ddl = `CREATE TABLE 'sometable2' (
      timestamp TIMESTAMP,
      emre INT,
      berk BOOLEAN,
      kaya GEOHASH(5c)
    ) timestamp(timestamp) PARTITION BY DAY TTL 5 DAYS;`

    const result = generateMatViewDDL(ddl)
    // GEOHASH excluded
    expect(result).not.toMatch(/\bkaya\b/)
    // INT numeric → last()
    expect(result).toMatch(/last\(\s*emre\s*\)/i)
    // BOOLEAN → last()
    expect(result).toMatch(/last\(\s*berk\s*\)/i)
    // Source TTL no longer propagated to the view
    expect(result).not.toMatch(/TTL/i)
  })

  it("handles mytrades with TIMESTAMP_NS designated + STRING column", () => {
    const ddl = `CREATE TABLE 'mytrades' (
      mystring STRING,
      myts TIMESTAMP_NS,
      mysymbol SYMBOL
    ) timestamp(myts) PARTITION BY DAY;`

    const result = generateMatViewDDL(ddl)
    // myts is the designated timestamp → passthrough
    expect(result).toMatch(/\bmyts\b/)
    // STRING → last()
    expect(result).toMatch(/last\(\s*mystring\s*\)/i)
    // SYMBOL kept
    expect(result).toMatch(/\bmysymbol\b/)
  })

  it("throws on non-CREATE-TABLE input", () => {
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
  })
})
