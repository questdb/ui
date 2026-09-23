import React, { createContext, useContext } from "react"

const ModalLayerContext = createContext(false)

type ModalLayerProps = {
  modal: boolean
  children: React.ReactNode
}

export const ModalLayer = ({ modal, children }: ModalLayerProps) => (
  <ModalLayerContext.Provider value={modal}>
    {children}
  </ModalLayerContext.Provider>
)

export const useIsInModalLayer = () => useContext(ModalLayerContext)
