import { FooterMessage } from "../../../components/FooterMessage"
import React, { useState, useRef, useEffect } from "react"
import styled from "styled-components"
import { subMonths } from "date-fns"
import {
  Box,
  Button,
  Form,
  Popover,
  Text,
  LoadingSpinner,
} from "../../../components"
import { Time, World } from "../../../components/icons"
import { getLocalGMTOffset, getLocalTimeZone } from "../../../utils"
import { EditorRefreshIntervalTriggerButton } from "../ToolbarRefreshControls"
import { DateBoundField } from "./DateBoundField"
import { timeRangeSchema, toStoredBound } from "./rangeSchema"
import {
  durationToHumanReadable,
  type DateRange,
  type DurationPreset,
} from "./utils"

const Root = styled(Box).attrs({
  gap: "1rem",
  flexDirection: "column",
  align: "flex-start",
})`
  color: ${({ theme }) => theme.color.contentSecondary};
  width: 50rem;
  padding: 1rem 1rem 0 1rem;
`

const Cols = styled(Box).attrs({ gap: 0, align: "flex-start" })`
  width: 100%;
`

const DatePickers = styled(Box).attrs({
  flexDirection: "column",
  gap: "1rem",
  align: "flex-start",
})`
  width: 70%;
  flex: 0 0 70%;
  align-self: stretch;
  padding-right: 1rem;
  padding-left: 1rem;

  form {
    width: 100%;
  }
`

const Presets = styled.ul`
  width: 30%;
  flex: 0 0 30%;
  list-style: none;
  margin: 0;
  padding: 0 0 0 1rem;
  border-left: 1px solid ${({ theme }) => theme.color.interactionNeutral};
`

const PresetButton = styled(Button).attrs({
  variant: "ghost",
  size: "sm",
  fullWidth: true,
})<{ $selected: boolean }>`
  && {
    height: 3rem;
    padding: 0 1rem;
    justify-content: flex-start;
    border-radius: 0;
    background: ${({ $selected, theme }) =>
      $selected ? theme.color.interactionNeutral : "transparent"} !important;
    color: ${({ $selected, theme }) =>
      $selected
        ? theme.color.contentPrimary
        : theme.color.contentSecondary} !important;
  }

  &&:hover:not(:disabled),
  &&:active:not(:disabled),
  &&:focus-visible {
    background: ${({ theme }) => theme.color.interactionNeutral} !important;
    color: ${({ theme }) => theme.color.contentPrimary} !important;
  }

  &&:focus-visible {
    outline: 1px solid ${({ theme }) => theme.color.borderAccent};
    outline-offset: -1px;
  }
`

const Footer = styled(Box).attrs({
  gap: "1rem",
  align: "center",
  justifyContent: "space-between",
})`
  width: 100%;
  padding: 1rem 0;
  border-top: 1px solid ${({ theme }) => theme.color.interactionNeutral};
`

const FooterActions = styled(Box).attrs({ gap: "1rem", align: "center" })``

type FormValues = DateRange

type OnProgress = (message: string, committing: boolean) => void

type ApplyAction =
  | { kind: "range"; dateFrom: string; dateTo: string }
  | { kind: "clear" }

type Props = {
  dateFrom?: string
  dateTo?: string
  presets: DurationPreset[]
  maxRangeSeconds?: number
  renderPreview?: (dateFrom: string, dateTo: string) => React.ReactNode
  onApply: (
    dateFrom: string,
    dateTo: string,
    signal: AbortSignal,
    onProgress: OnProgress,
  ) => Promise<void> | void
  onClear?: (
    signal: AbortSignal,
    onProgress: OnProgress,
  ) => Promise<void> | void
  dataHook?: string
}

