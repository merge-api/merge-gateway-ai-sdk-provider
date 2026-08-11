/**
 * Self-contained structural copies of the AI SDK v5 (provider spec v2) types
 * the /v5 entry point exposes.
 *
 * Deliberately NOT imported from `@ai-sdk/provider`: a v5 app resolves that
 * package to 2.x, where the V3 types this package's core is written against
 * do not exist — and the frozen V2 copies shipped inside provider 3.x have
 * drifted from real 2.x (3.x `JSONObject` admits `undefined` values, 2.x
 * `JSONValue` does not). Keeping these local and strict makes the emitted
 * `/v5` declarations assignable to the real `@ai-sdk/provider@2.x` contract
 * regardless of which copy of the package TypeScript resolves.
 */

export type JsonValue =
  | null
  | string
  | number
  | boolean
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ProviderMetadataV5 = Record<string, Record<string, JsonValue>>;

export type FinishReasonV5 =
  | "stop"
  | "length"
  | "content-filter"
  | "tool-calls"
  | "error"
  | "other"
  | "unknown";

export type UsageV5 = {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
  reasoningTokens?: number | undefined;
  cachedInputTokens?: number | undefined;
};

export type CallWarningV5 =
  | { type: "unsupported-setting"; setting: string; details?: string }
  | { type: "other"; message: string };

/** The content parts the gateway chat model emits from doGenerate. */
export type ContentV5 =
  | { type: "text"; text: string; providerMetadata?: ProviderMetadataV5 }
  | { type: "reasoning"; text: string; providerMetadata?: ProviderMetadataV5 }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      input: string;
      providerMetadata?: ProviderMetadataV5;
    };

/** The stream parts the gateway chat model emits from doStream. */
export type StreamPartV5 =
  | { type: "stream-start"; warnings: Array<CallWarningV5> }
  | {
      type: "response-metadata";
      id?: string;
      timestamp?: Date;
      modelId?: string;
    }
  | { type: "text-start"; id: string; providerMetadata?: ProviderMetadataV5 }
  | {
      type: "text-delta";
      id: string;
      delta: string;
      providerMetadata?: ProviderMetadataV5;
    }
  | { type: "text-end"; id: string; providerMetadata?: ProviderMetadataV5 }
  | {
      type: "reasoning-start";
      id: string;
      providerMetadata?: ProviderMetadataV5;
    }
  | {
      type: "reasoning-delta";
      id: string;
      delta: string;
      providerMetadata?: ProviderMetadataV5;
    }
  | {
      type: "reasoning-end";
      id: string;
      providerMetadata?: ProviderMetadataV5;
    }
  | {
      type: "tool-input-start";
      id: string;
      toolName: string;
      providerMetadata?: ProviderMetadataV5;
    }
  | {
      type: "tool-input-delta";
      id: string;
      delta: string;
      providerMetadata?: ProviderMetadataV5;
    }
  | { type: "tool-input-end"; id: string; providerMetadata?: ProviderMetadataV5 }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      input: string;
      providerMetadata?: ProviderMetadataV5;
    }
  | {
      type: "finish";
      finishReason: FinishReasonV5;
      usage: UsageV5;
      providerMetadata?: ProviderMetadataV5;
    }
  | { type: "error"; error: unknown };

export type GenerateResultV5 = {
  content: Array<ContentV5>;
  finishReason: FinishReasonV5;
  usage: UsageV5;
  warnings: Array<CallWarningV5>;
  providerMetadata?: ProviderMetadataV5;
  request?: { body?: unknown };
  response?: {
    id?: string;
    timestamp?: Date;
    modelId?: string;
    headers?: Record<string, string>;
    body?: unknown;
  };
};

export type StreamResultV5 = {
  stream: ReadableStream<StreamPartV5>;
  request?: { body?: unknown };
  response?: { headers?: Record<string, string> };
};

export type EmbedResultV5 = {
  embeddings: Array<Array<number>>;
  usage?: { tokens: number };
  response?: { headers?: Record<string, string>; body?: unknown };
};

// ---------------------------------------------------------------------------
// Loose structural views of the inner V3 model, so the adapter's declaration
// files never reference `@ai-sdk/provider` types.
// ---------------------------------------------------------------------------

export type InnerFinishReason = { unified: FinishReasonV5; raw?: string };

export type InnerUsage = {
  inputTokens: {
    total: number | undefined;
    noCache: number | undefined;
    cacheRead: number | undefined;
    cacheWrite: number | undefined;
  };
  outputTokens: {
    total: number | undefined;
    text: number | undefined;
    reasoning: number | undefined;
  };
  raw?: Record<string, unknown>;
};

export type InnerWarning =
  | { type: "unsupported"; feature: string; details?: string }
  | { type: "compatibility"; feature: string; details?: string }
  | { type: "other"; message: string };

export type InnerStreamPart =
  | { type: "stream-start"; warnings: Array<InnerWarning> }
  | { type: "finish"; finishReason: InnerFinishReason; usage: InnerUsage; providerMetadata?: unknown }
  | ({ type: string } & Record<string, unknown>);

export type InnerChatModel = {
  readonly provider: string;
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]>;
  doGenerate(options: unknown): PromiseLike<{
    content: Array<{ type: string } & Record<string, unknown>>;
    finishReason: InnerFinishReason;
    usage: InnerUsage;
    warnings: Array<InnerWarning>;
    providerMetadata?: unknown;
    request?: { body?: unknown };
    response?: {
      id?: string;
      timestamp?: Date;
      modelId?: string;
      headers?: Record<string, string>;
      body?: unknown;
    };
  }>;
  doStream(options: unknown): PromiseLike<{
    stream: ReadableStream<InnerStreamPart>;
    request?: { body?: unknown };
    response?: { headers?: Record<string, string> };
  }>;
};

export type InnerEmbeddingModel = {
  readonly provider: string;
  readonly modelId: string;
  readonly maxEmbeddingsPerCall: number | undefined;
  readonly supportsParallelCalls: boolean;
  doEmbed(options: {
    values: Array<string>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string | undefined>;
  }): PromiseLike<EmbedResultV5>;
};
