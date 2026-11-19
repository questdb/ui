// @vitest-environment jsdom
import { renderComponent } from "../../../../test/component"
import React, { useState } from "react"
import { fireEvent, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import {
  InteractionsEditor,
  interactionErrors,
  newVariablesInUse,
  serverInteractionErrors,
  withNewVariables,
  type InteractionsDraft,
} from "./InteractionsEditor"

const variables = [{ name: "symbol", value: "'BTC'" }]

let latest: InteractionsDraft = { created: {} }

const Editor = ({
  initial = { created: {} },
  brush = { available: true as const },
}: {
  initial?: InteractionsDraft
  brush?: React.ComponentProps<typeof InteractionsEditor>["brush"]
}) => {
  const [draft, setDraft] = useState(initial)
  latest = draft
  return (
    <InteractionsEditor
      draft={draft}
      onChange={setDraft}
      variables={variables}
      columns={[{ name: "ts" }, { name: "symbol" }]}
      clickTarget="item"
      brush={brush}
      errors={interactionErrors(draft, variables)}
    />
  )
}

const pickNew = async (label: RegExp) => {
  await userEvent.click(screen.getByRole("button", { name: label }))
  await userEvent.click(
    screen.getByRole("menuitemradio", { name: "New variable…" }),
  )
}

describe("interactions editor", () => {
  it("sets a click to an existing variable from a column", async () => {
    // Given
    renderComponent(<Editor />)

    // When
    fireEvent.click(screen.getByRole("checkbox", { name: /A click sets/ }))
    await userEvent.click(screen.getByRole("button", { name: /^Variable:/ }))
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: /^@symbol/ }),
    )
    await userEvent.click(screen.getByRole("button", { name: /^Set it to:/ }))
    await userEvent.click(
      screen.getByRole("menuitemradio", {
        name: "The symbol of the clicked row",
      }),
    )

    // Then
    expect(latest.interactions).toEqual({
      click: { variable: "symbol", column: "symbol" },
    })
    expect(interactionErrors(latest, variables)).toBeNull()
  })

  it("keeps two new variables for a drag apart", async () => {
    // Given
    renderComponent(<Editor />)
    fireEvent.click(screen.getByRole("checkbox", { name: /Dragging across/ }))

    // When the user creates a new variable for each end of the window
    await pickNew(/^Start of the window/)
    await pickNew(/^End of the window/)
    const [startName, endName] = screen.getAllByPlaceholderText("e.g. symbol")
    fireEvent.change(startName, { target: { value: "@t0" } })
    fireEvent.change(endName, { target: { value: "t1" } })
    fireEvent.change(
      screen.getByPlaceholderText("e.g. dateadd('h', -1, now())"),
      { target: { value: "dateadd('h', -8, now())" } },
    )

    // Then both stay new, the @ is dropped, and the missing value is named
    expect(latest.interactions?.brush).toEqual({ from: "t0", to: "t1" })
    expect(interactionErrors(latest, variables)).toEqual({
      to: "Give the new variable a value to start with.",
    })

    // When the end gets a value
    fireEvent.change(screen.getByPlaceholderText("e.g. now()"), {
      target: { value: "now()" },
    })

    // Then both are added on save
    expect(newVariablesInUse(latest)).toEqual([
      { name: "t0", value: "dateadd('h', -8, now())" },
      { name: "t1", value: "now()" },
    ])
  })

  it("refuses a starting value that is not one expression", () => {
    // Given / When / Then
    expect(
      interactionErrors(
        {
          interactions: { click: { variable: "pair" } },
          created: { click: { name: "pair", value: "'BTC', 'ETH'" } },
        },
        variables,
      ),
    ).toEqual({
      click:
        "Must be a single expression: wrap it in parentheses if it needs commas.",
    })
  })

  it("shows a variable a click creates on first use", () => {
    // Given / When
    renderComponent(
      <Editor
        initial={{
          interactions: { click: { variable: "level" } },
          created: {},
        }}
      />,
    )

    // Then
    expect(
      screen.getByRole("button", { name: /^Variable: @level/ }),
    ).toBeVisible()
    expect(interactionErrors(latest, variables)).toBeNull()
  })

  it("explains why dragging is not available", () => {
    // Given / When
    renderComponent(
      <Editor
        brush={{ available: false, reason: "Dragging needs a time x-axis." }}
      />,
    )

    // Then
    expect(
      screen.getByRole("checkbox", { name: /Dragging across/ }),
    ).toBeDisabled()
    expect(screen.getByText("Dragging needs a time x-axis.")).toBeVisible()
  })

  it("adds new variables without replacing existing ones or each other", () => {
    // Given / When / Then
    expect(
      withNewVariables(variables, [
        { name: "symbol", value: "'ETH'" },
        { name: "t0", value: "now()" },
        { name: "t0", value: "now() - 1" },
      ]),
    ).toEqual([...variables, { name: "t0", value: "now()" }])
    expect(
      interactionErrors(
        {
          interactions: { click: { variable: "symbol" } },
          created: { click: { name: "symbol", value: "'X'" } },
        },
        variables,
      ),
    ).toEqual({ click: "@symbol already exists: pick it from the list." })
  })

  it("reports the server's error on the slot whose variable fails", async () => {
    // Given a new variable the server rejects
    const draft: InteractionsDraft = {
      interactions: { click: { variable: "bad" } },
      created: { click: { name: "bad", value: "nope(" } },
    }
    const queries: string[] = []

    // When
    const errors = await serverInteractionErrors(draft, variables, (query) => {
      queries.push(query)
      return Promise.resolve({ error: "unbalanced (" })
    })

    // Then it checked the variable after the notebook's and named the slot
    expect(queries[0]).toContain("@symbol := 'BTC'")
    expect(queries[0]).toContain("@bad := nope(")
    expect(errors).toEqual({ click: "unbalanced (" })
  })
})
