import type { LanguageModelV3Usage } from "@ai-sdk/provider";

/**
 * Map Gateway/OpenAI usage to AI SDK usage format.
 */
export function computeTokenUsage(usage: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}): LanguageModelV3Usage {
  return {
    inputTokens: { total: usage.prompt_tokens ?? 0 },
    outputTokens: { total: usage.completion_tokens ?? 0 },
  };
}

export function emptyUsage(): LanguageModelV3Usage {
  return {
    inputTokens: { total: 0 },
    outputTokens: { total: 0 },
  };
}
