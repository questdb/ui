/*******************************************************************************
 *     ___                  _   ____  ____
 *    / _ \ _   _  ___  ___| |_|  _ \| __ )
 *   | | | | | | |/ _ \/ __| __| | | |  _ \
 *   | |_| | |_| |  __/\__ \ |_| |_| | |_) |
 *    \__\_\\__,_|\___||___/\__|____/|____/
 *
 *  Copyright (c) 2014-2019 Appsicle
 *  Copyright (c) 2019-2022 QuestDB
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 ******************************************************************************/

import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react"
import { throttle } from "throttle-debounce"

type Props = Readonly<{
  children: ReactNode
}>

export enum ScreenSize {
  SM,
  MD,
  LG,
  XL,
}

enum Breakpoint {
  SM = 767,
  MD = 1024,
  LG = 1280,
}

const getScreenSize = (): ScreenSize => {
  const width = window.innerWidth
  if (width <= Breakpoint.SM) return ScreenSize.SM
  if (width <= Breakpoint.MD) return ScreenSize.MD
  if (width <= Breakpoint.LG) return ScreenSize.LG
  return ScreenSize.XL
}

const ScreenSizeContext = createContext<ScreenSize>(getScreenSize())

export const ScreenSizeProvider = ({ children }: Props) => {
  const [screenSize, setScreenSize] = useState(getScreenSize)

  useEffect(() => {
    const handleResize = throttle(16, () => {
      setScreenSize(getScreenSize())
    })
    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [])

  return (
    <ScreenSizeContext.Provider value={screenSize}>
      {children}
    </ScreenSizeContext.Provider>
  )
}

export const useScreenSize = () => useContext(ScreenSizeContext)
