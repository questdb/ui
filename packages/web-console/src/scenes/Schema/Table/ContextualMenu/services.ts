import { Column } from "./../../../../utils/questdb"
import { formatTableSchemaQuery } from "./../../../../utils/formatTableSchemaQuery"
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

import * as QuestDB from "../../../../utils/questdb"

export const formatTableSchemaQueryResult = (
  name: string,
  partitionBy: string,
  result: QuestDB.QueryRawResult,
  walEnabled: boolean,
): string => {
  if (result.type === QuestDB.Type.DQL) {
    const findTimestampRow = result.dataset.find((row) => row[6] === true)
    return formatTableSchemaQuery({
      name,
      partitionBy,
      timestamp: findTimestampRow ? (findTimestampRow[0] as string) : "",
      walEnabled,
      schemaColumns: result.dataset.map(
        (row) =>
          ({
            column: row[0],
            type: row[1],
            indexed: row[2],
            indexBlockCapacity: row[3],
            symbolCached: row[4],
            symbolCapacity: row[5],
            designated: row[6],
          } as Column),
      ),
    })
  } else {
    throw new Error("Could not format table schema")
  }
}
