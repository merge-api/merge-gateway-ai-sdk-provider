import type { LanguageModelV3Prompt } from "@ai-sdk/provider";

type ChatMessage = {
  role: string;
  content: string | Array<Record<string, unknown>> | null;
  name?: string;
  tool_calls?: Array<Record<string, unknown>>;
  tool_call_id?: string;
};

/**
 * Extract a tool result into the plain-string content the Gateway's
 * OpenAI-style `role: "tool"` message expects.
 *
 * AI SDK v5+ (LanguageModelV2/V3) carries the tool output in
 * `output: { type, value }`, where `type` is one of
 * `text | json | error-text | error-json | content`. AI SDK v4
 * (LanguageModelV1) instead used a flat `result` (and sometimes `content`)
 * field. Reading only `result`/`content` — as this converter originally did —
 * silently dropped every tool result once the package was upgraded to AI SDK
 * v5+, so the model received an empty tool result. Prefer the v5+ `output`
 * shape and fall back to the legacy fields.
 */
function extractToolResultContent(part: {
  output?: { type?: string; value?: unknown } | unknown;
  result?: unknown;
  content?: unknown;
}): string {
  const output = part.output as { type?: string; value?: unknown } | undefined;
  if (output && typeof output === "object" && "type" in output) {
    switch (output.type) {
      case "text":
      case "error-text":
        return typeof output.value === "string"
          ? output.value
          : JSON.stringify(output.value ?? "");
      case "json":
      case "error-json":
        return JSON.stringify(output.value ?? "");
      case "content": {
        // Array of { type: "text", text } | { type: "media", ... } parts.
        // Concatenate plain text when the result is text-only; otherwise
        // serialize the whole structure so nothing is lost.
        if (Array.isArray(output.value)) {
          const isAllText = output.value.every(
            (p: unknown) =>
              typeof p === "object" &&
              p !== null &&
              (p as { type?: string }).type === "text" &&
              typeof (p as { text?: unknown }).text === "string",
          );
          if (isAllText) {
            return output.value
              .map((p: { text: string }) => p.text)
              .join("\n");
          }
          return JSON.stringify(output.value);
        }
        return JSON.stringify(output.value ?? "");
      }
      default:
        return JSON.stringify(output.value ?? output ?? "");
    }
  }

  // Legacy AI SDK v4 fallback.
  if (typeof part.result === "string") {
    return part.result;
  }
  if (part.result !== undefined || part.content !== undefined) {
    return JSON.stringify(part.result ?? part.content ?? "");
  }
  return "";
}

/**
 * Convert AI SDK LanguageModelV3Prompt to OpenAI chat message format,
 * which is what the Gateway /v1/ai-sdk/chat/completions endpoint expects.
 */
export function convertToGatewayMessages(
  prompt: LanguageModelV3Prompt,
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case "system": {
        messages.push({ role: "system", content: content as string });
        break;
      }

      case "user": {
        const parts = content as Array<{
          type: string;
          text?: string;
          data?: string | Uint8Array;
          mimeType?: string;
          url?: string;
        }>;

        // Unwrap single text part to plain string
        if (parts.length === 1 && parts[0].type === "text") {
          messages.push({ role: "user", content: parts[0].text! });
          break;
        }

        const contentParts: Array<Record<string, unknown>> = [];
        for (const part of parts) {
          switch (part.type) {
            case "text":
              contentParts.push({ type: "text", text: part.text });
              break;
            case "file": {
              // Image content — convert to OpenAI image_url format
              if (part.mimeType?.startsWith("image/")) {
                let url: string;
                if (typeof part.data === "string") {
                  // Could be a URL or base64
                  if (
                    part.data.startsWith("http://") ||
                    part.data.startsWith("https://")
                  ) {
                    url = part.data;
                  } else {
                    url = `data:${part.mimeType};base64,${part.data}`;
                  }
                } else if (part.url) {
                  url = part.url;
                } else {
                  // Uint8Array — convert to base64
                  const bytes = part.data as Uint8Array;
                  const binary = Array.from(bytes)
                    .map((b) => String.fromCharCode(b))
                    .join("");
                  url = `data:${part.mimeType};base64,${btoa(binary)}`;
                }
                contentParts.push({
                  type: "image_url",
                  image_url: { url },
                });
              }
              break;
            }
          }
        }
        messages.push({ role: "user", content: contentParts });
        break;
      }

      case "assistant": {
        const parts = content as Array<{
          type: string;
          text?: string;
          toolCallId?: string;
          toolName?: string;
          input?: unknown;
        }>;

        let textContent = "";
        const toolCalls: Array<Record<string, unknown>> = [];

        for (const part of parts) {
          switch (part.type) {
            case "text":
              textContent += part.text ?? "";
              break;
            case "reasoning":
              // Thinking/reasoning content — pass through as text for now
              // The backend handles thinking blocks
              break;
            case "tool-call":
              toolCalls.push({
                id: part.toolCallId,
                type: "function",
                function: {
                  name: part.toolName,
                  arguments:
                    typeof part.input === "string"
                      ? part.input
                      : JSON.stringify(part.input ?? {}),
                },
              });
              break;
          }
        }

        const msg: ChatMessage = {
          role: "assistant",
          content: textContent || null,
        };
        if (toolCalls.length > 0) {
          msg.tool_calls = toolCalls;
        }
        messages.push(msg);
        break;
      }

      case "tool": {
        const parts = content as Array<{
          type: string;
          toolCallId?: string;
          result?: unknown;
          content?: unknown;
          output?: { type?: string; value?: unknown } | unknown;
        }>;

        for (const part of parts) {
          if (part.type === "tool-result") {
            messages.push({
              role: "tool",
              content: extractToolResultContent(part),
              tool_call_id: part.toolCallId,
            });
          }
        }
        break;
      }
    }
  }

  return messages;
}
