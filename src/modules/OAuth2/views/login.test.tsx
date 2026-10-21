import React from "react"
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer"
import { ThemeProvider } from "styled-components"
import { afterEach, describe, expect, it, vi } from "vitest"
import { darkTheme } from "../../../theme"

vi.mock("../../../providers", () => ({
  useSettings: () => ({
    settings: {
      "release.type": "EE",
      "release.version": "test",
      "acl.basic.auth.realm.enabled": false,
    },
  }),
}))
vi.mock("../../../components", () => ({
  Badge: "div",
  Text: "span",
  Button: "button",
  IconButton: "button",
  Form: Object.assign(
    (props: React.ComponentProps<"form">) => <form {...props} />,
    { Item: "label", Input: "input", Submit: "button" },
  ),
}))
vi.mock("../../../components/icons", () => ({
  User: () => null,
  Building: () => null,
  ErrorWarning: () => null,
  XSquare: () => null,
}))
vi.mock("../utils", () => ({
  SIGN_IN_ERROR_TITLE: "Sign-in failed",
  getSSOUserNameWithClientID: () => "",
}))
vi.mock("../../../components/LoadingSpinner", () => ({
  LoadingSpinner: () => null,
}))
vi.mock("./loginBackground", () => ({ LoginBackground: () => null }))
import { Login } from "./login"

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.unstubAllGlobals()
})

const mount = (
  errors: { errorTitle?: string; errorMessage?: string } = {},
  unfinishedWrites = 0,
) => {
  const heading = { focus: vi.fn() }
  const banner = { focus: vi.fn() }
  const props = {
    onOAuthLogin: vi.fn(),
    onBasicAuthSuccess: vi.fn(),
    resetErrors: vi.fn(),
    unfinishedWrites,
    ...errors,
  }
  const render = () => (
    <ThemeProvider theme={darkTheme}>
      <Login {...props} />
    </ThemeProvider>
  )
  act(() => {
    renderer = create(render(), {
      createNodeMock: (
        element: React.ReactElement<Record<string, unknown>>,
      ) => {
        if (element.type === "h2") return heading
        if (element.props["data-hook"] === "sign-in-error") return banner
        return null
      },
    })
  })
  const clearErrors = () => {
    props.errorTitle = undefined
    props.errorMessage = undefined
    renderer!.update(render())
  }
  props.resetErrors.mockImplementation(clearErrors)
  return {
    heading,
    banner,
    props,
    updateErrors: (next: typeof errors) => {
      act(() => {
        props.errorTitle = next.errorTitle
        props.errorMessage = next.errorMessage
        renderer!.update(render())
      })
    },
    updateUnfinishedWrites: (count: number) => {
      act(() => {
        props.unfinishedWrites = count
        renderer!.update(render())
      })
    },
  }
}

const textOf = (node: ReactTestInstance): string =>
  node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("")

// AuthProvider asks before leaving the page, as signing in replaces Login.
describe("unfinished writes of the previous session", () => {
  const notices = () =>
    renderer!.root.findAll(
      (node) =>
        node.type === "div" && node.props["data-hook"] === "unfinished-writes",
    )

  it("explains them until they finish", () => {
    const { updateUnfinishedWrites } = mount({}, 2)
    expect(notices()).toHaveLength(1)
    expect(notices()[0].props.role).toBe("status")
    expect(textOf(notices()[0])).toContain(
      "Your previous session is still sending 2 requests",
    )
    expect(textOf(notices()[0])).toContain(
      "Leaving the page, including to sign in with SSO, cancels them",
    )

    updateUnfinishedWrites(1)
    expect(textOf(notices()[0])).toContain(
      "Your previous session is still sending 1 request",
    )
    expect(textOf(notices()[0])).toContain("Keep this tab open until it")

    updateUnfinishedWrites(0)
    expect(notices()).toHaveLength(0)
  })

  it("shows no notice when no write is unfinished", () => {
    mount()
    expect(notices()).toHaveLength(0)
  })
})

describe("login focus", () => {
  it("focuses the heading on initial mount without a redirect error", () => {
    const { heading, banner } = mount()
    expect(heading.focus).toHaveBeenCalledOnce()
    expect(banner.focus).not.toHaveBeenCalled()
  })

  it("focuses redirect errors when presented, but not the heading when cleared", () => {
    const { heading, banner, updateErrors } = mount({
      errorMessage: "Sign-in cancelled",
    })
    expect(banner.focus).toHaveBeenCalledOnce()
    expect(heading.focus).not.toHaveBeenCalled()

    updateErrors({})
    expect(heading.focus).not.toHaveBeenCalled()
    updateErrors({ errorTitle: "Another sign-in error" })
    expect(banner.focus).toHaveBeenCalledTimes(2)
  })

  it("retains explicit dismissal's heading focus", () => {
    const { heading, props } = mount({ errorMessage: "Sign-in cancelled" })
    act(() => {
      renderer!.root
        .findByProps({ label: "Dismiss sign-in error" })
        .props.onClick()
    })
    expect(props.resetErrors).toHaveBeenCalledOnce()
    expect(heading.focus).toHaveBeenCalledOnce()
  })

  it("does not refocus the heading during password submission or credential rejection", async () => {
    const { heading, props } = mount({ errorMessage: "Sign-in cancelled" })
    let finish!: (response: Response) => void
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve
          }),
      ),
    )
    let pending!: Promise<void>
    act(() => {
      const { onSubmit } = renderer!.root.findByType("form").props as {
        onSubmit: (values: {
          username: string
          password: string
        }) => Promise<void>
      }
      pending = onSubmit({ username: "admin", password: "wrong" })
    })
    expect(props.resetErrors).toHaveBeenCalledOnce()
    expect(heading.focus).not.toHaveBeenCalled()
    expect(
      renderer!.root.findAllByProps({ "data-hook": "sign-in-error" }),
    ).toHaveLength(0)

    await act(async () => {
      finish(new Response("", { status: 401 }))
      await pending
    })
    expect(heading.focus).not.toHaveBeenCalled()
    expect(
      renderer!.root
        .findAllByType("span")
        .some((node) => node.children.includes("Invalid username or password")),
    ).toBe(true)
    expect(props.onBasicAuthSuccess).not.toHaveBeenCalled()
  })
})
