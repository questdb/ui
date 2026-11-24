// @vitest-environment jsdom
import { renderComponent } from "../../../../test/component"
import React, { useState } from "react"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import type { StepsRule } from "../../../../components/ResultGrid/highlight"
import { StepsEditor } from "./StepsEditor"

const initial: StepsRule = {
  id: "bands",
  kind: "steps",
  enabled: true,
  target: { kind: "column", name: "v" },
  appliesTo: "cell",
  display: "always",
  baseColor: "dataSeries10",
  steps: [
    { id: "s1", from: 10, color: "dataSeries2" },
    { id: "s2", from: 20, color: "dataSeries3" },
  ],
}

const Editor = () => {
  const [rule, setRule] = useState(initial)
  return <StepsEditor rule={rule} errors={{}} onChange={setRule} />
}

describe("steps editor", () => {
  it("moves focus to the next step, then to Add step, as steps are removed", async () => {
    // Given two steps
    renderComponent(<Editor />)

    // When the user removes the first step from the keyboard
    screen.getByRole("button", { name: "Remove step 1" }).focus()
    await userEvent.keyboard("{Enter}")

    // Then focus is on the step that took its place
    expect(screen.getByLabelText("Step 1 from")).toHaveFocus()
    expect(screen.getByLabelText("Step 1 from")).toHaveValue(20)

    // When the user removes the last step
    screen.getByRole("button", { name: "Remove step 1" }).focus()
    await userEvent.keyboard("{Enter}")

    // Then focus is on Add step
    expect(screen.getByRole("button", { name: "+ Add step" })).toHaveFocus()
  })
})
