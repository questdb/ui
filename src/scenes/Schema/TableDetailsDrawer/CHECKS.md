# TableDetailsDrawer Health Checks

This document describes the health checks implemented in `healthCheck.ts` for the TableDetailsDrawer component.

## Overview

Health checks are categorized by severity:
- **Critical (Red)** - Immediate attention required, ingestion may be blocked
- **Warning (Orange)** - Needs attention, performance may be degraded
- **Recovering (Green)** - Positive trend, situation is improving

## Critical Checks

### R1: WAL Suspended
- **Condition**: `walEnabled && table_suspended === true`
- **Field**: `walStatus` (header dot only - UI has dedicated section)
- **Message**: "WAL suspended - ingestion blocked"

### R2: Invalid Materialized View
- **Condition**: `isMatView && view_status === "invalid"`
- **Field**: `viewStatus` (header dot only - UI has dedicated section)
- **Message**: "Materialized view is invalid"

### R3: Memory Backoff
- **Condition**: `table_memory_pressure_level === 2`
- **Field**: `memoryPressure`
- **Message**: "Memory backoff - system under pressure"
- **Reference**: https://questdb.com/docs/query/functions/meta/#tables (Health dashboard query, BACKOFF case)

## Warning Checks

### Y3: Small Transactions
- **Condition**: `wal_tx_size_p90 > 0 && wal_tx_size_p90 < 100`
- **Field**: `txSizeP90`
- **Message**: "Small transactions - consider batching"
- **Note**: Threshold of 100 rows is a reasonable default for batching recommendations

### Y4: High Write Amplification
- **Condition**: `table_write_amp_p50 > 2.0`
- **Field**: `writeAmp`
- **Message**: "High write amplification (O3 overhead)"
- **Reference**: https://questdb.com/docs/query/functions/meta/#tables (High write amplification query)
  - Documentation states: "A ratio of 1.0 means no amplification. Higher values indicate O3 merge overhead."
  - The docs example query filters for `> 2.0`, indicating values above 2.0 warrant investigation

### Y5: Reduced Parallelism
- **Condition**: `table_memory_pressure_level === 1`
- **Field**: `memoryPressure`
- **Message**: "Reduced parallelism mode"
- **Reference**: https://questdb.com/docs/query/functions/meta/#tables (Health dashboard query, PRESSURE case)

## Trend Indicators (Directional Arrows)

Instead of warnings, transaction lag and pending rows use **directional arrows** to show trends:

### Transaction Lag Trend
- **Condition**: Enough trend samples AND **current lag > 0** AND trend is non-stable
- **Field**: `transactionLag`
- **Display**: ↑ orange arrow when increasing, ↓ green arrow when decreasing
- **Messages**: "WAL lag growing" (↑) or "WAL catching up" (↓)

### Pending Rows Trend
- **Condition**: Enough trend samples AND **current pending > 0** AND trend is non-stable
- **Field**: `pendingRows`
- **Display**: ↑ orange arrow when increasing, ↓ green arrow when decreasing
- **Messages**: "Pending rows accumulating" (↑) or "Pending rows clearing" (↓)

**Note**: Arrows only appear when the **current value is > 0**. Once lag/pending reaches 0, no arrow is shown (nothing to indicate - the backlog is cleared).

## Trend Detection

**2 fields use trend indicators**: Transaction Lag, Pending Rows

All other checks (R1, R2, R3, Y3, Y4, Y5) are **instant** - they evaluate immediately based on current table metrics.

### Adaptive Sample Count

Trend detection uses an **adaptive sample count** calculated from a fixed **2-second time window**. The number of samples used equals `2000ms / pollingInterval`, clamped to [2, 10]:

| Polling Interval | Sample Count | Calculation |
|------------------|--------------|-------------|
| 200ms            | 10           | 2000/200 = 10 |
| 400ms            | 5            | 2000/400 = 5 |
| 500ms            | 4            | 2000/500 = 4 |
| 1000ms           | 2            | 2000/1000 = 2 |
| 2000ms+          | 2            | clamped to min 2 |

```ts
function getSampleCountForInterval(intervalMs: number): number {
  return Math.max(2, Math.min(10, Math.floor(2000 / intervalMs)))
}
```

This ensures trend detection always covers approximately the last 2 seconds of data, regardless of polling speed.

### Timestamped Samples

Trend data uses `TimestampedSample` objects:
```ts
type TimestampedSample = {
  value: number
  timestamp: number
}
```

A rolling buffer of 10 samples is maintained for each metric. The last N samples (based on adaptive sample count) are used for trend detection.

### Detection Algorithm

The `detectTrend()` function uses **monotonic** trend detection (not strict):

1. Takes the last N samples based on adaptive sample count
2. Checks if all samples are **monotonically increasing** (each value >= previous, at least one actual increase)
3. Checks if all samples are **monotonically decreasing** (each value <= previous, at least one actual decrease)

**Results:**
- `"increasing"`: All samples are monotonically increasing (e.g., `[1, 2, 2, 3, 4]` or `[1, 2, 3, 4, 5]`)
- `"decreasing"`: All samples are monotonically decreasing (e.g., `[5, 4, 4, 3, 2]` or `[5, 4, 3, 2, 1]`)
- `"stable"`: Mixed directions, all equal values, or fewer than 2 samples

**Note:** Monotonic (not strict) detection allows equal consecutive values, which handles cases where metrics temporarily plateau before continuing their trend.

## Ingestion Activity Indicator

The Ingestion section header shows an "Ingestion in progress..." indicator with a spinner when active ingestion is detected.

### Detection Logic (`detectIngestionActive()`)
- **Metric tracked**: `wal_txn` for WAL-enabled tables, `table_row_count` for non-WAL tables
- **Condition**: Requires `min(3, sampleCount)` samples AND at least one increase in recent samples
- **Display**: CircleNotchSpinner with "Ingestion in progress..." text in gray2

### Notes
- Uses adaptive sample count based on polling interval (same as trend detection)
- Does not show until we have at least `min(3, sampleCount)` samples (prevents false positives on initial load)
- Not shown for suspended WAL tables (ingestion is blocked)
- Shown in both WAL-enabled and non-WAL table ingestion section headers

## Field to UI Mapping

| Field | UI Label | Location |
|-------|----------|----------|
| `memoryPressure` | Memory Pressure | Ingestion metrics |
| `transactionLag` | Transaction Lag | Ingestion metrics |
| `pendingRows` | Pending Rows | Ingestion metrics |
| `txSizeP90` | Tx Size (p90) | Ingestion metrics |
| `writeAmp` | Write Amp (p50) | Ingestion metrics |
| `mergeRate` | Merge Rate (p99) | Ingestion metrics |

**Note**: WAL suspended status and materialized view invalid status are shown directly in the UI without using the health check system, as they have dedicated UI sections.

## Testing

Use the simulation script to trigger specific health checks:

```bash
cd scripts
python health_simulation.py <command>
```

Available commands:
- `small_tx` - Triggers Y3 (small transactions)
- `write_amp` - Triggers Y4 (high write amplification)
- `suspended` - Triggers R1 (WAL suspended)
- `matview` - Triggers R2 (invalid materialized view)
- `lag` - Triggers Y1 (transaction lag increasing) - continuous, Ctrl+C to stop
- `pending` - Triggers Y2 (pending rows increasing) - continuous, Ctrl+C to stop
- `recovery` - Triggers G1/G2 (WAL recovering) - creates backlog then watches recovery
- `ingestion` - Test ingestion indicator (5s on, 5s off cycles)
- `healthy` - Control case with no issues
- `cleanup` - Remove all test tables
