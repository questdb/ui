export type AuthPayload = {
  access_token: string
  id_token?: string
  refresh_token?: string
  token_type: string
  expires_in: number
  expires_at: string
  groups_encoded_in_token?: boolean
}

export type TokenResponse = Partial<AuthPayload> & {
  error?: string
  error_description?: string
}

export type SignInError = { errorTitle: string; errorMessage: string }

export type LogoutOptions = Partial<SignInError> & {
  promptForLogin?: boolean
  isDisconnection?: boolean
  reload?: boolean
  clearSSOSession?: boolean
}

export class AuthSessionEndedError extends Error {
  constructor() {
    super("Your session has ended. Please sign in again.")
    this.name = "AuthSessionEndedError"
  }
}
