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

  /**
   * Controls the `strict` flag on `json_schema` structured output.
   *
   * Defaults to `true` for deterministic schema conformance where the
   * provider supports it. Set to `false` for schemas that OpenAI-style
   * strict mode rejects (optional fields, unions/anyOf, open objects).
   * Overrides the model-level `strictJsonSchema` setting per call.
   */
  strictJsonSchema?: boolean;

  /** Set the model's named reasoning effort. */
  reasoningEffort?:
    | "none"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | "max";

  /** Enable extended thinking with a token budget. */
  thinking?: {
    type: "enabled" | "disabled";
    budgetTokens: number;
  };
}
