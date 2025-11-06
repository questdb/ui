# `<ForwardRef/>`

This component is used as a helper wrapper to avoid repetitive
`React.forwardRef` uses.

For example, using `@radix-ui/react-alert-dialog` with `asChild` will require to
use `React.forwardRef` and pass props to the child component.

It can be handled on each case individually, or, because that's tedious, with a
`<ForwardRef/>` helper.

Let's say you want to do this:

> notice the use of `asChild`

```jsx
const Alert = ({ children, content }) => {
  <AlertDialog.Root>
    <AlertDialog.Trigger asChild>{children}</AlertDialog.Trigger>
    <AlertDialog.Content>{content}</AlertDialog.Content>
  </AlertDialog.Root>;
};
```

All is good, you can use it like so:

```jsx
<Alert content="some content">
  <Button>Cool button</Button>
</Alert>
```

But this would not work well:

```jsx
<Alert content="some content">
  <Tooltip text="click this button for an alert dialog!">
    <Button>Cool button</Button>
  </Tooltip>
</Alert>
```

Typescript would probably be happy, but React would complain during runtime:

```
Warning: Function components cannot be given refs. Attempts to access this ref will fail. Did you mean to use React.forwardRef()?
```

This error can consume a long time to figure out, where it comes from.

Because we used
[`asChild`](https://www.radix-ui.com/docs/primitives/overview/styling#changing-the-rendered-element),
we have to pass `ref` and `props` to the child component. We can do this
manually for each usage of `asChild`, but that's tedious. Instead we can use
`<ForwardRef/>` helper:

> notice `<ForwardRef>` is wrapping `{children}`

```jsx
const Alert = ({ children, content }) => {
  <AlertDialog.Root>
    <AlertDialog.Trigger asChild>
      <ForwardRef>{children}</ForwardRef>
    </AlertDialog.Trigger>
    <AlertDialog.Content>{content}</AlertDialog.Content>
  </AlertDialog.Root>;
};
```

## What happens:

- `children` is rendered with `React.forwardRef`
- `children` is wrapped in a `<span>`. You can change `<span>` to anything else
  with `as` prop:
  ```jsx
  <ForwardRef as="div">{children}</ForwardRef>
  ```
- all props are passed down to `children`
- `ref` is passed down to (by default) `<span>`
- you don't need to think about it all, just use `<ForwardRef/>`!

## Why wrapping `span`

We want to leverage `asChild`, if we don't then `@radix-ui` by default renders a
`button`. That button has styling which doesn't align with our UI. The styling
needs to be overriden or somehow removed.

Thus, we use `asChild` to avoid that button, but then we face the
`Warning: Function components cannot be given refs`.

This warning is not trivial to track down, we might even ignore it, leaving us
with polluted console and suboptimal code quality.

Thus, `<ForwardRef/>` is a quick win and additional `<span>` is therefore
negligible.
