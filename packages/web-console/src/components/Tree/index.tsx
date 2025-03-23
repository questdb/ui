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

import React, { useState, useCallback, useEffect, useRef } from "react"
import Row from "../../scenes/Schema/Row"
import styled from "styled-components"
import { WrapWithIf } from "../"
import { color } from "../../utils/"

const LeafWrapper = styled.div`
  position: relative;
  display: flex;
  margin-left: 2rem;
  flex-direction: column;

  &:hover {
    &:before {
      opacity: 1;
    }
  }

  &:before {
    position: absolute;
    height: 100%;
    width: 2px;
    left: -0.4rem;
    top: 0;
    opacity: 0;
    transition: .2s;
    content: "";
    background: ${color("gray1")};
  }
`

export type TreeNodeKind = "column" | "table" | "matview" | "folder" | "detail"

export type TreeNodeRenderParams = {
  toggleOpen: ToggleOpen
  isOpen: boolean
  isLoading: boolean
}

export type TreeNodeRender = ({
  toggleOpen,
  isOpen,
  isLoading,
}: TreeNodeRenderParams) => React.ReactElement

type ToggleOpen = () => void

type OnOpen = (onOpenApi: {
  setChildren: (children: TreeNode[]) => void
}) => Promise<void> | void

export type TreeNode = {
  name: string
  table_id?: number
  kind?: TreeNodeKind
  render?: TreeNodeRender
  initiallyOpen?: boolean
  wrapper?: React.FunctionComponent
  onOpen?: OnOpen
  children?: TreeNode[]
}

const Ul = styled.ul`
  padding: 0;
  margin: 0;
`

const Li = styled.li`
  list-style: none;
  padding-left: 1rem;
`

const Leaf = (leaf: TreeNode) => {
  const {
    table_id,
    name,
    kind,
    initiallyOpen,
    onOpen,
    render,
    children: initialChildren = [],
    wrapper = LeafWrapper,
  } = leaf
  const [open, setOpen] = useState(initiallyOpen ?? false)
  const [loading, setLoading] = useState(false)
  const [children, setChildren] = useState<TreeNode[]>(initialChildren)
  const isMounted = useRef(true)

  const loadNewContent = useCallback(async () => {
    const onOpenApi = {
      setChildren: (newChildren: TreeNode[]) => {
        // ensure state is changed only for mounted component
        if (isMounted.current) {
          setChildren(newChildren)
        }
      },
    }

    if (typeof onOpen === "function") {
      setLoading(true)
      await onOpen(onOpenApi)

      // ensure state is changed only for mounted component
      if (isMounted.current) {
        setLoading(false)
      }
    }
  }, [onOpen])

  const toggleOpen: ToggleOpen = useCallback(async () => {
    if (!loading && !open) {
      await loadNewContent()
    }
    setOpen(!open)
  }, [open, loading, loadNewContent])

  useEffect(() => {
    const loadInitialContent: () => void = async () => {
      if (isMounted.current) {
        await loadNewContent()
      }
    }

    if (
      open &&
      typeof onOpen === "function" &&
      children.length === 0 &&
      !loading
    ) {
      loadInitialContent()
    }

    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    setOpen(initiallyOpen ?? false)
  }, [initiallyOpen])

  return (
    <Li>
      {typeof render === "function" ? (
        render({ toggleOpen, isOpen: open, isLoading: loading })
      ) : (
        <Row
          kind={kind ?? "folder"}
          name={name}
          table_id={table_id}
          onClick={() => setOpen(!open)}
        />
      )}

      {open && (
        <WrapWithIf
          condition={Boolean(wrapper)}
          wrapper={(children) =>
            React.createElement(wrapper ?? React.Fragment, {}, children)
          }
        >
          <Tree root={children} />
        </WrapWithIf>
      )}
    </Li>
  )
}

export const Tree: React.FunctionComponent<{
  root: TreeNode[]
}> = ({ root }) => (
  <Ul>
    {root.map((leaf: TreeNode) => (
      <Leaf key={leaf.name} {...leaf} />
    ))}
  </Ul>
)
