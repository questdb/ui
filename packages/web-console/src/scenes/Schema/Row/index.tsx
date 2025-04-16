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

import React, { MouseEvent, useState, useEffect, useRef } from "react"
import styled from "styled-components"
import { Rocket, InfoCircle } from "@styled-icons/boxicons-regular"
import { SortDown } from "@styled-icons/boxicons-regular"
import { ChevronRight } from "@styled-icons/boxicons-solid"
import { Error as ErrorIcon } from "@styled-icons/boxicons-regular"
import { CheckboxBlankCircle, Loader4 } from "@styled-icons/remix-line"
import type { StyledIcon } from '@styled-icons/styled-icon'
import { OneHundredTwentyThree, CalendarMinus, Globe, GeoAlt, Type as CharIcon, Tag } from '@styled-icons/bootstrap'
import type { TreeNodeKind } from "../../../components/Tree"
import * as QuestDB from "../../../utils/questdb"
import Highlighter from "react-highlight-words"
import { TableIcon } from "../table-icon"
import { Box } from "@questdb/react-components"
import { Text, TransitionDuration, IconWithTooltip, spinAnimation } from "../../../components"
import { color } from "../../../utils"
import { useSchema } from "../SchemaContext"
import { Checkbox } from "../checkbox"
import { PopperHover } from "../../../components/PopperHover"
import { Tooltip } from "../../../components/Tooltip"
import { mapColumnTypeToUI } from "../../../scenes/Import/ImportCSVFiles/utils"
import { MATVIEWS_GROUP_KEY } from "../localStorageUtils"

type Props = Readonly<{
  className?: string
  designatedTimestamp?: string
  expanded?: boolean
  kind: TreeNodeKind
  table_id?: number
  name: string
  onClick?: (event: MouseEvent) => void
  "data-hook"?: string
  partitionBy?: QuestDB.PartitionBy
  walEnabled?: boolean
  isLoading?: boolean
  type?: string
  selectOpen?: boolean
  selected?: boolean
  onSelectToggle?: ({name, type}: {name: string, type: TreeNodeKind}) => void
  errors?: string[]
  value?: string
  includesSymbol?: boolean
  path?: string
  tabIndex?: number
}>

const Type = styled(Text)`
  align-items: center;
  display: inline-block;
`

const Title = styled(Text)`
  .highlight {
    background-color: #7c804f;
    color: ${({ theme }) => theme.color.foreground};
  }
`

