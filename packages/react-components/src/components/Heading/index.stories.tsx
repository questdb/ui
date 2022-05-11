import React from "react";

import { Heading } from "./";
import type { Props } from "./";

export default {
  title: "Heading",
  component: Heading,
};

const Template = (args: Props) => (
  <Heading children={`Level ${args.level}`} {...args} />
);

type Story = {
  (args: Props): JSX.Element;
  args?: Props;
};

export const Level1: Story = Template.bind({});

Level1.args = {
  level: 1,
  children: "Level 1",
};
