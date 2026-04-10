import type { LanguageModelV3FinishReason } from "@ai-sdk/provider";

/**
 * Map Gateway/OpenAI finish reasons to AI SDK V3 finish reasons.
 * V3 uses { unified, raw } format instead of plain strings.
 */
export function mapFinishReason(
  reason: string | null | undefined,
): LanguageModelV3FinishReason {
  const raw = reason ?? undefined;

  switch (reason) {
    case "stop":
      return { unified: "stop", raw };
    case "length":
    case "max_tokens":
      return { unified: "length", raw };
    case "tool_calls":
    case "tool_use":
      return { unified: "tool-calls", raw };
    case "content_filter":
      return { unified: "content-filter", raw };
    default:
      return { unified: "other", raw };
  }
}
