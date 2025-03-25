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

import React, { useContext, useState } from "react"
import styled from "styled-components"
import { Tree } from "../../../components"
import { TreeNode, TreeNodeRenderParams, Text } from "../../../components"
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, MenuItem } from "../../../components/ContextMenu"
import * as QuestDB from "../../../utils/questdb"
import Row from "../Row"
import { useDispatch } from "react-redux"
import { actions } from "../../../store"
import { QuestContext } from "../../../providers"
import { NotificationType } from "../../../types"
import { TreeNodeKind } from "../../../components/Tree"
import { SuspensionDialog } from '../SuspensionDialog'
import { FileCopy, Restart } from "@styled-icons/remix-line"
import { TABLES_GROUP_KEY, MATVIEWS_GROUP_KEY } from "../localStorageUtils"

type Props = QuestDB.Table &
  Readonly<{
    designatedTimestamp: string
    id: number
    table_name: string
    partitionBy: string
    walTableData?: QuestDB.WalTable
    matViewData?: QuestDB.MaterializedView
    selected: boolean
    onSelectToggle:  ({name, type}: {name: string, type: TreeNodeKind}) => void
    selectOpen: boolean
    cachedColumns?: QuestDB.Column[]
    onCacheColumns?: (columns: QuestDB.Column[]) => void
    onClearColumnsCache?: (tableName: string) => void
    path: string
  }>

const Title = styled(Row)`
  display: flex;
  align-items: stretch;

  &:hover {
    cursor: pointer;
  }
`

const columnRender =
  ({
    table_id,
    column,
    designatedTimestamp,
    includesSymbol,
  }: {
    table_id: number
    column: QuestDB.Column
    designatedTimestamp: string
    includesSymbol: boolean
  }) =>
  ({ toggleOpen, isOpen }: TreeNodeRenderParams) => (
    <Row
      {...column}
      includesSymbol={includesSymbol}
      expanded={isOpen}
      designatedTimestamp={designatedTimestamp}
      table_id={table_id}
      kind="column"
      name={column.column}
      onClick={() => toggleOpen()}
    />
  )

const columnNode = ({
  table_id,
  column,
  designatedTimestamp,
  includesSymbol,
}: {
  table_id: number
  column: QuestDB.Column
  designatedTimestamp: string
  includesSymbol: boolean
}): TreeNode => ({
  name: column.column,
  kind: "column",
  children: [
    ...(column.type === "SYMBOL" ? [
      {
        name: "Indexed",
        kind: "detail",
        render: detailRender({
          name: "Indexed",
          value: column.indexed ? "Yes" : "No"
        })
      },
      {
        name: "Symbol capacity",
        kind: "detail",
        render: detailRender({
          name: "Symbol capacity",
          value: column.symbolCapacity.toString()
        })
      },
      {
        name: "Cached",
        kind: "detail",
        render: detailRender({
          name: "Cached",
          value: column.symbolCached ? "Yes" : "No"
        })
      }
    ] as TreeNode[] : [])
  ],
  render: columnRender({
    table_id,
    column,
    designatedTimestamp,
    includesSymbol,
  })
})

const detailRender = ({ name, value }: { name: string, value: string }) => 
  ({ toggleOpen }: TreeNodeRenderParams) => (
    <Row
      kind="detail"
      name={`${name}:`}
      value={value}
      onClick={() => toggleOpen()}
    />
  )

