import React, { useMemo } from "react"
import styled, { useTheme } from "styled-components"
import { QuestionIcon, WarningIcon, XCircleIcon } from "@phosphor-icons/react"
import { Button, IconButton, Text, Tooltip } from "../../../../components"
import { useToggletip } from "../../../../components/Tooltip/useToggletip"
import { Field, FieldGroup, FieldLabel } from "./chartSettingsStyles"
import { CodeEditorField } from "./CodeEditorField"
import { parseCustomJson } from "./drawSettings"
import type { StatementRows } from "../visuals/statementRows"
import {
  prepareCustomOption,
  problemsOf,
} from "../customChart/prepareCustomOption"
import { useNotebookBufferId, useNotebookSettings } from "../NotebookProvider"
import type { RenderProblem } from "../renderReports"

const Help = styled.span`
  display: grid;
  gap: 0.8rem;
  font-size: 1.2rem;
  line-height: 1.45;

  strong {
    color: ${({ theme }) => theme.color.contentPrimary};
    font-weight: 600;
  }

  code {
    padding: 0 0.3rem;
    border-radius: 0.3rem;
    font-family: ${({ theme }) => theme.fontMonospace};
    font-size: 1.1rem;
    color: ${({ theme }) => theme.color.contentPrimary};
    background: ${({ theme }) => theme.color.surfaceRaised};
  }
`

const Problems = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Problem = styled.li<{ $error: boolean }>`
  display: grid;
  grid-template-columns: 1.4rem minmax(0, 1fr);
  gap: 0.6rem;
  font-size: 1.2rem;
  line-height: 1.4;
  color: ${({ theme }) => theme.color.contentPrimary};

  svg {
    margin-top: 0.15rem;
    color: ${({ theme, $error }) =>
      $error ? theme.color.statusDanger : theme.color.statusWarning};
  }

  code {
    font-family: ${({ theme }) => theme.fontMonospace};
    font-size: 1.1rem;
    color: ${({ theme }) => theme.color.contentSecondary};
  }
`

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
`

const TitleGroup = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
`

const JsonSpecHelp = () => {
  const { tooltipProps, triggerProps } = useToggletip()

  return (
    <Tooltip
      {...tooltipProps}
      placement="bottom-start"
      maxWidth="32rem"
      onEscapeKeyDown={(event) => {
        tooltipProps.onEscapeKeyDown()
        event.stopPropagation()
      }}
      content={
        <Help>
          <span>
            <strong>Data:</strong> SQL statements become datasets{" "}
            <code>q0</code>, <code>q1</code>, and so on. Bind a series with{" "}
            <code>datasetId</code> and map its columns with <code>encode</code>.
          </span>
          <span>
            <strong>Style:</strong> Use theme tones such as{" "}
            <code>$series1</code> or <code>$positive:0.3</code>. The console
            fits the layout, so skip padding.
          </span>
          <span>
            <strong>Start from a chart:</strong> Replace with the chart uses the
            first query&apos;s chart. Undo in the editor with ⌘Z or Ctrl+Z.
          </span>
        </Help>
      }
    >
      <IconButton label="About the JSON spec" size="sm" {...triggerProps}>
        <QuestionIcon size={16} aria-hidden />
      </IconButton>
    </Tooltip>
  )
}

type Props = {
  json: string
  statements: (StatementRows | null)[]
  onChange: (json: string) => void
  onStartFromChart: () => void
}

/** An ECharts option written as JSON, with what will happen to it. */
export const CustomOptionSettings: React.FC<Props> = ({
  json,
  statements,
  onChange,
  onStartFromChart,
}) => {
  const theme = useTheme()
  const bufferId = useNotebookBufferId()
  const settings = useNotebookSettings()
  const parsed = useMemo(() => parseCustomJson(json), [json])
  const problems: RenderProblem[] = useMemo(
    () =>
      parsed.ok
        ? problemsOf(
            prepareCustomOption(parsed.option, {
              bufferId,
              colors: theme.color,
              chartTypes: settings.chartTypes,
              statements,
              live: false,
            }),
          )
        : [],
    [parsed, bufferId, theme.color, settings.chartTypes, statements],
  )

  return (
    <>
      <FieldGroup>
        <HeaderRow>
          <TitleGroup>
            <FieldLabel>JSON spec</FieldLabel>
            <JsonSpecHelp />
          </TitleGroup>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onStartFromChart}
          >
            Replace with the chart
          </Button>
        </HeaderRow>
        <CodeEditorField
          value={json}
          onChange={onChange}
          language="json"
          ariaLabel="ECharts option"
          invalid={!parsed.ok && json.trim() !== ""}
        />
      </FieldGroup>

      <Field as="div">
        <FieldLabel>Check</FieldLabel>
        {!parsed.ok ? (
          <Problems>
            <Problem $error>
              <XCircleIcon size={14} weight="fill" />
              <span>{parsed.error}</span>
            </Problem>
          </Problems>
        ) : problems.length === 0 ? (
          <Text color="contentSecondary" size="xs">
            No problems: the option draws as written.
          </Text>
        ) : (
          <Problems aria-label="Problems with the option">
            {problems.map((p) => (
              <Problem
                key={`${p.path ?? ""}:${p.message}`}
                $error={p.severity === "error"}
              >
                {p.severity === "error" ? (
                  <XCircleIcon size={14} weight="fill" />
                ) : (
                  <WarningIcon size={14} weight="fill" />
                )}
                <span>
                  {p.path && <code>{p.path}: </code>}
                  {p.message}
                </span>
              </Problem>
            ))}
          </Problems>
        )}
      </Field>
    </>
  )
}
