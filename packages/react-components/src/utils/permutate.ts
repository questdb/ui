export const permutate = (perms: { [key: string]: Readonly<any[]> }) => {
  const result: { [x: string]: any }[] = [];
  const keys = Object.keys(perms);
  const max = keys.length - 1;

  function recurse(object: object, depth: number) {
    const key = keys[depth];
    perms[key].forEach((prop: any) => {
      const newObject = { ...object, [key]: prop };

      if (depth === max) {
        result.push(newObject);
      } else {
        recurse(newObject, depth + 1);
      }
    });
  }
  recurse({}, 0);

  return result;
};
