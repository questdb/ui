import React from "react";
import { ComponentMeta } from "@storybook/react";
import { permutate } from "../../utils/permutate";
import { permutateDecorator } from "../../utils/permutate-decorator";

import { Switch } from "./";

export default {
  title: "Switch",
  component: Switch,
  decorators: [
    (Story) => (
      <div style={{ margin: "3em" }}>
        <Story />
      </div>
    ),
  ],
} as ComponentMeta<typeof Switch>;

const Template = (args) => {
  return <Switch {...args} />;
};

export const All = Template.bind({});

All.args = {
  onChange: (checked: boolean) => console.log(checked),
};

const permutations = permutate({
  disabled: [true, false],
  checked: [true, false],
});

All.decorators = [permutateDecorator(permutations)];
