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

import { useEffect, useRef } from "react"
import type { RefObject } from "react"

export const useHorizontalScroll = (
  inViewRef: RefObject<HTMLButtonElement>,
) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current

    if (inViewRef.current !== null && element) {
      inViewRef.current.scrollIntoView({ behavior: "auto" })
    }
  }, [inViewRef.current])

  useEffect(() => {
    const element = ref.current

    if (element) {
      const onWheel = (event: WheelEvent) => {
        // skip if the user is scrolling vertically
        if (event.deltaY === 0) {
          return
        }

        event.preventDefault()
        element.scrollTo({
          left: element.scrollLeft + event.deltaY,
          behavior: "auto",
        })
      }

      element.addEventListener("wheel", onWheel)

      return () => {
        element.removeEventListener("wheel", onWheel)
      }
    }
  }, [])

  return ref
}
