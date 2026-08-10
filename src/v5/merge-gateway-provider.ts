import { NoSuchModelError } from "@ai-sdk/provider";
import { loadApiKey, withoutTrailingSlash } from "@ai-sdk/provider-utils";
import { MergeGatewayChatLanguageModel } from "../chat/index.js";
import { MergeGatewayEmbeddingModel } from "../embedding/index.js";
import type {
  MergeGatewayChatConfig,
  MergeGatewayEmbeddingConfig,
  MergeGatewayProviderSettings,
} from "../merge-gateway-provider.js";
import type { MergeGatewayChatSettings } from "../types/merge-gateway-chat-settings.js";
import type { MergeGatewayEmbeddingSettings } from "../types/merge-gateway-embedding-settings.js";
import { VERSION } from "../version.js";
import { MergeGatewayChatLanguageModelV5 } from "./as-language-model-v2.js";
import { MergeGatewayEmbeddingModelV5 } from "./as-embedding-model-v2.js";
import type { InnerChatModel, InnerEmbeddingModel } from "./types.js";

export type { MergeGatewayProviderSettings } from "../merge-gateway-provider.js";

export interface MergeGatewayProviderV5 {
  (
    modelId: string,
    settings?: MergeGatewayChatSettings,
  ): MergeGatewayChatLanguageModelV5;

  languageModel(
    modelId: string,
    settings?: MergeGatewayChatSettings,
  ): MergeGatewayChatLanguageModelV5;

  chat(
    modelId: string,
    settings?: MergeGatewayChatSettings,
  ): MergeGatewayChatLanguageModelV5;

  textEmbeddingModel(
    modelId: string,
    settings?: MergeGatewayEmbeddingSettings,
  ): MergeGatewayEmbeddingModelV5;

  /** Always throws NoSuchModelError — the gateway AI SDK surface has no image models. */
  imageModel(modelId: string): never;
}

/**
 * Create a Merge Gateway provider for **AI SDK v5** (`ai@5`, provider spec
 * v2). The request behavior is identical to the main entry point — the same
 * V3 implementation runs underneath, wrapped in a thin spec down-converter.
 *
 * AI SDK v6 users should import from the package root instead.
 *
 * @example
 * ```ts
 * import { createMergeGateway } from "merge-gateway-ai-sdk-provider/v5";
 * import { generateObject } from "ai";
 *
 * const gateway = createMergeGateway({ apiKey: process.env.MERGE_GATEWAY_API_KEY });
 * const { object } = await generateObject({
 *   model: gateway("openai/gpt-4o"),
 *   schema: mySchema,
 *   prompt: "…",
 *   providerOptions: { mergeGateway: { strictJsonSchema: false } },
 * });
 * ```
 */
export function createMergeGateway(
  options: MergeGatewayProviderSettings = {},
): MergeGatewayProviderV5 {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ??
    "https://api-gateway.merge.dev/v1/ai-sdk";

  const getHeaders = (): Record<string, string | undefined> => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: "MERGE_GATEWAY_API_KEY",
      description: "Merge Gateway",
    })}`,
    "User-Agent": `ai-sdk/merge-gateway/${VERSION}`,
    ...options.headers,
  });

  const chatConfig: MergeGatewayChatConfig = {
    provider: "merge-gateway.chat",
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch,
  };

  const embeddingConfig: MergeGatewayEmbeddingConfig = {
    provider: "merge-gateway.embedding",
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch,
  };

  const createChatModel = (
    modelId: string,
    settings: MergeGatewayChatSettings = {},
  ) =>
    new MergeGatewayChatLanguageModelV5(
      new MergeGatewayChatLanguageModel(
        modelId,
        settings,
        chatConfig,
      ) as unknown as InnerChatModel,
    );

  const createEmbeddingModel = (
    modelId: string,
    settings: MergeGatewayEmbeddingSettings = {},
  ) =>
    new MergeGatewayEmbeddingModelV5(
      new MergeGatewayEmbeddingModel(
        modelId,
        settings,
        embeddingConfig,
      ) as unknown as InnerEmbeddingModel,
    );

  const provider = (
    modelId: string,
    settings?: MergeGatewayChatSettings,
  ) => createChatModel(modelId, settings);

  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.imageModel = (modelId: string): never => {
    throw new NoSuchModelError({ modelId, modelType: "imageModel" });
  };

  return provider as MergeGatewayProviderV5;
}

/**
 * Default Merge Gateway provider instance for AI SDK v5.
 * Reads MERGE_GATEWAY_API_KEY from environment.
 */
export const mergeGateway = createMergeGateway();
