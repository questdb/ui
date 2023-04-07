import React from "react";
import { ComponentMeta } from "@storybook/react";
import { permutate } from "../../utils/permutate";
import { permutateDecorator } from "../../utils/permutate-decorator";

import { Input } from "./";

export default {
  title: "Input",
  component: Input,
  decorators: [
    (Story) => (
      <div style={{ margin: "3em" }}>
        <Story />
      </div>
    ),
  ],
} as ComponentMeta<typeof Input>;

const Template = (args) => {
  return <Input {...args} />;
};

export const All = Template.bind({});

All.args = {
  placeholder: "Input placeholder",
  value: "Input value",
};

const permutations = permutate({
  type: ["text", "password"],
  variant: ["transparent", "error"],
});

All.decorators = [permutateDecorator(permutations)];
