import { describe, it, expect, vi } from "vitest"
import {
  MetricType,
  MetricViewMode,
  SampleBy,
  RefreshRate,
} from "../Metrics/utils"

// Mock the buffers module to avoid React dependencies
vi.mock("../../../store/buffers", () => ({
  defaultEditorViewState: {
    cursorState: [
      { inSelectionMode: false, position: { lineNumber: 1, column: 1 } },
    ],
  },
}))

// Mock the Monaco index to avoid editor dependencies
vi.mock("./index", () => ({
  LINE_NUMBER_HARD_LIMIT: 99999,
}))

// Import after mocks
import {
  validateBufferSchema,
  sanitizeBuffer,
  DEFAULT_METRIC_COLOR,
  createBufferContentKey,
  hashBufferContent,
  findDuplicates,
} from "./importTabs"
import type { Buffer } from "../../../store/buffers"

describe("validateBufferSchema", () => {
  describe("array validation", () => {
    it("should reject non-array data", () => {
      expect(validateBufferSchema(null)).toBe("Data must be an array")
      expect(validateBufferSchema(undefined)).toBe("Data must be an array")
      expect(validateBufferSchema({})).toBe("Data must be an array")
      expect(validateBufferSchema("string")).toBe("Data must be an array")
      expect(validateBufferSchema(123)).toBe("Data must be an array")
    })

    it("should reject empty array", () => {
      expect(validateBufferSchema([])).toBe("File contains no tabs")
    })
  })

  describe("buffer item validation", () => {
    it("should reject non-object items", () => {
      expect(validateBufferSchema([null])).toBe("Item [0]: must be an object")
      expect(validateBufferSchema(["string"])).toBe(
        "Item [0]: must be an object",
      )
      expect(validateBufferSchema([123])).toBe("Item [0]: must be an object")
    })

    it("should reject missing label", () => {
      expect(
        validateBufferSchema([
          { value: "SELECT 1", position: 0, editorViewState: {} },
        ]),
      ).toBe("Item [0]: label must be a string")
    })

    it("should reject non-string label", () => {
      expect(
        validateBufferSchema([
          { label: 123, value: "SELECT 1", position: 0, editorViewState: {} },
        ]),
      ).toBe("Item [0]: label must be a string")
    })

    it("should reject missing value", () => {
      expect(
        validateBufferSchema([
          { label: "Tab 1", position: 0, editorViewState: {} },
        ]),
      ).toBe("Item [0]: value must be a string")
    })

    it("should reject non-string value", () => {
      expect(
        validateBufferSchema([
          { label: "Tab 1", value: 123, position: 0, editorViewState: {} },
        ]),
      ).toBe("Item [0]: value must be a string")
    })

    it("should reject missing position", () => {
      expect(
        validateBufferSchema([
          { label: "Tab 1", value: "SELECT 1", editorViewState: {} },
        ]),
      ).toBe("Item [0]: position must be a number")
    })

    it("should reject non-number position", () => {
      expect(
        validateBufferSchema([
          {
            label: "Tab 1",
            value: "SELECT 1",
            position: "0",
            editorViewState: {},
          },
        ]),
      ).toBe("Item [0]: position must be a number")
    })

    it("should reject tabs without editorViewState or metricsViewState", () => {
      expect(
        validateBufferSchema([
          { label: "Tab 1", value: "SELECT 1", position: 0 },
        ]),
      ).toBe("Item [0]: must have editorViewState or metricsViewState")
    })

    it("should accept tab with editorViewState", () => {
      expect(
        validateBufferSchema([
          {
            label: "Tab 1",
            value: "SELECT 1",
            position: 0,
            editorViewState: {},
          },
        ]),
      ).toBe(true)
    })

    it("should accept tab with metricsViewState", () => {
      expect(
        validateBufferSchema([
          {
            label: "Metrics",
            value: "",
            position: 0,
            metricsViewState: {},
          },
        ]),
      ).toBe(true)
    })
  })

  describe("line count limit", () => {
    it("should reject value exceeding line limit", () => {
      const hugeValue = Array(100001).fill("line").join("\n")
      const result = validateBufferSchema([
        { label: "Tab 1", value: hugeValue, position: 0, editorViewState: {} },
      ])
      expect(result).toContain("exceeds line limit")
    })

    it("should accept value within line limit", () => {
      const largeValue = Array(1000).fill("line").join("\n")
      expect(
        validateBufferSchema([
          {
            label: "Tab 1",
            value: largeValue,
            position: 0,
            editorViewState: {},
          },
        ]),
      ).toBe(true)
    })
  })

  describe("prototype pollution protection", () => {
    it("should reject __proto__ key", () => {
      const maliciousObj = Object.create(null) as Record<string, unknown>
      maliciousObj.label = "Tab 1"
      maliciousObj.value = "SELECT 1"
      maliciousObj.position = 0
      maliciousObj.editorViewState = {}
      maliciousObj.__proto__ = { malicious: true }

      expect(validateBufferSchema([maliciousObj])).toBe(
        'Item [0]: contains forbidden key "__proto__"',
      )
    })

    it("should reject constructor key", () => {
      const maliciousObj = Object.create(null) as Record<string, unknown>
      maliciousObj.label = "Tab 1"
      maliciousObj.value = "SELECT 1"
      maliciousObj.position = 0
      maliciousObj.editorViewState = {}
      // @ts-expect-error - we want to test the constructor key
      maliciousObj.constructor = { malicious: true }

      expect(validateBufferSchema([maliciousObj])).toBe(
        'Item [0]: contains forbidden key "constructor"',
      )
    })

    it("should reject prototype key", () => {
      const maliciousObj = Object.create(null) as Record<string, unknown>
      maliciousObj.label = "Tab 1"
      maliciousObj.value = "SELECT 1"
      maliciousObj.position = 0
      maliciousObj.editorViewState = {}
      maliciousObj.prototype = { malicious: true }

      expect(validateBufferSchema([maliciousObj])).toBe(
        'Item [0]: contains forbidden key "prototype"',
      )
    })
  })

  describe("metricsViewState validation", () => {
    it("should reject non-object metricsViewState", () => {
      expect(
        validateBufferSchema([
          {
            label: "Metrics",
            value: "",
            position: 0,
            metricsViewState: "invalid",
          },
        ]),
      ).toBe("Item [0]: metricsViewState: must be an object")
    })

    it("should reject non-string dateFrom", () => {
      expect(
        validateBufferSchema([
          {
            label: "Metrics",
            value: "",
            position: 0,
            metricsViewState: { dateFrom: 123 },
          },
        ]),
      ).toBe("Item [0]: metricsViewState.dateFrom: must be a string")
    })

    it("should reject non-string dateTo", () => {
      expect(
        validateBufferSchema([
          {
            label: "Metrics",
            value: "",
            position: 0,
            metricsViewState: { dateTo: 123 },
          },
        ]),
      ).toBe("Item [0]: metricsViewState.dateTo: must be a string")
    })

    it("should reject invalid refreshRate", () => {
      expect(
        validateBufferSchema([
          {
            label: "Metrics",
            value: "",
            position: 0,
            metricsViewState: { refreshRate: "invalid" },
          },
        ]),
      ).toBe('Item [0]: metricsViewState.refreshRate: invalid value "invalid"')
    })

    it("should accept valid refreshRate values", () => {
      Object.values(RefreshRate).forEach((rate) => {
        expect(
          validateBufferSchema([
            {
              label: "Metrics",
              value: "",
              position: 0,
              metricsViewState: { refreshRate: rate },
            },
          ]),
        ).toBe(true)
      })
    })

    it("should reject invalid sampleBy", () => {
      expect(
        validateBufferSchema([
          {
            label: "Metrics",
            value: "",
            position: 0,
            metricsViewState: { sampleBy: "2h" },
          },
        ]),
      ).toBe('Item [0]: metricsViewState.sampleBy: invalid value "2h"')
    })

    it("should accept valid sampleBy values", () => {
      Object.values(SampleBy).forEach((sample) => {
        expect(
          validateBufferSchema([
            {
              label: "Metrics",
              value: "",
              position: 0,
              metricsViewState: { sampleBy: sample },
            },
          ]),
        ).toBe(true)
      })
    })

    it("should reject invalid viewMode", () => {
      expect(
        validateBufferSchema([
          {
            label: "Metrics",
            value: "",
            position: 0,
            metricsViewState: { viewMode: "Table" },
          },
        ]),
      ).toBe('Item [0]: metricsViewState.viewMode: invalid value "Table"')
    })

    it("should accept valid viewMode values", () => {
      Object.values(MetricViewMode).forEach((mode) => {
        expect(
          validateBufferSchema([
            {
              label: "Metrics",
              value: "",
              position: 0,
              metricsViewState: { viewMode: mode },
            },
          ]),
        ).toBe(true)
      })
    })

    it("should reject non-array metrics", () => {
      expect(
        validateBufferSchema([
          {
            label: "Metrics",
            value: "",
            position: 0,
            metricsViewState: { metrics: "not-array" },
          },
        ]),
      ).toBe("Item [0]: metricsViewState.metrics: must be an array")
    })
  })

  describe("metric validation", () => {
    const validMetric = {
      metricType: MetricType.WAL_ROW_THROUGHPUT,
      position: 0,
      color: DEFAULT_METRIC_COLOR,
      removed: false,
    }

    it("should reject non-object metric", () => {
      expect(
        validateBufferSchema([
          {
            label: "Metrics",
            value: "",
            position: 0,
            metricsViewState: { metrics: ["invalid"] },
          },
        ]),
      ).toBe("Item [0]: metricsViewState.metrics[0]: must be an object")
    })

    it("should reject non-number tableId", () => {
      expect(
        validateBufferSchema([
          {
            label: "Metrics",
            value: "",
            position: 0,
            metricsViewState: {
              metrics: [{ ...validMetric, tableId: "not-number" }],
            },
          },
        ]),
      ).toBe("Item [0]: metricsViewState.metrics[0].tableId: must be a number")
    })

    it("should accept metric without tableId", () => {
      expect(
        validateBufferSchema([
          {
            label: "Metrics",
            value: "",
            position: 0,
            metricsViewState: { metrics: [validMetric] },
          },
        ]),
      ).toBe(true)
    })

    it("should accept metric with valid tableId", () => {
      expect(
        validateBufferSchema([
          {
            label: "Metrics",
            value: "",
            position: 0,
            metricsViewState: { metrics: [{ ...validMetric, tableId: 123 }] },
          },
        ]),
      ).toBe(true)
    })

    it("should reject invalid metricType", () => {
      expect(
        validateBufferSchema([
          {
            label: "Metrics",
            value: "",
            position: 0,
            metricsViewState: {
              metrics: [{ ...validMetric, metricType: "INVALID_TYPE" }],
            },
          },
        ]),
      ).toBe(
        'Item [0]: metricsViewState.metrics[0].metricType: invalid value "INVALID_TYPE"',
      )
    })

    it("should accept all valid metricType values", () => {
      Object.values(MetricType).forEach((type) => {
        expect(
          validateBufferSchema([
            {
              label: "Metrics",
              value: "",
              position: 0,
              metricsViewState: {
                metrics: [{ ...validMetric, metricType: type }],
              },
            },
          ]),
        ).toBe(true)
      })
    })

    it("should reject non-number position in metric", () => {
      expect(
        validateBufferSchema([
          {
            label: "Metrics",
            value: "",
            position: 0,
            metricsViewState: {
              metrics: [{ ...validMetric, position: "0" }],
            },
          },
        ]),
      ).toBe("Item [0]: metricsViewState.metrics[0].position: must be a number")
    })

    it("should reject non-string color", () => {
      expect(
        validateBufferSchema([
          {
            label: "Metrics",
            value: "",
            position: 0,
            metricsViewState: {
              metrics: [{ ...validMetric, color: 123 }],
            },
          },
        ]),
      ).toBe("Item [0]: metricsViewState.metrics[0].color: must be a string")
    })

    it("should reject non-boolean removed when present", () => {
      expect(
        validateBufferSchema([
          {
            label: "Metrics",
            value: "",
            position: 0,
            metricsViewState: {
              metrics: [{ ...validMetric, removed: "false" }],
            },
          },
        ]),
      ).toBe("Item [0]: metricsViewState.metrics[0].removed: must be a boolean")
    })
  })

  describe("multiple tabs validation", () => {
    it("should validate all tabs and report first error", () => {
      expect(
        validateBufferSchema([
          {
            label: "Tab 1",
            value: "SELECT 1",
            position: 0,
            editorViewState: {},
          },
          { label: "Tab 2", value: 123, position: 1, editorViewState: {} },
        ]),
      ).toBe("Item [1]: value must be a string")
    })

    it("should accept multiple valid tabs", () => {
      expect(
        validateBufferSchema([
          {
            label: "Tab 1",
            value: "SELECT 1",
            position: 0,
            editorViewState: {},
          },
          {
            label: "Tab 2",
            value: "SELECT 2",
            position: 1,
            editorViewState: {},
          },
          {
            label: "Metrics",
            value: "",
            position: 2,
            metricsViewState: { viewMode: MetricViewMode.GRID },
          },
        ]),
      ).toBe(true)
    })
  })
})

