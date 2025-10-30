import React from "react";
import styled, { css } from "styled-components";

const keyOrFallback = (key: React.ReactNode | undefined, fallback: React.Key) =>
  typeof key === "number" || typeof key === "string" ? key : fallback;

type ColumnProps = {
  width?: Column["width"];
  align?: Column["align"];
};

const columnStyle = css<ColumnProps>`
  ${({ width }) => (width ? `width: ${width};` : "")}
`;

const columnChildStyle = css<ColumnProps>`
  ${({ align }) => (align ? `justify-content: ${align};` : "")}
`;

const Th = styled.th`
  ${columnStyle}
`;

const Td = styled.td`
  ${columnStyle}
`;

const TdChild = styled.div`
  display: flex;
  ${columnChildStyle}
`;

const defaultRowRenderer = <Row,>({
  row,
  columns,
  index,
}: {
  row: Row;
  columns: Column<Row>[];
  index: number;
}) =>
  columns.map((column: Column<Row>, columnIndex: number) => (
    <Td width={column.width} key={keyOrFallback(column.id, columnIndex)}>
      <TdChild align={column.align}>
        {column.render({ data: row, index })}
      </TdChild>
    </Td>
  ));

export type TableProps<Row> = {
  columns: Column<Row>[];
  rows: Row[];
  className?: string;
  rowRender?({
    row,
    columns,
    index,
    defaultRowRender,
  }: {
    row: Row;
    columns: Column<Row>[];
    index: number;
    defaultRowRender: typeof defaultRowRenderer;
  }): React.ReactNode;
};

export type Column<Row = object> = {
  id?: React.Key;
  header?:
    | React.ReactNode
    | (({ data, index }: { data: Row; index: number }) => React.ReactNode);
  render({ data, index }: { data: Row; index: number }): React.ReactNode;
  width?: string | number;
  align?: "flex-start" | "center" | "flex-end";
};

export type Row<T> = T & {
  id?: React.Key;
};

export const Table = <T,>({
  columns,
  rows,
  className,
  rowRender,
}: TableProps<Row<T>>): React.ReactElement => {
  const hasHeader = columns.filter(({ header }) => header).length > 0;

  return (
    <table className={className}>
      {hasHeader && (
        <thead>
          <tr>
            {columns.map((column, columnIndex) =>
              typeof column.header === "function" ? (
                React.cloneElement(
                  column.header({
                    data: rows[columnIndex],
                    index: columnIndex,
                  }),
                  { key: keyOrFallback(column.header, columnIndex) }
                )
              ) : (
                <Th
                  width={column.width}
                  key={keyOrFallback(column.header, columnIndex)}
                >
                  <TdChild align={column.align}>{column.header}</TdChild>
                </Th>
              )
            )}
          </tr>
        </thead>
      )}

      <tbody>
        {rows.map((row, rowIndex) => {
          const key = keyOrFallback(row.id, rowIndex);

          return (
            <tr key={key}>
              {rowRender
                ? rowRender({
                    row,
                    columns,
                    index: rowIndex,
                    defaultRowRender: defaultRowRenderer,
                  })
                : defaultRowRenderer({
                    row,
                    columns,
                    index: rowIndex,
                  })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
