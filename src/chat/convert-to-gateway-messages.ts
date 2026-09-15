import type { LanguageModelV3Prompt, SharedV3Warning } from "@ai-sdk/provider";
import { convertUint8ArrayToBase64 } from "@ai-sdk/provider-utils";

type ChatMessage = {
  role: string;
  content: string | Array<Record<string, unknown>> | null;
  name?: string;
  tool_calls?: Array<Record<string, unknown>>;
  tool_call_id?: string;
  cache_control?: Record<string, unknown>;
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

/** Anything that can carry AI SDK `providerOptions` — a message or a part. */
type WithProviderOptions = {
  providerOptions?: Record<string, unknown>;
  provider_options?: Record<string, unknown>;
};

/**
 * Prompt-cache hints ride on `providerOptions` in the AI SDK
 * (`{ anthropic: { cacheControl: { type: "ephemeral" } } }`), which this
 * converter used to drop on the floor along with the rest of the part's
 * provider options — so caching a long document or system prompt through this
 * provider quietly did nothing.
 *
 * The gateway reads a `cache_control` key on the message or the content block
 * (its own OpenAI-compat shape), so translate rather than pass through.
 */
function cacheControlFrom(
  source: WithProviderOptions | undefined,
): Record<string, unknown> | undefined {
  const options = source?.providerOptions ?? source?.provider_options;
  if (!options || typeof options !== "object") {
    return undefined;
  }
  for (const family of ["anthropic", "openrouter", "mergeGateway"]) {
    const familyOptions = options[family];
    if (!familyOptions || typeof familyOptions !== "object") {
      continue;
    }
    const cacheControl =
      (familyOptions as Record<string, unknown>).cacheControl ??
      (familyOptions as Record<string, unknown>).cache_control;
    if (cacheControl && typeof cacheControl === "object") {
      return cacheControl as Record<string, unknown>;
    }
  }
  return undefined;
}

/**
 * A file part as it can actually arrive, across every prompt spec this package
 * is used with. The field names moved between generations and the provider is
 * handed whatever the installed `@ai-sdk/provider` produces:
 *
 * - media type: `mediaType` in V2/V3/V4; `mimeType` only in the v1-era shape
 *   (which is what this converter originally — and wrongly — read, so every
 *   file part, images included, fell through and was dropped silently).
 * - data: `Uint8Array | string | URL` in V2/V3; a tagged union
 *   `{ type: 'data' | 'url' | 'reference' | 'text' }` in V4. A sibling `url`
 *   on the part itself only ever existed in the v1-era shape.
 */
type FilePartLike = WithProviderOptions & {
  type: string;
  text?: string;
  filename?: string;
  data?: unknown;
  mediaType?: string;
  mimeType?: string;
  url?: string;
};

/** Where the bytes live once the spec differences are resolved away. */
type FileSource =
  | { kind: "url"; value: string }
  | { kind: "base64"; value: string }
  | { kind: "text"; value: string }
  | { kind: "unsupported"; reason: string };

/** Base64 prefixes of the file signatures we can identify without decoding. */
const BASE64_SIGNATURES: Array<[string, string]> = [
  ["iVBORw0KGgo", "image/png"],
  ["/9j/", "image/jpeg"],
  ["R0lGODdh", "image/gif"],
  ["R0lGODlh", "image/gif"],
  ["JVBERi0", "application/pdf"],
];

const EXTENSION_MEDIA_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

function isFullMediaType(mediaType: string | undefined): mediaType is string {
  return (
    typeof mediaType === "string" &&
    mediaType.includes("/") &&
    !mediaType.endsWith("/*")
  );
}

/** Media type of a `data:` URI, or "" when it carries none. */
function mediaTypeFromDataUri(value: string): string {
  const head = value.slice(5).split(";", 1)[0] ?? "";
  return head.includes("/") ? head : "";
}

/**
 * Resolve a concrete `type/subtype`. V3 allows wildcards (`image/*`) and V4
 * allows a bare top-level segment (`image`), neither of which can label a
 * `data:` URI, so fall back to the file signature and then the filename.
 */
function resolveMediaType(
  part: FilePartLike,
  source: FileSource,
): string | undefined {
  const declared = part.mediaType ?? part.mimeType;
  if (isFullMediaType(declared)) {
    return declared;
  }
  if (source.kind === "url" && source.value.startsWith("data:")) {
    const fromUri = mediaTypeFromDataUri(source.value);
    if (fromUri) {
      return fromUri;
    }
  }
  if (source.kind === "base64") {
    for (const [prefix, mediaType] of BASE64_SIGNATURES) {
      if (source.value.startsWith(prefix)) {
        return mediaType;
      }
    }
  }
  const extension = part.filename?.split(".").pop()?.toLowerCase();
  if (extension && EXTENSION_MEDIA_TYPES[extension]) {
    return EXTENSION_MEDIA_TYPES[extension];
  }
  return undefined;
}

/** Top-level IANA segment (`image`, `audio`, …) of whatever we could resolve. */
function topLevelType(
  part: FilePartLike,
  resolved: string | undefined,
): string {
  const declared = part.mediaType ?? part.mimeType;
  return (resolved ?? declared ?? "").split("/")[0]?.toLowerCase() ?? "";
}

function rawDataToSource(data: unknown): FileSource {
  if (data instanceof URL) {
    return { kind: "url", value: data.toString() };
  }
  if (data instanceof Uint8Array) {
    return { kind: "base64", value: convertUint8ArrayToBase64(data) };
  }
  if (data instanceof ArrayBuffer) {
    return { kind: "base64", value: convertUint8ArrayToBase64(new Uint8Array(data)) };
  }
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return {
      kind: "base64",
      value: convertUint8ArrayToBase64(
        new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
      ),
    };
  }
  if (typeof data === "string") {
    if (
      data.startsWith("http://") ||
      data.startsWith("https://") ||
      data.startsWith("data:")
    ) {
      // A `data:` URI is already a complete, labelled payload — forward as-is.
      return { kind: "url", value: data };
    }
    return { kind: "base64", value: data };
  }
  return { kind: "unsupported", reason: "file data of an unrecognized type" };
}

