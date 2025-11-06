export type AuthPayload = {
  access_token: string
  id_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  expires_at: string
  groups_encoded_in_token?: boolean
}