describe("sanitizeBuffer", () => {
  describe("basic field sanitization", () => {
    it("should copy label, value, and position", () => {
      const input = {
        label: "Test Tab",
        value: "SELECT 1",
        position: 5,
        editorViewState: {},
      }
      const result = sanitizeBuffer(input)
      expect(result.label).toBe("Test Tab")
      expect(result.value).toBe("SELECT 1")
      expect(result.position).toBe(5)
    })

    it("should use defaultEditorViewState for SQL tabs", () => {
      const input = {
        label: "Test Tab",
        value: "SELECT 1",
        position: 0,
        editorViewState: { malicious: "data" },
      }
      const result = sanitizeBuffer(input)
      expect(result.editorViewState).toBeDefined()
      expect(
        (result.editorViewState as unknown as Record<string, unknown>)
          .malicious,
      ).toBeUndefined()
    })
  })

  describe("optional field handling", () => {
    it("should copy archived when true", () => {
      const input = {
        label: "Test",
        value: "",
        position: 0,
        editorViewState: {},
        archived: true,
      }
      const result = sanitizeBuffer(input)
      expect(result.archived).toBe(true)
    })

    it("should not copy archived when false or missing", () => {
      const input = {
        label: "Test",
        value: "",
        position: 0,
        editorViewState: {},
        archived: false,
      }
      const result = sanitizeBuffer(input)
      expect(result.archived).toBeUndefined()
    })

    it("should copy archivedAt when number", () => {
      const timestamp = Date.now()
      const input = {
        label: "Test",
        value: "",
        position: 0,
        editorViewState: {},
        archivedAt: timestamp,
      }
      const result = sanitizeBuffer(input)
      expect(result.archivedAt).toBe(timestamp)
    })

    it("should not copy archivedAt when not a number", () => {
      const input = {
        label: "Test",
        value: "",
        position: 0,
        editorViewState: {},
        archivedAt: "2024-01-01",
      }
      const result = sanitizeBuffer(input)
      expect(result.archivedAt).toBeUndefined()
    })
  })

  describe("internal state fields exclusion", () => {
    it("should NOT copy isTemporary", () => {
      const input = {
        label: "Test",
        value: "",
        position: 0,
        editorViewState: {},
        isTemporary: true,
      }
      const result = sanitizeBuffer(input)
      expect(result.isTemporary).toBeUndefined()
    })

    it("should NOT copy isPreviewBuffer", () => {
      const input = {
        label: "Test",
        value: "",
        position: 0,
        editorViewState: {},
        isPreviewBuffer: true,
      }
      const result = sanitizeBuffer(input)
      expect(result.isPreviewBuffer).toBeUndefined()
    })

    it("should NOT copy previewContent", () => {
      const input = {
        label: "Test",
        value: "",
        position: 0,
        editorViewState: {},
        previewContent: { type: "diff", original: "", modified: "" },
      }
      const result = sanitizeBuffer(input)
      expect(result.previewContent).toBeUndefined()
    })
  })

  describe("unexpected field exclusion", () => {
    it("should NOT copy arbitrary extra fields", () => {
      const input = {
        label: "Test",
        value: "",
        position: 0,
        editorViewState: {},
        maliciousField: "evil",
        anotherField: { nested: "data" },
      }
      const result = sanitizeBuffer(input) as Record<string, unknown>
      expect(result.maliciousField).toBeUndefined()
      expect(result.anotherField).toBeUndefined()
    })
  })

  describe("metricsViewState sanitization", () => {
    it("should sanitize metricsViewState fields", () => {
      const input = {
        label: "Metrics",
        value: "",
        position: 0,
        metricsViewState: {
          dateFrom: "now-1h",
          dateTo: "now",
          refreshRate: RefreshRate.FIVE_SECONDS,
          sampleBy: SampleBy.ONE_MINUTE,
          viewMode: MetricViewMode.GRID,
          extraField: "should not be copied",
        },
      }
      const result = sanitizeBuffer(input)
      expect(result.metricsViewState).toBeDefined()
      expect(result.metricsViewState?.dateFrom).toBe("now-1h")
      expect(result.metricsViewState?.dateTo).toBe("now")
      expect(result.metricsViewState?.refreshRate).toBe(
        RefreshRate.FIVE_SECONDS,
      )
      expect(result.metricsViewState?.sampleBy).toBe(SampleBy.ONE_MINUTE)
      expect(result.metricsViewState?.viewMode).toBe(MetricViewMode.GRID)
      // Extra fields should NOT be copied due to sanitization
      expect(
        (result.metricsViewState as Record<string, unknown>).extraField,
      ).toBeUndefined()
    })
  })

  describe("metric color sanitization (CSS injection prevention)", () => {
    it("should accept valid hex colors", () => {
      const input = {
        label: "Metrics",
        value: "",
        position: 0,
        metricsViewState: {
          metrics: [
            {
              metricType: MetricType.WAL_ROW_THROUGHPUT,
              position: 0,
              color: DEFAULT_METRIC_COLOR,
              removed: false,
            },
          ],
        },
      }
      const result = sanitizeBuffer(input)
      expect(result.metricsViewState?.metrics?.[0].color).toBe(
        DEFAULT_METRIC_COLOR,
      )
    })

    it("should accept lowercase hex colors", () => {
      const input = {
        label: "Metrics",
        value: "",
        position: 0,
        metricsViewState: {
          metrics: [
            {
              metricType: MetricType.WAL_ROW_THROUGHPUT,
              position: 0,
              color: "#aabbcc",
              removed: false,
            },
          ],
        },
      }
      const result = sanitizeBuffer(input)
      expect(result.metricsViewState?.metrics?.[0].color).toBe("#aabbcc")
    })

    it("should replace invalid color with default", () => {
      const input = {
        label: "Metrics",
        value: "",
        position: 0,
        metricsViewState: {
          metrics: [
            {
              metricType: MetricType.WAL_ROW_THROUGHPUT,
              position: 0,
              color: "red",
              removed: false,
            },
          ],
        },
      }
      const result = sanitizeBuffer(input)
      expect(result.metricsViewState?.metrics?.[0].color).toBe(
        DEFAULT_METRIC_COLOR,
      )
    })

    it("should replace CSS injection attempt with default", () => {
      const input = {
        label: "Metrics",
        value: "",
        position: 0,
        metricsViewState: {
          metrics: [
            {
              metricType: MetricType.WAL_ROW_THROUGHPUT,
              position: 0,
              color: "red; background: url(evil.com)",
              removed: false,
            },
          ],
        },
      }
      const result = sanitizeBuffer(input)
      expect(result.metricsViewState?.metrics?.[0].color).toBe(
        DEFAULT_METRIC_COLOR,
      )
    })

    it("should replace rgb() color with default", () => {
      const input = {
        label: "Metrics",
        value: "",
        position: 0,
        metricsViewState: {
          metrics: [
            {
              metricType: MetricType.WAL_ROW_THROUGHPUT,
              position: 0,
              color: "rgb(255, 0, 0)",
              removed: false,
            },
          ],
        },
      }
      const result = sanitizeBuffer(input)
      expect(result.metricsViewState?.metrics?.[0].color).toBe(
        DEFAULT_METRIC_COLOR,
      )
    })

    it("should replace short hex color with default", () => {
      const input = {
        label: "Metrics",
        value: "",
        position: 0,
        metricsViewState: {
          metrics: [
            {
              metricType: MetricType.WAL_ROW_THROUGHPUT,
              position: 0,
              color: "#F00",
              removed: false,
            },
          ],
        },
      }
      const result = sanitizeBuffer(input)
      expect(result.metricsViewState?.metrics?.[0].color).toBe(
        DEFAULT_METRIC_COLOR,
      )
    })

    it("should replace hex color with alpha with default", () => {
      const input = {
        label: "Metrics",
        value: "",
        position: 0,
        metricsViewState: {
          metrics: [
            {
              metricType: MetricType.WAL_ROW_THROUGHPUT,
              position: 0,
              color: "#FF6B6BFF",
              removed: false,
            },
          ],
        },
      }
      const result = sanitizeBuffer(input)
      expect(result.metricsViewState?.metrics?.[0].color).toBe(
        DEFAULT_METRIC_COLOR,
      )
    })
  })

  describe("metric field sanitization", () => {
    it("should copy tableId when present", () => {
      const input = {
        label: "Metrics",
        value: "",
        position: 0,
        metricsViewState: {
          metrics: [
            {
              tableId: 123,
              metricType: MetricType.WAL_ROW_THROUGHPUT,
              position: 0,
              color: DEFAULT_METRIC_COLOR,
              removed: false,
            },
          ],
        },
      }
      const result = sanitizeBuffer(input)
      expect(result.metricsViewState?.metrics?.[0].tableId).toBe(123)
    })

    it("should default removed to false when undefined", () => {
      const input = {
        label: "Metrics",
        value: "",
        position: 0,
        metricsViewState: {
          metrics: [
            {
              metricType: MetricType.WAL_ROW_THROUGHPUT,
              position: 0,
              color: DEFAULT_METRIC_COLOR,
            },
          ],
        },
      }
      const result = sanitizeBuffer(input)
      expect(result.metricsViewState?.metrics?.[0].removed).toBe(false)
    })

    it("should NOT copy extra fields from metric objects", () => {
      const input = {
        label: "Metrics",
        value: "",
        position: 0,
        metricsViewState: {
          metrics: [
            {
              metricType: MetricType.WAL_ROW_THROUGHPUT,
              position: 0,
              color: DEFAULT_METRIC_COLOR,
              removed: false,
              extraField: "malicious",
            },
          ],
        },
      }
      const result = sanitizeBuffer(input)
      expect(
        (result.metricsViewState?.metrics?.[0] as Record<string, unknown>)
          .extraField,
      ).toBeUndefined()
    })
  })
})

