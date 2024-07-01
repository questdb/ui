import React, { useEffect } from "react"
import styled from "styled-components"
import { Button } from "@questdb/react-components"
import { User } from "@styled-icons/remix-line"
import { Form } from "../../../components/Form"
import Joi from "joi"
import { Text } from "../../../components"
import { setValue } from "../../../utils/localStorage"
import { StoreKey } from "../../../utils/localStorage/types"
import { useSettings } from "../../../providers"

const Header = styled.div`
  position: absolute;
  width: 100%;
  padding: 30px;
`
const ErrorContainer = styled.div<{ hasError?: string }>`
  @keyframes smooth-appear {
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @keyframes smooth-disappear {
    to {
      transform: translateY(10px);
      opacity: 0;
    }
  }

  background: gray;
  color: white;
  padding: 20px;
  margin-top: 10px;
  opacity: 0;
  transform: translateY(10px);
  border-radius: 10px;
  text-align: center;

  ${({ hasError }) =>
    hasError
      ? `
  animation: smooth-appear 0.5s ease forwards;
  `
      : `animation: smooth-disappear 0.5s ease forwards;`}
`
const Container = styled.div`
  margin-left: auto;
  margin-right: auto;
  margin-top: 4%;
  width: 500px;
  font-size: 16px;
  transition: height 10s ease;
`
const Title = styled.h1`
  color: white;
  text-align: center;
`

const SSOCard = styled.div`
  button {
    padding-top: 2rem;
    padding-bottom: 2rem;
    border-radius: 0 5px 5px 0;
    width: 100%;
    margin-bottom: 10px;
  }
  margin-bottom: 10px;
`

const Card = styled.div<{ hasError?: string }>`
  border-radius: ${({ theme }) => theme.borderRadius};

  @keyframes horizontal-shaking {
    0% {
      transform: translateX(0);
    }
    25% {
      transform: translateX(5px);
    }
    50% {
      transform: translateX(-5px);
    }
    75% {
      transform: translateX(5px);
    }
    100% {
      transform: translateX(0);
    }
  }

  button[type="submit"] {
    padding-top: 2rem;
    padding-bottom: 2rem;
    border-radius: 5px;
    width: 100%;
    margin-top: 40px;
  }

  ${({ hasError }) =>
    hasError &&
    `
    button[type="submit"] {
      animation: horizontal-shaking 0.3s ease-in-out;
    }
  `}

  button {
    padding-top: 2rem;
    padding-bottom: 2rem;
    border-radius: 0 5px 5px 0;
  }

  input[name="password"] {
    padding-top: 2rem;
    padding-bottom: 2rem;
    border-radius: 5px 0 0 5px;
  }

  input {
    padding-top: 2rem;
    padding-bottom: 2rem;
    border-radius: 5px;
    box-shadow: 0 0 0 30px #44475a inset !important;
    -webkit-text-fill-color: white;
  }

  label {
    margin-top: 20px;
  }
`

const StyledButton = styled(Button)`
  padding-top: 2rem;
  padding-bottom: 2rem;
`

const Line = styled.div`
  position: relative;
  text-align: center;

  &:before {
    content: "";
    position: absolute;
    top: 50%;
    left: 0;
    width: 100%;
    height: 1px;
    background: ${({ theme }) => theme.color.selection};
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
  padding: 0 1.5rem;
`

const Footer = styled.div`
  width: 700px;
  text-align: center;
  padding: 20px;
  margin-top: 40px;
  margin-right: auto;
  margin-left: auto;
`

const schema = Joi.object({
  username: Joi.string().required().messages({
    "string.empty": "User name is required",
  }),
  password: Joi.string().required().messages({
    "string.empty": "Password is required",
  }),
})

type FormValues = { username: string; password: string }

export const Login = ({
  onOAuthLogin,
  onBasicAuthSuccess,
}: {
  onOAuthLogin: () => void
  onBasicAuthSuccess: () => void
}) => {
  const { settings } = useSettings()
  const isEE = settings["release.type"] === "EE"
  const [errorMessage, setErrorMessage] = React.useState<string | undefined>()

  const httpBasicAuthStrategy = isEE ? {
    query: (username: string) => `alter user '${username}' create token type rest with ttl '1d' refresh transient`,
    store: async (response: Response, username: string, password: string) => {
      const token = (await response.json()).dataset[0][1]
      setValue(StoreKey.REST_TOKEN, token)
    }
  } : {
    query: () => "select * from long_sequence(1)",
    store: async (response: Response, username: string, password: string) => {
      setValue(StoreKey.BASIC_AUTH_HEADER, `Basic ${btoa(`${username}:${password}`)}`)
    }
  };

  const handleSubmit = async (values: FormValues) => {
    const {username, password} = values
    try {
      const response = await fetch(
        `exec?query=${httpBasicAuthStrategy.query(username)}`,
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
        setErrorMessage("Invalid user name or password")
      } else if (response.status === 403) {
        setErrorMessage("Unauthorized to use the Web Console")
      } else {
        setErrorMessage("Login failed, status code: " + response.status)
      }
    } catch (e) {
      setErrorMessage("Error occurred while trying to login")
    }
  }

  useEffect(() => {
    setTimeout(() => {
      setErrorMessage(undefined)
    }, 5000)
  }, [errorMessage])

  return settings["acl.basic.auth.realm.enabled"] ? null : (
    <div data-hook="auth-login">
      <Header>
        <a href={"https://questdb.io"}>
          <img
            alt="QuestDB logotype"
            height="20"
            src="assets/questdb-logotype.svg"
          />
        </a>
      </Header>
      <Container>
        {/*
          The title should include server name, to help users
          orient in case there are multiple instances around. This name
          will eventually be provided via "settings" endpoint too. If name
          is absent, we should display generic text as the title contributes to
          the page layout.
          */}
        <Title>Please Sign In</Title>
        {settings["acl.oidc.enabled"] && (
          <SSOCard>
            <StyledButton
              data-hook="button-sso-login"
              skin="secondary"
              prefixIcon={<User size="18px" />}
              onClick={() => onOAuthLogin()}
            >
              Continue with SSO
            </StyledButton>
            <Line>
              <LineText color="gray2">or</LineText>
            </Line>
          </SSOCard>
        )}
        <Card hasError={errorMessage}>
          <Form<FormValues>
            name="login"
            onSubmit={handleSubmit}
            defaultValues={{}}
            validationSchema={schema}
          >
            <Form.Item name="username" label="User name">
              <Form.Input name="username" placeholder={"johndoe"} />
            </Form.Item>
            <Form.Item name="password" label="Password">
              <Form.Input
                name="password"
                type="password"
                placeholder={"••••••••"}
              />
            </Form.Item>
            <Form.Submit variant="primary">Sign In</Form.Submit>
            <ErrorContainer hasError={errorMessage}>
              <TooltipArrow />
              {errorMessage}
            </ErrorContainer>
          </Form>
        </Card>
      </Container>
      {/*
          Large orgs usually provide disclaimers with login screens, such as
          warnings to prevent unauthorized access. QuestDB instance will eventually
          provide the disclaimer text via "settings" endpoint.
          */}
      <Footer>
        {/* Nunc a posuere felis. Phasellus dignissim vel nisi et fermentum. Sed
        tempor pharetra eros, et tincidunt odio congue sed. Vivamus nec
        tincidunt massa. Cras ac euismod nisi, a mattis lorem. Maecenas et lacus
        nunc. Phasellus vitae purus pellentesque, finibus neque ut, finibus ex.
        Quisque eu lacinia diam. */}
      </Footer>
    </div>
  )
}
