import React from "react";

import { Heading } from "./";

export default {
  title: "Heading",
  component: Heading,
};

const Template = (args) => (
  <Heading children={`Level ${args.level}`} {...args} />
);

export const Level1 = Template.bind({});

Level1.args = {
  level: 1,
  children: "Level 1",
};
