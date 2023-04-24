import React from "react"
import styled from "styled-components"
import { ProcessedFile } from "./types"
import { Button, Select, Switch, Input } from "@questdb/react-components"
import { Box } from "../../../components/Box"
import { Text } from "../../../components/Text"
import { Settings4 } from "styled-icons/remix-line"
import { Undo } from "styled-icons/boxicons-regular"
import { UploadModeSettings } from "../../../utils"
import { Drawer } from "../../../components/Drawer"

const SettingsIcon = styled(Settings4)`
  color: ${({ theme }) => theme.color.foreground};
`

const Row = styled(Box).attrs({ justifyContent: "space-between", gap: "2rem" })`
  width: 100%;
`

const InputWrapper = styled.div`
  flex-shrink: 0;
  width: 30%;
`

type Props = {
  open: boolean
  onOpenChange: (value: boolean) => void
  file: ProcessedFile
  onSubmit: (settings: UploadModeSettings) => void
}

type BooleanOption = {
  type: "switch"
  defaultValue: boolean
}

type InputOption = {
  type: "input"
  defaultValue: string
  placeholder?: string
}

type SelectOption = {
  type: "select"
  defaultValue: string
  options: { label: string; value: string }[]
}

type Option = {
  name: string
  label: string
  description?: React.ReactNode
} & (BooleanOption | InputOption | SelectOption)

export const UploadSettingsDialog = ({
  file,
  open,
  onOpenChange,
  onSubmit,
}: Props) => {
  const { delimiter, overwrite, forceHeader, skipLev, atomicity, durable } =
    file.settings

  const initialState = {
    delimiter,
    overwrite,
    forceHeader,
    skipLev,
    atomicity,
    durable,
  }

  const [settings, setSettings] =
    React.useState<UploadModeSettings>(initialState)

  const options: Option[] = [
    {
      type: "input",
      name: "delimiter",
      label: "Delimiter",
      placeholder: "Automatic",
      description: (
        <>
          Delimiter character. When not set, import will try to detect the
          delimiter automatically. Since automatic delimiter detection requires
          at least two lines (rows) to be present in the file, this parameter
          may be used to allow single line file import.
        </>
      ),
      defaultValue: settings.delimiter,
    },
    {
      type: "select",
      name: "overwrite",
      label: "Write mode",
      description: (
        <>
          <strong>Append</strong>: data will be appended to the set.
          <br />
          <strong>Overwrite</strong>: any existing data or structure will be
          overwritten. Required for partitioning and timestamp related changes.
        </>
      ),
      defaultValue: overwrite ? "true" : "false",
      options: [
        {
          label: "Append",
          value: "false",
        },
        {
          label: "Overwrite",
          value: "true",
        },
      ],
    },
    {
      type: "select",
      name: "atomicity",
      label: "Atomicity",
      description: (
        <>
          Behaviour when an error is detected in the data.
          <br />
          <strong>Abort</strong>: the entire file will be skipped.
          <br />
          <strong>Skip row</strong>: the row is skipped.
          <br />
          <strong>Skip column</strong>: the column is skipped.
        </>
      ),
      defaultValue: settings.atomicity,
      options: [
        {
          label: "Skip column",
          value: "skipCol",
        },
        {
          label: "Skip row",
          value: "skipRow",
        },
        {
          label: "Abort import",
          value: "abort",
        },
      ],
    },
    {
      type: "switch",
      name: "forceHeader",
      label: "Force header",
      description: (
        <>
          When <strong>false</strong>, QuestDB will try to infer if the first
          line of the file is the header line.
          <br />
          When set to <strong>true</strong>, QuestDB will expect that line to be
          the header line.
        </>
      ),
      defaultValue: settings.forceHeader,
    },
    {
      type: "switch",
      name: "skipLev",
      label: "Skip line extra values",
      description: (
        <>
          When set to <strong>true</strong>, the parser will ignore those extra
          values rather than ignoring entire line. An extra value is something
          in addition to what is defined by the header.
        </>
      ),
      defaultValue: settings.skipLev,
    },
    {
      type: "switch",
      name: "durable",
      label: "Durable",
      description: (
        <>
          When set to <strong>true</strong>, import will be resilient against OS
          errors or power losses by forcing the data to be fully persisted
          before sending a response back to the user.
        </>
      ),
      defaultValue: settings.durable,
    },
  ]

  return (
    <Drawer
      open={open}
      title={
        <Box>
          <SettingsIcon size="20px" />
          <Text color="foreground">Settings</Text>
        </Box>
      }
      trigger={
        <Button
          skin="secondary"
          prefixIcon={<Settings4 size="18px" />}
          onClick={() => onOpenChange(true)}
        >
          Settings
        </Button>
      }
    >
      <Box gap="2rem" flexDirection="column">
        <Box gap="0" flexDirection="column" align="stretch">
          {options.map((option) => (
            <Drawer.GroupItem key={option.name}>
              <Row key={option.name}>
                <Box
                  gap="1rem"
                  flexDirection="column"
                  align="flex-start"
                  justifyContent="flex-start"
                >
                  <Text color="foreground" weight={600}>
                    {option.label}
                  </Text>
                  {option.description && (
                    <Text color="gray2" size="sm">
                      {option.description}
                    </Text>
                  )}
                </Box>
                <InputWrapper>
                  {option.type === "input" && (
                    <Input
                      name={option.name}
                      defaultValue={option.defaultValue}
                      placeholder={option.placeholder}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setSettings({
                          ...settings,
                          [option.name]: e.target.value,
                        })
                      }
                    />
                  )}
                  {option.type === "select" && (
                    <Select
                      name={option.name}
                      defaultValue={option.defaultValue as string}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        setSettings({
                          ...settings,
                          [option.name]: e.target.value,
                        })
                      }
                      options={option.options}
                    />
                  )}
                  {option.type === "switch" && (
                    <Switch
                      checked={option.defaultValue}
                      onChange={(value) =>
                        setSettings({
                          ...settings,
                          [option.name]: value,
                        })
                      }
                    />
                  )}
                </InputWrapper>
              </Row>
            </Drawer.GroupItem>
          ))}
        </Box>

        <Drawer.Actions>
          <Button
            prefixIcon={<Undo size={18} />}
            skin="secondary"
            onClick={() => {
              setSettings(initialState)
              onOpenChange(false)
            }}
            type="button"
          >
            Dismiss
          </Button>

          <Button
            prefixIcon={<Settings4 size={18} />}
            skin="success"
            onClick={() => {
              onSubmit(settings)
              onOpenChange(false)
            }}
          >
            Submit
          </Button>
        </Drawer.Actions>
      </Box>
    </Drawer>
  )
}
