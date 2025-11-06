import React, { useEffect, useState, useRef } from "react"
import styled, { css } from "styled-components"
import { Table } from "@styled-icons/remix-line"
import Highlighter from "react-highlight-words"
import { Box, Input } from "../../../components"
import { useKeyPress } from "../../../hooks"

type Option = {
  label: string
  value: string
  disabled: boolean
}
type Props = {
  tableId?: number
  defaultValue: string
  options: Option[]
  onSelect: (value: string) => void
  placeholder: string
  loading: boolean
}

const Root = styled.div`
  display: flex;
  position: relative;
  margin-left: 1rem;
`

const TableIcon = styled(Table)`
  color: ${({ theme }) => theme.color.gray2};
`

const StyledInput = styled(Input)<{ $highlight?: boolean }>`
  border: 1px solid transparent;
  background: transparent;
  font-weight: 600;
  font-size: 1.6rem;
  color: ${({ theme }) => theme.color.yellow};
  text-transform: uppercase;
  width: 100%;
  ${({ $highlight }) =>
    $highlight &&
    css`
      background: transparent;
      border-color: ${({ theme }) => theme.color.comment};
    `}

  &:hover,
  &:active,
  &:focus {
    background: transparent;
    border-color: ${({ theme }) => theme.color.comment};
  }
`

const ShadowInput = styled(StyledInput)`
  visibility: hidden;
  width: max-content;
  z-index: 1;
  position: fixed;
`

const Wrapper = styled.div`
  position: absolute;
  width: 30rem;
  z-index: 100;
  top: 100%;
  overflow-y: auto;
  max-height: calc(10 * 3rem);
`

const Options = styled.ul`
  list-style: none;
  background: ${({ theme }) => theme.color.backgroundDarker};
  box-shadow: 0 5px 5px 0 ${({ theme }) => theme.color.black40};
  margin: 0;
  padding: 0.5rem;
  border-radius: 0.4rem;
`

const Item = styled.li<{ active: boolean; disabled: boolean }>`
  display: flex;
  align-items: center;
  height: 3rem;
  padding: 0 1rem;
  font-family:
    SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
    monospace;
  ${({ active, theme }) => `
    background: ${active ? theme.color.selection : "transparent"};
  `}

  ${({ disabled, theme }) => `
    color: ${disabled ? theme.color.gray1 : theme.color.foreground};
    cursor: ${disabled ? "not-allowed" : "pointer"};
  `}
`
export const TableSelector = ({
  defaultValue,
  options,
  onSelect,
  placeholder,
  loading,
}: Props) => {
  const [hasFocus, setHasFocus] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const shadowInputRef = useRef<HTMLSpanElement | null>(null)
  const [query, setQuery] = useState<string | undefined>(defaultValue ?? "")
  const [keyIndex, setKeyIndex] = useState(-1)
  const downPress = useKeyPress("ArrowDown")
  const upPress = useKeyPress("ArrowUp")
  const enterPress = useKeyPress("Enter")
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const initialQuery = useRef<string | undefined>(undefined)

  const filteredOptions = options
    .filter((option) =>
      query ? option.label.toLowerCase().includes(query.toLowerCase()) : true,
    )
    .sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()))

  useEffect(() => {
    if (!inputRef.current || !shadowInputRef.current) return

    if (inputRef.current && shadowInputRef.current && !loading) {
      inputRef.current.style.width = `${shadowInputRef.current.offsetWidth}px`
      const nextValue: string = defaultValue ?? ""

      // As we refresh the edit quite frequently, this code is necessary
      // to allow user change table name. Unchecked table name is overwritten at the same
      // time as user edits it.
      if (initialQuery.current !== nextValue) {
        setQuery(defaultValue ?? "")
        initialQuery.current = defaultValue ?? ""
      }

      const onBlur = (e: MouseEvent) => {
        if (inputRef.current?.contains(e.target as Node)) {
          return
        }
        if (
          (e.target instanceof HTMLElement || e.target instanceof SVGElement) &&
          e.target.getAttribute("data-hook") !== "table-selector-item"
        ) {
          if (defaultValue) {
            setQuery(defaultValue)
          }
          setHasFocus(false)
        }
      }
      document.addEventListener("click", onBlur)
      return () => document.removeEventListener("click", onBlur)
    }
  }, [defaultValue, inputRef, loading])

  useEffect(() => {
    if (downPress) {
      setKeyIndex(keyIndex < filteredOptions.length - 1 ? keyIndex + 1 : 0)
    } else if (upPress) {
      setKeyIndex(keyIndex > 0 ? keyIndex - 1 : filteredOptions.length - 1)
    }
  }, [downPress, upPress])

  useEffect(() => {
    if (enterPress && filteredOptions.length > 0) {
      if (keyIndex !== -1) {
        if (filteredOptions[keyIndex].disabled) return
        onSelect(filteredOptions[keyIndex].value)
        setHasFocus(false)
        setQuery(filteredOptions[keyIndex].label)
      }
    }
  }, [enterPress])

  useEffect(() => {
    if (
      filteredOptions.length === 1 &&
      query?.toLowerCase() === filteredOptions[0].label.toLowerCase()
    ) {
      setKeyIndex(0)
    }
  }, [query, filteredOptions])

  return (
    <Root>
      <Box align="center" gap="0.5rem">
        <TableIcon size="18px" />
        <StyledInput
          value={query}
          $highlight={defaultValue === ""}
          placeholder={defaultValue !== "" ? defaultValue : placeholder}
          ref={inputRef}
          onFocus={() => {
            setQuery(defaultValue)
            inputRef.current?.select()
            setHasFocus(true)
          }}
          onKeyUp={(e) => {
            if (e.key === "Backspace") {
              if (query === "") {
                setQuery("")
                setHasFocus(true)
                setKeyIndex(-1)
              }
            } else if (e.key === "Escape") {
              setQuery(defaultValue)
              setHasFocus(false)
            }
          }}
          onChange={(e) => {
            setQuery(e.target.value ?? "")
          }}
        />
      </Box>
      <ShadowInput ref={shadowInputRef} as="span">
        {defaultValue !== "" ? defaultValue : placeholder}
      </ShadowInput>
      {hasFocus && (
        <Wrapper ref={wrapperRef}>
          <Options>
            {filteredOptions
              .sort((a, b) =>
                a.disabled === b.disabled ? 0 : a.disabled ? 1 : -1,
              )
              .map((option, index) => (
                <Item
                  data-hook="table-selector-item"
                  tabIndex={index}
                  active={keyIndex === filteredOptions.indexOf(option)}
                  key={option.value}
                  onMouseEnter={() => setKeyIndex(index)}
                  onMouseLeave={() => setKeyIndex(-1)}
                  disabled={option.disabled}
                  {...(!option.disabled && {
                    onClick: () => {
                      inputRef.current!.value = option.label
                      onSelect(option.value)
                      setQuery(option.label)
                      setHasFocus(false)
                    },
                  })}
                >
                  <Highlighter
                    highlightClassName="highlight"
                    searchWords={[query ?? ""]}
                    textToHighlight={option.label}
                  />
                </Item>
              ))}
          </Options>
        </Wrapper>
      )}
    </Root>
  )
}
