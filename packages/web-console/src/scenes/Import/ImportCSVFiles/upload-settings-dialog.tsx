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
import { MAX_UNCOMMITTED_ROWS } from "./const"

const SettingsIcon = styled(Settings4)`
  color: ${({ theme }) => theme.color.foreground};
`

const Row = styled(Box).attrs({ justifyContent: "space-between", gap: "2rem" })`
  width: 100%;
`

const FormWrapper = styled(Box).attrs({ gap: "0", flexDirection: "column" })`
  width: 100%;
  height: calc(100vh - 6.1rem);

  form {
    height: 100%;
  }
`

const Items = styled(Box).attrs({ gap: "0", flexDirection: "column" })`
  height: 100%;
`

const Inputs = styled(Box).attrs({ gap: "0", flexDirection: "column" })`
  width: 100%;
  height: 100%;
  overflow: auto;
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
  defaultValue: string | number
  placeholder?: string
}

type SelectOption = {
  type: "select"
  defaultValue: string
  options: { label: string; value: string | number }[]
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
  const {
    delimiter,
    overwrite,
    forceHeader,
    skipLev,
    atomicity,
    maxUncommitedRows,
  } = file.settings

  const initialState = {
    delimiter,
    overwrite,
    forceHeader,
    skipLev,
    atomicity,
    maxUncommitedRows,
  }

  const [settings, setSettings] =
    React.useState<UploadModeSettings>(initialState)

  const options: Option[] = [
    {
      type: "input",
      name: "maxUncommitedRows",
      label: "Maximum number of uncommited rows",
      placeholder: MAX_UNCOMMITTED_ROWS.toString(),
      description: (
        <>
          Set this parameter to determine the size of the commit batch based on
          the RAM size of the machine to avoid running out of memory during an
          import.
        </>
      ),
      defaultValue: settings.maxUncommitedRows,
    },
    {
      type: "input",
      name: "delimiter",
      label: "Delimiter",
      placeholder: "Automatic",
      description: (
        <>
          Delimiter character. When not set, import will try to detect the
          delimiter automatically. You can define the parameter here to disable
          auto-detection and allow single-line file import.
        </>
      ),
      defaultValue: settings.delimiter,
    },
    {
      type: "select",
      name: "atomicity",
      label: "Atomicity",
      description: (
        <>
          Behavior when an error is detected in the data.
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
          When set to <strong>false</strong>, QuestDB will try to infer if the
          first line of the file is the header line.
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
          When set to <strong>true</strong>, the parser will ignore extra
          values. When set to <strong>false</strong>, the parser will ignore the
          entire line. An extra value is something in addition to what is
          defined by the header.
        </>
      ),
      defaultValue: settings.skipLev,
    },
  ]

  return (
    <Drawer
      open={open}
      title={
        <Box>
          <SettingsIcon size="20px" />
          <Text color="foreground">Settings for {file.fileObject.name}</Text>
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
      onDismiss={() => {
        setSettings(initialState)
        onOpenChange(false)
      }}
      withCloseButton
    >
      <FormWrapper>
        <Items>
          <Inputs>
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
          </Inputs>

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
        </Items>
      </FormWrapper>
    </Drawer>
  )
}
