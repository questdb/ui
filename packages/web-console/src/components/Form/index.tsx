import React, { KeyboardEvent, useEffect } from "react"
import {
  useForm,
  FormProvider,
  SubmitHandler,
  UseFormProps,
  WatchObserver,
} from "react-hook-form"
import { joiResolver } from "@hookform/resolvers/joi"
import { Schema } from "joi"
import { FormItem } from "./FormItem"
import { FormInput } from "./FormInput"
import { FormCheckbox } from "./FormCheckbox"
import { FormSelect } from "./FormSelect"
import { FormGroup } from "./FormGroup"
import { FormSubmit } from "./FormSubmit"
import { FormCancel } from "./FormCancel"
import { FormTextArea } from "./FormTextArea"

type DirtyChangeObserver<T = Record<string, any>> = (
  isDirty: boolean,
  dirtyFields: Partial<T> | Record<string, string>,
) => void

export type Props<TFormValues> = {
  name: string
  method?: HTMLFormElement["method"]
  onSubmit: SubmitHandler<TFormValues>
  onChange?: WatchObserver<TFormValues>
  onDirtyChange?: DirtyChangeObserver<TFormValues>
  children: React.ReactNode
  validationSchema?: Schema
  defaultValues?: UseFormProps<TFormValues>["defaultValues"]
  preventSubmitOnEnter?: boolean
  className?: string
}

export const Form = <
  TFormValues extends Record<string, any> = Record<string, any>,
>({
  name,
  method = "post",
  onSubmit,
  onChange,
  onDirtyChange,
  children,
  validationSchema,
  defaultValues,
  preventSubmitOnEnter,
  className,
}: Props<TFormValues>) => {
  let props: UseFormProps<TFormValues> = {}

  if (defaultValues) {
    props.defaultValues = defaultValues
  }

  if (validationSchema) {
    props.resolver = joiResolver(validationSchema)
  }

  const methods = useForm<TFormValues>(props)

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Enter" && preventSubmitOnEnter) {
      event.preventDefault()
    }
  }

  useEffect(() => {
    if (onChange) {
      methods.watch(onChange)
    }
  }, [])

  useEffect(() => {
    if (onDirtyChange) {
      onDirtyChange(methods.formState.isDirty, methods.formState.dirtyFields)
    }
  }, [methods.formState])

  const handleSubmit = async (e: React.BaseSyntheticEvent) => {
    e.stopPropagation()
    await methods.handleSubmit(onSubmit)(e)
  }

  if (Object.keys(methods.formState.errors).length > 0) {
    console.log("Schema validation errors", methods.formState.errors)
  }

  return (
    <FormProvider {...methods}>
      <form
        name={name}
        onSubmit={handleSubmit}
        method={method}
        onKeyDown={handleKeyDown}
        className={className}
      >
        {children}
      </form>
    </FormProvider>
  )
}

Form.Item = FormItem
Form.Input = FormInput
Form.Checkbox = FormCheckbox
Form.Select = FormSelect
Form.Group = FormGroup
Form.Submit = FormSubmit
Form.Cancel = FormCancel
Form.TextArea = FormTextArea
