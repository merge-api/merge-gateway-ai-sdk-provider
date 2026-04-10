import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3FunctionTool,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
  SharedV3Headers,
  SharedV3ProviderMetadata,
  SharedV3Warning,
} from "@ai-sdk/provider";
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
} from "@ai-sdk/provider-utils";
import type { MergeGatewayChatConfig } from "../merge-gateway-provider.js";
import type { MergeGatewayChatSettings } from "../types/merge-gateway-chat-settings.js";
import type { MergeGatewayProviderOptions } from "../types/merge-gateway-provider-options.js";
import { computeTokenUsage, emptyUsage } from "../utils/compute-token-usage.js";
import { mapFinishReason } from "../utils/map-finish-reason.js";
import { mergeGatewayFailedResponseHandler } from "../schemas/error-response.js";
import { convertToGatewayMessages } from "./convert-to-gateway-messages.js";
import { getToolChoice } from "./get-tool-choice.js";
import {
  chatCompletionResponseSchema,
  chatCompletionChunkSchema,
} from "./schemas.js";

export class MergeGatewayChatLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = "v3" as const;
  readonly provider: string;
  readonly modelId: string;
  readonly defaultObjectGenerationMode = "tool" as const;

  readonly settings: MergeGatewayChatSettings;
  private readonly config: MergeGatewayChatConfig;

  constructor(
    modelId: string,
    settings: MergeGatewayChatSettings,
    config: MergeGatewayChatConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
    this.provider = config.provider;
  }

  private getArgs({
    prompt,
    maxOutputTokens,
    temperature,
    topP,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    responseFormat,
    tools,
    toolChoice,
    seed,
    providerOptions,
  }: LanguageModelV3CallOptions) {
    const gatewayOptions = (providerOptions?.mergeGateway ?? {}) as MergeGatewayProviderOptions;

    const baseArgs: Record<string, unknown> = {
      model: this.modelId,
      messages: convertToGatewayMessages(prompt),

      // Standard parameters
      max_tokens: maxOutputTokens,
      temperature,
      top_p: topP,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      stop: stopSequences,
      seed,

      // Response format
      response_format:
        responseFormat?.type === "json"
          ? responseFormat.schema != null
            ? {
                type: "json_schema",
                json_schema: {
                  schema: responseFormat.schema,
                  strict: true,
                  name: responseFormat.name ?? "response",
                  ...(responseFormat.description && {
                    description: responseFormat.description,
                  }),
                },
              }
            : { type: "json_object" }
          : undefined,

      // Gateway-specific options (from providerOptions.mergeGateway)
      ...(gatewayOptions.tags && { tags: gatewayOptions.tags }),
      ...(gatewayOptions.vendor && { vendor: gatewayOptions.vendor }),
      ...(gatewayOptions.vendors && { vendors: gatewayOptions.vendors }),
      ...(gatewayOptions.projectId && {
        project_id: gatewayOptions.projectId,
      }),
      ...(gatewayOptions.includeRoutingMetadata && {
        include_routing_metadata: true,
      }),
      ...(gatewayOptions.thinking && {
        thinking: {
          type: gatewayOptions.thinking.type,
          budget_tokens: gatewayOptions.thinking.budgetTokens,
        },
      }),

      // Per-model settings
      ...(this.settings.user && { user: this.settings.user }),
    };

    if (tools && tools.length > 0) {
      const mappedTools = tools
        .filter(
          (tool): tool is LanguageModelV3FunctionTool =>
            tool.type === "function",
        )
        .map((tool) => ({
          type: "function" as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        }));

      return {
        ...baseArgs,
        tools: mappedTools,
        tool_choice: toolChoice
          ? getToolChoice(toolChoice)
          : undefined,
      };
    }

    return baseArgs;
  }

  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<{
    content: Array<LanguageModelV3Content>;
    finishReason: LanguageModelV3FinishReason;
    usage: LanguageModelV3Usage;
    warnings: Array<SharedV3Warning>;
    providerMetadata?: SharedV3ProviderMetadata;
    request?: { body?: unknown };
    response?: { headers?: SharedV3Headers; body?: unknown };
  }> {
    const args = this.getArgs(options);

    const { value: response, responseHeaders } = await postJsonToApi({
      url: this.config.url({ path: "/chat/completions" }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: mergeGatewayFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        chatCompletionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const choice = response.choices[0];
    if (!choice) {
      return {
        content: [],
        finishReason: "unknown",
        usage: emptyUsage(),
        warnings: [],
        request: { body: args },
        response: { headers: responseHeaders, body: response },
      };
    }

    // Build content array
    const content: Array<LanguageModelV3Content> = [];

    // Reasoning/thinking content
    if (choice.message.thinking) {
      content.push({
        type: "reasoning",
        text: choice.message.thinking,
      });
    }

    // Text content
    if (choice.message.content) {
      content.push({
        type: "text",
        text: choice.message.content,
      });
    }

    // Tool calls
    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        content.push({
          type: "tool-call",
          toolCallId: tc.id,
          toolName: tc.function.name,
          args: tc.function.arguments,
        });
      }
    }

    const usage = response.usage
      ? computeTokenUsage(response.usage)
      : emptyUsage();

    // Build provider metadata (includes routing info if requested)
    const providerMetadata: SharedV3ProviderMetadata = {
      mergeGateway: {
        responseId: response.id,
      },
    };

    return {
      content,
      finishReason: mapFinishReason(choice.finish_reason),
      usage,
      warnings: [],
      providerMetadata,
      request: { body: args },
      response: {
        headers: responseHeaders,
        body: response,
      },
    };
  }

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<{
    stream: ReadableStream<LanguageModelV3StreamPart>;
    warnings: Array<SharedV3Warning>;
    request?: { body?: unknown };
    response?: { headers?: SharedV3Headers; body?: unknown };
  }> {
    const args = this.getArgs(options);

    const { value: response, responseHeaders } = await postJsonToApi({
      url: this.config.url({ path: "/chat/completions" }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: { ...args, stream: true },
      failedResponseHandler: mergeGatewayFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        chatCompletionChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    // Track state across stream chunks
    const toolCalls: Map<
      number,
      { id: string; name: string; arguments: string }
    > = new Map();
    let finishReason: LanguageModelV3FinishReason = "unknown";
    let usage: LanguageModelV3Usage = emptyUsage();

    return {
      stream: response.pipeThrough(
        new TransformStream<
          { success: boolean; value?: Record<string, unknown>; error?: unknown },
          LanguageModelV3StreamPart
        >({
          transform(chunk, controller) {
            if (!chunk.success) {
              controller.enqueue({ type: "error", error: chunk.error });
              return;
            }

            const value = chunk.value as Record<string, unknown>;
            const choices = value.choices as Array<Record<string, unknown>> | undefined;
            if (!choices || choices.length === 0) return;

            const choice = choices[0] as Record<string, unknown>;
            const delta = choice.delta as Record<string, unknown> | undefined;

            if (!delta) return;

            // Response metadata (model info)
            if (value.model) {
              controller.enqueue({
                type: "response-metadata",
                modelId: value.model as string,
              });
            }

            // Text content
            const textContent = delta.content as string | null | undefined;
            if (textContent) {
              controller.enqueue({
                type: "text-delta",
                textDelta: textContent,
              });
            }

            // Thinking/reasoning content
            const thinkingContent = delta.thinking as string | null | undefined;
            if (thinkingContent) {
              controller.enqueue({
                type: "reasoning",
                text: thinkingContent,
              });
            }

            // Tool calls
            const deltaToolCalls = delta.tool_calls as
              | Array<Record<string, unknown>>
              | null
              | undefined;
            if (deltaToolCalls) {
              for (const tc of deltaToolCalls) {
                const index = (tc.index as number) ?? 0;
                const tcFunction = tc.function as Record<string, unknown> | undefined;

                if (!toolCalls.has(index)) {
                  // New tool call
                  const id = (tc.id as string) ?? "";
                  const name = tcFunction?.name as string ?? "";
                  toolCalls.set(index, { id, name, arguments: "" });

                  controller.enqueue({
                    type: "tool-call-streaming-start",
                    toolCallId: id,
                    toolName: name,
                  });
                }

                // Accumulate arguments
                const argsDelta = tcFunction?.arguments as string | undefined;
                if (argsDelta) {
                  const existing = toolCalls.get(index)!;
                  existing.arguments += argsDelta;

                  controller.enqueue({
                    type: "tool-call-delta",
                    toolCallId: existing.id,
                    argsTextDelta: argsDelta,
                  });
                }
              }
            }

            // Finish reason
            const chunkFinishReason = choice.finish_reason as string | null | undefined;
            if (chunkFinishReason) {
              finishReason = mapFinishReason(chunkFinishReason);

              // Emit complete tool calls
              for (const [, tc] of toolCalls) {
                controller.enqueue({
                  type: "tool-call",
                  toolCallId: tc.id,
                  toolName: tc.name,
                  args: tc.arguments,
                });
              }
            }

            // Usage (typically on the final chunk)
            const chunkUsage = (value.usage ?? (choice as Record<string, unknown>).usage) as
              | Record<string, number>
              | null
              | undefined;
            if (chunkUsage) {
              usage = computeTokenUsage(chunkUsage);
            }
          },
          flush(controller) {
            controller.enqueue({
              type: "finish",
              finishReason,
              usage,
            });
          },
        }),
      ),
      warnings: [],
      request: { body: args },
      response: {
        headers: responseHeaders,
      },
    };
  }
}
