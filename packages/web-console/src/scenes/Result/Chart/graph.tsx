import React, { useEffect, useRef, useState } from "react"
import UplotReact from "uplot-react"

import "uplot/dist/uPlot.min.css"

export const Graph = () => {
  const [layoutReady, setLayoutReady] = useState(false)
  const plotRef = useRef(null)

  useEffect(() => {
    setLayoutReady(true)
  }, [])

  return <div>graph</div>
}
