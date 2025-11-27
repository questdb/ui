import React, { useState } from "react"
import styled, { css, useTheme, createGlobalStyle } from "styled-components"
import { User, Building, Close } from "@styled-icons/remix-line"
import { ErrorWarning } from "@styled-icons/remix-fill"
import { XSquare } from "@styled-icons/boxicons-solid"
import Joi from "joi"
import { Text, Form, Button } from "../../../components"
import { setValue } from "../../../utils/localStorage"
import { StoreKey } from "../../../utils/localStorage/types"
import { useSettings } from "../../../providers"
import { getSSOUserNameWithClientID } from "../utils"
import { RawDqlResult } from "utils/questdb/types"
import { LoadingSpinner } from "../../../components/LoadingSpinner"
import { Box } from "../../../components/Box"

const LoginFontStyles = createGlobalStyle`
  @font-face {
    font-family: 'PPFormula';
    src: url('/fonts/PPFormula-SemiExtendedBold.woff2') format('woff2'),
         url('/fonts/PPFormula-SemiExtendedBold.woff') format('woff'),
         url('/fonts/PPFormula-SemiExtendedBold.ttf') format('truetype');
    font-weight: 700;
    font-style: normal;
    font-display: swap;
  }
`

const LoginContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: ${({ theme }) => theme.color.loginBackground};
  overflow-y: auto;
`

const LoginBackground = styled.img`
  position: absolute;
  top: 1%;
  left: 0;
  width: 100%;
  max-height: 100vh;
  object-fit: cover;
  z-index: 0;
  pointer-events: none;
  user-select: none;
`

const LogoContainer = styled.div`
  padding: 2.4rem 4.8rem;
  display: flex;
  justify-content: center;
  align-items: center;
  border-bottom: 1px solid ${({ theme }) => theme.color.selection};
`

const QuestDBLogo = styled.img`
  display: block;
  width: 48px;
  height: 48px;
`

const PlugsContainer = styled.div`
  width: 4.8rem;
  height: 4.8rem;
  padding: 1.2rem;
  border-radius: 0.4rem;
  background: rgba(220, 40, 40, 0.64);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  img {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
  }
`

const CloseContainer = styled.div`
  border: 1px solid #6b7280;
  border-radius: 4px;
  padding: 1.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  &:hover {
    background: #6b7280;
  }
`

const Container = styled.div<{ $hasRedirectError: boolean }>`
  position: relative;
  z-index: 1;
  margin: ${({ $hasRedirectError }) => ($hasRedirectError ? "0 auto" : "auto")};
  background: ${({ theme }) => theme.color.backgroundDarker};
  width: 560px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.color.selection};
  font-size: 16px;
`
const Title = styled.h2`
  width: 100%;
  color: white;
  font-family: "PPFormula", "Open Sans", sans-serif;
  font-weight: 700;
  font-size: 33.75px;
  text-align: center;
  margin: 0;
  margin-top: 3.2rem;
`

const FormBody = styled.div`
  padding: 3.2rem 4.8rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
`

const Separator = styled.div`
  height: 1px;
  background: ${({ theme }) => theme.color.selection};
  width: 100%;
`

const FormFooter = styled.div`
  padding: 2.4rem 4.8rem;
  display: flex;
  justify-content: center;
`

const SSOCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  button {
    padding-top: 2rem;
    padding-bottom: 2rem;
    width: 100%;
    margin-bottom: 10px;
  }
  margin: 3.2rem 4.8rem 0 4.8rem;
  gap: 2rem;
`

const Card = styled.div`
  border-radius: ${({ theme }) => theme.borderRadius};
  transition: height 0.5s ease;

  button[type="submit"] {
    background: ${({ theme }) => theme.color.pinkDarker};
    border-color: ${({ theme }) => theme.color.pinkDarker};
    padding-top: 2rem;
    padding-bottom: 2rem;
    border-radius: 5px;
    width: 100%;

    &:hover {
      background: ${({ theme }) => theme.color.pinkPrimary};
      border-color: ${({ theme }) => theme.color.pinkPrimary};
    }
  }

  button {
    padding-top: 2rem;
    padding-bottom: 2rem;
    border-radius: 5px;
  }

  input {
    display: flex;
    padding: 12px;
    height: 4.5rem;
    align-items: center;
    align-self: stretch;
    border-radius: 8px;
    border: 1px solid #6b7280;
    background: ${({ theme }) => theme.color.background};
    font-size: 1.4rem;
    line-height: 1.5;

    &:focus,
    &:active,
    &:focus-visible {
      background: ${({ theme }) => theme.color.background} !important;
      border-color: ${({ theme }) => theme.color.pinkPrimary} !important;
    }
  }

  label {
    font-size: 1.6rem;
    font-family: monospace;
    text-transform: uppercase;
  }
`

const ErrorContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1.2rem 2.4rem 1.2rem 1.8rem;
  border-radius: 0.8rem;
  border: 1.5px solid rgba(220, 40, 40, 0.72);
  border-left: 6px solid rgba(220, 40, 40, 0.72);
`

const RedirectErrorContainer = styled(ErrorContainer)`
  margin-top: auto;
  margin-bottom: 3.2rem;
  position: relative;
  z-index: 1;
  border-color: rgba(220, 40, 40);
  width: 560px;
  background: ${({ theme }) => theme.color.backgroundDarker};
`

const StyledButton = styled(Button)<{ skin: string }>`
  margin: 0 !important;
  ${({ skin }) =>
    skin === "primary" &&
    css`
      background: ${({ theme }) => theme.color.pinkDarker} !important;
      border-color: ${({ theme }) => theme.color.pinkDarker} !important;

      &:hover {
        background: ${({ theme }) => theme.color.pinkPrimary} !important;
        border-color: ${({ theme }) => theme.color.pinkPrimary} !important;
      }
    `}

  ${({ skin }) =>
    skin === "secondary" &&
    css`
      border-radius: 4px !important;
      border: 1px solid #6b7280 !important;
      background: transparent !important;

      &:hover {
        background: #6b7280 !important;
        border-color: #6b7280 !important;
      }
    `}
`

const Line = styled.div`
  position: relative;
  text-align: center;
  margin-top: 1.2rem;
  width: 100%;

  &:before {
    content: "";
    position: absolute;
    top: 50%;
    left: 0;
    width: 100%;
    height: 1px;
    background: ${({ theme }) => theme.color.selection};
    background: linear-gradient(
      90deg,
      rgba(55, 65, 81, 0) 0%,
      #374151 50%,
      rgba(55, 65, 81, 0) 100%
    );
  }
`

export const TooltipArrow = styled.div`
  &::before {
    position: absolute;
    width: 7px;
    height: 7px;
    top: -4px;
    left: 50%;
    content: "";
    transform: rotate(45deg);
    background: gray;
    border-left: 1px solid gray;
    border-radius: 1px;
    border-right: none;
    border-bottom: none;
  }
`

const LineText = styled(Text)`
  position: relative;
  z-index: 1;
  background: ${({ theme }) => theme.color.backgroundDarker};
  padding: 0 2.4rem;
  font-family: monospace;
  text-transform: uppercase;
`

const Footer = styled.div`
  text-align: center;
  margin-right: auto;
  margin-left: auto;
  align-items: center;
  display: flex;
  gap: 2rem;
  margin: 2rem 0;
`

const VersionBadge = styled.div`
  display: flex;
  padding: 0.6rem 1.1rem;
  justify-content: center;
  align-items: center;
  border-radius: 0.4rem;
  border: 0.075rem solid #521427;
  background: #290a13;