const Wrapper = styled.div<{ $isExpandable: boolean, $includesSymbol?: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0;
  padding-left: 1rem;
  padding-right: 1rem;
  user-select: none;
  border: 1px solid transparent;
  border-radius: 0.4rem;
  ${({ $isExpandable }) => $isExpandable && `
    cursor: pointer;
  `}

  ${({ $includesSymbol, $isExpandable }) => $includesSymbol && !$isExpandable && `
    padding-left: 3.3rem;
  `}

  &:hover,
  &:active {
    background: ${color("selection")};
  }

  &:focus-visible, &.focused {
    outline: none;
    background: ${color("selection")};
    border: 1px solid ${color("comment")};
  }
`

const StyledTitle = styled(Title)`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  z-index: 1;
  flex-shrink: 0;
  margin-right: 1rem;

  .highlight {
    background-color: #45475a;
    color: ${({ theme }) => theme.color.foreground};
  }

  svg {
    color: ${color("cyan")};
  }
`

const TableActions = styled.span`
  z-index: 1;
  position: relative;
  display: inline-flex;
  align-items: center;
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

const SortDownIcon = styled(SortDown)`
  color: ${color("green")};
  margin-right: 0.8rem;
  flex-shrink: 0;
`

const ChevronRightIcon = styled(ChevronRight)`
  color: ${color("gray2")};
  margin-right: 0.8rem;
  cursor: pointer;
  flex-shrink: 0;
  width: 1.5rem;
`

const ChevronDownIcon = styled(ChevronRightIcon)`
  transform: rotateZ(90deg);
`

const DotIcon = styled(CheckboxBlankCircle)`
  color: ${color("gray2")};
  margin-right: 1rem;
`

const Loader = styled(Loader4)`
  margin-left: 1rem;
  color: ${color("orange")};
  ${spinAnimation};
`

const ErrorIconWrapper = styled.div`
  display: inline-flex;
  align-items: center;
  align-self: center;

  svg {
    color: #f47474;
  }
`

const ErrorItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`

const TypeIcon = styled.div<{ $type?: string }>`
  margin-right: 0.8rem;
  display: flex;
  align-items: center;
  color: ${color("cyan")};

  svg {
    color: ${({ $type }) => $type === 'SYMBOL' ? color("yellow") : color("cyan")};
  }
`

const TYPE_ICONS = {
  number: {
    types: ["BOOLEAN", "BYTE", "SHORT", "INT", "LONG", "LONG256", "DOUBLE", "FLOAT", "BINARY", "UUID"],
    icon: OneHundredTwentyThree
  },
  date: {
    types: ["DATE"],
    icon: CalendarMinus
  },
  text: {
    types: ["CHAR", "VARCHAR", "STRING"],
    icon: CharIcon
  },
  symbol: {
    types: ["SYMBOL"],
    icon: Tag
  },
  time: {
    types: ["TIMESTAMP", "INTERVAL"],
    icon: SortDown
  },
  network: {
    types: ["IPV4"],
    icon: Globe
  },
  geo: {
    types: ["GEOHASH"],
    icon: GeoAlt
  }
} as const

const IconWrapper = ({ icon: Icon, size = "14px", type }: { icon: StyledIcon; size?: string; type?: string }) => (
  <TypeIcon $type={type}>
    <Icon size={size} />
  </TypeIcon>
)

const getIcon = (type: string) => {
  const iconConfig = Object.values(TYPE_ICONS).find(
    ({ types }) => types.some((t) => t === mapColumnTypeToUI(type))
  )

  return <IconWrapper icon={iconConfig?.icon ?? DotIcon} type={type} />
}

const ColumnIcon = ({ 
  isDesignatedTimestamp, 
  type 
}: { 
  isDesignatedTimestamp: boolean;
  type?: string;
}) => {
  if (!type) return null

  if (isDesignatedTimestamp) {
    return (
      <IconWithTooltip
        icon={<SortDownIcon size="14px" />}
        placement="top"
        tooltip="Designated timestamp"
      />
    )
  }

  return getIcon(type)
}

export const isElementVisible = (element: HTMLElement | undefined, container: HTMLElement | null) => {
  if (!element || !container) return false
  const elementRect = element.getBoundingClientRect()
  const containerRect = container instanceof Window 
    ? { top: 0, bottom: window.innerHeight }
    : container.getBoundingClientRect()

  const visibleTop = Math.max(elementRect.top, containerRect.top)
  const visibleBottom = Math.min(elementRect.bottom, containerRect.bottom)
  const visibleHeight = Math.max(0, visibleBottom - visibleTop)
  
  const totalHeight = elementRect.bottom - elementRect.top
  
  return visibleHeight >= totalHeight * 0.5
}

export const computeFocusableElements = (scrollerRef: HTMLElement) => {
  const allElements = Array.from(document.querySelectorAll('[tabindex="100"], [tabindex="101"], [tabindex="200"], [tabindex="201"]'))

  const focusableElements = allElements
    .filter(element => isElementVisible(element as HTMLElement, scrollerRef))
    .sort((a, b) => {
      const tabIndexA = parseInt(a.getAttribute('tabindex') || '0')
      const tabIndexB = parseInt(b.getAttribute('tabindex') || '0')
      
      if (tabIndexA !== tabIndexB) {
        return tabIndexA - tabIndexB
      }
      
      const positionA = allElements.indexOf(a)
      const positionB = allElements.indexOf(b)
      return positionA - positionB
    })

  return focusableElements
}

const Row = ({
  className,
  designatedTimestamp,
  expanded,
  kind,
  table_id,
  name,
  partitionBy,
  walEnabled,
  onClick,
  "data-hook": dataHook,
  isLoading,
  type,
  selectOpen,
  selected,
  onSelectToggle,
  errors,
  value,
  includesSymbol,
  path,
  tabIndex,
}: Props) => {
  const { query, scrollBy, scrollerRef } = useSchema()
  const [showLoader, setShowLoader] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isExpandable = ["folder", "table", "matview"].includes(kind) || (kind === "column" && type === "SYMBOL")
  const isTableKind = ["table", "matview"].includes(kind)

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

  const getTabIndex = () => { 
    if (tabIndex) {
      return tabIndex
    }
    if (path?.startsWith(MATVIEWS_GROUP_KEY)) {
      return 201
    }
    return 101
  }

  return (
    <Wrapper
      $isExpandable={isExpandable}
      $includesSymbol={includesSymbol}
      data-hook={dataHook ?? "schema-row"}
      data-kind={kind}
      data-path={path}
      className={className}
      tabIndex={getTabIndex()}
      onFocus={(e) => {
        ;(e.target as HTMLElement).classList.add('focused')
      }}
      onBlur={(e) => {
        ;(e.target as HTMLElement).classList.remove('focused')
      }}
      onClick={(e) => {
        const target = e.target as HTMLElement
        target.focus();
        if (isTableKind && selectOpen && onSelectToggle) {
          onSelectToggle({name, type: kind})
        } else {
          onClick?.(e)
        }
      }}
      onKeyDown={(e) => {
        if (!path) return
        if (!scrollerRef.current || !isElementVisible(document.activeElement as HTMLElement, scrollerRef.current)) return
        if (isExpandable) {
          if (
              e.key === "Enter"
              || (e.key === "ArrowRight" && !expanded)
              || (e.key === "ArrowLeft" && expanded)
          ) {
            // @ts-ignore
            onClick?.()
          }
        }
        if (e.key === "ArrowDown") {
          e.preventDefault()
          const currentElement = document.activeElement as HTMLElement
          if (!currentElement || !scrollerRef.current) return
          let focusableElements = computeFocusableElements(scrollerRef.current)
          let currentIndex = focusableElements.indexOf(currentElement)

          if (currentIndex === focusableElements.length - 1) {
            scrollBy(32)
          }
          focusableElements = computeFocusableElements(scrollerRef.current)
          currentIndex = focusableElements.indexOf(document.activeElement as HTMLElement)

          if (currentIndex < focusableElements.length - 1) {
            const nextElement = focusableElements[currentIndex + 1] as HTMLElement
            nextElement.focus()
          }
        }
        if (e.key === "ArrowUp") {
          e.preventDefault()
          if (!document.activeElement || !scrollerRef.current) return
          let focusableElements = computeFocusableElements(scrollerRef.current)
          let currentIndex = focusableElements.indexOf(document.activeElement as HTMLElement)

          if (currentIndex === 0) {
            scrollBy(-32)
          }
          setTimeout(() => {
            focusableElements = computeFocusableElements(scrollerRef.current!)
            currentIndex = focusableElements.indexOf(document.activeElement as HTMLElement)
            if (currentIndex > 0) {
              const previousElement = focusableElements[currentIndex - 1] as HTMLElement
              previousElement.focus()
            }
          }, 0)

        }
      }}
    >
      <Box
        align="center"
        justifyContent="flex-start"
        gap="2rem"
        style={{ width: "100%", position: "relative" }}
      >
        {isTableKind && (
          <div style={{ position: "absolute" }}>
            <Checkbox
              visible={selectOpen && onSelectToggle !== undefined}
              checked={selected}
            />
          </div>
        )}
        <FlexRow $selectOpen={selectOpen}>
          {isExpandable && expanded && <ChevronDownIcon size="14px" />}
          {isExpandable && !expanded && <ChevronRightIcon size="14px" />}

          {kind === "column" && (
            <ColumnIcon 
              isDesignatedTimestamp={name === designatedTimestamp}
              type={type}
            />
          )}

          <StyledTitle
            color="foreground"
            ellipsis
            data-hook={`schema-${kind}-title`}
          >
            {isTableKind && (
              <TableIcon
                isPartitioned={partitionBy && partitionBy !== "NONE"}
                walEnabled={walEnabled}
                isMaterializedView={kind === "matview"}
              />
            )}
            {kind === "detail" && (
              <InfoCircle size="14px" />
            )}
            <Highlighter
              highlightClassName="highlight"
              searchWords={[query ?? ""]}
              textToHighlight={name}
            />
          </StyledTitle>

          {type && (
            <Type color="gray2" transform="lowercase" ellipsis>
              ({type})
            </Type>
          )}

          {kind === "detail" && (
            <Text color="gray2">
              {value}
            </Text>
          )}

          {showLoader && <Loader size="18px" />}

          <Spacer />

          {errors && errors.length > 0 && (
            <TableActions>
              <PopperHover
                placement="top"
                trigger={
                  <ErrorIconWrapper data-hook="schema-row-error-icon">
                    <ErrorIcon size="18px" />
                  </ErrorIconWrapper>
                }
              >
                <Tooltip>
                  {errors.length > 1 ? errors.map((error) => (
                    <ErrorItem key={error}>
                      <ErrorIconWrapper>
                        <ErrorIcon size="18px" />
                      </ErrorIconWrapper>
                      <Text color="foreground">{error}</Text>
                    </ErrorItem>
                  )) : (
                    <Text color="foreground">{errors[0]}</Text>
                  )}
                </Tooltip>
              </PopperHover>
            </TableActions>
          )}
        </FlexRow>
      </Box>
    </Wrapper>
  )
}

export default Row
