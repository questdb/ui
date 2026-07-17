import React, { useEffect, useState } from "react"
import styled, { css, keyframes } from "styled-components"

const MAX_SPEECH_MS = 2500
const CALL_STEP_MS = 500
const CALL_MS = 1000

const cursorBlink = keyframes`
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
`

const callBlink = keyframes`
  0%, 50%, 100% { opacity: 1; }
  25%, 75% { opacity: 0.2; }
`

const Frame = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  padding: 1px;
  background: #151515;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1.2rem;
  font-family: ${({ theme }) => theme.fontMonospace};
`

const TitleBar = styled.div`
  display: flex;
  align-items: center;
  gap: 1.2rem;
  padding: 0.8rem 1.2rem;
`

const Dots = styled.div`
  display: flex;
  gap: 0.6rem;
`

const Dot = styled.span<{ $color: string }>`
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 9999px;
  background: ${({ $color }) => $color};
`

const RepoName = styled.span`
  padding-left: 0.6rem;
  font-size: 1.1rem;
  color: ${({ theme }) => theme.color.mutedLabel};
`

const Body = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 0.2rem;
  overflow: hidden;
  padding: 0.8rem 1.4rem 1.2rem;
`

const PromptRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.7rem 1.2rem 0.8rem;
  border-radius: 0.3rem;
  background: rgba(255, 255, 255, 0.04);
  box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.03);
`

const PromptCaret = styled.span`
  font-size: 1.2rem;
  color: #93adff;
`

const PromptText = styled.span`
  flex: 1;
  min-width: 0;
  font-size: 1.1rem;
  line-height: 1.6;
  color: #93adff;
`

const Line = styled.div<{ $hidden?: boolean; $blink?: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  padding: 0.8rem 1.8rem 0.4rem;
  visibility: ${({ $hidden }) => ($hidden ? "hidden" : "visible")};
  ${({ $blink }) =>
    $blink &&
    css`
      animation: ${callBlink} 1s ease-in-out infinite;
    `}
`

const Diamond = styled.span<{ $muted?: boolean }>`
  font-size: 1rem;
  line-height: 1.6rem;
  color: ${({ $muted, theme }) =>
    $muted ? theme.color.purple : theme.color.foreground};
`

const LineText = styled.span<{ $muted?: boolean }>`
  font-size: 1.1rem;
  line-height: 1.6;
  color: ${({ $muted, theme }) =>
    $muted ? theme.color.mutedLabel : theme.color.foreground};
`

const Cursor = styled.span`
  position: relative;

  &::before {
    content: "";
    position: absolute;
    left: 0.2rem;
    top: 0.15rem;
    width: 0.7rem;
    height: 1.2rem;
    background: currentColor;
    animation: ${cursorBlink} 0.9s steps(1) infinite;
  }
`

const Ghost = styled.span`
  opacity: 0;
`

const InputBox = styled.div`
  display: flex;
  align-items: center;
  margin-top: 1.2rem;
  padding: 0.9rem 1.7rem;
  background: #202020;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.4rem;
`

const InputCaret = styled.span`
  font-size: 0.9rem;
  line-height: 1.6rem;
  color: #29c6be;
`

type TranscriptLine =
  | { id: string; kind: "speech"; text: string }
  | { id: string; kind: "call"; calls: number }

const PROMPT =
  "Build an FX analytics dashboard in my Web Console for GBPUSD and EURUSD over the last 12 hours, using 5-minute candles. Chart OHLC with volume bars, Bollinger Bands (20, 2σ), RSI (14), and VWAP vs close."

