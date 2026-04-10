import type {
  EmbeddingModelV3,
  SharedV3Headers,
  SharedV3Warning,
} from "@ai-sdk/provider";
import {
  combineHeaders,
  createJsonResponseHandler,
  postJsonToApi,
} from "@ai-sdk/provider-utils";
import type { MergeGatewayEmbeddingConfig } from "../merge-gateway-provider.js";
import type { MergeGatewayEmbeddingSettings } from "../types/merge-gateway-embedding-settings.js";
import { mergeGatewayFailedResponseHandler } from "../schemas/error-response.js";
import { embeddingResponseSchema } from "./schemas.js";

export class MergeGatewayEmbeddingModel implements EmbeddingModelV3 {
  readonly specificationVersion = "v3" as const;
  readonly provider: string;
  readonly modelId: string;
  readonly maxEmbeddingsPerCall = undefined;
  readonly supportsParallelCalls = true;

  readonly settings: MergeGatewayEmbeddingSettings;
  private readonly config: MergeGatewayEmbeddingConfig;

  constructor(
    modelId: string,
    settings: MergeGatewayEmbeddingSettings,
    config: MergeGatewayEmbeddingConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
    this.provider = config.provider;
  }

  async doEmbed(options: {
    values: Array<string>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string | undefined>;
  }): Promise<{
    embeddings: Array<Array<number>>;
    usage?: { tokens: number };
    response?: { headers?: SharedV3Headers; body?: unknown };
    warnings: Array<SharedV3Warning>;
  }> {
    const { values, abortSignal, headers } = options;

    const args = {
      model: this.modelId,
      input: values,
      ...(this.settings.user && { user: this.settings.user }),
    };

    const { value: response, responseHeaders } = await postJsonToApi({
      url: this.config.url({ path: "/embeddings" }),
      headers: combineHeaders(this.config.headers(), headers),
      body: args,
      failedResponseHandler: mergeGatewayFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        embeddingResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      embeddings: response.data.map((item) => item.embedding),
      usage: response.usage
        ? { tokens: response.usage.prompt_tokens ?? 0 }
        : undefined,
      response: {
        headers: responseHeaders,
        body: response,
      },
      warnings: [],
    };
  }
}
