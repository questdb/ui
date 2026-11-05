import React, { useState } from "react"
import styled from "styled-components"
import { subMonths } from "date-fns"
import { useFormContext, useWatch } from "react-hook-form"
import {
  Button,
  Checkbox,
  Dialog,
  Form,
  ForwardRef,
  Overlay,
  Text,
} from "../../../../../components"
import { World } from "../../../../../components/icons"
import { trackEvent } from "../../../../../modules/ConsoleEventTracker"
import { ConsoleEvent } from "../../../../../modules/ConsoleEventTracker/events"
import type { NotebookCell } from "../../../../../store/notebook"
import { getLocalGMTOffset, getLocalTimeZone } from "../../../../../utils"
import { signalUserEdit } from "../../../../../utils/notebooks/notebookAIBridge"
import { DateBoundField } from "../../../TimeRangePicker/DateBoundField"
import {
  useNotebookActions,
  useNotebookBufferId,
  useNotebookVariablesState,
} from "../../NotebookProvider"
import { hasCellTime, type CellTime } from "../../variables/cellTime"
import { TIME_PRESETS } from "../../../TimeRangePicker/presets"
import { TimePresetList } from "../../../TimeRangePicker/TimePresetList"
import { DeclarationLines } from "../../variables/TimeRangeDeclarations"
import {
  cellTimeFormSchema,
  cellTimeFormValues,
  cellTimeFromForm,
  previewEntries,
  sameCellTimeForm,
  SHIFT_PRESETS,
  type CellTimeFormValues,
} from "./cellTimeForm"
import { PresetChips } from "./PresetChips"

const Content = styled(Dialog.Content).attrs({ maxwidth: "82rem" })`
  display: flex;
  flex-direction: column;
  padding-bottom: 0;

  form {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
`

const Body = styled.div`
  display: flex;
  align-items: stretch;
  min-height: 0;
`

const Fields = styled.div`
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2.4rem;
  min-width: 0;
  padding: 2rem;
  overflow-y: auto;
`

const Presets = styled.div`
  position: relative;
  flex: 0 0 24rem;
  border-left: 1px solid ${({ theme }) => theme.color.borderSubtle};
`

const PresetsViewport = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 2rem 1.2rem;
`

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
`

const SectionHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
`

const BoundFields = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.2rem;
`

const ShiftRow = styled.div`
  display: grid;
  flex-direction: column
  align-items: flex-start;
  gap: 1.2rem;

  input {
    font-family: ${({ theme }) => theme.fontMonospace};
    max-width: 23.4rem;
  }
`

const Preview = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1.2rem 1.4rem;
  overflow-x: auto;
  border: 1px solid ${({ theme }) => theme.color.borderSubtle};
  border-radius: 0.6rem;
  background: ${({ theme }) => theme.color.surfaceInset};
`

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.6rem;
  padding: 1.2rem 2rem;
  border-top: 1px solid ${({ theme }) => theme.color.borderSubtle};
`

const FooterGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
`

const RangePresets = () => {
  const { setValue } = useFormContext<CellTimeFormValues>()
  const dateFrom = useWatch<CellTimeFormValues, "dateFrom">({
    name: "dateFrom",
  })
  const dateTo = useWatch<CellTimeFormValues, "dateTo">({ name: "dateTo" })
  return (
    <Presets>
      <PresetsViewport>
        <TimePresetList
          presets={TIME_PRESETS}
          selected={{ dateFrom, dateTo }}
          disabled={false}
          onSelect={(preset) => {
            setValue("dateFrom", preset.dateFrom, { shouldDirty: true })
            setValue("dateTo", preset.dateTo, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }}
          dataHook="cell-time-preset"
        />
      </PresetsViewport>
    </Presets>
  )
}

const ShiftPresetChips = () => {
  const { setValue } = useFormContext<CellTimeFormValues>()
  const shift = useWatch<CellTimeFormValues, "shift">({ name: "shift" })
  return (
    <PresetChips
      chips={SHIFT_PRESETS.map((token) => ({ key: token, label: token }))}
      selectedKey={shift}
      onSelect={(token) =>
        setValue("shift", token, { shouldDirty: true, shouldValidate: true })
      }
      ariaLabel="Time shift presets"
      dataHook="cell-time-shift-preset"
    />
  )
}

const HeaderToggle = styled.label`
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 0.8rem;
  cursor: pointer;
