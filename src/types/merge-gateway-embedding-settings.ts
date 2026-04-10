/**
 * Per-model settings for Merge Gateway embedding models.
 *
 * Passed as the second argument to gateway.textEmbeddingModel(modelId, settings).
 */
export interface MergeGatewayEmbeddingSettings {
  /** Custom user identifier for rate limiting or tracking. */
  user?: string;
}
