import React, { useMemo } from "react"
import styled from "styled-components"
import { columnIndex, toLabel, type StatementRows } from "./statementRows"
import type { VisualConfig } from "../CellChart/chartTypes"

// A query plan from EXPLAIN, as a tree of operators with their attributes.
// EXPLAIN returns one row per line, indented by depth; a line such as
// "filter: price > 10" is an attribute of the operator above it.

export type PlanNode = {
  id: string
  name: string
  attributes: { key: string; value: string }[]
  children: PlanNode[]
}

const ATTRIBUTE = /^([A-Za-z][A-Za-z0-9_]*):\s?(.*)$/

export const parsePlan = (lines: string[]): PlanNode[] => {
  const roots: PlanNode[] = []
  const stack: { indent: number; node: PlanNode }[] = []
  for (const raw of lines) {
    if (raw.trim() === "") continue
    const indent = raw.length - raw.trimStart().length
    const text = raw.trim()
    const attribute = ATTRIBUTE.exec(text)
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      if (attribute && stack[stack.length - 1].indent < indent) break
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

const Root = styled.div`
  height: 100%;
  padding: 1rem 1.2rem;
  overflow: auto;
  font-size: 1.25rem;
`

const NodeRoot = styled.div<{ $depth: number }>`
  position: relative;
  margin-left: ${({ $depth }) => ($depth === 0 ? 0 : 1.8)}rem;
  padding-left: ${({ $depth }) => ($depth === 0 ? 0 : 1.2)}rem;
  border-left: ${({ $depth, theme }) =>
    $depth === 0 ? "none" : `1px solid ${theme.color.borderDefault}`};
`

const Operator = styled.div<{ $kind: string }>`
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0.4rem 0 0.2rem;
  padding: 0.3rem 0.8rem;
  border-radius: 0.4rem;
  border: 1px solid ${({ theme }) => theme.color.borderDefault};
  background: ${({ theme }) => theme.color.surfaceRaised};
  color: ${({ $kind, theme }) =>
    $kind === "scan"
      ? theme.color.contentSecondary
      : $kind === "sort"
        ? theme.color.statusWarning
        : $kind === "parallel"
          ? theme.color.contentAccent
          : theme.color.contentPrimary};
  font-weight: 600;
`

const Attributes = styled.dl`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.1rem 0.8rem;
  margin: 0.2rem 0 0.4rem 0.8rem;
  font-family: ${({ theme }) => theme.fontMonospace};
  font-size: 1.15rem;

  dt {
    color: ${({ theme }) => theme.color.contentMuted};
  }

  dd {
    margin: 0;
    color: ${({ theme }) => theme.color.contentSecondary};
    word-break: break-word;
  }
`

const kindOf = (name: string): string => {
  const n = name.toLowerCase()
  if (n.includes("scan") || n.includes("pageframe")) return "scan"
  if (n.includes("sort")) return "sort"
  if (n.startsWith("async") || n.includes("workers")) return "parallel"
  return "other"
}

const NodeView = ({ node, depth }: { node: PlanNode; depth: number }) => (
  <NodeRoot $depth={depth}>
    <Operator $kind={kindOf(node.name)}>{node.name}</Operator>
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
    {node.children.map((child) => (
      <NodeView key={child.id} node={child} depth={depth + 1} />
    ))}
  </NodeRoot>
)

export const planLines = (
  visual: VisualConfig,
  rows: StatementRows | null,
): string[] => {
  if (!rows) return []
  const textIdx = columnIndex(rows, visual.columns?.text, 0)
  return textIdx < 0 ? [] : rows.rows.map((r) => toLabel(r[textIdx]))
}

export const PlanTree = ({
  visual,
  statements,
}: {
  visual: VisualConfig
  statements: (StatementRows | null)[]
}) => {
  const tree = useMemo(
    () => parsePlan(planLines(visual, statements[0])),
    [visual, statements],
  )
  return (
    <Root data-hook="plan-tree">
      {tree.map((node) => (
        <NodeView key={node.id} node={node} depth={0} />
      ))}
    </Root>
  )
}