export const TimeRangePicker = ({
  dateFrom,
  dateTo,
  presets,
  maxRangeSeconds,
  renderPreview,
  onApply,
  onClear,
  dataHook,
}: Props) => {
  const appliedRange = { dateFrom: dateFrom ?? "", dateTo: dateTo ?? "" }
  const [mainOpen, setMainOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange>(appliedRange)
  const [progress, setProgress] = useState<string | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)
  const operationRef = useRef<{
    controller: AbortController
    committing: boolean
  } | null>(null)
  const hasRange = dateFrom !== undefined && dateTo !== undefined
  const emptyDraft = draft.dateFrom === "" && draft.dateTo === ""

  const handleOpenChange = (next: boolean) => {
    if (operationRef.current?.committing) return
    if (next) {
      setDraft(appliedRange)
      setApplyError(null)
    } else {
      operationRef.current?.controller.abort()
      operationRef.current = null
      setProgress(null)
    }
    setMainOpen(next)
  }

  const run = (
    action: ApplyAction,
    signal: AbortSignal,
    onProgress: OnProgress,
  ) => {
    switch (action.kind) {
      case "range":
        return onApply(action.dateFrom, action.dateTo, signal, onProgress)
      case "clear":
        return onClear?.(signal, onProgress)
    }
  }

  const apply = async (action: ApplyAction) => {
    if (operationRef.current) return
    const operation = { controller: new AbortController(), committing: false }
    operationRef.current = operation
    setApplyError(null)
    setProgress("Checking variables...")
    const onProgress = (message: string, committing: boolean) => {
      if (operationRef.current !== operation) return
      operation.committing = committing
      setProgress(message)
    }
    try {
      await run(action, operation.controller.signal, onProgress)
      if (
        !operation.controller.signal.aborted &&
        operationRef.current === operation
      )
        setMainOpen(false)
    } catch (error) {
      if (!operation.controller.signal.aborted)
        setApplyError(
          error instanceof Error
            ? error.message
            : "Could not update time range",
        )
    } finally {
      if (operationRef.current === operation) {
        operationRef.current = null
        setProgress(null)
      }
    }
  }

  const handleSubmit = async (values: FormValues) => {
    if (!values.dateFrom || !values.dateTo) return
    await apply({
      kind: "range",
      dateFrom: toStoredBound(values.dateFrom),
      dateTo: toStoredBound(values.dateTo),
    })
  }
  const handleClear = () => void apply({ kind: "clear" })

  useEffect(
    () => () => {
      operationRef.current?.controller.abort()
    },
    [],
  )

  const min = subMonths(new Date(), 12)
  const max = new Date()
  const schema = timeRangeSchema({ maxRangeSeconds })

  const datePickerProps = { min, max, ...draft }

  return (
    <Popover
      open={mainOpen}
      onOpenChange={handleOpenChange}
      trigger={
        <EditorRefreshIntervalTriggerButton
          label={
            hasRange
              ? durationToHumanReadable(dateFrom, dateTo, presets)
              : "Time range"
          }
          leadingIcon={<Time size="18px" />}
          type="button"
          aria-label="Time range"
          aria-expanded={mainOpen}
          data-hook={dataHook}
        />
      }
    >
      <Root data-hook="time-range-picker">
        <Cols>
          <DatePickers>
            <Text weight={600} color="contentPrimary" size="lg">
              Absolute time range
            </Text>
            <Form
              name="dateRanges"
              onSubmit={handleSubmit}
              onChange={(values) =>
                setDraft({
                  dateFrom: values.dateFrom ?? "",
                  dateTo: values.dateTo ?? "",
                })
              }
              defaultValues={appliedRange}
              validationSchema={schema}
            >
              <Box flexDirection="column" gap="1rem" align="flex-start">
                <DateBoundField
                  name="dateFrom"
                  label="From"
                  placeholder="now-1h"
                  {...datePickerProps}
                />
                <DateBoundField
                  name="dateTo"
                  label="To"
                  placeholder="now"
                  {...datePickerProps}
                />
                <Box flexDirection="row" align="center" gap="1rem">
                  <Form.Submit
                    disabled={progress !== null || emptyDraft}
                    data-hook="time-range-apply"
                  >
                    Apply
                  </Form.Submit>
                  {progress && <LoadingSpinner />}
                  <span role="status" data-hook="time-range-status">
                    <FooterMessage
                      message={applyError ?? progress}
                      color={applyError ? "statusDanger" : "contentSecondary"}
                    />
                  </span>
                </Box>
              </Box>
            </Form>
            <Box margin="auto 0 0 0">
              {renderPreview?.(draft.dateFrom, draft.dateTo)}
            </Box>
          </DatePickers>
          <Presets>
            {presets.map(
              ({ label, dateFrom: presetFrom, dateTo: presetTo }) => (
                <li key={label}>
                  <PresetButton
                    type="button"
                    data-hook="time-range-preset"
                    $selected={dateFrom === presetFrom && dateTo === presetTo}
                    aria-pressed={
                      dateFrom === presetFrom && dateTo === presetTo
                    }
                    disabled={progress !== null}
                    onClick={() =>
                      void apply({
                        kind: "range",
                        dateFrom: presetFrom,
                        dateTo: presetTo,
                      })
                    }
                  >
                    {label}
                  </PresetButton>
                </li>
              ),
            )}
          </Presets>
        </Cols>
        <Footer>
          <Box gap="0.5rem" align="center">
            <World size="14px" />
            <Text color="contentPrimary">
              {getLocalTimeZone()} ({getLocalGMTOffset()})
            </Text>
          </Box>
          <FooterActions>
            {onClear && hasRange && (
              <Button
                variant="secondary"
                disabled={progress !== null}
                onClick={handleClear}
                data-hook="time-range-clear"
              >
                Clear
              </Button>
            )}
          </FooterActions>
        </Footer>
      </Root>
    </Popover>
  )
}
