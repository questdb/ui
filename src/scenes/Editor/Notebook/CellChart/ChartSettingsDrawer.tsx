import React, { useEffect, useState } from "react"
import styled, { keyframes } from "styled-components"
import { XIcon } from "@phosphor-icons/react"
import { Button, Input } from "../../../../components"
import { Select } from "../../../../components/Select"
import type { ChartConfig, QueryChart } from "./chartTypes"
import { groupColumns } from "./inferChartConfig"
import type { QueryTab } from "../DrawCanvas/drawCanvasUtils"
import {
  Field,
  FieldGroup,
  FieldLabel,
  IncompatibleIcon,
} from "./chartSettingsStyles"
import { QueryControls } from "./QueryControls"

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`

const slideIn = keyframes`
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
`

const Backdrop = styled.div`
  position: absolute;
  inset: 0;
  z-index: 3;
  background: rgba(0, 0, 0, 0.35);
  animation: ${fadeIn} 0.2s ease both;
`

const Panel = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(36rem, 90%);
  z-index: 4;
  background: ${({ theme }) => theme.color.backgroundDarker};
  border-left: 1px solid ${({ theme }) => theme.color.selection};
  display: flex;
  flex-direction: column;
  animation: ${slideIn} 0.25s cubic-bezier(0.16, 1, 0.3, 1) both;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.2rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.selection};
`

const Title = styled.h3`
  margin: 0;
  font-size: 1.4rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.foreground};
`

const Body = styled.form`
  flex: 1;
  overflow-y: auto;
  padding: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
`

const Row = styled.div`
  display: flex;
  gap: 0.8rem;
  & > * {
    flex: 1 1 0;
    min-width: 0;
  }
`

const Footer = styled.div`
  padding: 1rem 1.2rem;
  border-top: 1px solid ${({ theme }) => theme.color.selection};
  display: flex;
  justify-content: flex-end;
  gap: 0.8rem;
`

const Divider = styled.div`
  border-top: 1px solid ${({ theme }) => theme.color.selection};
`

const TabStrip = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.selection};
`

const Tab = styled.button<{ active: boolean }>`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;
  padding: 0.8rem 1.4rem;
  border: none;
  border-bottom: 2px solid
    ${({ active, theme }) => (active ? theme.color.pink : "transparent")};
  margin-bottom: -1px;
  background: ${({ active, theme }) =>
    active ? theme.color.backgroundLighter : "transparent"};
  color: ${({ active, theme }) =>
    active ? theme.color.foreground : theme.color.gray2};
  cursor: pointer;
  font-size: 1.3rem;

  &:hover {
    color: ${({ theme }) => theme.color.foreground};
  }
