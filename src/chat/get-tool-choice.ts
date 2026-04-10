import type { LanguageModelV3ToolChoice } from "@ai-sdk/provider";

/**
 * Convert AI SDK tool choice to OpenAI chat completions tool_choice format.
 */
export function getToolChoice(
  toolChoice: LanguageModelV3ToolChoice | undefined,
): string | { type: "function"; function: { name: string } } | undefined {
  if (toolChoice == null) return undefined;

  switch (toolChoice.type) {
    case "auto":
      return "auto";
    case "none":
      return "none";
    case "required":
      return "required";
    case "tool":
      return {
        type: "function",
        function: { name: toolChoice.toolName },
      };
    default:
      return undefined;
  }
}
