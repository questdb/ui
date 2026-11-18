// @vitest-environment jsdom
import React from "react"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  type RenderResult,
} from "@testing-library/react"
import { ThemeProvider } from "styled-components"
import { afterEach, describe, expect, it, vi, type MockInstance } from "vitest"
import { darkTheme } from "../../../theme"

const formSubmission = vi.hoisted(() => ({
  pending: undefined as Promise<void> | undefined,
}))

vi.mock("../../../providers/SettingsProvider", () => ({
  useSettings: () => ({
    settings: {
      "release.type": "EE",
      "release.version": "test",
      "acl.basic.auth.realm.enabled": false,
    },
  }),
}))
vi.mock("../../../components/Badge", () => ({ Badge: "div" }))
vi.mock("../../../components/Text", () => ({ Text: "span" }))
vi.mock("../../../components/Button", () => ({ Button: "button" }))
vi.mock("../../../components/IconButton", () => ({ IconButton: "button" }))
vi.mock("../../../components/Form", () => ({
  Form: Object.assign(
    ({
      onSubmit,
      children,
      name,
    }: {
      onSubmit: (values: {
        username: FormDataEntryValue | null
        password: FormDataEntryValue | null
      }) => Promise<void>
      children?: React.ReactNode
      name?: string
    }) => (
      <form
        name={name}
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          formSubmission.pending = onSubmit({
            username: data.get("username"),
            password: data.get("password"),
          })
        }}
      >
        {children}
      </form>
    ),
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

let rendered: RenderResult | undefined
let focusSpy: MockInstance | undefined

afterEach(() => {
  cleanup()
  rendered = undefined
  focusSpy?.mockRestore()
  focusSpy = undefined
  formSubmission.pending = undefined
  vi.unstubAllGlobals()
})

const mount = (
  errors: { errorTitle?: string; errorMessage?: string } = {},
  unfinishedWrites = 0,
) => {
  const heading = { focus: vi.fn() }
  const banner = { focus: vi.fn() }
  focusSpy = vi
    .spyOn(HTMLElement.prototype, "focus")
    .mockImplementation(function (this: HTMLElement) {
      if (this.tagName === "H2") heading.focus()
      if (this.getAttribute("data-hook") === "sign-in-error") banner.focus()
    })
  const props = {
    onOAuthLogin: vi.fn(),
    onBasicAuthSuccess: vi.fn(),
    resetErrors: vi.fn(),
    unfinishedWrites,
    ...errors,
  }
  const view = () => (
    <ThemeProvider theme={darkTheme}>
      <Login {...props} />
    </ThemeProvider>
  )
  rendered = render(view())
  const clearErrors = () => {
    props.errorTitle = undefined
    props.errorMessage = undefined
    rendered!.rerender(view())
  }
  props.resetErrors.mockImplementation(clearErrors)
  return {
    heading,
    banner,
    props,
    updateErrors: (next: typeof errors) => {
      props.errorTitle = next.errorTitle
      props.errorMessage = next.errorMessage
      rendered!.rerender(view())
    },
    updateUnfinishedWrites: (count: number) => {
      props.unfinishedWrites = count
      rendered!.rerender(view())
    },
  }
}

const query = <E extends Element = HTMLElement>(selector: string) =>
  Array.from(rendered!.container.querySelectorAll<E>(selector))

// AuthProvider asks before leaving the page, as signing in replaces Login.
describe("unfinished writes of the previous session", () => {
  const notices = () => query('div[data-hook="unfinished-writes"]')

  it("explains them until they finish", () => {
    const { updateUnfinishedWrites } = mount({}, 2)
    expect(notices()).toHaveLength(1)
    expect(notices()[0].getAttribute("role")).toBe("status")
    expect(notices()[0].textContent).toContain(
      "Your previous session is still sending 2 requests",
    )
    expect(notices()[0].textContent).toContain(
      "Leaving the page, including to sign in with SSO, cancels them",
    )

    updateUnfinishedWrites(1)
    expect(notices()[0].textContent).toContain(
      "Your previous session is still sending 1 request",
    )
    expect(notices()[0].textContent).toContain("Keep this tab open until it")

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
    fireEvent.click(query('button[label="Dismiss sign-in error"]')[0])
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
    fireEvent.change(query<HTMLInputElement>('input[name="username"]')[0], {
      target: { value: "admin" },
    })
    fireEvent.change(query<HTMLInputElement>('input[name="password"]')[0], {
      target: { value: "wrong" },
    })
    fireEvent.submit(query("form")[0])
    const pending = formSubmission.pending!
    expect(props.resetErrors).toHaveBeenCalledOnce()
    expect(heading.focus).not.toHaveBeenCalled()
    expect(query('[data-hook="sign-in-error"]')).toHaveLength(0)

    await act(async () => {
      finish(new Response("", { status: 401 }))
      await pending
    })
    expect(heading.focus).not.toHaveBeenCalled()
    expect(
      screen.getByText("Invalid username or password", { selector: "span" }),
    ).toBeTruthy()
    expect(props.onBasicAuthSuccess).not.toHaveBeenCalled()
  })
})
