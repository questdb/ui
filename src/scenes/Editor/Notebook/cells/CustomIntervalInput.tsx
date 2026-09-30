import React, { useState } from "react"
import styled from "styled-components"
import { Input } from "../../../../components"
import { menuInputStyles } from "../../../../components/menuStyles"
import { parseAutoRefreshInterval } from "../notebookUtils"
import type { AutoRefreshInterval } from "../../../../store/notebook"

const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0 0.4rem;
  margin-top: 0.4rem;
`

const IntervalInput = styled(Input)`
  ${menuInputStyles}
`

const Hint = styled.span`
  font-size: 1.1rem;
  color: ${({ theme }) => theme.color.statusDangerStrong};
`

type Props = {
  onApply: (value: AutoRefreshInterval) => void
}

export const CustomIntervalInput: React.FC<Props> = ({ onApply }) => {
  const [text, setText] = useState("")
  const [invalid, setInvalid] = useState(false)

  const apply = () => {
    const interval = parseAutoRefreshInterval(text)
    if (!interval) {
      setInvalid(true)
      return
    }
    setText("")
    setInvalid(false)
    onApply(interval)
  }

  // The menu reads keys for typeahead and arrow navigation; the input keeps
  // them, and Escape still closes the menu.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") return
    event.stopPropagation()
    if (event.key === "Enter") {
      event.preventDefault()
      apply()
    }
  }

  return (
    <Root>
      <IntervalInput
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setInvalid(false)
        }}
        onKeyDown={handleKeyDown}
        placeholder="Custom interval"
        aria-label="Custom auto-refresh interval"
        aria-invalid={invalid}
        variant={invalid ? "error" : undefined}
        autoComplete="off"
        spellCheck={false}
      />
      {invalid && <Hint role="alert">Should be between 50ms and 60m</Hint>}
    </Root>
  )
}
