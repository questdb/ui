import React from "react";
import { ComponentStory, ComponentMeta } from "@storybook/react";
import { FeedbackDialog } from "./";

export default {
  title: "FeedbackDialog",
  component: FeedbackDialog,
} as ComponentMeta<typeof FeedbackDialog>;

const Template: ComponentStory<typeof FeedbackDialog> = (args) => {
  const [open, setOpen] = React.useState(false);

  return args.trigger ? (
    <FeedbackDialog {...args} />
  ) : (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <FeedbackDialog {...args} open={open} onOpenChange={setOpen} />
    </>
  );
};

export const Programmatic = Template.bind({});

Programmatic.args = {
  onSubmit: async (values) => {
    console.log(values);
  },
  title: "Title",
  subtitle: "Subtitle",
  initialMessage: "Initial message",
  afterMessage: <div>After message</div>,
  withEmailInput: true,
};

export const Trigger = Template.bind({});

Trigger.args = {
  onSubmit: async (values) => {
    console.log(values);
  },
  title: "Title",
  subtitle: "Subtitle",
  initialMessage: "Initial message",
  afterMessage: <div>After message</div>,
  withEmailInput: true,
  trigger: ({ setOpen }) => <button onClick={() => setOpen(true)}>Open</button>,
};
