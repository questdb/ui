import React, { useState } from "react"
import styled, { useTheme } from "styled-components"
import { User, Building } from "../../../components/icons"
import { ErrorWarning } from "../../../components/icons"
import { XSquare } from "../../../components/icons"
import { XIcon } from "@phosphor-icons/react"
import Joi from "joi"
import { Badge, Text, Form, Button, IconButton } from "../../../components"
import { setValue } from "../../../utils/localStorage"
import { StoreKey } from "../../../utils/localStorage/types"
import { useSettings } from "../../../providers"
import { getSSOUserNameWithClientID } from "../utils"
import { RawDqlResult } from "utils/questdb/types"
import { LoadingSpinner } from "../../../components/LoadingSpinner"
import { Box } from "../../../components/Box"
import { LoginBackground } from "./loginBackground"

const LoginContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: ${({ theme }) => theme.color.authBackdrop};
  overflow-y: auto;
`

const LogoContainer = styled.div`
  padding: 2.4rem 4.8rem;
  display: flex;
  justify-content: center;
  align-items: center;
  border-bottom: 1px solid ${({ theme }) => theme.color.authBorder};
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
  background: ${({ theme }) => theme.color.statusDangerMuted};
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

const ErrorCloseButton = styled(IconButton)`
  flex-shrink: 0;
`

const Container = styled.div<{ $hasRedirectError: boolean }>`
  position: relative;
  z-index: 1;
  margin: ${({ $hasRedirectError }) => ($hasRedirectError ? "0 auto" : "auto")};
  background: ${({ theme }) => theme.color.surfaceCanvas};
  width: 560px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.color.authBorder};
  box-shadow:
    0 1px 2px ${({ theme }) => theme.color.shadowMedium},
    0 1.8rem 4.8rem ${({ theme }) => theme.color.shadowSoft},
    inset 0 1px 0 ${({ theme }) => theme.color.borderSubtle};
  font-size: 16px;
`
const Title = styled.h2`
  width: 100%;
  color: ${({ theme }) => theme.color.contentPrimary};
  font-weight: 600;
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
  background: ${({ theme }) => theme.color.authBorder};
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
    padding-top: 2rem;
    padding-bottom: 2rem;
    border-radius: 5px;
    width: 100%;
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
    font-size: 1.4rem;
    line-height: 1.5;
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
  border: 1.5px solid ${({ theme }) => theme.color.statusDangerMuted};
  border-left: 6px solid ${({ theme }) => theme.color.statusDangerMuted};
`

const RedirectErrorContainer = styled(ErrorContainer)`
  margin-top: auto;
  margin-bottom: 3.2rem;
  position: relative;
  z-index: 1;
  border-color: ${({ theme }) => theme.color.statusDanger};
  width: 560px;
  background: ${({ theme }) => theme.color.surfaceCanvas};
  box-shadow:
    0 1px 2px ${({ theme }) => theme.color.shadowMedium},
    0 1.2rem 3.2rem ${({ theme }) => theme.color.shadowSoft};
`

const StyledButton = styled(Button)`
  margin: 0 !important;
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
    background: ${({ theme }) => theme.color.interactionNeutral};
    background: linear-gradient(
      90deg,
      ${({ theme }) => theme.color.transparent} 0%,
      ${({ theme }) => theme.color.authBorder} 50%,
      ${({ theme }) => theme.color.transparent} 100%
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
    background: ${({ theme }) => theme.color.contentDisabled};
    border-left: 1px solid ${({ theme }) => theme.color.contentDisabled};
    border-radius: 1px;
    border-right: none;
    border-bottom: none;
  }
`

const LineText = styled(Text)`
  position: relative;
  z-index: 1;
  background: ${({ theme }) => theme.color.surfaceCanvas};
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

const VersionBadge = styled(Badge).attrs({
  variant: "neutral",
  size: "md",
})`
  && {
    background: ${({ theme }) => theme.color.actionPrimary};
    color: ${({ theme }) => theme.color.authVersionContent};
  }

  label {
    color: inherit;
  }
`

const VersionBadgeText = styled.span`
  color: ${({ theme }) => theme.color.authVersionContent};
  font-size: ${({ theme }) => theme.fontSize.sm};
  font-weight: 500;
  line-height: 1;
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
      <LoginContainer data-hook="auth-login">
        <LoginBackground />
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
                  color={theme.color.contentPrimary}
                  style={{ flexShrink: "0" }}
                />
              )}
            </PlugsContainer>
            <Box flexDirection="column" gap="0" align="flex-start">
              <Text size="lg" weight={600} color="statusDanger">
                {redirectErrorTitle ?? "Something went wrong."}
              </Text>
              <Text size="lg" color="statusDanger">
                {redirectErrorMessage ?? "Error logging in. Please try again."}
              </Text>
            </Box>
            <ErrorCloseButton
              label="Dismiss sign-in error"
              size="lg"
              variant="secondary"
              onClick={resetErrors}
            >
              <XIcon size={24} />
            </ErrorCloseButton>
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
                    variant="primary"
                    prefixIcon={<User size="18px" />}
                    onClick={() => onOAuthLogin(false)}
                  >
                    Continue as {ssoUsername}
                  </StyledButton>
                )}
                <StyledButton
                  data-hook="button-sso-login"
                  variant={ssoUsername ? "secondary" : "primary"}
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
                  <LineText color="contentSecondary">or</LineText>
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
                  <Form.Input
                    name="username"
                    placeholder="Enter username"
                    tone="accent"
                  />
                </Form.Item>
                <Form.Item name="password" label="Password">
                  <Form.Input
                    name="password"
                    type="password"
                    placeholder="Enter password"
                    tone="accent"
                  />
                </Form.Item>
                {errorMessage && (
                  <ErrorContainer>
                    <XSquare
                      size="15px"
                      color={theme.color.statusDanger}
                      style={{ flexShrink: "0" }}
                    />
                    <Box flexDirection="column" gap="0" align="flex-start">
                      <Text size="lg" weight={600} color="statusDanger">
                        Sign in failed.
                      </Text>
                      <Text size="lg" color="statusDanger">
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
                    <LoadingSpinner color="contentPrimary" size="18px" />
                  ) : (
                    "Sign In"
                  )}
                </Form.Submit>
              </FormFooter>
            </Form>
          </Card>
        </Container>
        <Footer>
          <Text size="sm" color="contentSecondary">
            Copyright &copy; {new Date().getFullYear()} QuestDB. All rights
            reserved.
          </Text>
          <VersionBadge>
            <VersionBadgeText>
              QuestDB {isEE ? "Enterprise" : ""} {version}
            </VersionBadgeText>
          </VersionBadge>
        </Footer>
      </LoginContainer>
    </>
  )
}
