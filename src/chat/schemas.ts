import { z } from "zod";

/**
 * Zod schema for a non-streaming chat completion response from the Gateway.
 * Matches the OpenAI format that /v1/ai-sdk/chat/completions returns.
 */
export const chatCompletionResponseSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion"),
  created: z.number(),
  model: z.string(),
  choices: z.array(
    z.object({
      index: z.number(),
      message: z.object({
        role: z.string(),
        content: z.string().nullable().optional(),
        tool_calls: z
          .array(
            z.object({
              id: z.string(),
              type: z.literal("function"),
              function: z.object({
                name: z.string(),
                arguments: z.string(),
              }),
            }),
          )
          .nullable()
          .optional(),
        thinking: z.string().nullable().optional(),
      }),
      finish_reason: z.string().nullable().optional(),
    }),
  ),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    })
    .optional(),
});

/**
 * Zod schema for a streaming chat completion chunk.
 * Accepts either a valid chunk OR an error response from the backend.
 */
const chatCompletionChunkData = z
  .object({
    id: z.string(),
    object: z.literal("chat.completion.chunk"),
    created: z.number(),
    model: z.string(),
    choices: z.array(
      z.object({
        index: z.number(),
        delta: z.object({
          role: z.string().nullable().optional(),
          content: z.string().nullable().optional(),
          tool_calls: z
            .array(
              z.object({
                index: z.number().optional(),
                id: z.string().optional(),
                type: z.string().optional(),
                function: z
                  .object({
                    name: z.string().optional(),
                    arguments: z.string().optional(),
                  })
                  .optional(),
              }),
            )
            .nullable()
            .optional(),
          thinking: z.string().nullable().optional(),
        }),
        finish_reason: z.string().nullable().optional(),
      }),
    ),
    usage: z
      .object({
        prompt_tokens: z.number().optional(),
        completion_tokens: z.number().optional(),
        total_tokens: z.number().optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();

const chatCompletionErrorData = z.object({
  error: z.object({
    type: z.string().optional(),
    message: z.string(),
    status_code: z.string().optional(),
    code: z.string().optional(),
  }),
});

export const chatCompletionChunkSchema = z.union([
  chatCompletionChunkData,
  chatCompletionErrorData,
]);
