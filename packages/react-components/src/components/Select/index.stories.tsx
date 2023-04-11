import React from "react";
import { ComponentMeta } from "@storybook/react";

import { Select } from "./";

export default {
  title: "Select",
  component: Select,
  decorators: [
    (Story) => (
      <div style={{ width: "25%" }}>
        <Story />
      </div>
    ),
  ],
} as ComponentMeta<typeof Select>;

const Template = (args) => {
  return <Select {...args} />;
};

export const All = Template.bind({});

All.args = {
  name: "select",
  options: [
    {
      label: "Option 1",
      value: "option-1",
    },
    {
      label: "Option 2",
      value: "option-2",
    },
  ],
};