const LINES: TranscriptLine[] = [
  {
    id: "pair",
    kind: "speech",
    text: "Let me load the QuestDB MCP tools and pair with Web Console.",
  },
  { id: "call-pair", kind: "call", calls: 1 },
  {
    id: "inspect",
    kind: "speech",
    text: "Paired. Now let me inspect the tables and materialized views available, and investigate QuestDB documentation.",
  },
  { id: "call-inspect", kind: "call", calls: 5 },
  {
    id: "create",
    kind: "speech",
    text: "I have everything I need on the schema and indicators. Now let me create the notebook for you.",
  },
  { id: "call-create", kind: "call", calls: 1 },
  {
    id: "build",
    kind: "speech",
    text: "Notebook ready. Now I'll build the entire dashboard — variables, grid layout, markdown explanations, and all 4 charts — in one atomic call.",
  },
  { id: "call-build", kind: "call", calls: 2 },
  {
    id: "done",
    kind: "speech",
    text: "The \"FX Dashboard\" is built and live in your Web Console. All charts are laid out in a 2-column grid and auto-refresh. Two notebook variables drive everything — symbol = 'GBPUSD' and range = '$now - 12h..$now' by default — so you can re-point the whole board from the Variables popover.",
  },
]

// Constant typing speed: the longest line types in MAX_SPEECH_MS, and every
// shorter line takes proportionally less, so a 60-char line isn't dragged out
// to the same duration as a 280-char one.
const MS_PER_CHAR =
  MAX_SPEECH_MS /
  Math.max(
    ...LINES.map((line) => (line.kind === "speech" ? line.text.length : 0)),
  )

const callText = (calls: number) =>
  calls <= 1
    ? "Called questdb"
    : `Called questdb ${calls} times (ctrl+o to expand)`

export const AgentTranscript = () => {
  const [activeIndex, setActiveIndex] = useState(0)
  const [typedChars, setTypedChars] = useState(0)
  const [callCount, setCallCount] = useState(1)

  useEffect(() => {
    if (activeIndex >= LINES.length) return
    const line = LINES[activeIndex]

    if (line.kind === "call") {
      setCallCount(1)
      let count = 1
      const stepTimer = window.setInterval(() => {
        if (count >= line.calls) {
          window.clearInterval(stepTimer)
          return
        }
        count += 1
        setCallCount(count)
      }, CALL_STEP_MS)
      const advanceTimer = window.setTimeout(
        () => setActiveIndex((index) => index + 1),
        Math.max(CALL_MS, line.calls * CALL_STEP_MS),
      )
      return () => {
        window.clearInterval(stepTimer)
        window.clearTimeout(advanceTimer)
      }
    }

    const length = line.text.length
    setTypedChars(0)
    let typed = 0
    const timer = window.setInterval(() => {
      typed += 1
      setTypedChars(typed)
      if (typed >= length) {
        window.clearInterval(timer)
        setActiveIndex((index) => index + 1)
      }
    }, MS_PER_CHAR)
    return () => window.clearInterval(timer)
  }, [activeIndex])

  return (
    <Frame>
      <TitleBar>
        <Dots>
          <Dot $color="#ff5f57" />
          <Dot $color="#febc2e" />
          <Dot $color="#28c840" />
        </Dots>
        <RepoName>questdb/trading-data</RepoName>
      </TitleBar>
      <Body>
        <PromptRow>
          <PromptCaret>❯</PromptCaret>
          <PromptText>{PROMPT}</PromptText>
        </PromptRow>
        {LINES.map((line, index) => {
          const isActive = index === activeIndex
          const isPending = index > activeIndex

          let content: React.ReactNode
          if (line.kind === "call") {
            content = callText(isActive ? callCount : line.calls)
          } else if (isActive) {
            content = (
              <>
                {line.text.slice(0, typedChars)}
                <Cursor />
                <Ghost>{line.text.slice(typedChars)}</Ghost>
              </>
            )
          } else {
            content = line.text
          }

          return (
            <Line
              key={line.id}
              $hidden={isPending}
              $blink={line.kind === "call" && isActive}
            >
              <Diamond $muted={line.kind === "call"}>◆</Diamond>
              <LineText $muted={line.kind === "call"}>{content}</LineText>
            </Line>
          )
        })}
        <InputBox>
          <InputCaret>❯</InputCaret>
        </InputBox>
      </Body>
    </Frame>
  )
}