describe("deduplication", () => {
  describe("createBufferContentKey", () => {
    it("creates key from label and value for editor tabs", () => {
      const buffer = { label: "Tab1", value: "SELECT 1" }
      expect(createBufferContentKey(buffer)).toBe("Tab1|SELECT 1")
    })

    it("creates key from label and metricsViewState for metrics tabs", () => {
      const buffer = {
        label: "Metrics",
        value: "",
        metricsViewState: { viewMode: MetricViewMode.LIST },
      }
      const key = createBufferContentKey(buffer)
      expect(key).toContain("Metrics|")
      expect(key).toContain("viewMode")
      expect(key).toContain(MetricViewMode.LIST)
    })

    it("uses value when metricsViewState is undefined", () => {
      const buffer = {
        label: "Tab",
        value: "SELECT * FROM t",
        metricsViewState: undefined,
      }
      expect(createBufferContentKey(buffer)).toBe("Tab|SELECT * FROM t")
    })
  })

  describe("hashBufferContent", () => {
    it("returns consistent hash for same content", () => {
      const buffer = { label: "Tab1", value: "SELECT 1" }
      const hash1 = hashBufferContent(buffer)
      const hash2 = hashBufferContent(buffer)
      expect(hash1).toBe(hash2)
    })

    it("returns different hash for different content", () => {
      const buffer1 = { label: "Tab1", value: "SELECT 1" }
      const buffer2 = { label: "Tab1", value: "SELECT 2" }
      expect(hashBufferContent(buffer1)).not.toBe(hashBufferContent(buffer2))
    })

    it("returns different hash for different labels", () => {
      const buffer1 = { label: "Tab1", value: "SELECT 1" }
      const buffer2 = { label: "Tab2", value: "SELECT 1" }
      expect(hashBufferContent(buffer1)).not.toBe(hashBufferContent(buffer2))
    })

    it("returns string hash", () => {
      const buffer = { label: "Tab1", value: "SELECT 1" }
      const hash = hashBufferContent(buffer)
      expect(typeof hash).toBe("string")
      expect(hash.length).toBeGreaterThan(0)
    })
  })

  describe("findDuplicates", () => {
    const createBuffer = (
      id: number,
      label: string,
      value: string,
      position: number,
    ): Buffer => ({
      id,
      label,
      value,
      position,
      editorViewState: {} as Buffer["editorViewState"],
    })

    it("returns empty set when no duplicates exist", () => {
      const existing = [createBuffer(1, "Tab1", "SELECT 1", 0)]
      const imported = [{ label: "Tab2", value: "SELECT 2", position: 0 }]
      const duplicates = findDuplicates(
        existing,
        imported as Omit<Buffer, "id">[],
      )
      expect(duplicates.size).toBe(0)
    })

    it("identifies exact duplicates by label and value", () => {
      const existing = [createBuffer(1, "Tab1", "SELECT 1", 0)]
      const imported = [{ label: "Tab1", value: "SELECT 1", position: 0 }]
      const duplicates = findDuplicates(
        existing,
        imported as Omit<Buffer, "id">[],
      )
      expect(duplicates.has(0)).toBe(true)
      expect(duplicates.size).toBe(1)
    })

    it("does not flag different content with same label as duplicate", () => {
      const existing = [createBuffer(1, "Tab1", "SELECT 1", 0)]
      const imported = [{ label: "Tab1", value: "SELECT 2", position: 0 }]
      const duplicates = findDuplicates(
        existing,
        imported as Omit<Buffer, "id">[],
      )
      expect(duplicates.size).toBe(0)
    })

    it("does not flag same content with different label as duplicate", () => {
      const existing = [createBuffer(1, "Tab1", "SELECT 1", 0)]
      const imported = [{ label: "Tab2", value: "SELECT 1", position: 0 }]
      const duplicates = findDuplicates(
        existing,
        imported as Omit<Buffer, "id">[],
      )
      expect(duplicates.size).toBe(0)
    })

    it("handles metrics tabs deduplication", () => {
      const metricsState = { viewMode: MetricViewMode.LIST, metrics: [] }
      const existing: Buffer[] = [
        {
          id: 1,
          label: "Metrics",
          value: "",
          position: 0,
          metricsViewState: metricsState,
        },
      ]
      const imported = [
        {
          label: "Metrics",
          value: "",
          position: 0,
          metricsViewState: metricsState,
        },
      ]
      const duplicates = findDuplicates(
        existing,
        imported as Omit<Buffer, "id">[],
      )
      expect(duplicates.has(0)).toBe(true)
    })

    it("returns correct indices for multiple duplicates", () => {
      const existing = [
        createBuffer(1, "Tab1", "SELECT 1", 0),
        createBuffer(2, "Tab2", "SELECT 2", 1),
      ]
      const imported = [
        { label: "Tab1", value: "SELECT 1", position: 0 }, // duplicate (index 0)
        { label: "Tab3", value: "SELECT 3", position: 1 }, // new (index 1)
        { label: "Tab2", value: "SELECT 2", position: 2 }, // duplicate (index 2)
      ]
      const duplicates = findDuplicates(
        existing,
        imported as Omit<Buffer, "id">[],
      )
      expect(duplicates.size).toBe(2)
      expect(duplicates.has(0)).toBe(true)
      expect(duplicates.has(1)).toBe(false)
      expect(duplicates.has(2)).toBe(true)
    })

    it("handles empty existing buffers", () => {
      const existing: Buffer[] = []
      const imported = [{ label: "Tab1", value: "SELECT 1", position: 0 }]
      const duplicates = findDuplicates(
        existing,
        imported as Omit<Buffer, "id">[],
      )
      expect(duplicates.size).toBe(0)
    })

    it("handles empty imported buffers", () => {
      const existing = [createBuffer(1, "Tab1", "SELECT 1", 0)]
      const imported: Omit<Buffer, "id">[] = []
      const duplicates = findDuplicates(existing, imported)
      expect(duplicates.size).toBe(0)
    })

    it("handles multiple existing buffers with same content", () => {
      // Edge case: if somehow there are duplicates in existing buffers
      const existing = [
        createBuffer(1, "Tab1", "SELECT 1", 0),
        createBuffer(2, "Tab1", "SELECT 1", 1), // same content, different id
      ]
      const imported = [{ label: "Tab1", value: "SELECT 1", position: 0 }]
      const duplicates = findDuplicates(
        existing,
        imported as Omit<Buffer, "id">[],
      )
      expect(duplicates.has(0)).toBe(true)
    })

    it("ignores position when comparing for duplicates", () => {
      const existing = [createBuffer(1, "Tab1", "SELECT 1", 0)]
      const imported = [{ label: "Tab1", value: "SELECT 1", position: 999 }]
      const duplicates = findDuplicates(
        existing,
        imported as Omit<Buffer, "id">[],
      )
      expect(duplicates.has(0)).toBe(true)
    })
  })
})
