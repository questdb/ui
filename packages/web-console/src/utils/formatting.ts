/*******************************************************************************
 *     ___                  _   ____  ____
 *    / _ \ _   _  ___  ___| |_|  _ \| __ )
 *   | | | | | | |/ _ \/ __| __| | | |  _ \
 *   | |_| | |_| |  __/\__ \ |_| |_| | |_) |
 *    \__\_\\__,_|\___||___/\__|____/|____/
 *
 *  Copyright (c) 2014-2019 Appsicle
 *  Copyright (c) 2019-2022 QuestDB
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 ******************************************************************************/

export const roundTiming = (time: number): number =>
  Math.round((time + Number.EPSILON) * 100) / 100

/**
 * Format a number of nano seconds to a human readable time.
 * @param {number} nanos Number of nanoseconds
 * @returns {string} The human readable time as a string.
 */
export const formatTiming = (nanos: number): string => {
  if (nanos === 0) {
    return "0"
  }

  if (nanos > 1e9) {
    return `${roundTiming(nanos / 1e9)}s`
  }

  if (nanos > 1e6) {
    return `${roundTiming(nanos / 1e6)}ms`
  }

  if (nanos > 1e3) {
    return `${roundTiming(nanos / 1e3)}μs`
  }

  return `${nanos}ns`
}

/**
 * Format data into an ASCII table.
 * @param {string[][]} rows Data to render as a table
 * @returns {string} The ASCII table.
 */
export const renderTable = (rows: string[][]): string => {
  const colMax = rows[0].map((_, i) =>
    Math.max(...rows.map((row) => String(row[i]).length))
  );

  const header = `| ${rows[0]
    .map((col, i) => col.padEnd(colMax[i]))
    .join(" | ")} |`;

  const separator = `+${colMax.map((max) => "-".repeat(max + 2)).join("+")}+`;

  const data = rows
    .slice(1)
    .map((row) => `| ${row.map((col, i) => String(col).padEnd(colMax[i])).join(" | ")} |`);

  return [separator, header, separator, ...data, separator].join("\n");
};
