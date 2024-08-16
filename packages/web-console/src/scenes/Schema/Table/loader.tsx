import styled from "styled-components"
import { Loader4 } from "@styled-icons/remix-line"
import { spinAnimation } from "../../../components"
import { color } from "../../../utils"

export const Loader = styled(Loader4)`
  margin-left: 1rem;
  color: ${color("orange")};
  ${spinAnimation};
`
