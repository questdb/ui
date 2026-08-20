import React from "react"
import styled from "styled-components"
import { CloudOff } from "../../../components/icons"
import { Text } from "../../../components"
import { ErrorResult } from "../../../utils"

type Props = Readonly<{
  error?: ErrorResult
}>

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 2.4rem 2rem;
  text-align: center;
`

const IconSurface = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 4.4rem;
  height: 4.4rem;
  flex: 0 0 auto;
  border: 1px solid ${({ theme }) => theme.color.statusDangerBorder};
  border-radius: 0.8rem;
  background: ${({ theme }) => theme.color.statusDangerSurface};
`

const CloudOffIcon = styled(CloudOff)`
  width: 2.4rem;
  height: 2.4rem;
  color: ${({ theme }) => theme.color.statusDanger};
`

const ErrorTitle = styled(Text)`
  margin-top: 1.2rem;
  color: ${({ theme }) => theme.color.contentPrimary};
  font-size: 1.4rem;
  font-weight: 600;
  line-height: 2rem;
`

const ErrorDetail = styled(Text)`
  max-width: 26rem;
  margin-top: 0.5rem;
  color: ${({ theme }) => theme.color.contentSecondary};
  font-size: 1.2rem;
  line-height: 1.7rem;
  overflow-wrap: anywhere;
`

const LoadingError = ({ error }: Props) => {
  return (
    <Wrapper role="alert">
      <IconSurface>
        <CloudOffIcon weight="regular" />
      </IconSurface>
      <ErrorTitle>Cannot load tables</ErrorTitle>
      {error && <ErrorDetail>{error.error}</ErrorDetail>}
    </Wrapper>
  )
}

export default LoadingError