`

const schema = Joi.object({
  username: Joi.string().required().messages({
    "string.empty": "Username is required",
  }),
  password: Joi.string().required().messages({
    "string.empty": "Password is required",
  }),
})

type FormValues = { username: string; password: string }

export const Login = ({
  onOAuthLogin,
  onBasicAuthSuccess,
  errorTitle: redirectErrorTitle,
  errorMessage: redirectErrorMessage,
  isDisconnection,
  resetErrors,
}: {
  onOAuthLogin: (loginWithDifferentAccount?: boolean) => void
  onBasicAuthSuccess: () => void
  errorTitle?: string
  errorMessage?: string
  isDisconnection?: boolean
  resetErrors: () => void
}) => {
  const { settings } = useSettings()
  const theme = useTheme()
  const isEE = settings["release.type"] === "EE"
  const [errorMessage, setErrorMessage] = React.useState<string | undefined>()
  const ssoUsername =
    settings["acl.oidc.enabled"] && settings["acl.oidc.client.id"]
      ? getSSOUserNameWithClientID(settings["acl.oidc.client.id"])
      : ""
  const version = settings["release.version"]
  const [loading, setLoading] = useState(false)

  const httpBasicAuthStrategy = isEE
    ? {
        query: (username: string) =>
          `alter user '${username}' create token type rest with ttl '1d' refresh transient`,
        store: async (
          response: Response,
          _username: string,
          _password: string,
        ) => {
          const json = (await response.json()) as RawDqlResult
          const token = json.dataset[0][1] as string
          setValue(StoreKey.REST_TOKEN, token)
        },
      }
    : {
        query: () => "select * from long_sequence(1)",
        store: (_response: Response, username: string, password: string) => {
          setValue(
            StoreKey.BASIC_AUTH_HEADER,
            `Basic ${btoa(`${username}:${password}`)}`,
          )
        },
      }

  const handleSubmit = async (values: FormValues) => {
    resetErrors()
    setLoading(true)
    const { username, password } = values
    try {
      const response = await fetch(
        `exec?query=${httpBasicAuthStrategy.query(username)}&session=true`,
        {
          headers: {
            Authorization: `Basic ${btoa(`${username}:${password}`)}`,
          },
        },
      )
      if (response.status === 200) {
        await httpBasicAuthStrategy.store(response, username, password)
        return onBasicAuthSuccess()
      } else if (response.status === 401) {
        setErrorMessage("Invalid username or password")
      } else if (response.status === 403) {
        setErrorMessage(
          "You are not authorized to use the Web Console. Contact your account administrator.",
        )
      } else {
        setErrorMessage("Error occurred while trying to login")
      }
    } catch (e) {
      setErrorMessage("Error occurred while trying to login")
    } finally {
      setLoading(false)
    }
  }

  return settings["acl.basic.auth.realm.enabled"] ? null : (
    <>
      <LoginFontStyles />
      <LoginContainer data-hook="auth-login">
        <LoginBackground
          src="assets/login-background.svg"
          aria-hidden="true"
          alt=""
        />
        {(redirectErrorTitle || redirectErrorMessage) && (
          <RedirectErrorContainer>
            <PlugsContainer>
              {isDisconnection ? (
                <img
                  src="assets/plugs.svg"
                  width="24"
                  height="24"
                  alt="Plug"
                  style={{ flexShrink: "0" }}
                />
              ) : (
                <ErrorWarning
                  size="24px"
                  color={theme.color.foreground}
                  style={{ flexShrink: "0" }}
                />
              )}
            </PlugsContainer>
            <Box flexDirection="column" gap="0" align="flex-start">
              <Text size="lg" weight={600} color="red">
                {redirectErrorTitle ?? "Something went wrong."}
              </Text>
              <Text size="lg" color="red">
                {redirectErrorMessage ?? "Error logging in. Please try again."}
              </Text>
            </Box>
            <CloseContainer role="presentation" onClick={resetErrors}>
              <Close
                size="24px"
                color={theme.color.foreground}
                style={{ flexShrink: "0" }}
              />
            </CloseContainer>
          </RedirectErrorContainer>
        )}
        <Container
          $hasRedirectError={!!redirectErrorTitle || !!redirectErrorMessage}
        >
          <LogoContainer>
            <QuestDBLogo
              src="assets/questdb.svg"
              alt="QuestDB logotype"
              width="48"
              height="48"
            />
          </LogoContainer>
          <Title>Sign in to QuestDB</Title>
          <Card>
            {settings["acl.oidc.enabled"] && (
              <SSOCard>
                {!!ssoUsername && (
                  <StyledButton
                    data-hook="button-sso-continue"
                    skin="primary"
                    prefixIcon={<User size="18px" />}
                    onClick={() => onOAuthLogin(false)}
                  >
                    Continue as {ssoUsername}
                  </StyledButton>
                )}
                <StyledButton
                  data-hook="button-sso-login"
                  skin={ssoUsername ? "secondary" : "primary"}
                  prefixIcon={
                    ssoUsername ? undefined : <Building size="18px" />
                  }
                  onClick={() => onOAuthLogin(true)}
                >
                  {ssoUsername
                    ? "Choose a different account"
                    : "Single Sign-On (SSO)"}
                </StyledButton>
                <Line>
                  <LineText color="gray2">or</LineText>
                </Line>
              </SSOCard>
            )}
            <Form<FormValues>
              name="login"
              onSubmit={handleSubmit}
              defaultValues={{}}
              validationSchema={schema}
            >
              <FormBody>
                <Form.Item name="username" label="Username">
                  <Form.Input name="username" placeholder="Enter username" />
                </Form.Item>
                <Form.Item name="password" label="Password">
                  <Form.Input
                    name="password"
                    type="password"
                    placeholder="Enter password"
                  />
                </Form.Item>
                {errorMessage && (
                  <ErrorContainer>
                    <XSquare
                      size="15px"
                      color={theme.color.red}
                      style={{ flexShrink: "0" }}
                    />
                    <Box flexDirection="column" gap="0" align="flex-start">
                      <Text size="lg" weight={600} color="red">
                        Sign in failed.
                      </Text>
                      <Text size="lg" color="red">
                        {errorMessage}
                      </Text>
                    </Box>
                  </ErrorContainer>
                )}
              </FormBody>
              <Separator />
              <FormFooter>
                <Form.Submit variant="primary">
                  {loading ? (
                    <LoadingSpinner color="foreground" size="18px" />
                  ) : (
                    "Sign In"
                  )}
                </Form.Submit>
              </FormFooter>
            </Form>
          </Card>
        </Container>
        <Footer>
          <Text size="sm" color="gray2">
            Copyright &copy; {new Date().getFullYear()} QuestDB. All rights
            reserved.
          </Text>
          <VersionBadge>
            <Text size="sm" color="gray2">
              QuestDB {isEE ? "Enterprise" : ""} {version}
            </Text>
          </VersionBadge>
        </Footer>
      </LoginContainer>
    </>
  )
}
