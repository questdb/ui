import React from "react";

import { permutate } from "../../utils/permutate";
import { permutateDecorator } from "../../utils/permutate-decorator";
import { Heading } from "./";
import type { Props } from "./";
import { ComponentMeta, ComponentStory } from "@storybook/react";

export default {
  title: "Heading",
  component: Heading,
  decorators: [
    (Story) => (
      <div style={{ margin: "3em" }}>
        <Story />
      </div>
    ),
  ],
} as ComponentMeta<typeof Heading>;

const Template: ComponentStory<typeof Heading> = (args: Props) => (
  <Heading {...args} />
);

const permutations = permutate({ level: [1, 2, 3, 4, 5, 6] });

export const All = Template.bind({});

All.args = {
  children: "Heading",
};

All.decorators = [permutateDecorator(permutations)];
