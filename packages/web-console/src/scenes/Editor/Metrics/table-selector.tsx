import React, { useEffect, useState, useRef, useLayoutEffect } from "react"
import styled from "styled-components"
import { Box, Input } from "@questdb/react-components"
import { Table } from "@styled-icons/remix-line"
import Highlighter from "react-highlight-words"
import { useKeyPress } from "../../../components"

type Option = {
  label: string
  value: string
}
type Props = {
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

const StyledInput = styled(Input)`
  border: 1px solid transparent;
  background: transparent;
  font-weight: 600;
  font-size: 1.6rem;
  width: 100%;

  &:hover,
  &:active,
  &:focus {
    background: transparent;
    border-color: ${({ theme }) => theme.color.comment};
  }
`

const Options = styled.ul`
  position: absolute;
  width: 20rem;
  top: 100%;
  list-style: none;
  z-index: 100;
  background: ${({ theme }) => theme.color.backgroundDarker};
  box-shadow: 0 5px 5px 0 ${({ theme }) => theme.color.black40};
  margin: 0;
  padding: 0.5rem;
  border-radius: 0.4rem;
`

const Item = styled.li<{ active: boolean }>`
  display: flex;
  align-items: center;
  height: 3rem;
  cursor: pointer;
  padding: 0 1rem;

  ${({ active, theme }) => `
    background: ${active ? theme.color.selection : "transparent"};
  `}

  .highlight {
    background-color: #7c804f;
    color: ${({ theme }) => theme.color.foreground};
  }
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
  const [query, setQuery] = useState<string | undefined>(defaultValue ?? "")
  const [keyIndex, setKeyIndex] = useState(-1)
  const downPress = useKeyPress("ArrowDown")
  const upPress = useKeyPress("ArrowUp")
  const enterPress = useKeyPress("Enter")

  const filteredOptions = options.filter((option) =>
    query ? option.label.toLowerCase().includes(query.toLowerCase()) : true,
  )

  useEffect(() => {
    if (!inputRef.current) return

    inputRef.current.style.width = `calc(${
      defaultValue !== "" ? defaultValue.length : placeholder.length
    }ch + 1.2rem)`

    if (inputRef.current && !loading) {
      setQuery(defaultValue ?? "")
      if (defaultValue === "") {
        inputRef.current!.focus()
      }

      const onBlur = (e: MouseEvent) => {
        if (inputRef.current?.contains(e.target as Node)) {
          return
        }
        if (e.target instanceof HTMLElement && e.target.tagName !== "LI") {
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
      {hasFocus && (
        <Options>
          {filteredOptions.map((option, index) => (
            <Item
              active={keyIndex === filteredOptions.indexOf(option)}
              key={option.value}
              onClick={() => {
                inputRef.current!.value = option.label
                onSelect(option.value)
                setQuery(option.label)
                setHasFocus(false)
              }}
              onMouseEnter={() => setKeyIndex(index)}
              onMouseLeave={() => setKeyIndex(-1)}
            >
              <Highlighter
                highlightClassName="highlight"
                searchWords={[query ?? ""]}
                textToHighlight={option.label}
              />
            </Item>
          ))}
        </Options>
      )}
    </Root>
  )
}
