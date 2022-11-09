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

import React, { useRef, useState } from "react"
import styled from "styled-components"
import {
  Input,
  PrimaryToggleButton,
  SecondaryButton,
} from "../../../components"
import {
  ContextMenuTrigger,
  ContextMenu,
  MenuItem,
} from "../../../components/ContextMenu"
import { Close, FileEdit as FileEditIcon } from "styled-icons/remix-line"
import { Plus as PlusIcon } from "styled-icons/boxicons-regular/"
import { useEditor } from "../../../providers"
import { useOnClickOutside } from "usehooks-ts"
import { useHorizontalScroll } from "../../../components/Hooks/useHorizontalScroll"

const Root = styled.div`
  display: flex;
  gap: 0.5rem;
  padding: 1rem 0 0;
`

const Tabs = styled.div`
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  gap: 1px;
`

const Tab = styled(PrimaryToggleButton)`
  padding: 1.5rem 1rem;
  border: 0;
  border-top-left-radius: 0.3rem;
  border-top-right-radius: 0.3rem;

  background-color: ${({ selected, theme }) =>
    selected ? theme.color.draculaSelection : theme.color.draculaBackground};

  &:hover:not([disabled]) {
    background-color: ${({ selected, theme }) =>
      selected ? theme.color.draculaSelection : theme.color.draculaBackground};
  }
  &:focus {
    box-shadow: none;
  }
`

const CloseIcon = styled(Close)`
  margin-left: 1rem;
`

const FilenameInput = styled(Input)`
  margin-left: 1rem;
`

const AddTabButton = styled(SecondaryButton)`
  background: none;
  border: none;
  opacity: 0.5;

  &:hover:not([disabled]),
  &:focus {
    background: none;
    box-shadow: none;
    opacity: 1;
  }
`

const Ellipsis = styled.span`
  display: inline-block;
  max-width: 30rem;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
`

const EditableLabel = ({
  label,
  onConfirm,
  onCancel,
  isEditing,
}: {
  label: string
  onConfirm(label: string): void
  onCancel(): void
  isEditing: boolean
}) => {
  const [value, setValue] = useState(label)
  const ref = useRef(null)

  useOnClickOutside(ref, () => {
    setValue(label)
    onCancel()
  })

  return (
    <span ref={ref}>
      {isEditing ? (
        <FilenameInput
          autoFocus
          size="sm"
          defaultValue={value}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            setValue(event.target.value)
          }
          onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter" && value.length !== 0) {
              onConfirm(value)
            }
          }}
        />
      ) : (
        <Ellipsis>{label}</Ellipsis>
      )}
    </span>
  )
}

export const EditorTabs = () => {
  const {
    activeBuffer,
    buffers,
    setActiveBuffer,
    addBuffer,
    deleteBuffer,
    updateBuffer,
  } = useEditor()
  const [editingId, setEditingId] = useState<number | null>(null)
  const selectedTabRef = useRef<HTMLButtonElement>(null)
  const horizontalScrollRef = useHorizontalScroll(selectedTabRef)

  return (
    <Root>
      <Tabs ref={horizontalScrollRef}>
        {buffers.map((buffer) => {
          const selected = activeBuffer.id === buffer.id

          return (
            <React.Fragment key={buffer.id}>
              <ContextMenuTrigger id={`${buffer.id}`}>
                <Tab
                  data-hook={`tab-${buffer.id}`}
                  data-active={selected}
                  selected={selected}
                  ref={selected ? selectedTabRef : null}
                  onClick={async () => {
                    // do not set the active buffer if the user is editing the filename
                    if (editingId !== buffer.id) {
                      await setActiveBuffer(buffer)
                    }

                    // do not reset the editing id if the user is editing the filename
                    if (!selected) {
                      setEditingId(null)
                    }
                  }}
                >
                  <FileEditIcon size="14px" />

                  <EditableLabel
                    isEditing={editingId === buffer.id}
                    label={buffer.label}
                    onConfirm={(label) => {
                      updateBuffer(buffer.id as number, { label })
                      setEditingId(null)
                    }}
                    onCancel={() => {
                      setEditingId(null)
                    }}
                  />

                  {buffers.length > 1 && (
                    <CloseIcon
                      size="14px"
                      data-hook={`close-tab-button-${buffer.id}`}
                      onClick={(event) => {
                        // prevent event bubbling from triggering `setActiveBuffer`
                        event.stopPropagation()
                        deleteBuffer(buffer.id as number)
                      }}
                    />
                  )}
                </Tab>
              </ContextMenuTrigger>

              <ContextMenu id={`${buffer.id}`}>
                <MenuItem onClick={() => setEditingId(buffer.id as number)}>
                  Rename
                </MenuItem>
                {buffers.length > 1 && (
                  <MenuItem onClick={() => deleteBuffer(buffer.id as number)}>
                    Close
                  </MenuItem>
                )}
              </ContextMenu>
            </React.Fragment>
          )
        })}
      </Tabs>

      <AddTabButton data-hook="add-tab-button" onClick={() => addBuffer()}>
        <PlusIcon size="16px" />
      </AddTabButton>
    </Root>
  )
}
