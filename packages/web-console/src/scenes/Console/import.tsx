import React from "react"
import { PaneContent, PaneWrapper } from "../../components"
import { ImportFile } from "../../modules/Import/import-file"

export const Import = () => (
  <PaneWrapper>
    <PaneContent>
      <ImportFile />
    </PaneContent>
  </PaneWrapper>
)