/** Collapse every spec's `data` shape down to a URL, base64, or inline text. */
function resolveFileSource(part: FilePartLike): FileSource {
  const data = part.data;

  // AI SDK V4 tagged union.
  if (
    data !== null &&
    typeof data === "object" &&
    !(data instanceof Uint8Array) &&
    !(data instanceof URL) &&
    !(data instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(data) &&
    "type" in (data as Record<string, unknown>)
  ) {
    const tagged = data as Record<string, unknown>;
    switch (tagged.type) {
      case "url":
        return { kind: "url", value: String(tagged.url) };
      case "data":
        return rawDataToSource(tagged.data);
      case "text":
        return { kind: "text", value: String(tagged.text) };
      case "reference":
        return {
          kind: "unsupported",
          reason:
            "a provider file reference, which the gateway cannot resolve — send the file data or a URL instead",
        };
      default:
        return {
          kind: "unsupported",
          reason: `file data of type "${String(tagged.type)}"`,
        };
    }
  }

  return rawDataToSource(data ?? part.url);
}

/**
 * Convert one file part to the Chat Completions block the Gateway expects.
 *
 * Images become `image_url`; audio becomes `input_audio`; everything else
 * (PDF, Office documents, video, …) becomes litellm's unified `file` block,
 * which the gateway translates per vendor — the same vehicle its own
 * document/video content blocks use. Nothing is dropped without a warning.
 */
function fileContentPart(
  part: FilePartLike,
  warn: (warning: SharedV3Warning) => void,
): Record<string, unknown> | undefined {
  const source = resolveFileSource(part);
  const label = part.filename ?? part.mediaType ?? part.mimeType ?? "file";

  if (source.kind === "unsupported") {
    warn({
      type: "unsupported",
      feature: "file attachment",
      details: `"${label}" was not sent: ${source.reason}.`,
    });
    return undefined;
  }

  if (source.kind === "text") {
    // V4 inline-text documents have no binary payload; the text itself is the
    // content, so send it as text rather than an empty file block.
    return {
      type: "text",
      text: part.filename ? `${part.filename}:\n${source.value}` : source.value,
    };
  }

  const mediaType = resolveMediaType(part, source);
  const topLevel = topLevelType(part, mediaType);

  if (source.kind === "base64" && mediaType === undefined) {
    warn({
      type: "unsupported",
      feature: "file attachment",
      details:
        `"${label}" was not sent: its media type is ${
          part.mediaType ?? part.mimeType ?? "missing"
        }, which is not a concrete "type/subtype". ` +
        "Pass a full media type (or a filename) so the file can be labelled.",
    });
    return undefined;
  }

  const url =
    source.kind === "url"
      ? source.value
      : `data:${mediaType};base64,${source.value}`;

  if (topLevel === "image") {
    return { type: "image_url", image_url: { url } };
  }

  if (topLevel === "audio" && source.kind === "base64") {
    // litellm's `input_audio` takes bare base64 plus a bare format ("wav"),
    // not a data URI. URL-sourced audio falls through to the `file` block.
    return {
      type: "input_audio",
      input_audio: {
        data: source.value,
        format: (mediaType ?? "").split("/")[1]?.replace("mpeg", "mp3") ?? "",
      },
    };
  }

  const file: Record<string, unknown> = { file_data: url };
  if (mediaType) {
    file.format = mediaType;
  }
  if (part.filename) {
    file.filename = part.filename;
  }
  return { type: "file", file };
}

/**
 * Convert AI SDK LanguageModelV3Prompt to OpenAI chat message format,
 * which is what the Gateway /v1/ai-sdk/chat/completions endpoint expects.
 *
 * `warnings` collects anything that could not be forwarded, so a part the
 * gateway cannot carry surfaces on the call result instead of vanishing.
 */
export function convertToGatewayMessages(
  prompt: LanguageModelV3Prompt,
  warnings: Array<SharedV3Warning> = [],
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const warn = (warning: SharedV3Warning) => {
    warnings.push(warning);
  };

  for (const message of prompt) {
    const { role, content } = message;
    const messageCacheControl = cacheControlFrom(message as WithProviderOptions);

    switch (role) {
      case "system": {
        messages.push({
          role: "system",
          content: content as string,
          ...(messageCacheControl && { cache_control: messageCacheControl }),
        });
        break;
      }

      case "user": {
        const parts = content as Array<FilePartLike>;

        // Unwrap single text part to plain string. A cache hint on that part
        // has nowhere to sit once the content is a string, so promote it to
        // the message, which the gateway honours the same way.
        if (parts.length === 1 && parts[0].type === "text") {
          const cacheControl = messageCacheControl ?? cacheControlFrom(parts[0]);
          messages.push({
            role: "user",
            content: parts[0].text!,
            ...(cacheControl && { cache_control: cacheControl }),
          });
          break;
        }

        const contentParts: Array<Record<string, unknown>> = [];
        for (const part of parts) {
          switch (part.type) {
            case "text": {
              const cacheControl = cacheControlFrom(part);
              contentParts.push({
                type: "text",
                text: part.text,
                ...(cacheControl && { cache_control: cacheControl }),
              });
              break;
            }
            case "file": {
              const block = fileContentPart(part, warn);
              if (block) {
                const cacheControl = cacheControlFrom(part);
                if (cacheControl) {
                  block.cache_control = cacheControl;
                }
                contentParts.push(block);
              }
              break;
            }
            default:
              warn({
                type: "unsupported",
                feature: `user content part "${part.type}"`,
                details: "the part was not included in the request.",
              });
          }
        }
        messages.push({
          role: "user",
          content: contentParts,
          ...(messageCacheControl && { cache_control: messageCacheControl }),
        });
        break;
      }

      case "assistant": {
        const parts = content as Array<
          WithProviderOptions & {
            type: string;
            text?: string;
            toolCallId?: string;
            toolName?: string;
            input?: unknown;
          }
        >;

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
            default:
              // Assistant-side files (generated images, for example) have no
              // Chat Completions representation on the way back in. Say so.
              warn({
                type: "unsupported",
                feature: `assistant content part "${part.type}"`,
                details: "the part was not included in the request.",
              });
          }
        }

        // Assistant text parts collapse into one string, so a part-level hint
        // has no block to sit on; the last one wins at the message level.
        const assistantCacheControl =
          messageCacheControl ??
          parts.map((part) => cacheControlFrom(part)).filter(Boolean).pop();

        const msg: ChatMessage = {
          role: "assistant",
          content: textContent || null,
          ...(assistantCacheControl && { cache_control: assistantCacheControl }),
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
