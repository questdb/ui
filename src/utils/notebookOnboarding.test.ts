import {
  isMcpPromoCollapsed,
  shouldShowMcpPromo,
  shouldShowNotebookModal,
} from "./notebookOnboarding"
import type { NotebookOnboarding } from "../providers/LocalStorageProvider/types"

const freshInstall: NotebookOnboarding = {
  mcpEverConnected: false,
  showNotebookPromo: true,
  showMcpPromo: true,
  collapseMcpPromo: false,
}

describe("notebook onboarding visibility", () => {
  describe("onboarding modal", () => {
    it("shows on a fresh install", () => {
      // Given a fresh install
      // When deciding whether to show the modal
      // Then it shows
      expect(shouldShowNotebookModal(freshInstall)).toBe(true)
    })

    it("stays hidden once it has been shown", () => {
      // Given the modal was already shown (flag flipped to false)
      const onboarding = { ...freshInstall, showNotebookPromo: false }
      // When deciding whether to show the modal
      // Then it stays hidden
      expect(shouldShowNotebookModal(onboarding)).toBe(false)
    })

    it("stays hidden once an MCP bridge has ever connected", () => {
      // Given the bridge has connected before, even if the flag is untouched
      const onboarding = { ...freshInstall, mcpEverConnected: true }
      // When deciding whether to show the modal
      // Then it stays hidden
      expect(shouldShowNotebookModal(onboarding)).toBe(false)
    })
  })

  describe("in-notebook promo section", () => {
    it("shows on a fresh install", () => {
      // Given a fresh install
      // When deciding whether to show the section
      // Then it shows
      expect(shouldShowMcpPromo(freshInstall)).toBe(true)
    })

    it("stays hidden once explicitly dismissed", () => {
      // Given the user dismissed the section
      const onboarding = { ...freshInstall, showMcpPromo: false }
      // When deciding whether to show the section
      // Then it stays hidden
      expect(shouldShowMcpPromo(onboarding)).toBe(false)
    })

    it("stays hidden once an MCP bridge has ever connected", () => {
      // Given the bridge has connected before
      const onboarding = { ...freshInstall, mcpEverConnected: true }
      // When deciding whether to show the section
      // Then it stays hidden
      expect(shouldShowMcpPromo(onboarding)).toBe(false)
    })

    it("renders collapsed when the section is visible and collapse is set", () => {
      // Given a visible section the user collapsed
      const onboarding = { ...freshInstall, collapseMcpPromo: true }
      // When deciding how to render the section
      // Then it is visible and collapsed
      expect(shouldShowMcpPromo(onboarding)).toBe(true)
      expect(isMcpPromoCollapsed(onboarding)).toBe(true)
    })

    it("renders expanded by default", () => {
      // Given a fresh install
      // When deciding how to render the section
      // Then it is not collapsed
      expect(isMcpPromoCollapsed(freshInstall)).toBe(false)
    })
  })
})
