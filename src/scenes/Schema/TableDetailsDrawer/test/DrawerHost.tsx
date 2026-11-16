import React, { useState } from "react"

export const DrawerHost = ({ children }: { children: React.ReactNode }) => {
  const [panel, setPanel] = useState<HTMLDivElement | null>(null)
  return (
    <div
      id="side-panel-right"
      ref={setPanel}
      style={{ width: 650, height: 1000, position: "relative" }}
    >
      {panel && children}
    </div>
  )
}
