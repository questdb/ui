# `<Form/>`

This is our main abstraction for forms across the site. Internally we're
utilizing [React-Hook-Form](https://react-hook-form.com/) to control inputs and
manage state, along with [Joi](https://joi.dev) validation system to define form
schemas.

## `<FormApiErrorProvider/>`

Most of the time we'll be able to fail fast and catch errors before the API
POST/PATCH request is being made, but we still need to display related API
errors in the correct field block. We could do that by simply passing `error`
object to the `<Form/>` component, but often times this involves prop drilling,
which is far from ideal.

For this purpose an app-wide provider has been created, containing a key-based
storage, wherein key is a form name, that should be unique.

### How to use:

Within the component when the mutation occurs:

```ecmascript 6
const { setApiErrors } = useFormApiError();

const { data, error } = useMutationFunction();

useEffect(() => {
  setApiErrors("form-name", error);
}, [error]);

...

<Form name="form-name" ... />
```

Note the `<Form />` can be deeper down within the component tree, as we're not
passing anything directly.
