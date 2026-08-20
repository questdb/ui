# Control variants

Use controls by intent, not by their current color.

| Component               | Variant       | Use                                                                              |
| ----------------------- | ------------- | -------------------------------------------------------------------------------- |
| `Button`                | `primary`     | The single main action in a view or dialog                                       |
| `Button`                | `secondary`   | Supporting actions such as Cancel, Refresh, or Back                              |
| `Button`                | `tertiary`    | Low-emphasis bordered actions on dense surfaces                                  |
| `Button` / `IconButton` | `ghost`       | Toolbar and chrome actions that should be quiet at rest                          |
| `Button`                | `danger`      | Destructive actions and immediate stop controls                                  |
| `Button` / `IconButton` | `dangerGhost` | Destructive actions before confirmation, including menu-adjacent delete controls |
| `Button`                | `success`     | A completed or explicitly positive action; not a substitute for primary          |
| `Button`                | `warning`     | Actions that require caution without being destructive                           |
| `Button`                | `gradient`    | Branded high-attention actions; use sparingly                                    |

Use `IconButton` for square icon-only actions. It requires a `label`, providing
the accessible name and optionally a tooltip. Use `TextButton` for inline
actions, `TabButton` for panel navigation, `SegmentedControlButton` for view
modes and mutually exclusive toolbar choices, and `SelectableCardButton` for
large choices such as AI providers. Use `SelectMenu` for single-value dropdowns;
it provides compact and descriptive triggers, optional leading icons, and the
standard pink selected check.

New feature-level styled wrappers should normally change only geometry, layout,
and local motion. Color, border, hover, pressed, focus, and disabled treatment
belongs to the shared primitive unless the control has a distinct semantic state
that no variant represents. `ButtonBase` is reserved for the shared control
layer and exceptional composite controls whose shape cannot be represented by an
existing primitive. It supplies inherited font behavior, the focus ring,
disabled cursor, press feedback, and base motion.

The legacy `skin` prop has been removed. Feature code must choose a semantic
`variant`; visual aliases such as `transparent` and `error` are no longer
accepted.

Badges use `neutral`, `accent`, `info`, `success`, `warning`, or `danger`.
`BadgeType` remains as a compatibility API for existing callers; new code should
use `variant`. A badge describes state or metadata and never performs an action.
Interactive chips should be built on `ButtonBase` instead.
