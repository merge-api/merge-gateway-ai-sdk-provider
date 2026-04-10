import type { LanguageModelV3Prompt } from "@ai-sdk/provider";

type ChatMessage = {
  role: string;
  content: string | Array<Record<string, unknown>> | null;
  name?: string;
  tool_calls?: Array<Record<string, unknown>>;
  tool_call_id?: string;
};

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
          args?: string;
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
                  arguments: part.args ?? "{}",
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
          output?: string;
        }>;

        for (const part of parts) {
          if (part.type === "tool-result") {
            const resultContent =
              typeof part.result === "string"
                ? part.result
                : JSON.stringify(part.result ?? part.content ?? "");
            messages.push({
              role: "tool",
              content: resultContent,
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
