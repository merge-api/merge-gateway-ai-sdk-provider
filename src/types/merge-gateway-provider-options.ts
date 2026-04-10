/**
 * Gateway-specific options passed via providerOptions.mergeGateway.
 *
 * These are sent as body fields alongside the standard OpenAI request,
 * allowing the native provider to expose Gateway features with full
 * TypeScript types and autocomplete.
 */
export interface MergeGatewayProviderOptions {
  /** Tag requests for categorization, filtering, and policy overrides. */
  tags?: Array<{ key: string; value: string }>;

  /** Associate the request with a project for cost/usage tracking. */
  projectId?: string;

  /** Restrict to a single vendor (e.g., "bedrock", "anthropic"). */
  vendor?: string;

  /** Ordered vendor preference list — first available wins. */
  vendors?: string[];

  /** Include routing decision metadata in the response. */
  includeRoutingMetadata?: boolean;

  /** Enable extended thinking with a token budget. */
  thinking?: {
    type: "enabled" | "disabled";
    budgetTokens: number;
  };
}
