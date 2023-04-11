import React from "react";
import { ComponentMeta } from "@storybook/react";
import { permutate } from "../../utils/permutate";
import { permutateDecorator } from "../../utils/permutate-decorator";

import { Badge, BadgeType } from "./";

export default {
  title: "Badge",
  component: Badge,
  decorators: [
    (Story) => (
      <div style={{ margin: "3em" }}>
        <Story />
      </div>
    ),
  ],
} as ComponentMeta<typeof Badge>;

const Template = (args) => {
  return <Badge {...args} />;
};

export const All = Template.bind({});

All.args = {
  children: "Badge",
};

const permutations = permutate({
  type: [BadgeType.SUCCESS, BadgeType.WARNING, BadgeType.ERROR, BadgeType.INFO],
});

All.decorators = [permutateDecorator(permutations)];
