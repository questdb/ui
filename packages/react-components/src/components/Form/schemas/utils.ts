import Joi from "joi";
import { FormSchema } from "../../../types";

export const getValidationSchema = (formSchema: FormSchema) => {
  let out: Joi.Schema = Joi.object(
    Object.keys(formSchema).reduce(
      (o, key) => ({ ...o, [key]: formSchema[key].validation }),
      {}
    )
  );
  return out;
};
