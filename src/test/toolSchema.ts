import Ajv, { type ErrorObject, type ValidateFunction } from "ajv"
import { ALL_DEFINITIONS } from "../utils/tools/tools"

// Validates tool inputs against the JSON schemas the model and MCP clients are
// given. Strict mode refuses any keyword Ajv does not implement, so a schema
// can never lean on a rule this check would silently skip.
const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true })
const validators = new Map<string, ValidateFunction>()

export const toolInputValidator = (tool: string): ValidateFunction => {
  const cached = validators.get(tool)
  if (cached) return cached
  const definition = ALL_DEFINITIONS.find((d) => d.name === tool)
  if (!definition) throw new Error(`No tool definition named ${tool}`)
  const validate = ajv.compile(definition.inputSchema)
  validators.set(tool, validate)
  return validate
}

const describeError = ({
  instancePath,
  message,
  params,
}: ErrorObject): string => {
  const extra =
    "additionalProperty" in params ? ` (${params.additionalProperty})` : ""
  return `${instancePath || "/"} ${message ?? "is invalid"}${extra}`
}

// Every violation of the tool's input schema, so a failure names each field.
export const toolInputViolations = (tool: string, input: unknown): string[] => {
  const validate = toolInputValidator(tool)
  return validate(input) ? [] : (validate.errors ?? []).map(describeError)
}
