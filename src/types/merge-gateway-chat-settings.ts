/**
 * Per-model settings for Merge Gateway chat models.
 *
 * Passed as the second argument to gateway.chat(modelId, settings).
 */
export interface MergeGatewayChatSettings {
  /** Custom user identifier for rate limiting or tracking. */
  user?: string;

  /**
   * Model-level default for the `strict` flag on `json_schema` structured
   * output. Per-call `providerOptions.mergeGateway.strictJsonSchema` wins.
   * @default true
   */
  strictJsonSchema?: boolean;
}
