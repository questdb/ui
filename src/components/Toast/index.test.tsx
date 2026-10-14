import { describe, expect, it, vi } from "vitest"

const messages = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}))
vi.mock("react-toastify", () => ({
  toast: { ...messages, dismiss: vi.fn(), isActive: vi.fn() },
  ToastContainer: () => null,
  Slide: () => null,
}))
vi.mock("react-toastify/addons/use-notification-center", () => ({
  useNotificationCenter: vi.fn(),
}))
vi.mock("../icons", () => ({
  CloseCircle: () => null,
  ErrorWarning: () => null,
  Information: () => null,
  CheckmarkOutline: () => null,
}))
import { toast } from "."

describe("toast theme styles", () => {
  it.each(["info", "success", "warning", "error"] as const)(
    "uses live theme variables for persistent %s toasts",
    (type) => {
      toast[type]("Could not refresh", { autoClose: false })
      const status = {
        info: "Info",
        success: "Success",
        warning: "Warning",
        error: "Danger",
      }[type]
      expect(messages[type]).toHaveBeenCalledWith(
        "Could not refresh",
        expect.objectContaining({
          autoClose: false,
          style: {
            background: "var(--qdb-color-surfaceRaised)",
            color: "var(--qdb-color-contentPrimary)",
            borderColor: `var(--qdb-color-status${status})`,
          },
          progressStyle: {
            background: `var(--qdb-color-status${status})`,
          },
        }),
      )
    },
  )
})
