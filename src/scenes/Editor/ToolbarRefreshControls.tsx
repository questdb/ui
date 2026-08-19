import styled from "styled-components"
import { Button, SelectMenu, TOOLBAR_CONTROL_HEIGHT } from "../../components"

export const EditorRefreshControlGroup = styled.div`
  display: flex;
  align-items: center;
  border-radius: 0.4rem;
  gap: 0.6rem;
`

export const EditorRefreshButton = styled(Button)`
  && {
    display: flex;
    height: ${TOOLBAR_CONTROL_HEIGHT};
    align-items: center;
    gap: 0.5rem;
    padding: 0 1.1rem;
    border-radius: 0.4rem;
    font-size: 1.4rem;
  }

  svg {
    width: 1.8rem;
    height: 1.8rem;
  }
`

export const EditorRefreshIntervalTrigger = styled(SelectMenu.Trigger)`
  && {
    height: ${TOOLBAR_CONTROL_HEIGHT};
    min-height: ${TOOLBAR_CONTROL_HEIGHT};
  }
`

export const EditorRefreshIntervalTriggerButton = styled(
  SelectMenu.TriggerButton,
)`
  && {
    height: ${TOOLBAR_CONTROL_HEIGHT};
    min-height: ${TOOLBAR_CONTROL_HEIGHT};
  }
`
