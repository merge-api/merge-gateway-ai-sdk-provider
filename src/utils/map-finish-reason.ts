import type { LanguageModelV3FinishReason } from "@ai-sdk/provider";

/**
 * Map Gateway/OpenAI finish reasons to AI SDK finish reasons.
 */
export function mapFinishReason(
  reason: string | null | undefined,
): LanguageModelV3FinishReason {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
    case "max_tokens":
      return "length";
    case "tool_calls":
    case "tool_use":
      return "tool-calls";
    case "content_filter":
      return "content-filter";
    default:
      return "unknown";
  }
}
