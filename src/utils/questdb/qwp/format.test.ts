import { describe, expect, it } from "vitest"
import { QWP_COLUMN_TYPE } from "@questdb/browser-client"
import {
  cellFormatter,
  columnDefinition,
  epochFormatter,
  formatDecimal,
  formatEpoch,
  formatGeohash,
  formatIPv4,
  formatLong256,
  formatUuid,
  QwpUnsupportedColumnError,
  shortestFloat32,
} from "./format"

const big = (value: string | number) => BigInt(value)

// Values QuestDB returned for the same rows over QWP and `/exec`.
describe("epoch formatting", () => {
  it.each([
    ["1704164645123456", "micros", "2024-01-02T03:04:05.123456Z"],
    ["-1", "micros", "1969-12-31T23:59:59.999999Z"],
    ["0", "micros", "1970-01-01T00:00:00.000000Z"],
    ["253402300799999999", "micros", "9999-12-31T23:59:59.999999Z"],
    ["253402300800000000", "micros", "10000-01-01T00:00:00.000000Z"],
    ["1704164645123456789", "nanos", "2024-01-02T03:04:05.123456789Z"],
    ["-2208988799999999999", "nanos", "1900-01-01T00:00:00.000000001Z"],
    ["9223372036854775807", "nanos", "2262-04-11T23:47:16.854775807Z"],
    ["1704164645123", "millis", "2024-01-02T03:04:05.123Z"],
    ["-60576249599999", "millis", "0050-06-01T00:00:00.001Z"],
    ["-62135596800000", "millis", "0001-01-01T00:00:00.000Z"],
  ] as const)("formats %s %s as %s", (value, unit, expected) => {
    expect(formatEpoch(big(value), unit)).toBe(expected)
  })

  it("prints years before 1 as QuestDB does", () => {
    // Year 0 prints as 1, and a negative year is padded by its magnitude.
    expect(formatEpoch(big("-62167219200000"), "millis")).toBe(
      "0001-01-01T00:00:00.000Z",
    )
    expect(formatEpoch(big("-62198755200000"), "millis")).toBe(
      "000-1-01-01T00:00:00.000Z",
    )
  })

  it("formats values of other days after one it cached", () => {
    const format = epochFormatter("micros")
    expect(format(big("86399999999"))).toBe("1970-01-01T23:59:59.999999Z")
    expect(format(big("86400000000"))).toBe("1970-01-02T00:00:00.000000Z")
    expect(format(big("-86400000000"))).toBe("1969-12-31T00:00:00.000000Z")
    expect(format(big("86400000001"))).toBe("1970-01-02T00:00:00.000001Z")
  })

  it("agrees with Date across the range Date covers", () => {
    const format = epochFormatter("millis")
    for (let millis = -8.64e15; millis <= 8.64e15; millis += 7.77e13 + 13_579) {
      const iso = new Date(millis).toISOString()
      if (!/^\d{4}-/.test(iso)) continue
      expect(format(BigInt(millis))).toBe(iso)
    }
  })
})

describe("FLOAT values", () => {
  it.each([
    [0.10000000149011612, 0.1],
    [1.0000000116860974e-7, 1e-7],
    [123456792, 123456790],
    [16777216, 16777216],
    [0.0010000000474974513, 0.001],
    [9999999, 9999999],
    [1, 1],
  ])("reads %d as %d", (value, expected) => {
    expect(shortestFloat32(value)).toBe(expected)
  })

  it("reads every float back as itself", () => {
    const view = new DataView(new ArrayBuffer(4))
    for (let bits = 1; bits < 0x7f800000; bits += 0x00123457) {
      view.setUint32(0, bits)
      const value = view.getFloat32(0)
      expect(Math.fround(shortestFloat32(value))).toBe(value)
    }
  })

  it("keeps negative zero", () => {
    expect(Object.is(shortestFloat32(-0), -0)).toBe(true)
  })
})

