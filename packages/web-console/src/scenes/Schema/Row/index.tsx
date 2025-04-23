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

import React, { useState, useEffect, useRef } from "react"
import styled from "styled-components"
import { InfoCircle } from "@styled-icons/boxicons-regular"
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
import { Text, IconWithTooltip, spinAnimation } from "../../../components"
import { color } from "../../../utils"
import { useSchema } from "../SchemaContext"
import { Checkbox } from "../checkbox"
import { PopperHover } from "../../../components/PopperHover"
import { Tooltip } from "../../../components/Tooltip"
import { mapColumnTypeToUI } from "../../../scenes/Import/ImportCSVFiles/utils"
import { MATVIEWS_GROUP_KEY, TABLES_GROUP_KEY } from "../localStorageUtils"

type Props = Readonly<{
  className?: string
  designatedTimestamp?: string
  expanded?: boolean
  kind: TreeNodeKind
  table_id?: number
  name: string
  onExpandCollapse: () => void
  "data-hook"?: string
  partitionBy?: QuestDB.PartitionBy
  walEnabled?: boolean
  isLoading?: boolean
  type?: string
  errors?: string[]
  value?: string
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

const Wrapper = styled.div<{ $level?: number, $selectOpen?: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0;
  padding-right: 1rem;
  user-select: none;
  border: 1px solid transparent;
  border-radius: 0.4rem;

  cursor: ${({ $selectOpen }) => $selectOpen ? "pointer" : "default"};
  &:hover {
    background: ${({ $selectOpen }) => $selectOpen ? color("selectionDarker") : "transparent"};
  }

  ${({ $level }) => $level && `
    padding-left: ${$level * 1.5 + 1}rem;
  `}

  &:focus-visible, &.focused {
    outline: none;
    background: ${color("tableSelection")};
    border: 1px solid ${color("cyan")};
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

const FlexRow = styled.div<{ $selectOpen?: boolean, $isTableKind?: boolean }>`
  display: flex;
  align-items: center;
  width: 100%;
  transform: translateX(${({ $selectOpen, $isTableKind }) => $selectOpen && $isTableKind ? "1rem" : "0"});
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

const ChevronRightIcon = styled(ChevronRight)<{ $expanded?: boolean }>`
  color: ${color("gray2")};
  margin-right: 1.5rem;
  cursor: pointer;
  flex-shrink: 0;
  width: 1.5rem;
  transform: rotateZ(${({ $expanded }) => $expanded ? "90deg" : "0deg"});
  position: absolute;
  left: -2rem;
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
  const allElements = Array.from(document.querySelectorAll('[data-path][tabindex="100"], [data-path][tabindex="101"], [data-path][tabindex="200"], [data-path][tabindex="201"]'))

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
  onExpandCollapse,
  "data-hook": dataHook,
  isLoading,
  type,
  errors,
  value,
  path,
  tabIndex,
}: Props) => {
  const { query, scrollBy, scrollerRef, selectOpen, selectedTables, handleSelectToggle } = useSchema()
  const [showLoader, setShowLoader] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isExpandable = ["folder", "table", "matview"].includes(kind) || (kind === "column" && type === "SYMBOL")
  const isTableKind = ["table", "matview"].includes(kind)
  const isRootFolder = [MATVIEWS_GROUP_KEY, TABLES_GROUP_KEY].includes(path ?? "")

  const selected = !!(selectedTables.find((t: {name: string, type: TreeNodeKind}) =>
    t.name === name
    && t.type === kind
  ))

  const handleExpandCollapse = () => {
    if (!isExpandable) {
      return
    }

    let savedPosition = 0
    
    if (expanded && scrollerRef.current && path) {
      const element = document.querySelector(`[data-path="${path}"]`)
      if (element) {
        const rect = element.getBoundingClientRect()
        const scrollerRect = scrollerRef.current.getBoundingClientRect()
        savedPosition = rect.top - scrollerRect.top + scrollerRef.current.scrollTop
      }
    }
    
    onExpandCollapse()
    
    if (scrollerRef.current && path) {
      // If the contents of element is large, the element sometimes disappears from the DOM because
      // of virtualization. This is a workaround to ensure the element is still visible and focused after a collapse.
      setTimeout(() => {
        let element = document.querySelector(`[data-path="${path}"]`)
        if (!element) {
          scrollerRef.current?.scrollTo({ top: savedPosition })
          setTimeout(() => {
            element = document.querySelector(`[data-path="${path}"]`)
            if (element && !element.classList.contains('focused')) {
              (element as HTMLElement).focus()
            }
          }, 50)
        }
      }, 50)
    }
  }

  const handleClick = () => {
    if (isTableKind && selectOpen && handleSelectToggle) {
      handleSelectToggle({ name, type: kind })
    }
  }

  const handleGoToParent = () => {
    const pathSegments = path!.split(":")
    pathSegments.pop()
    const parentPath = pathSegments.join(":")
    const parentElement = document.querySelector(`[data-path="${parentPath}"]`) as HTMLElement
    if (parentElement) {
      parentElement.focus()
    }
  }

  const handleGoToNextSibling = () => {
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

  const handleGoToPreviousSibling = () => {
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
    })
  }

  const getTabIndex = () => { 
    if (tabIndex) {
      return tabIndex
    }
    if (path?.startsWith(MATVIEWS_GROUP_KEY)) {
      return 201
    }
    return 101
  }

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

  if (selectOpen && !isTableKind && !isRootFolder) {
    return null
  }

  return (
    <Wrapper
      $level={path ? path.split(":").length - 2 : 0}
      $selectOpen={selectOpen}
      data-hook={dataHook ?? "schema-row"}
      data-kind={kind}
      data-path={path}
      className={className}
      tabIndex={getTabIndex()}
      onContextMenu={(e) => {
        if (!isTableKind) {
          e.preventDefault()
        }
      }}
      onFocus={(e) => {
        if (!selectOpen || isRootFolder) {
          (e.target as HTMLElement).classList.add('focused')
        }
      }}
      onBlur={(e) => {
        ;(e.target as HTMLElement).classList.remove('focused')
      }}
      onDoubleClick={handleExpandCollapse}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "PageUp" || e.key === "PageDown" || e.key === "Home" || e.key === "End") {
          return
        }
        e.preventDefault()
        if (!path) return
        if (!scrollerRef.current || !isElementVisible(document.activeElement as HTMLElement, scrollerRef.current)) return

        if (isExpandable && (
          e.key === "Enter"
          || (e.key === "ArrowRight" && !expanded)
          || (e.key === "ArrowLeft" && expanded)
        )) {
          handleExpandCollapse()
        }

        const shouldGoToParent = (!isExpandable || !expanded) && e.key === "ArrowLeft"
        const shouldGoToNextSibling = ((!isExpandable || expanded) && e.key === "ArrowRight") || e.key === "ArrowDown"
        
        if (shouldGoToParent) {
          handleGoToParent()
        }
        if (shouldGoToNextSibling) {
          handleGoToNextSibling()
        }

        if (e.key === "ArrowUp") {
          handleGoToPreviousSibling()
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
          <div style={{ position: "absolute", left: "-2rem" }}>
            <Checkbox
              visible={selectOpen}
              checked={selected}
            />
          </div>
        )}
        <FlexRow $selectOpen={selectOpen} $isTableKind={isTableKind}>
          {isExpandable && (!selectOpen || !isTableKind) && <ChevronRightIcon size="15px" $expanded={expanded} onClick={handleExpandCollapse} />}

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
