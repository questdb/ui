import React from "react";
import { ComponentStory, ComponentMeta } from "@storybook/react";

import { permutate } from "../../utils/permutate";
import { permutateDecorator } from "../../utils/permutate-decorator";
import { sizes, Button } from "./";
import { skins } from "./skin";

export default {
  title: "Button",
  component: Button,
  decorators: [
    (Story) => (
      <div style={{ margin: "3em" }}>
        <Story />
      </div>
    ),
  ],
} as ComponentMeta<typeof Button>;

const Template: ComponentStory<typeof Button> = (args) => <Button {...args} />;

export const All = Template.bind({});

All.args = {
  children: "Button",
};

const permutations = permutate({
  disabled: [true, false],
  size: sizes,
  skin: skins,
});

All.decorators = [permutateDecorator(permutations)];
