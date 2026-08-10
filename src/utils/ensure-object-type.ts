/**
 * Ensure a JSON Schema object carries `"type": "object"` at its root.
 *
 * Some Zod v4 conversions omit the root `type` when `properties` is present,
 * which OpenAI-style providers reject. Applied to both tool parameter schemas
 * and `responseFormat.schema`; everything else in the schema passes through
 * byte-identical.
 */
export function ensureObjectType(schema: unknown): unknown {
  if (
    schema &&
    typeof schema === "object" &&
    !Array.isArray(schema) &&
    "properties" in schema &&
    !("type" in schema)
  ) {
    return { type: "object", ...schema };
  }
  return schema;
}
