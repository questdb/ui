import React, { useEffect, useState } from "react"
import styled, { keyframes } from "styled-components"
import { XIcon } from "@phosphor-icons/react"
import {
  Button,
  Input,
  SelectMenuControl,
  TabButton,
} from "../../../../components"
import type { ChartConfig, QueryChart } from "./chartTypes"
import type {
  ChartSettingsCancelMethod,
  ChartSettingsTelemetry,
} from "./chartSettingsTelemetry"
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
  background: ${({ theme }) => theme.color.shadowMedium};
  animation: ${fadeIn} 0.2s ease both;
`

type Presentation = "drawer" | "panel"

const Panel = styled.div<{ $presentation: Presentation }>`
  position: ${({ $presentation }) =>
    $presentation === "drawer" ? "absolute" : "relative"};
  top: ${({ $presentation }) => ($presentation === "drawer" ? "0" : "auto")};
  right: ${({ $presentation }) => ($presentation === "drawer" ? "0" : "auto")};
  bottom: ${({ $presentation }) => ($presentation === "drawer" ? "0" : "auto")};
  width: ${({ $presentation }) =>
    $presentation === "drawer"
      ? "min(36rem, 90%)"
      : "clamp(26rem, 30%, 34rem)"};
  flex: ${({ $presentation }) =>
    $presentation === "drawer" ? "0 0 auto" : "0 0 clamp(26rem, 30%, 34rem)"};
  min-width: 0;
  min-height: 0;
  z-index: ${({ $presentation }) => ($presentation === "drawer" ? "4" : "1")};
  background: ${({ theme, $presentation }) =>
    $presentation === "drawer"
      ? theme.color.surfaceInset
      : theme.color.surfaceRaised};
  border-left: ${({ theme, $presentation }) =>
    $presentation === "drawer"
      ? `1px solid ${theme.color.interactionNeutral}`
      : "none"};
  border-right: ${({ theme, $presentation }) =>
    $presentation === "panel"
      ? `1px solid ${theme.color.borderSubtle}`
      : "none"};
  display: flex;
  flex-direction: column;
  animation-name: ${({ $presentation }) =>
    $presentation === "drawer" ? slideIn : "none"};
  animation-duration: ${({ $presentation }) =>
    $presentation === "drawer" ? "0.25s" : "0s"};
  animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
  animation-fill-mode: both;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.2rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.interactionNeutral};
`

const Title = styled.h3`
  margin: 0;
  font-size: 1.4rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.contentPrimary};
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
  border-top: 1px solid ${({ theme }) => theme.color.interactionNeutral};
  display: flex;
  justify-content: flex-end;
  gap: 0.8rem;
`

const Divider = styled.div`
  border-top: 1px solid ${({ theme }) => theme.color.interactionNeutral};
`

const TabStrip = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.interactionNeutral};
`

const Tab = styled(TabButton)`
  && {
    flex: 0 0 auto;
    white-space: nowrap;
    padding: 0.8rem 1.4rem;
    margin-bottom: -1px;
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

type SharedProps = {
  tabs: QueryTab[]
  config: ChartConfig
  onSave: (next: ChartConfig) => void
  telemetry?: ChartSettingsTelemetry
}

type SettingsProps = SharedProps & {
  presentation: Presentation
  open: boolean
  onClose?: () => void
}

const ChartSettings: React.FC<SettingsProps> = ({
  presentation,
  open,
  onClose,
  tabs,
  config,
  onSave,
  telemetry,
}) => {
  const [draft, setDraft] = useState<ChartConfig>(config)
  const [activeIndex, setActiveIndex] = useState<number>(tabs[0]?.index ?? 0)
  const [saveAttempted, setSaveAttempted] = useState(false)
  const visible = presentation === "panel" || open

  const resetDraft = () => {
    setDraft(config)
    setActiveIndex(tabs[0]?.index ?? 0)
    setSaveAttempted(false)
  }

  useEffect(() => {
    if (visible) resetDraft()
  }, [open, presentation])

  useEffect(() => {
    if (!open || presentation !== "drawer") return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (
        document.querySelector("[data-radix-popper-content-wrapper]") !== null
      ) {
        return
      }
      telemetry?.onCancel?.("escape")
      onClose?.()
      e.stopImmediatePropagation()
    }
    window.addEventListener("keydown", onKey, { capture: true })
    return () => window.removeEventListener("keydown", onKey, { capture: true })
  }, [open, onClose, presentation, telemetry])

  if (!visible) return null

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

  const dismiss = (method: Exclude<ChartSettingsCancelMethod, "escape">) => {
    telemetry?.onCancel?.(method)
    onClose?.()
  }

  const commit = () => {
    const badIdx = draft.queries.findIndex(candlestickMissingOhlc)
    if (badIdx >= 0) {
      telemetry?.onSaveBlocked?.("ohlc_incomplete")
      setSaveAttempted(true)
      setActiveIndex(badIdx)
      return
    }
    const primary = anchorTab != null ? draft.queries[anchorTab.index] : null
    telemetry?.onSave?.({
      chartType: primary?.type,
      seriesCount: primary?.yColumns.length ?? 0,
      queryCount: draft.queries.filter((q) => q != null).length,
      hasRightAxis: hasRight,
      partitioned: draft.queries.some((q) => q?.partitionByColumn != null),
    })
    onSave(draft)
    if (presentation === "drawer") onClose?.()
  }

  return (
    <>
      {presentation === "drawer" && (
        <Backdrop onClick={() => dismiss("backdrop")} aria-hidden />
      )}
      <Panel
        $presentation={presentation}
        role={presentation === "drawer" ? "dialog" : "region"}
        aria-label="Chart settings"
        data-hook={
          presentation === "drawer"
            ? "chart-settings-drawer"
            : "chart-settings-panel"
        }
      >
        <Header>
          <Title>Chart settings</Title>
          {presentation === "drawer" && (
            <Button
              variant="ghost"
              type="button"
              onClick={() => dismiss("close")}
              aria-label="Close chart settings"
            >
              <XIcon size={18} />
            </Button>
          )}
        </Header>

        <Body
          onSubmit={(e) => {
            e.preventDefault()
            commit()
          }}
        >
          <Field>
            <FieldLabel>X-axis</FieldLabel>
            <SelectMenuControl
              name="x-axis"
              value={draft.xColumn ?? ""}
              placeholder="Select column"
              onValueChange={(value) =>
                setDraft((d) => ({ ...d, xColumn: value || null }))
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
              <TabStrip role="tablist" aria-label="Chart queries">
                {tabs.map((t) => (
                  <Tab
                    key={t.index}
                    type="button"
                    $active={t.index === activeIndex}
                    role="tab"
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
              telemetry={telemetry}
            />
          )}
        </Body>

        <Footer>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (presentation === "drawer") dismiss("button")
              else resetDraft()
            }}
          >
            {presentation === "drawer" ? "Cancel" : "Reset changes"}
          </Button>
          <Button type="button" variant="primary" onClick={commit}>
            {presentation === "drawer" ? "Save" : "Apply"}
          </Button>
        </Footer>
      </Panel>
    </>
  )
}

export const ChartSettingsDrawer: React.FC<
  SharedProps & { open: boolean; onClose: () => void }
> = (props) => <ChartSettings {...props} presentation="drawer" />

export const ChartSettingsPanel: React.FC<SharedProps> = (props) => (
  <ChartSettings {...props} presentation="panel" open />
)
