import Joi from "joi"

export type Schema = {
  [key: string]: {
    disabled?: boolean
    validation: Joi.AnySchema
    helperText?: string
  }
}

export const getValidationSchema = (schema: Schema) => {
  const out: Joi.Schema = Joi.object(
    Object.keys(schema).reduce(
      (o, key) => ({ ...o, [key]: schema[key].validation }),
      {},
    ),
  )
  return out
}
