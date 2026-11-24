import React from "react"
import styled, { useTheme } from "styled-components"
import {
  CircleIcon,
  ColumnsIcon,
  CpuIcon,
  FunnelIcon,
  GitMergeIcon,
  LightningIcon,
  ListNumbersIcon,
  SigmaIcon,
  SortAscendingIcon,
  TableIcon,
} from "@phosphor-icons/react"
import { withAlpha } from "../../../../theme"
import { columnIndex, toLabel, type StatementRows } from "./statementRows"
import type { VisualConfig } from "../CellChart/chartTypes"

// A query plan from EXPLAIN as a tree of operators: the result at the top,
// the scans at the bottom, data flowing up. EXPLAIN returns one row per line,
// indented by depth; a line such as "filter: price > 10" is an attribute of
// the operator above it, and "Async Group By workers: 14" carries one inline.

export type PlanNode = {
  id: string
  name: string
  attributes: { key: string; value: string }[]
  children: PlanNode[]
}

const ATTRIBUTE = /^([A-Za-z][A-Za-z0-9_]*):\s?(.*)$/
// " workers: 14", " lo: 5", " on: trades" at the end of an operator line.
const INLINE = /\s([A-Za-z][A-Za-z0-9_]*):\s(\S.*)$/

export const parsePlan = (lines: string[]): PlanNode[] => {
  const roots: PlanNode[] = []
  const stack: { indent: number; node: PlanNode }[] = []
  for (const raw of lines) {
    if (raw.trim() === "") continue
    const indent = raw.length - raw.trimStart().length
    const text = raw.trim()
    const attribute = ATTRIBUTE.exec(text)
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop()
    }
    const parent = stack[stack.length - 1]?.node
    if (attribute && parent) {
      parent.attributes.push({ key: attribute[1], value: attribute[2] })
      continue
    }
    const node: PlanNode = {
      id: `${roots.length}.${stack.length}.${text}.${indent}`,
      name: text,
      attributes: [],
      children: [],
    }
    if (parent) parent.children.push(node)
    else roots.push(node)
    stack.push({ indent, node })
  }
  return roots
}

type Kind =
  | "scan"
  | "filter"
  | "aggregate"
  | "sort"
  | "limit"
  | "join"
  | "project"
  | "other"

const kindOf = (name: string): Kind => {
  const n = name.toLowerCase()
  if (/scan|pageframe|long_sequence|table/.test(n)) return "scan"
  if (/join|union|splice|intersect|except/.test(n)) return "join"
  if (/group by|sample by|aggregate|distinct|count/.test(n)) return "aggregate"
  if (/sort|top k|order/.test(n)) return "sort"
  if (/limit|lo:/.test(n)) return "limit"
  if (/filter/.test(n)) return "filter"
  if (/selectedrecord|virtualrecord|project|record/.test(n)) return "project"
  return "other"
}

const ICONS: Record<Kind, React.ElementType> = {
  scan: TableIcon,
  filter: FunnelIcon,
  aggregate: SigmaIcon,
  sort: SortAscendingIcon,
  limit: ListNumbersIcon,
  join: GitMergeIcon,
  project: ColumnsIcon,
  other: CircleIcon,
}

const Root = styled.div`
  height: 100%;
  padding: 1.6rem 1.2rem;
  overflow: auto;
  font-size: 1.25rem;
`

const Tree = styled.ul`
  display: flex;
  justify-content: center;
  margin: 0;
  padding: 0;
  list-style: none;
`

