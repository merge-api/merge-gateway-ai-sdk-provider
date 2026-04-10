import type { ProviderV3 } from "@ai-sdk/provider";
import { loadApiKey, withoutTrailingSlash } from "@ai-sdk/provider-utils";
import { MergeGatewayChatLanguageModel } from "./chat/index.js";
import { MergeGatewayEmbeddingModel } from "./embedding/index.js";
import type { MergeGatewayChatSettings } from "./types/merge-gateway-chat-settings.js";
import type { MergeGatewayEmbeddingSettings } from "./types/merge-gateway-embedding-settings.js";
import { VERSION } from "./version.js";

export interface MergeGatewayProviderSettings {
  /**
   * Merge Gateway API key.
   * Falls back to the MERGE_GATEWAY_API_KEY environment variable.
   */
  apiKey?: string;

  /**
   * Base URL for the AI SDK compatibility endpoints.
   * @default "https://api-gateway.merge.dev/v1/ai-sdk"
   */
  baseURL?: string;

  /** Custom headers to include in every request. */
  headers?: Record<string, string>;

  /** Custom fetch implementation for testing or middleware. */
  fetch?: typeof fetch;
}

export interface MergeGatewayProvider extends ProviderV3 {
  (
    modelId: string,
    settings?: MergeGatewayChatSettings,
  ): MergeGatewayChatLanguageModel;

  languageModel(
    modelId: string,
    settings?: MergeGatewayChatSettings,
  ): MergeGatewayChatLanguageModel;

  chat(
    modelId: string,
    settings?: MergeGatewayChatSettings,
  ): MergeGatewayChatLanguageModel;

  textEmbeddingModel(
    modelId: string,
    settings?: MergeGatewayEmbeddingSettings,
  ): MergeGatewayEmbeddingModel;
}

export type MergeGatewayChatConfig = {
  provider: string;
  headers: () => Record<string, string | undefined>;
  url: (options: { path: string }) => string;
  fetch?: typeof fetch;
};

export type MergeGatewayEmbeddingConfig = {
  provider: string;
  headers: () => Record<string, string | undefined>;
  url: (options: { path: string }) => string;
  fetch?: typeof fetch;
};

/**
 * Create a Merge Gateway provider instance for the Vercel AI SDK.
 *
 * @example
 * ```ts
 * import { createMergeGateway } from "@merge-api/ai-sdk-provider";
 * import { generateText } from "ai";
 *
 * const gateway = createMergeGateway({
 *   apiKey: process.env.MERGE_GATEWAY_API_KEY,
 * });
 *
 * const { text } = await generateText({
 *   model: gateway("openai/gpt-4o"),
 *   prompt: "Hello!",
 * });
 * ```
 */
export function createMergeGateway(
  options: MergeGatewayProviderSettings = {},
): MergeGatewayProvider {
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

  const getChatConfig = (): MergeGatewayChatConfig => ({
    provider: "merge-gateway.chat",
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch,
  });

  const getEmbeddingConfig = (): MergeGatewayEmbeddingConfig => ({
    provider: "merge-gateway.embedding",
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch,
  });

  const createChatModel = (
    modelId: string,
    settings: MergeGatewayChatSettings = {},
  ) => new MergeGatewayChatLanguageModel(modelId, settings, getChatConfig());

  const createEmbeddingModel = (
    modelId: string,
    settings: MergeGatewayEmbeddingSettings = {},
  ) =>
    new MergeGatewayEmbeddingModel(modelId, settings, getEmbeddingConfig());

  const provider = (
    modelId: string,
    settings?: MergeGatewayChatSettings,
  ) => createChatModel(modelId, settings);

  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.textEmbeddingModel = createEmbeddingModel;

  return provider as MergeGatewayProvider;
}

/**
 * Default Merge Gateway provider instance.
 * Reads MERGE_GATEWAY_API_KEY from environment.
 */
export const mergeGateway = createMergeGateway();
