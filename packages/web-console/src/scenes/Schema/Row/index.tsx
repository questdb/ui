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

import React, { MouseEvent, ReactNode, useContext } from "react"
import { useDispatch } from "react-redux"
import styled from "styled-components"
import { Rocket } from "@styled-icons/boxicons-regular"
import { SortDown } from "@styled-icons/boxicons-regular"
import { RightArrow } from "@styled-icons/boxicons-regular"
import { CheckboxBlankCircle, FileCopy, Information } from "@styled-icons/remix-line"
import type { TreeNodeKind } from "../../../components/Tree"
import * as QuestDB from "../../../utils/questdb"
import Highlighter from "react-highlight-words"
import { TableIcon } from "../table-icon"
import { Button, Box } from "@questdb/react-components"
import { Text, TransitionDuration, IconWithTooltip } from "../../../components"
import type { TextProps } from "../../../components"
import { color } from "../../../utils"
import { SchemaContext } from "../SchemaContext"
import { SuspensionDialog } from "../SuspensionDialog"
import { Checkbox } from "../checkbox"
import { copyToClipboard } from "../../../utils"
import { actions } from "../../../store"
import { PopperHover } from "../../../components/PopperHover"
import { Tooltip } from "../../../components/Tooltip"

type Props = Readonly<{
  className?: string
  designatedTimestamp?: string
  description?: string
  expanded?: boolean
  indexed?: boolean
  kind: TreeNodeKind
  table_id?: number
  name: string
  onClick?: (event: MouseEvent) => void
  partitionBy?: QuestDB.PartitionBy
  walEnabled?: boolean
  walTableData?: QuestDB.WalTable
  suffix?: ReactNode
  tooltip?: boolean
  type?: string
  value?: string
  selectOpen?: boolean
  selected?: boolean
  onSelectToggle?: (table_name: string) => void
  copyable?: boolean
}>

const Type = styled(Text)`
  margin-right: 1rem;
  flex: 0;
  transition: opacity ${TransitionDuration.REG}ms;
`

const Title = styled(Text)<TextProps & { kind: TreeNodeKind }>`
  cursor: ${({ kind }) =>
    ["folder", "table"].includes(kind) ? "pointer" : "initial"};

  .highlight {
    background-color: #7c804f;
    color: ${({ theme }) => theme.color.foreground};
  }
`

const CopyButton = styled(Button)<
  Pick<Props, "tooltip"> & { suspended?: boolean }
>`
  && {
    position: absolute;
    z-index: 2;
    right: ${({ suspended }) => (suspended ? "13rem" : "1rem")};
    opacity: 0;
    background: ${({ theme }) => theme.color.backgroundLighter};
    padding-top: 1.2rem;
    padding-bottom: 1.2rem;
    font-size: 1.3rem;

    .highlight {
      background-color: #7c804f;
      color: ${({ theme }) => theme.color.foreground};
    }
  }
`

