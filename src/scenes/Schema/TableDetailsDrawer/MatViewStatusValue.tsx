import React from "react"
import { useTheme } from "styled-components"
import {
  CheckCircleIcon,
  WarningIcon,
  XSquareIcon,
} from "@phosphor-icons/react"
import { Text } from "../../../components"
import type { MaterializedView } from "../../../utils/questdb/types"
import { MetricValue } from "./shared-styles"

type Props = {
  status: MaterializedView["view_status"]
}

export const MatViewStatusValue = ({ status }: Props) => {
  const theme = useTheme()

  switch (status) {
    case "valid":
      return (
        <>
          <CheckCircleIcon
            size={16}
            weight="fill"
            color={theme.color.statusSuccess}
          />
          <Text color="statusSuccess">Valid</Text>
        </>
      )
    case "refreshing":
      return <MetricValue>Refreshing</MetricValue>
    case "retrying":
      return (
        <>
          <WarningIcon
            size={16}
            weight="fill"
            color={theme.color.statusWarning}
          />
          <Text color="statusWarning">Retrying refresh</Text>
        </>
      )
    case "invalid":
      return (
        <>
          <XSquareIcon
            size={16}
            weight="fill"
            color={theme.color.statusDanger}
          />
          <Text color="statusDanger">Invalid</Text>
        </>
      )
    default:
      return <MetricValue>{String(status)}</MetricValue>
  }
}
