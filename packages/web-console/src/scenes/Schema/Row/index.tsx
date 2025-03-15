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

import React, { MouseEvent, useContext, useState, useEffect, useRef } from "react"
import styled from "styled-components"
import { Rocket } from "@styled-icons/boxicons-regular"
import { SortDown } from "@styled-icons/boxicons-regular"
import { RightArrow } from "@styled-icons/boxicons-regular"
import { CheckboxBlankCircle, Information, Loader4 } from "@styled-icons/remix-line"
import type { TreeNodeKind } from "../../../components/Tree"
import * as QuestDB from "../../../utils/questdb"
import Highlighter from "react-highlight-words"
import { TableIcon } from "../table-icon"
import { Box } from "@questdb/react-components"
import { Text, TransitionDuration, IconWithTooltip, spinAnimation } from "../../../components"
import type { TextProps } from "../../../components"
import { color } from "../../../utils"
import { SchemaContext } from "../SchemaContext"
import { SuspensionDialog } from "../SuspensionDialog"
import { Checkbox } from "../checkbox"
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
  isLoading?: boolean
  tooltip?: boolean
  type?: string
  value?: string
  selectOpen?: boolean
  selected?: boolean
  onSelectToggle?: (table_name: string) => void
  copyable?: boolean
  suffix?: React.ReactNode
}>

const Type = styled(Text)`
  display: flex;
  align-items: center;
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

const Wrapper = styled.div<Pick<Props, "expanded" | "kind"> & { suspended?: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  padding: ${({ suspended }) => (suspended ? "0" : "0.5rem 0")};
  padding-left: 1rem;
  padding-right: 1rem;
  transition: background ${TransitionDuration.REG}ms;

  &:hover,
  &:active {
    background: ${color("selection")};
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
  justify-content: flex-end;
  width: 100%;
`

const TruncatedBox = styled(Box)`
  display: inline;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  cursor: default;
  font-style: italic;
  color: ${color("gray2")};
  text-align: right;
`

const Loader = styled(Loader4)`
  margin-left: 1rem;
  color: ${color("orange")};
  ${spinAnimation};
`

const ValueText = styled(Text)`
  font-style: italic;
  color: ${color("gray2")};
  flex: 1;
  text-align: right;
  overflow: hidden;
  white-space: nowrap;
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
  isLoading,
  tooltip,
  type,
  value,
  selectOpen,
  selected,
  onSelectToggle,
  copyable,
  suffix,
}: Props) => {
  const { query } = useContext(SchemaContext)
  const [showLoader, setShowLoader] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (isLoading) {
      timeoutRef.current = setTimeout(() => {
        setShowLoader(true)
      }, 500)
    } else {
      setShowLoader(false)
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [isLoading])

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

          {showLoader && <Loader size="18px" />}

          <Spacer />

          {type && (
            <Type _style="italic" color="pinkLighter" transform="lowercase">
              {type}
            </Type>
          )}

          {kind === 'info' && value && (
            <ValueWrapper>
              {copyable ? (
                <PopperHover
                  placement="top"
                  trigger={<TruncatedBox data-hook="copyable-value">{value}</TruncatedBox>}
                >
                  <Tooltip>{value}</Tooltip>
                </PopperHover>
              ) : (
                <ValueText>{value}</ValueText>
              )}
              {suffix}
            </ValueWrapper>
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
        {!tooltip && kind !== 'info' && <Text color="comment">{description}</Text>}
      </Box>
    </Wrapper>
  )
}

export default Row
