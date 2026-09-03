import type { ValidationTargets } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { validator } from 'hono/validator'
import type { Static, TSchema } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'

export function typeboxValidator<const T extends TSchema, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) {
  return validator(target, (value) => {
    if (!Value.Check(schema, value)) {
      throw new HTTPException(400, { message: 'invalid request' })
    }
    return Value.Decode(schema, value) as Static<T>
  })
}