describe("value formatting", () => {
  it.each([
    [[big(1), big(0), big(0), big(0)], "0x01"],
    [[big(0), big(0), big(0), big(0)], "0x00"],
    [[big(-1), big(-1), big(-1), big(-1)], "0x" + "f".repeat(64)],
    [[big(1), big(2), big(0), big(0)], "0x020000000000000001"],
    [[big(0x123), big(0), big(0), big(0)], "0x0123"],
  ])("formats LONG256 %s", (words, expected) => {
    expect(
      formatLong256({
        words: words as [bigint, bigint, bigint, bigint],
      }),
    ).toBe(expected)
  })

  it("formats a UUID", () => {
    expect(
      formatUuid({
        high: big("1229782938533638963"),
        low: big("4919150517987661141"),
      }),
    ).toBe("11111111-2222-3333-4444-555555555555")
    expect(formatUuid({ high: big(0), low: big(1) })).toBe(
      "00000000-0000-0000-0000-000000000001",
    )
  })

  it("formats an IPv4 address from its signed value", () => {
    expect(formatIPv4(-1062731519)).toBe("192.168.1.1")
    expect(formatIPv4(1)).toBe("0.0.0.1")
    expect(formatIPv4(-1)).toBe("255.255.255.255")
  })

  it.each([
    [big(27364744), 25, "u33d8"],
    [big(26), 5, "u"],
    [big(0), 25, "00000"],
    [big(85), 7, "1010101"],
    [big(1), 7, "0000001"],
  ])("formats geohash %s of %d bits as %s", (bits, precisionBits, expected) => {
    expect(formatGeohash({ bits, precisionBits })).toBe(expected)
  })

  it.each([
    [big(123456), 3, "123.456"],
    [big(150), 2, "1.50"],
    [big(-1), 10, "-0.0000000001"],
    [big(0), 10, "0.0000000000"],
    [big(42), 0, "42"],
    [big(-1000), 3, "-1.000"],
    [big("-100000000000000000000"), 20, "-1.00000000000000000000"],
    [
      big("1234567890123456789012345678901234567890"),
      20,
      "12345678901234567890.12345678901234567890",
    ],
  ])("formats decimal %s with scale %d", (unscaled, scale, expected) => {
    expect(formatDecimal({ unscaled, scale })).toBe(expected)
  })
})

const format = (
  type: number,
  value: Parameters<ReturnType<typeof cellFormatter>>[0],
) => cellFormatter({ name: "c", type: type as never })(value)

