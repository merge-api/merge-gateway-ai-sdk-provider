/**
 * Routing metadata returned when includeRoutingMetadata is true.
 * Surfaced via providerMetadata.mergeGateway in the AI SDK response.
 */
export interface MergeGatewayRoutingMetadata {
  policy_id?: string;
  policy_name?: string;
  strategy?: string;
  intelligent_routing_used?: boolean;
  complexity_score?: number;
  adjusted_score?: number;
  selected_tier?: number;
  total_tiers?: number;
  routing_reason?: string;
  model_requested?: string;
  model_used?: string;
  vendor_used?: string;
  credential_type?: string;
  cost_usd?: number;
  latency?: {
    policy_lookup_ms: number;
    routing_decision_ms: number;
    llm_call_ms: number;
    total_ms: number;
  };
}

export interface MergeGatewayResponseMetadata {
  routing?: MergeGatewayRoutingMetadata;
}
