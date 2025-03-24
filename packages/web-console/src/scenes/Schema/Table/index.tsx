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
import { getTableExpanded, setMatViewExpanded, setTableExpanded, getFolderExpanded, setFolderExpanded } from "../localStorageUtils"

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
  }: {
    table_id: number
    column: QuestDB.Column
    designatedTimestamp: string
  }) =>
  ({ toggleOpen }: TreeNodeRenderParams) =>
    (
      <Row
        {...column}
        designatedTimestamp={designatedTimestamp}
        table_id={table_id}
        kind="column"
        name={column.column}
        onClick={() => toggleOpen()}
      />
    )

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
      initiallyOpen: getTableExpanded(table_name),
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
                onClick={() => {
                  toggleOpen()
                  if (matView) {
                    setMatViewExpanded(table_name, !isOpen)
                  } else {
                    setTableExpanded(table_name, !isOpen)
                  }
                  onClearColumnsCache?.(table_name);
                }}
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
          initiallyOpen: getFolderExpanded(matView ? 'matview' : 'table', table_name, "Columns"),
          async onOpen({ setChildren }) {
            const response = await showColumns(table_name)

            if (response && response.data && response.data.length > 0) {
              setChildren(
                response.data.map((column) => ({
                  name: column.column,
                  render: columnRender({
                    column,
                    designatedTimestamp,
                    table_id: id,
                  }),
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
                  setFolderExpanded(matView ? 'matview' : 'table', table_name, "Columns", isOpen ? false : true);
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
          initiallyOpen: getFolderExpanded(matView ? 'matview' : 'table', table_name, "Storage details"),
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
                onClick={() => {
                  setFolderExpanded(matView ? 'matview' : 'table', table_name, "Storage details", isOpen ? false : true);
                  toggleOpen();
                }}
                isLoading={isLoading}
              />
            )
          }
        }

        const baseTables: TreeNode[] = matViewData ? [{
          name: 'Base tables',
          kind: 'folder',
          initiallyOpen: getFolderExpanded("matview", table_name, "Base tables"),
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
                onClick={() => {
                  setFolderExpanded("matview", table_name, "Base tables", isOpen ? false : true);
                  toggleOpen();
                }}
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
      <Tree root={tree} />
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
