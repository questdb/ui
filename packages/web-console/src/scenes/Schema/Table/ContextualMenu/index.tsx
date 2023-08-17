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

import React, { useCallback, useContext } from "react"
import { ContextMenu, MenuItem } from "../../../../components/ContextMenu"
import { QuestContext } from "../../../../providers"
import * as QuestDB from "../../../../utils/questdb"
import { formatTableSchemaQueryResult } from "./services"
import { copyToClipboard } from "../../../../utils"

type Props = {
  name: string
  partitionBy: string
  walEnabled: boolean
  dedup: boolean
}

const ContextualMenu = ({ name, partitionBy, walEnabled, dedup }: Props) => {
  const { quest } = useContext(QuestContext)
  const [schema, setSchema] = React.useState<string | undefined>()

  const handleShow = useCallback(async () => {
    const response = await quest.showColumns(name)
    if (response.type === QuestDB.Type.DQL && response.data.length > 0) {
      const formattedResult = formatTableSchemaQueryResult(
        name,
        partitionBy,
        response.data,
        walEnabled,
        dedup,
      )
      setSchema(formattedResult)
    }
  }, [quest, name, partitionBy])

  const handleCopySchemaToClipboard = useCallback(() => {
    if (schema) {
      copyToClipboard(schema)
    }
  }, [schema])

  return (
    <ContextMenu id={name} onShow={handleShow}>
      {schema && (
        <MenuItem onClick={handleCopySchemaToClipboard}>
          Copy schema to clipboard
        </MenuItem>
      )}
      <MenuItem divider />
      <MenuItem>Close</MenuItem>
    </ContextMenu>
  )
}

export default ContextualMenu
