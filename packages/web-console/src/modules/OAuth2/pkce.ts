import { setValue } from "../../utils/localStorage"
import { StoreKey } from "../../utils/localStorage/types"
import { sha256 } from "js-sha256"
import { Base64 } from "js-base64"
import { Settings } from "../../providers/SettingsProvider/types"

const STATE_LENGTH = 60
const CODE_VERIFIER_LENGTH = 60

export const generateState = (settings: Settings) => {
    if (settings["acl.oidc.state.required"]) {
        return doGenerateState()
    }
    return null
}

export const generateCodeVerifier = (settings: Settings) => {
  if (settings["acl.oidc.pkce.required"]) {
    return doGenerateCodeVerifier()
  }
  return null
}

export const generateCodeChallenge = (code_verifier: string | null) => {
  if (code_verifier) {
    return doGenerateCodeChallenge(code_verifier)
  }
  return null
}

const doGenerateState = () => {
    const state_array = new Uint8Array(STATE_LENGTH)
    crypto.getRandomValues(state_array)
    const state = Base64.fromUint8Array(state_array, true)
    setValue(StoreKey.OAUTH_STATE, state)
    return state
}

const doGenerateCodeVerifier = () => {
  const code_verifier_array = new Uint8Array(CODE_VERIFIER_LENGTH)
  crypto.getRandomValues(code_verifier_array)
  const code_verifier = Base64.fromUint8Array(code_verifier_array, true)
  setValue(StoreKey.PKCE_CODE_VERIFIER, code_verifier)
  return code_verifier
}

const doGenerateCodeChallenge = (code_verifier: string) => {
  const code_verifier_array: number[] = []
  for (let i = 0; i < code_verifier.length; i++) {
    const ascii_code = code_verifier.codePointAt(i)
    if (ascii_code === undefined) {
      throw Error(i + " is out of bounds of string: " + code_verifier)
    }
    code_verifier_array.push(ascii_code)
  }
  const hash = new Uint8Array(
    sha256.create().update(code_verifier_array).array(),
  )
  return Base64.fromUint8Array(hash, true)
}
