export type View = 'month' | 'week' | 'agenda'

export interface SegmentOption<Value extends string> {
  value: Value
  label: string
}