// The classic CSS tree: each child draws half of the bar that joins its
// siblings and a stem up to it, so any number of children connect.
const Branch = styled.li<{ $root: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: ${({ $root }) => ($root ? "0 0.8rem" : "2.4rem 0.8rem 0")};
  list-style: none;

  ${({ $root, theme }) =>
    $root
      ? ""
      : `
    &::before, &::after {
      content: "";
      position: absolute;
      top: 0;
      width: 50%;
      height: 2.4rem;
      border-top: 1px solid ${theme.color.borderStrong};
    }
    &::before { right: 50%; }
    &::after { left: 50%; border-left: 1px solid ${theme.color.borderStrong}; }
    &:only-child::before, &:only-child::after { border-top: none; }
    &:first-child::before, &:last-child::after { border-top: none; }
    &:last-child::before { border-right: 1px solid ${theme.color.borderStrong}; }
    &:last-child::after { border-left: none; }
  `}
`

const Children = styled.ul`
  position: relative;
  display: flex;
  justify-content: center;
  margin: 0;
  padding: 2.4rem 0 0;

  &::before {
    content: "";
    position: absolute;
    top: 0;
    left: 50%;
    height: 2.4rem;
    border-left: 1px solid ${({ theme }) => theme.color.borderStrong};
  }
`

const Card = styled.div`
  display: flex;
  gap: 1rem;
  min-width: 18rem;
  max-width: 34rem;
  padding: 1rem 1.2rem;
  border-radius: 0.8rem;
  border: 1px solid ${({ theme }) => theme.color.borderDefault};
  background: ${({ theme }) => theme.color.surfaceRaised};
  box-shadow: 0 1px 2px ${({ theme }) => theme.color.shadowMedium};
`

const Icon = styled.span<{ $tint: string }>`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.8rem;
  height: 2.8rem;
  border-radius: 0.6rem;
  color: ${({ $tint }) => $tint};
  background: ${({ $tint }) => withAlpha($tint, 0.14)};
`

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
`

const Title = styled.div`
  font-weight: 600;
  color: ${({ theme }) => theme.color.contentPrimary};
`

const Subtitle = styled.div`
  color: ${({ theme }) => theme.color.contentSecondary};
`

const Badges = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
`

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.1rem 0.6rem;
  border-radius: 1rem;
  font-size: 1.05rem;
  font-weight: 600;
  color: ${({ theme }) => theme.color.contentAccent};
  background: ${({ theme }) => withAlpha(theme.color.contentAccent, 0.1)};
`

const Attributes = styled.dl`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.2rem 0.8rem;
  margin: 0.2rem 0 0;
  font-size: 1.15rem;

  dt {
    color: ${({ theme }) => theme.color.contentMuted};
  }

  dd {
    margin: 0;
    font-family: ${({ theme }) => theme.fontMonospace};
    font-size: 1.1rem;
    color: ${({ theme }) => theme.color.contentSecondary};
    word-break: break-word;
  }
`

const useTint = (kind: Kind): string => {
  const { color } = useTheme()
  switch (kind) {
    case "scan":
      return color.chartSeries1
    case "filter":
      return color.chartSeries3
    case "aggregate":
      return color.chartSeries4
    case "sort":
    case "limit":
      return color.statusWarning
    case "join":
      return color.chartSeries6
    default:
      return color.contentSecondary
  }
}

const Operator = ({ node }: { node: PlanNode }) => {
  const inline = INLINE.exec(node.name)
  const title = inline ? node.name.slice(0, inline.index) : node.name
  const extra = inline ? { key: inline[1], value: inline[2] } : null
  const kind = kindOf(node.name)
  const tint = useTint(kind)
  const KindIcon = ICONS[kind]
  const parallel = /^async/i.test(title)
  const jit = /\bjit\b/i.test(title)
  const workers = extra?.key === "workers" ? extra.value : null
  const subtitle = extra && extra.key !== "workers" ? extra : null
  return (
    <Card>
      <Icon $tint={tint}>
        <KindIcon size={16} weight="bold" />
      </Icon>
      <Body>
        <Title>
          {title.replace(/^Async\s+/i, "").replace(/\bJIT\s+/i, "")}
        </Title>
        {subtitle && (
          <Subtitle>
            {subtitle.key} {subtitle.value}
          </Subtitle>
        )}
        {(parallel || jit) && (
          <Badges>
            {parallel && (
              <Badge>
                <CpuIcon size={11} weight="bold" />
                {workers ? `${workers} workers` : "parallel"}
              </Badge>
            )}
            {jit && (
              <Badge>
                <LightningIcon size={11} weight="bold" />
                JIT
              </Badge>
            )}
          </Badges>
        )}
        {node.attributes.length > 0 && (
          <Attributes>
            {node.attributes.map((a) => (
              <React.Fragment key={`${a.key}=${a.value}`}>
                <dt>{a.key}</dt>
                <dd>{a.value}</dd>
              </React.Fragment>
            ))}
          </Attributes>
        )}
      </Body>
    </Card>
  )
}

const NodeView = ({ node, root }: { node: PlanNode; root: boolean }) => (
  <Branch $root={root}>
    <Operator node={node} />
    {node.children.length > 0 && (
      <Children>
        {node.children.map((child) => (
          <NodeView key={child.id} node={child} root={false} />
        ))}
      </Children>
    )}
  </Branch>
)

export const planLines = (
  visual: VisualConfig,
  rows: StatementRows | null,
): string[] => {
  if (!rows) return []
  const textIdx = columnIndex(rows, visual.columns?.text, 0)
  return textIdx < 0 ? [] : rows.rows.map((r) => toLabel(r[textIdx]))
}

/** A parsed plan (parsePlan), read by the visual's outcome. */
export const PlanTree = ({ tree }: { tree: PlanNode[] }) => {
  return (
    <Root data-hook="plan-tree">
      <Tree>
        {tree.map((node) => (
          <NodeView key={node.id} node={node} root />
        ))}
      </Tree>
    </Root>
  )
}
