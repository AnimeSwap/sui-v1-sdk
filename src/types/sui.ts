export type SuiJsonValue = boolean | number | string | Array<SuiJsonValue>

export type EntryFunctionPayload = {
  packageObjectId: string
  module: string
  function: string
  typeArguments: string[]
  arguments: SuiJsonValue[]
}

export type Payload = EntryFunctionPayload
