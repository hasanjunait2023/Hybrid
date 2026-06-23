// Coerce an arbitrary (provider-returned) value into a JSON-safe object that
// satisfies postgres.js's JSONValue contract for tx.json(...). Provider `raw`
// bodies are typed `unknown`; round-tripping through JSON.stringify drops
// non-serializable members and yields a value the jsonb column accepts.
//
// The cast is sound: JSON.parse always returns a JSON value, and we only ever
// pass plain objects in here.
export type JsonRecord = { readonly [key: string]: JsonValue };
export type JsonValue =
  | null
  | string
  | number
  | boolean
  | readonly JsonValue[]
  | JsonRecord;

export function toJsonRecord(value: Record<string, unknown>): JsonRecord {
  return JSON.parse(JSON.stringify(value)) as JsonRecord;
}