const Wrapper = styled.div<Pick<Props, "expanded" | "kind"> & { suspended?: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  padding: ${({ suspended }) => (suspended ? "0" : "0.5rem 0")};
  padding-left: 1rem;
  transition: background ${TransitionDuration.REG}ms;

  &:hover,
  &:active {
    background: ${color("selection")};
  }

  &:hover
    ${/* sc-selector */ CopyButton},
    &:active
    ${/* sc-selector */ CopyButton} {
    opacity: 1;
  }

  &:hover ${/* sc-selector */ Type} {
    opacity: ${({ kind }) => (kind === "column" || kind === "info" ? 1 : 0)};
  }
`

const StyledTitle = styled(Title)`
  z-index: 1;
  flex-shrink: 0;
`

const TableActions = styled.span`
  z-index: 1;
  position: relative;
`

const FlexRow = styled.div<{ $selectOpen?: boolean }>`
  display: flex;
  align-items: center;
  width: 100%;
  transform: translateX(${({ $selectOpen }) => ($selectOpen ? "26px" : "0")});
  transition: transform 275ms ease-in-out;
`

const Spacer = styled.span`
  flex: 1;
`

const InfoIcon = styled(Information)`
  color: ${color("purple")};
`

const RocketIcon = styled(Rocket)`
  color: ${color("orange")};
  margin-right: 1rem;
`

const SortDownIcon = styled(SortDown)`
  color: ${color("green")};
  margin-right: 0.8rem;
`

const RightArrowIcon = styled(RightArrow)`
  color: ${color("gray2")};
  margin-right: 0.8rem;
  cursor: pointer;
`

const DownArrowIcon = styled(RightArrowIcon)`
  transform: rotateZ(90deg);
`

const DotIcon = styled(CheckboxBlankCircle)`
  color: ${color("gray2")};
  margin-right: 1rem;
`

const InfoIconWrapper = styled.div`
  display: flex;
  padding: 0 1rem;
  align-items: center;
  justify-content: center;
`

const ValueWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  max-width: 200px;
  flex: 1;
`

const CopyValueButton = styled(Button)`
  && {
    padding: 0.3rem;
    background: ${({ theme }) => theme.color.backgroundLighter};
  }
`

const TruncatedBox = styled(Box)`
  display: inline;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  cursor: default;
  font-style: italic;
  color: ${color("gray2")};
`

const Row = ({
  className,
  designatedTimestamp,
  description,
  expanded,
  kind,
  indexed,
  table_id,
  name,
  partitionBy,
  walEnabled,
  walTableData,
  onClick,
  suffix,
  tooltip,
  type,
  value,
  selectOpen,
  selected,
  onSelectToggle,
  copyable,
}: Props) => {
  const { query } = useContext(SchemaContext)
  const dispatch = useDispatch()

  const handleCopy = (text: string) => {
    copyToClipboard(text)
    dispatch(
      actions.query.addNotification({
        content: <Text color="foreground">Copied to clipboard</Text>,
      }),
    )
  }

  return (
    <Wrapper
      kind={kind}
      data-hook="schema-row"
      className={className}
      expanded={expanded}
      suspended={walTableData?.suspended && kind === "table"}
      onClick={(e) => {
        if (kind === "table" && selectOpen && onSelectToggle) {
          onSelectToggle(name)
        } else {
          onClick?.(e)
        }
      }}
    >
      <Box
        align="center"
        justifyContent="flex-start"
        gap="2rem"
        style={{ width: "100%", position: "relative" }}
      >
        {kind === "table" && (
          <div style={{ position: "absolute" }}>
            <Checkbox
              visible={selectOpen && onSelectToggle !== undefined}
              checked={selected}
            />
          </div>
        )}
        <FlexRow $selectOpen={selectOpen}>
          {kind === "table" && (
            <>
              <TableIcon
                partitionBy={partitionBy}
                walEnabled={walEnabled}
                suspended={walTableData?.suspended}
              />
            </>
          )}

          {kind === "column" && indexed && (
            <IconWithTooltip
              icon={<RocketIcon size="13px" />}
              placement="top"
              tooltip="Indexed"
            />
          )}

          {kind === "folder" && expanded && <DownArrowIcon size="14px" />}

          {kind === "folder" && !expanded && <RightArrowIcon size="14px" />}

          {kind === "column" && !indexed && name === designatedTimestamp && (
            <IconWithTooltip
              icon={<SortDownIcon size="14px" />}
              placement="top"
              tooltip="Designated timestamp"
            />
          )}

          {kind === "column" && !indexed && name !== designatedTimestamp && (
            <DotIcon size="12px" />
          )}

          <StyledTitle
            color="foreground"
            ellipsis
            kind={kind}
            data-hook={`schema-${kind}-title`}
          >
            <Highlighter
              highlightClassName="highlight"
              searchWords={[query ?? ""]}
              textToHighlight={name}
            />
          </StyledTitle>

          {suffix}

          <Spacer />

          {type && (
            <Type _style="italic" color="pinkLighter" transform="lowercase">
              {type}
            </Type>
          )}

          {kind === 'info' && value && (
            copyable ? (
              <ValueWrapper>
                <PopperHover
                  placement="top"
                  trigger={<TruncatedBox>{value}</TruncatedBox>}
                >
                  <Tooltip>{value}</Tooltip>
                </PopperHover>
                <CopyValueButton
                  skin="transparent"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCopy(value)
                  }}
                >
                  <FileCopy size="14px" />
                </CopyValueButton>
              </ValueWrapper>
            ) : (
              <Type _style="italic" color="gray2">
                {value}
              </Type>
            )
          )}

          {walTableData?.suspended && kind === "table" && (
            <TableActions>
              <SuspensionDialog walTableData={walTableData} />
            </TableActions>
          )}

          {tooltip && description && (
            <IconWithTooltip
              icon={
                <InfoIconWrapper>
                  <InfoIcon size="10px" />
                </InfoIconWrapper>
              }
              placement="right"
              tooltip={description}
            />
          )}
        </FlexRow>
        {!tooltip && <Text color="comment">{description}</Text>}
      </Box>
    </Wrapper>
  )
}

export default Row
