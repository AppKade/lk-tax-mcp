import { z } from 'zod';
// SDK validation errors may otherwise echo unknown field names or enum values.
// Keep the advertised Zod JSON schema and inferred types, but emit only fixed errors.
export function privateSchema<S extends z.ZodType>(schema: S) {
  return { '~standard': {
    ...schema['~standard'], vendor: 'lk-tax',
    types: undefined as { input: z.input<S>; output: z.output<S> } | undefined,
    validate(value: unknown) {
      const parsed = schema.safeParse(value);
      return parsed.success ? { value: parsed.data } : {
        issues: [{ message: 'Invalid tool arguments. Use the published schema; do not send identifiers.' }],
      };
    },
  } };
}