`

const parseBound = (v: string): number | undefined => {
  const n = Number(v)
  return v === "" || !Number.isFinite(n) ? undefined : n
}

const candlestickMissingOhlc = (q: QueryChart | null): boolean => {
  if (!q || q.type !== "candlestick" || q.enabled === false) return false
  const o = q.ohlc
  if (!o || !o.open || !o.high || !o.low || !o.close) return true
  return new Set([o.open, o.high, o.low, o.close]).size !== 4
}

type Props = {
  open: boolean
  onClose: () => void
  tabs: QueryTab[]
  config: ChartConfig
  onSave: (next: ChartConfig) => void
}

export const ChartSettingsDrawer: React.FC<Props> = ({
  open,
  onClose,
  tabs,
  config,
  onSave,
}) => {
  const [draft, setDraft] = useState<ChartConfig>(config)
  const [activeIndex, setActiveIndex] = useState<number>(tabs[0]?.index ?? 0)
  const [saveAttempted, setSaveAttempted] = useState(false)

  useEffect(() => {
    if (open) {
      setDraft(config)
      setActiveIndex(tabs[0]?.index ?? 0)
      setSaveAttempted(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (
        document.querySelector("[data-radix-popper-content-wrapper]") !== null
      ) {
        return
      }
      onClose()
      e.stopImmediatePropagation()
    }
    window.addEventListener("keydown", onKey, { capture: true })
    return () => window.removeEventListener("keydown", onKey, { capture: true })
  }, [open, onClose])

  if (!open) return null

  const anchorTab = tabs[0]
  const anchorGroups = anchorTab
    ? groupColumns(anchorTab.columns)
    : { temporal: [], numeric: [], categorical: [], other: [] }
  const xCandidates = [
    ...anchorGroups.temporal,
    ...anchorGroups.categorical,
    ...anchorGroups.numeric,
  ]

  const activeTab = tabs.find((t) => t.index === activeIndex) ?? anchorTab
  const isAnchorTab = activeTab != null && activeTab.index === anchorTab?.index
  const query: QueryChart | undefined =
    activeTab != null
      ? (draft.queries[activeTab.index] ?? undefined)
      : undefined

  const hasRight = draft.queries.some((q) => q?.axis === "right")

  const updateQuery = (index: number, patch: Partial<QueryChart>) =>
    setDraft((d) => ({
      ...d,
      queries: d.queries.map((q, i) =>
        i === index && q ? { ...q, ...patch } : q,
      ),
    }))

  const setQuery = (index: number, next: QueryChart) =>
    setDraft((d) => ({
      ...d,
      queries: d.queries.map((q, i) => (i === index ? next : q)),
    }))

  const commit = () => {
    const badIdx = draft.queries.findIndex(candlestickMissingOhlc)
    if (badIdx >= 0) {
      setSaveAttempted(true)
      setActiveIndex(badIdx)
      return
    }
    onSave(draft)
    onClose()
  }

  return (
    <>
      <Backdrop onClick={onClose} aria-hidden />
      <Panel role="dialog" aria-label="Chart settings">
        <Header>
          <Title>Chart settings</Title>
          <Button
            skin="transparent"
            type="button"
            onClick={onClose}
            aria-label="Close chart settings"
          >
            <XIcon size={18} />
          </Button>
        </Header>

        <Body
          onSubmit={(e) => {
            e.preventDefault()
            commit()
          }}
        >
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input
              name="chart-name"
              placeholder="e.g. Daily trades"
              value={draft.name ?? ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, name: e.target.value }))
              }
            />
          </Field>

          <Field>
            <FieldLabel>X-axis</FieldLabel>
            <Select
              name="x-axis"
              value={draft.xColumn ?? ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, xColumn: e.target.value || null }))
              }
              options={xCandidates.map((c) => ({
                label: c.name,
                value: c.name,
              }))}
            />
          </Field>

          {hasRight && (
            <FieldGroup>
              <FieldLabel>Right axis</FieldLabel>
              <Input
                name="right-axis-name"
                placeholder="Name (e.g. RSI)"
                value={draft.rightAxis?.name ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    rightAxis: { ...d.rightAxis, name: e.target.value },
                  }))
                }
              />
              <Row>
                <Input
                  name="right-axis-min"
                  type="number"
                  placeholder="min"
                  value={draft.rightAxis?.min ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      rightAxis: {
                        ...d.rightAxis,
                        min: parseBound(e.target.value),
                      },
                    }))
                  }
                />
                <Input
                  name="right-axis-max"
                  type="number"
                  placeholder="max"
                  value={draft.rightAxis?.max ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      rightAxis: {
                        ...d.rightAxis,
                        max: parseBound(e.target.value),
                      },
                    }))
                  }
                />
              </Row>
            </FieldGroup>
          )}

          {tabs.length > 1 && (
            <>
              <Divider />
              <FieldLabel>Queries</FieldLabel>
              <TabStrip>
                {tabs.map((t) => (
                  <Tab
                    key={t.index}
                    type="button"
                    active={t.index === activeIndex}
                    onClick={() => setActiveIndex(t.index)}
                    title={
                      t.compatible
                        ? t.query
                        : `${t.query}\n\n(x-axis incompatible — excluded)`
                    }
                  >
                    {t.label}
                    {!t.compatible && (
                      <IncompatibleIcon size={14} weight="fill" />
                    )}
                  </Tab>
                ))}
              </TabStrip>
            </>
          )}

          {activeTab && query && (
            <QueryControls
              activeTab={activeTab}
              query={query}
              anchorLabel={anchorTab?.label ?? "Q1"}
              isAnchorTab={isAnchorTab}
              ohlcError={saveAttempted && candlestickMissingOhlc(query)}
              onUpdateQuery={(patch) => updateQuery(activeTab.index, patch)}
              onSetQuery={(next) => setQuery(activeTab.index, next)}
            />
          )}
        </Body>

        <Footer>
          <Button type="button" skin="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" skin="primary" onClick={commit}>
            Save
          </Button>
        </Footer>
      </Panel>
    </>
  )
}