const Table = ({
  designatedTimestamp,
  id,
  table_name,
  partitionBy,
  ttlValue,
  ttlUnit,
  walEnabled,
  walTableData,
  matViewData,
  dedup,
  selected,
  onSelectToggle,
  selectOpen,
  matView,
  cachedColumns,
  onCacheColumns,
  onClearColumnsCache,
}: Props) => {
  const { quest } = useContext(QuestContext)
  const dispatch = useDispatch()
  const [suspensionDialogOpen, setSuspensionDialogOpen] = useState(false)

  const showColumns = async (name: string) => {
    try {
      if (cachedColumns) {
        return {
          type: QuestDB.Type.DQL,
          data: cachedColumns
        };
      }

      const response = await quest.showColumns(name)
      if (response && response.type === QuestDB.Type.DQL) {
        onCacheColumns?.(response.data);
        return response
      }
    } catch (error: any) {
      dispatch(
        actions.query.addNotification({
          content: (
            <Text color="red">Cannot show columns from table '{name}'</Text>
          ),
          type: NotificationType.ERROR,
        }),
      )
    }
  }

  const handleCopyQuery = async () => {
    try {
      let response
      if (matView) {
        response = await quest.showMatViewDDL(table_name)
      } else {
        response = await quest.showTableDDL(table_name)
      }

      if (response?.type === QuestDB.Type.DQL && response.data?.[0]?.ddl) {
        navigator.clipboard.writeText(response.data[0].ddl)
        dispatch(
          actions.query.addNotification({
            content: <Text color="foreground">Schema copied to clipboard</Text>,
            type: NotificationType.SUCCESS,
          })
        )
      }
    } catch (error: any) {
      dispatch(
        actions.query.addNotification({
          content: (
            <Text color="red">Cannot copy schema for {matView ? 'materialized view' : 'table'} '{table_name}'</Text>
          ),
          type: NotificationType.ERROR,
        })
      )
    }
  }

  const tree: TreeNode[] = [
    {
      name: table_name,
      kind: matView ? 'matview' : 'table',
      render: ({ toggleOpen, isOpen, isLoading }) => {
        return (
          <ContextMenu>
            <ContextMenuTrigger>
              <Title
                expanded={isOpen && !isLoading}
                kind={matView ? 'matview' : 'table'}
                table_id={id}
                name={table_name}
                baseTable={matViewData?.base_table_name}
                onClick={toggleOpen}
                isLoading={isLoading}
                selectOpen={selectOpen}
                selected={selected}
                onSelectToggle={onSelectToggle}
                partitionBy={partitionBy}
                walEnabled={walEnabled}
                errors={[
                  ...(matViewData?.view_status === 'invalid' ? [`Materialized view is invalid${matViewData?.invalidation_reason && `: ${matViewData?.invalidation_reason}`}`] : []),
                  ...(walTableData?.suspended ? [`Suspended`] : []),
                ]}
              />
            </ContextMenuTrigger>

            <ContextMenuContent>
              <MenuItem
                data-hook="table-context-menu-copy-schema"
                onClick={handleCopyQuery} icon={<FileCopy size={14} />}
              >
                Copy schema
              </MenuItem>
              {walTableData?.suspended && (
                <MenuItem 
                  data-hook="table-context-menu-resume-wal"
                  onClick={() => setTimeout(() => setSuspensionDialogOpen(true))}
                  icon={<Restart size={14} />}
                >
                  Resume WAL
                </MenuItem>
              )}
            </ContextMenuContent>
          </ContextMenu>
        )
      },
      async onOpen({ setChildren }) {
        const columns: TreeNode = {
          name: "Columns",
          kind: "folder",
          async onOpen({ setChildren }) {
            const response = await showColumns(table_name)

            if (response && response.data && response.data.length > 0) {
              const includesSymbol = response.data.some((column) => column.type === "SYMBOL")
              setChildren(
                response.data.map((column) => columnNode({
                  column,
                  designatedTimestamp,
                  table_id: id,
                  includesSymbol,
                })),
              )
            } else {
              setChildren([
                {
                  name: "error",
                  render: () => <Text color="gray2">No columns found</Text>,
                },
              ])
            }
          },
          render({ toggleOpen, isOpen, isLoading }) {
            return (
              <Row
                expanded={isOpen && !isLoading}
                kind="folder"
                table_id={id}
                name="Columns"
                onClick={() => {
                  onClearColumnsCache?.(table_name);
                  toggleOpen();
                }}
                isLoading={isLoading}
              />
            )
          },
        }

        const storageDetails: TreeNode = {
          name: 'Storage details',
          kind: 'folder',
          async onOpen({ setChildren }) {
            const details = [
              {
                name: 'WAL',
                value: walEnabled ? 'Enabled' : 'Disabled',
              },
              {
                name: 'Partitioning',
                value: partitionBy && partitionBy !== 'NONE' ? `By ${partitionBy.toLowerCase()}` : 'None',
              },
            ]
            setChildren(details.map((detail) => ({
              name: detail.name,
              render: detailRender(detail),
            })))
          },
          render: ({ toggleOpen, isOpen, isLoading }) => {
            return (
              <Row
                kind="folder"
                expanded={isOpen && !isLoading}
                table_id={id}
                name="Storage details"
                onClick={toggleOpen}
                isLoading={isLoading}
              />
            )
          }
        }

        const baseTables: TreeNode[] = matViewData ? [{
          name: 'Base tables',
          kind: 'folder',
          async onOpen({ setChildren }) {   
            setChildren([{
              name: matViewData.base_table_name,
              kind: 'detail',
            }])
          },
          render: ({ toggleOpen, isOpen, isLoading }) => {
            return (
              <Row
                kind="folder"
                expanded={isOpen && !isLoading}
                table_id={id}
                name="Base tables"
                onClick={toggleOpen}
                isLoading={isLoading}
              />
            )
          }
        }] : []

        setChildren([columns, storageDetails, ...baseTables])
      },
    },
  ]

  return (
    <>
      <Tree root={tree} parentPath={`${matView ? MATVIEWS_GROUP_KEY : TABLES_GROUP_KEY}`} />
      {walTableData?.suspended && (
        <SuspensionDialog 
          walTableData={walTableData}
          open={suspensionDialogOpen}
          onOpenChange={(isOpen) => {
            setSuspensionDialogOpen(isOpen)
            setTimeout(() => document.body.style.pointerEvents = '')
          }}
        />
      )}
    </>
  )
}

export default Table
