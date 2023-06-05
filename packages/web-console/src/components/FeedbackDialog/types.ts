export type Category =
  | "generic"
  | "instance-type-request"
  | "region-request"
  | "settings-invoices"
  | "web-console"

export type FeedbackPayload = {
  email: string
  pathname: string
  message: string
  category: Category
}