`

const ShowInHeaderField = () => {
  const { register } = useFormContext<CellTimeFormValues>()
  return (
    <HeaderToggle>
      <Checkbox
        {...register("showInHeader")}
        data-hook="cell-time-show-header"
      />
      <Text color="contentPrimary" size="md">
        Show overrides in cell header
      </Text>
    </HeaderToggle>
  )
}

const CLEARED: CellTime = {
  timeRange: undefined,
  timeShift: undefined,
  showTimeRange: undefined,
}

type Props = {
  cell: NotebookCell
  onClose: () => void
}

export const CellTimeDialog = ({ cell, onClose }: Props) => {
  const { updateCell } = useNotebookActions()
  const { settings } = useNotebookVariablesState()
  const bufferId = useNotebookBufferId()
  const [initial] = useState(() => cellTimeFormValues(cell))
  const [draft, setDraft] = useState(initial)
  const entries = previewEntries(settings.timeRange, draft)
  const dirty = !sameCellTimeForm(draft, initial)
  const bounds = {
    min: subMonths(new Date(), 12),
    max: new Date(),
    dateFrom: draft.dateFrom,
    dateTo: draft.dateTo,
  }

  const save = (next: CellTime) => {
    updateCell(cell.id, next)
    signalUserEdit(bufferId)
    onClose()
  }

  const handleSubmit = (values: CellTimeFormValues) => {
    const next = cellTimeFromForm(values)
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_TIME_RANGE_SET, {
      hasRange: next.timeRange !== undefined,
      hasShift: next.timeShift !== undefined,
    })
    save(next)
  }

  const handleClear = () => {
    void trackEvent(ConsoleEvent.NOTEBOOK_CELL_TIME_RANGE_CLEAR)
    save(CLEARED)
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <ForwardRef>
          <Overlay primitive={Dialog.Overlay} />
        </ForwardRef>
        <Content data-hook="cell-time-dialog" aria-describedby={undefined}>
          <Dialog.Title>Cell time range</Dialog.Title>
          <Form<CellTimeFormValues>
            name="cellTime"
            onSubmit={handleSubmit}
            onChange={(values) =>
              setDraft({
                dateFrom: values.dateFrom ?? "",
                dateTo: values.dateTo ?? "",
                shift: values.shift ?? "",
                showInHeader: values.showInHeader === true,
              })
            }
            defaultValues={initial}
            validationSchema={cellTimeFormSchema}
          >
            <Body>
              <Fields>
                <Section>
                  <SectionHeader>
                    <Text color="contentPrimary" size="md" weight={600}>
                      Time range override
                    </Text>
                    <Text color="contentSecondary" size="sm">
                      Override notebook time range
                    </Text>
                  </SectionHeader>
                  <BoundFields>
                    <DateBoundField
                      name="dateFrom"
                      label="From"
                      placeholder="now-1h"
                      {...bounds}
                    />
                    <DateBoundField
                      name="dateTo"
                      label="To"
                      placeholder="now"
                      {...bounds}
                    />
                  </BoundFields>
                </Section>
                <Section>
                  <SectionHeader>
                    <Text color="contentPrimary" size="md" weight={600}>
                      Time shift
                    </Text>
                    <Text color="contentSecondary" size="sm">
                      Start with - for the past or + for the future, then a
                      number and s, m, h, d, w, M or y.
                    </Text>
                  </SectionHeader>
                  <Form.Item name="shift">
                    <ShiftRow>
                      <Form.Input
                        name="shift"
                        placeholder="-1d"
                        autoComplete="off"
                        spellCheck={false}
                        data-hook="cell-time-shift"
                      />
                      <ShiftPresetChips />
                    </ShiftRow>
                  </Form.Item>
                </Section>
                <ShowInHeaderField />
                <Preview data-hook="cell-time-preview">
                  {entries.length > 0 ? (
                    <DeclarationLines entries={entries} />
                  ) : (
                    <Text color="contentPrimary" size="sm">
                      No time range. Pick a notebook time range or an override
                      to declare @timeFrom, @timeTo and @timeFilter.
                    </Text>
                  )}
                </Preview>
              </Fields>
              <RangePresets />
            </Body>
            <Footer>
              <FooterGroup>
                <World size="14px" />
                <Text color="contentPrimary" size="sm">
                  {getLocalTimeZone()} ({getLocalGMTOffset()})
                </Text>
              </FooterGroup>
              <FooterGroup>
                {hasCellTime(cell) && (
                  <Button
                    variant="dangerGhost"
                    onClick={handleClear}
                    data-hook="cell-time-clear"
                  >
                    Clear
                  </Button>
                )}
                <Button variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Form.Submit disabled={!dirty} data-hook="cell-time-apply">
                  Apply
                </Form.Submit>
              </FooterGroup>
            </Footer>
          </Form>
        </Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
