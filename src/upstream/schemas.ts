import { type Static, Type } from '@sinclair/typebox'

const NullableStringSchema = Type.Union([Type.String(), Type.Null()])

export const ArrImageSchema = Type.Object({
  coverType: Type.Optional(NullableStringSchema),
  remoteUrl: Type.Optional(NullableStringSchema),
})

export type ArrImage = Static<typeof ArrImageSchema>
