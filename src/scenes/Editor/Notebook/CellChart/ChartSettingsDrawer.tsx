import React, { useEffect, useRef, useState } from "react"
import styled, { keyframes } from "styled-components"
import { XIcon } from "@phosphor-icons/react"
import type { ColumnDefinition } from "../../../../utils/questdb/types"
import { Button, Input, MultiSelect, Text } from "../../../../components"
import { Select } from "../../../../components/Select"
import type { ChartConfig, ChartType } from "./chartTypes"
import { availableChartTypes, groupColumns } from "./inferChartConfig"

const TYPE_LABELS: Record<ChartType, string> = {
  line: "Line",
  area: "Area",
  bar: "Bar",
  stackedBar: "Stacked bar",
  scatter: "Scatter",
  pie: "Pie",
  candlestick: "Candlestick",
}

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

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`

const FieldLabel = styled.span`
  font-size: 1.1rem;
  color: ${({ theme }) => theme.color.gray2};
`

const Footer = styled.div`
  padding: 1rem 1.2rem;
  border-top: 1px solid ${({ theme }) => theme.color.selection};
  display: flex;
  justify-content: flex-end;
  gap: 0.8rem;
`

type Props = {
  open: boolean
  onClose: () => void
  columns: ColumnDefinition[]
  config: ChartConfig
  onSave: (next: ChartConfig) => void
}

export const ChartSettingsDrawer: React.FC<Props> = ({
  open,
  onClose,
  columns,
  config,
  onSave,
}) => {
  const [draft, setDraft] = useState<ChartConfig>(config)
  // Snapshot at open so commit diffs against it and only writes user-changed fields; otherwise external updates (auto-refresh columns, AI tool calls) would be wiped on Save.
  const openSnapshotRef = useRef<ChartConfig>(config)
  const latestConfigRef = useRef<ChartConfig>(config)
  latestConfigRef.current = config
  useEffect(() => {
    if (open) {
      setDraft(config)
      openSnapshotRef.current = config
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

  const groups = groupColumns(columns)
  const hasOhlc = !!draft.ohlc
  const types = availableChartTypes(groups, hasOhlc)

  const xCandidates =
    draft.type === "candlestick" || draft.type === "line"
      ? [...groups.temporal, ...groups.categorical]
      : draft.type === "scatter"
        ? groups.numeric
        : [...groups.categorical, ...groups.temporal, ...groups.numeric]

  const yCandidates = groups.numeric

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    commit()
  }

  const commit = () => {
    const snapshot = openSnapshotRef.current
    const latest = latestConfigRef.current
    const userChanges: Partial<ChartConfig> = {}
    for (const key of Object.keys(draft) as Array<keyof ChartConfig>) {
      if (draft[key] !== snapshot[key]) {
        ;(userChanges as Record<string, unknown>)[key] = draft[key]
      }
    }
    onSave({ ...latest, ...userChanges })
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

        <Body onSubmit={handleSubmit}>
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
            <FieldLabel>Type</FieldLabel>
            <Select
              name="chart-type"
              value={draft.type}
              onChange={(e) =>
                setDraft((d) => ({ ...d, type: e.target.value as ChartType }))
              }
              options={types.map((t) => ({ label: TYPE_LABELS[t], value: t }))}
            />
          </Field>

          {draft.type !== "pie" && (
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
          )}

          {draft.type === "pie" && (
            <Field>
              <FieldLabel>Category</FieldLabel>
              <Select
                name="category"
                value={draft.xColumn ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, xColumn: e.target.value || null }))
                }
                options={[...groups.categorical, ...groups.temporal].map(
                  (c) => ({ label: c.name, value: c.name }),
                )}
              />
            </Field>
          )}

          {draft.type !== "candlestick" && (
            <Field>
              <FieldLabel>
                {draft.type === "pie" ? "Value" : "Series"}
                {yCandidates.length > 8 && (
                  <Text color="gray2" size="xs">
                    {" "}
                    · {draft.yColumns.length}/{yCandidates.length}
                  </Text>
                )}
              </FieldLabel>
              {draft.type === "pie" ? (
                <Select
                  name="value"
                  value={draft.yColumns[0] ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, yColumns: [e.target.value] }))
                  }
                  options={yCandidates.map((c) => ({
                    label: c.name,
                    value: c.name,
                  }))}
                />
              ) : (
                <MultiSelect
                  name="y-columns"
                  value={draft.yColumns}
                  onChange={(next) =>
                    setDraft((d) => ({ ...d, yColumns: next }))
                  }
                  options={yCandidates.map((c) => ({
                    label: c.name,
                    value: c.name,
                  }))}
                  placeholder="None selected"
                />
              )}
            </Field>
          )}

          {(draft.type === "line" ||
            draft.type === "area" ||
            draft.type === "bar" ||
            draft.type === "stackedBar") &&
            groups.categorical.length > 0 && (
              <Field>
                <FieldLabel>Partition by</FieldLabel>
                <Select
                  name="partition-by"
                  value={draft.partitionByColumn ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      partitionByColumn: e.target.value || undefined,
                    }))
                  }
                  options={[
                    { label: "None", value: "" },
                    ...groups.categorical.map((c) => ({
                      label: c.name,
                      value: c.name,
                    })),
                  ]}
                />
              </Field>
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
