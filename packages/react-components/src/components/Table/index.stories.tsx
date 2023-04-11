import React from "react";
import { ComponentMeta } from "@storybook/react";
import styled from "styled-components";

import { Table } from "./";

const Root = styled.div`
  display: flex;
  font-family: ${({ theme }) => theme.font};
  color: ${({ theme }) => theme.color.foreground};

  table {
    width: 100%;
  }
`;

export default {
  title: "Table",
  component: Table,
  decorators: [
    (Story) => (
      <Root>
        <Story />
      </Root>
    ),
  ],
} as ComponentMeta<typeof Table>;

const Template = (args) => {
  return <Table {...args} />;
};

export const All = Template.bind({});

All.args = {
  columns: [
    {
      header: "Column 1 (align: flex-start)",
      align: "flex-start",
      render: ({ data }) => <>{data.property1}</>,
    },
    {
      header: "Column 2 (align: center)",
      align: "center",
      render: ({ data }) => <>{data.property2}</>,
    },
    {
      header: "Column 3 (align: flex-end)",
      align: "flex-end",
      render: ({ data }) => <>{data.property3}</>,
    },
  ],
  rows: Array.from(Array(10).keys()).map((i) => {
    return {
      property1: `Row ${i + 1} Column 1`,
      property2: `Row ${i + 1} Column 2`,
      property3: `Row ${i + 1} Column 3`,
    };
  }),
};
