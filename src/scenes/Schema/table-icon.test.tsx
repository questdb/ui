// @vitest-environment jsdom
import React from "react"
import { renderComponent, getHook, findHook } from "../../test/component"
import { fireEvent } from "@testing-library/react"
import { it, expect } from "vitest"
import { TableIcon } from "./table-icon"

for (const [kind, partition, header] of [
  [
    "table",
    "DAY",
    'WAL-based table. Partitioned by "day", ordered on "timestamp" column.',
  ],
  [
    "matview",
    "WEEK",
    'Materialized view. Partitioned by "week", ordered on "timestamp" column.',
  ],
  [
    "liveview",
    "DAY",
    'Live view. Partitioned by "day", ordered on "timestamp" column.',
  ],
] as const) {
  it(`explains the ${kind} icon on hover`, async () => {
    // Given
    renderComponent(
      <div style={{ padding: 40 }}>
        <TableIcon
          kind={kind}
          walEnabled
          partitionBy={partition}
          designatedTimestamp="timestamp"
        />
      </div>,
    )
    // When
    fireEvent.pointerMove(getHook("table-icon"), { pointerType: "mouse" })
    // Then
    expect(await findHook("tooltip")).toHaveTextContent(header)
    if (kind === "table")
      expect(getHook("tooltip")).toHaveTextContent(
        "WAL-based tables are the current and most up-to-date table format. This format supports advanced data recovery, replication and high-throughput ingestion. This is the recommended format if your table contains time-series data that has a designated timestamp.",
      )
  })
}
