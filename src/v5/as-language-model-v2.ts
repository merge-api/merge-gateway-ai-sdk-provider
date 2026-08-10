import type {
  CallWarningV5,
  ContentV5,
  FinishReasonV5,
  GenerateResultV5,
  InnerChatModel,
  InnerFinishReason,
  InnerStreamPart,
  InnerUsage,
  InnerWarning,
  ProviderMetadataV5,
  StreamPartV5,
  StreamResultV5,
  UsageV5,
} from "./types.js";

/**
 * Down-level adapter: presents the V3 chat model as a `LanguageModelV2` for
 * AI SDK v5 consumers (ai@5 pins @ai-sdk/provider@2 and cannot consume V3
 * models). V2 and V3 `CallOptions` are structurally identical — only
 * `usage`, `finishReason`, warnings, and the `stream-start`/`finish` stream
 * parts differ, so this is the inverse of Vercel's own `asLanguageModelV3`
 * shim. Types are vendored (see ./types.ts) so the emitted declarations
 * satisfy the real `@ai-sdk/provider@2.x` contract.
 */
export class MergeGatewayChatLanguageModelV5 {
  readonly specificationVersion = "v2" as const;

  constructor(private readonly inner: InnerChatModel) {}

  get provider(): string {
    return this.inner.provider;
  }

  get modelId(): string {
    return this.inner.modelId;
  }

  get supportedUrls(): Record<string, RegExp[]> {
    return this.inner.supportedUrls;
  }

  async doGenerate(options: unknown): Promise<GenerateResultV5> {
    // V2 CallOptions (prompt included) are a structural subset of V3, so the
    // options object passes through unchanged.
    const result = await this.inner.doGenerate(options);
    return {
      // The chat model only emits text / reasoning / tool-call content,
      // which is shape-identical across V2 and V3.
      content: result.content as Array<ContentV5>,
      finishReason: toV2FinishReason(result.finishReason),
      usage: toV2Usage(result.usage),
      warnings: result.warnings.map(toV2Warning),
      providerMetadata: result.providerMetadata as
        | ProviderMetadataV5
        | undefined,
      request: result.request,
      response: result.response,
    };
  }

  async doStream(options: unknown): Promise<StreamResultV5> {
    const result = await this.inner.doStream(options);
    return {
      stream: result.stream.pipeThrough(
        new TransformStream<InnerStreamPart, StreamPartV5>({
          transform(part, controller) {
            if (part.type === "stream-start") {
              controller.enqueue({
                type: "stream-start",
                warnings: (part.warnings as Array<InnerWarning>).map(
                  toV2Warning,
                ),
              });
              return;
            }
            if (part.type === "finish") {
              controller.enqueue({
                type: "finish",
                finishReason: toV2FinishReason(
                  part.finishReason as InnerFinishReason,
                ),
                usage: toV2Usage(part.usage as InnerUsage),
                providerMetadata: part.providerMetadata as
                  | ProviderMetadataV5
                  | undefined,
              });
              return;
            }
            // Every other part the chat model emits (text-* / reasoning-* /
            // tool-input-* / tool-call / response-metadata / error) is
            // shape-identical across V2 and V3.
            controller.enqueue(part as StreamPartV5);
          },
        }),
      ),
      request: result.request,
      response: result.response,
    };
  }
}

function toV2FinishReason(reason: InnerFinishReason): FinishReasonV5 {
  return reason.unified;
}

function toV2Usage(usage: InnerUsage): UsageV5 {
  const inputTokens = usage.inputTokens.total;
  const outputTokens = usage.outputTokens.total;
  const rawTotal = usage.raw?.["total_tokens"];
  return {
    inputTokens,
    outputTokens,
    totalTokens:
      typeof rawTotal === "number"
        ? rawTotal
        : inputTokens != null && outputTokens != null
          ? inputTokens + outputTokens
          : undefined,
    reasoningTokens: usage.outputTokens.reasoning,
    cachedInputTokens: usage.inputTokens.cacheRead,
  };
}

/** CallOptions keys that map onto V2's typed `unsupported-setting` warning. */
const V2_SETTINGS = new Set([
  "topK",
  "temperature",
  "topP",
  "seed",
  "stopSequences",
]);

function toV2Warning(warning: InnerWarning): CallWarningV5 {
  if (warning.type === "unsupported" && V2_SETTINGS.has(warning.feature)) {
    return {
      type: "unsupported-setting",
      setting: warning.feature,
      details: warning.details,
    };
  }
  if (warning.type === "other") {
    return warning;
  }
  const details = warning.details ? `: ${warning.details}` : "";
  return {
    type: "other",
    message: `${warning.type} ${warning.feature}${details}`,
  };
}