describe("cells", () => {
  it("passes values through that JSON carries as they are", () => {
    expect(format(QWP_COLUMN_TYPE.BOOLEAN, true)).toBe(true)
    expect(format(QWP_COLUMN_TYPE.INT, null)).toBe(null)
    expect(format(QWP_COLUMN_TYPE.VARCHAR, "vc ✓")).toBe("vc ✓")
    expect(format(QWP_COLUMN_TYPE.SYMBOL, "")).toBe("")
  })

  it("sends LONG as decimal text", () => {
    expect(format(QWP_COLUMN_TYPE.LONG, big("9007199254740993"))).toBe(
      "9007199254740993",
    )
    expect(format(QWP_COLUMN_TYPE.LONG, null)).toBe(null)
  })

  it("sends NaN and infinities as null", () => {
    expect(format(QWP_COLUMN_TYPE.DOUBLE, Number.NaN)).toBe(null)
    expect(format(QWP_COLUMN_TYPE.DOUBLE, Number.NEGATIVE_INFINITY)).toBe(null)
    expect(format(QWP_COLUMN_TYPE.FLOAT, Number.POSITIVE_INFINITY)).toBe(null)
    expect(format(QWP_COLUMN_TYPE.DOUBLE, 0.30000000000000004)).toBe(
      0.30000000000000004,
    )
  })

  it("sends the zero CHAR and a null LONG256 as empty text", () => {
    expect(format(QWP_COLUMN_TYPE.CHAR, "\u0000")).toBe("")
    expect(format(QWP_COLUMN_TYPE.CHAR, "z")).toBe("z")
    expect(format(QWP_COLUMN_TYPE.LONG256, null)).toBe("")
  })

  it("sends BINARY as an empty array, as `/exec` does", () => {
    expect(format(QWP_COLUMN_TYPE.BINARY, new Uint8Array([1, 2]))).toEqual([])
    expect(format(QWP_COLUMN_TYPE.BINARY, null)).toEqual([])
  })

  it("nests arrays by their dimensions", () => {
    expect(
      format(QWP_COLUMN_TYPE.DOUBLE_ARRAY, {
        dimensions: [2, 2],
        values: [1, 2, 3, 4],
      }),
    ).toEqual([
      [1, 2],
      [3, 4],
    ])
    expect(
      format(QWP_COLUMN_TYPE.DOUBLE_ARRAY, {
        dimensions: [3],
        values: [1.5, Number.NaN, 3],
      }),
    ).toEqual([1.5, null, 3])
    expect(
      format(QWP_COLUMN_TYPE.DOUBLE_ARRAY, { dimensions: [2, 0], values: [] }),
    ).toEqual([])
    expect(format(QWP_COLUMN_TYPE.DOUBLE_ARRAY, null)).toBe(null)
    expect(
      format(QWP_COLUMN_TYPE.LONG_ARRAY, {
        dimensions: [2],
        values: [big(7), big("-9223372036854775808")],
      }),
    ).toEqual([7, null])
  })

  it("formats temporal and other text values, and their nulls", () => {
    expect(format(QWP_COLUMN_TYPE.TIMESTAMP, big("1704164645123456"))).toBe(
      "2024-01-02T03:04:05.123456Z",
    )
    expect(format(QWP_COLUMN_TYPE.DATE, null)).toBe(null)
    expect(format(QWP_COLUMN_TYPE.IPV4, null)).toBe(null)
    expect(format(QWP_COLUMN_TYPE.UUID, null)).toBe(null)
    expect(format(QWP_COLUMN_TYPE.GEOHASH, null)).toBe(null)
    expect(format(QWP_COLUMN_TYPE.DECIMAL64, null)).toBe(null)
  })

  it("rejects a column type it cannot render", () => {
    expect(() => cellFormatter({ name: "c", type: 0x7f as never })).toThrow(
      QwpUnsupportedColumnError,
    )
  })
})

describe("column definitions", () => {
  it.each([
    [{ type: QWP_COLUMN_TYPE.TIMESTAMP_NANOS }, "TIMESTAMP_NS"],
    [{ type: QWP_COLUMN_TYPE.IPV4 }, "IPv4"],
    [{ type: QWP_COLUMN_TYPE.GEOHASH, precisionBits: 25 }, "GEOHASH(5c)"],
    [{ type: QWP_COLUMN_TYPE.GEOHASH, precisionBits: 7 }, "GEOHASH(7b)"],
    [{ type: QWP_COLUMN_TYPE.DECIMAL64, scale: 3 }, "DECIMAL(18,3)"],
    [{ type: QWP_COLUMN_TYPE.DECIMAL128, scale: 10 }, "DECIMAL(38,10)"],
    [{ type: QWP_COLUMN_TYPE.DECIMAL256, scale: 20 }, "DECIMAL(76,20)"],
  ])("names %o %s", (column, type) => {
    expect(columnDefinition({ name: "c", ...column })).toEqual({
      name: "c",
      type,
    })
  })

  it("describes arrays by their dimensions and element type", () => {
    expect(
      columnDefinition({ name: "a", type: QWP_COLUMN_TYPE.DOUBLE_ARRAY }, 2),
    ).toEqual({ name: "a", type: "ARRAY", dim: 2, elemType: "DOUBLE" })
    expect(
      columnDefinition({ name: "a", type: QWP_COLUMN_TYPE.LONG_ARRAY }),
    ).toEqual({ name: "a", type: "ARRAY", dim: 1, elemType: "LONG" })
  })
})
