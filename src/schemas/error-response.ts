import { createJsonErrorResponseHandler } from "@ai-sdk/provider-utils";
import { z } from "zod";

const mergeGatewayErrorSchema = z.object({
  error: z.object({
    type: z.string().optional(),
    message: z.string(),
    code: z.string().optional(),
    param: z.string().nullable().optional(),
  }),
});

export const mergeGatewayFailedResponseHandler =
  createJsonErrorResponseHandler({
    errorSchema: mergeGatewayErrorSchema,
    errorToMessage: (error) => error.error.message,
  });
