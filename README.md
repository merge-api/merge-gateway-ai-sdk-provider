# merge-gateway-ai-sdk-provider

Merge Gateway provider for the [Vercel AI SDK](https://ai-sdk.dev). Route requests to OpenAI, Anthropic, Google, and more through a single provider with built-in failover, intelligent routing, and cost optimization.

## Installation

```bash
npm install merge-gateway-ai-sdk-provider ai
```

## Quick start

```typescript
import { createMergeGateway } from "merge-gateway-ai-sdk-provider";
import { generateText } from "ai";

const gateway = createMergeGateway({
  apiKey: process.env.MERGE_GATEWAY_API_KEY,
});

const { text } = await generateText({
  model: gateway("openai/gpt-4o"),
  prompt: "Hello!",
});

console.log(text);
```

## Two ways to integrate

### Native provider (recommended)

Install `merge-gateway-ai-sdk-provider` for typed Gateway features:

```typescript
import { createMergeGateway } from "merge-gateway-ai-sdk-provider";

const gateway = createMergeGateway({
  apiKey: process.env.MERGE_GATEWAY_API_KEY,
});
```

### URL shim (zero install)

If you already have `@ai-sdk/openai`, point it at the Gateway:

```typescript
import { createOpenAI } from "@ai-sdk/openai";

const gateway = createOpenAI({
  apiKey: process.env.MERGE_GATEWAY_API_KEY,
  baseURL: "https://api-gateway.merge.dev/v1/ai-sdk",
});
```

Both approaches hit the same endpoints. The native provider adds typed `providerOptions` for Gateway features.

## Text generation

```typescript
import { generateText } from "ai";

const { text } = await generateText({
  model: gateway("openai/gpt-4o"),
  prompt: "Explain recursion with examples.",
});
```

## Streaming

```typescript
import { streamText } from "ai";

const result = streamText({
  model: gateway("anthropic/claude-sonnet-4-20250514"),
  prompt: "Write a short story about an otter.",
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

## Embeddings

```typescript
import { embedMany } from "ai";

const { embeddings } = await embedMany({
  model: gateway.textEmbeddingModel("openai/text-embedding-3-small"),
  values: ["hello", "world"],
});
```

## Gateway features

The native provider exposes Gateway-specific features via `providerOptions.mergeGateway`:

### Tags

Categorize requests for filtering, cost tracking, and routing policy overrides:

```typescript
const { text } = await generateText({
  model: gateway("openai/gpt-4o"),
  prompt: "Hello!",
  providerOptions: {
    mergeGateway: {
      tags: [
        { key: "env", value: "production" },
        { key: "team", value: "data-science" },
      ],
    },
  },
});
```

### Vendor routing

Control which execution host handles the request:

```typescript
const { text } = await generateText({
  model: gateway("anthropic/claude-sonnet-4-20250514"),
  prompt: "Hello!",
  providerOptions: {
    mergeGateway: {
      vendor: "bedrock", // Force AWS Bedrock
      // Or: vendors: ["bedrock", "anthropic"] for ordered preference
    },
  },
});
```

### Project association

Track cost and usage per project:

```typescript
const { text } = await generateText({
  model: gateway("openai/gpt-4o"),
  prompt: "Hello!",
  providerOptions: {
    mergeGateway: {
      projectId: "proj_abc123",
    },
  },
});
```

### Extended thinking

Enable reasoning/thinking for supported models:

```typescript
const { text } = await generateText({
  model: gateway("anthropic/claude-sonnet-4-20250514"),
  prompt: "What is 15 * 23? Show your work.",
  providerOptions: {
    mergeGateway: {
      thinking: { type: "enabled", budgetTokens: 10000 },
    },
  },
});
```

### Reasoning effort

Select a named reasoning level for models that expose effort controls:

```typescript
const { text } = await generateText({
  model: gateway("openai/gpt-5.6-sol"),
  prompt: "Solve this carefully.",
  providerOptions: {
    mergeGateway: {
      reasoningEffort: "high",
    },
  },
});
```

### Routing metadata

Get details about routing decisions, cost, and latency:

```typescript
const { text, providerMetadata } = await generateText({
  model: gateway("openai/gpt-4o"),
  prompt: "Hello!",
  providerOptions: {
    mergeGateway: {
      includeRoutingMetadata: true,
    },
  },
});

const routing = providerMetadata?.mergeGateway?.routing;
console.log(routing?.model_used);    // "gpt-4o"
console.log(routing?.vendor_used);   // "openai"
console.log(routing?.cost_usd);      // 0.003
console.log(routing?.strategy);      // "fallback"
```

## Tool calling

Tools work the same as with any AI SDK provider:

```typescript
import { generateText, tool } from "ai";
import { z } from "zod";

const { text, toolCalls } = await generateText({
  model: gateway("openai/gpt-4o"),
  prompt: "What's the weather in San Francisco?",
  tools: {
    getWeather: tool({
      description: "Get the current weather for a city",
      parameters: z.object({
        city: z.string(),
      }),
      execute: async ({ city }) => `Sunny and 65F in ${city}`,
    }),
  },
});
```

## Structured output

`generateObject` / `streamObject` map to the gateway's native `json_schema`
structured output. Schemas pass through untouched — nested objects, `$defs`,
`anyOf`, and optional fields all reach the provider as you wrote them.

```typescript
import { generateObject } from "ai";
import { z } from "zod";

const { object } = await generateObject({
  model: gateway("openai/gpt-4o"),
  prompt: "Invent a person",
  schema: z.object({
    name: z.string(),
    age: z.number(),
    occupation: z.string(),
  }),
});
```

### Controlling `strict`

The `strict` flag defaults to `true`. Schemas with optional fields, unions
(`anyOf`), or open objects are rejected by OpenAI-style strict mode — turn it
off per call (or per model via `gateway(modelId, { strictJsonSchema: false })`):

```typescript
const { object } = await generateObject({
  model: gateway("openai/gpt-4o"),
  prompt: "Invent a person with an email or phone contact",
  schema: z.object({
    name: z.string(),
    age: z.number().optional(),
    contact: z.union([
      z.object({ kind: z.literal("email"), address: z.string() }),
      z.object({ kind: z.literal("phone"), number: z.string() }),
    ]),
  }),
  providerOptions: { mergeGateway: { strictJsonSchema: false } },
});
```

If a routed model can't honor the schema, the gateway fails loudly with a
`400 unsupported_params` (surfaced as an `APICallError`) — never a silent
fallback to best-effort JSON.

## AI SDK v5

AI SDK v5 (`ai@5`) uses provider spec v2 and cannot load the default entry
point. Import from `merge-gateway-ai-sdk-provider/v5` instead — same
implementation and options, wrapped in a v2 adapter:

```typescript
import { createMergeGateway } from "merge-gateway-ai-sdk-provider/v5";
```

| AI SDK major | Import |
|--------------|--------|
| `ai@6` | `merge-gateway-ai-sdk-provider` |
| `ai@5` | `merge-gateway-ai-sdk-provider/v5` |
| `ai@4` | not supported — use the [URL shim](#url-shim-zero-install) |

## API reference

### `createMergeGateway(options?)`

Creates a Merge Gateway provider instance.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | `MERGE_GATEWAY_API_KEY` env | Merge Gateway API key |
| `baseURL` | `string` | `https://api-gateway.merge.dev/v1/ai-sdk` | Base URL for AI SDK endpoints |
| `headers` | `Record<string, string>` | — | Custom headers for every request |
| `fetch` | `typeof fetch` | — | Custom fetch implementation |

### Provider methods

| Method | Returns | Description |
|--------|---------|-------------|
| `gateway(modelId)` | `MergeGatewayChatLanguageModel` | Create a chat model |
| `gateway.chat(modelId)` | `MergeGatewayChatLanguageModel` | Create a chat model (explicit) |
| `gateway.textEmbeddingModel(modelId)` | `MergeGatewayEmbeddingModel` | Create an embedding model |

### `MergeGatewayProviderOptions`

Passed via `providerOptions.mergeGateway`:

| Option | Type | Description |
|--------|------|-------------|
| `tags` | `Array<{ key: string; value: string }>` | Request categorization tags |
| `projectId` | `string` | Project ID for cost tracking |
| `vendor` | `string` | Single vendor preference |
| `vendors` | `string[]` | Ordered vendor preference list |
| `includeRoutingMetadata` | `boolean` | Include routing metadata in response |
| `reasoningEffort` | `"none" \| "minimal" \| "low" \| "medium" \| "high" \| "xhigh" \| "max"` | Named reasoning effort level |
| `thinking` | `{ type: "enabled" \| "disabled"; budgetTokens: number }` | Extended thinking config |
| `strictJsonSchema` | `boolean` | `strict` flag for `json_schema` structured output (default `true`; set `false` for schemas with optional fields/unions) |

## License

MIT
