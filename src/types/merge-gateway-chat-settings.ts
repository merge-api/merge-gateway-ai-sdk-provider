/**
 * Per-model settings for Merge Gateway chat models.
 *
 * Passed as the second argument to gateway.chat(modelId, settings).
 */
export interface MergeGatewayChatSettings {
  /** Custom user identifier for rate limiting or tracking. */
  user?: string;
}
