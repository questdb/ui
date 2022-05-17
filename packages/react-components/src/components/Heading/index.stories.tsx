import React from "react";

import { permutate } from "../../utils/permutate";
import { permutateDecorator } from "../../utils/permutate-decorator";
import { Heading } from "./";
import type { Props } from "./";

export default {
  title: "Heading",
  component: Heading,
};

const Template = (args: Props) => <Heading {...args} />;

const permutations = permutate({ level: [1, 2, 3, 4, 5, 6] });

export const All = Template.bind({});

All.args = {
  children: "Heading",
};

All.decorators = [permutateDecorator(permutations)];
