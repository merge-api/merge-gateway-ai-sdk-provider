import { describe, it, expect, vi } from "vitest";
import { MergeGatewayChatLanguageModel } from "../src/chat/index";
import type { MergeGatewayChatConfig } from "../src/merge-gateway-provider";

function createTestModel(
  fetchMock: typeof fetch,
): MergeGatewayChatLanguageModel {
  const config: MergeGatewayChatConfig = {
    provider: "merge-gateway.chat",
    headers: () => ({
      Authorization: "Bearer test-key",
    }),
    url: ({ path }) => `https://test-gateway.example.com${path}`,
    fetch: fetchMock,
  };
  return new MergeGatewayChatLanguageModel("openai/gpt-4o", {}, config);
}

function mockJsonResponse(body: Record<string, unknown>, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

const BASIC_COMPLETION_RESPONSE = {
  id: "chatcmpl-test",
  object: "chat.completion",
  created: 1700000000,
  model: "gpt-4o",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: "Hello! How can I help you?",
      },
      finish_reason: "stop",
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 8,
    total_tokens: 18,
  },
};

const TOOL_CALL_RESPONSE = {
  id: "chatcmpl-tools",
  object: "chat.completion",
  created: 1700000000,
  model: "gpt-4o",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_abc",
            type: "function",
            function: {
              name: "get_weather",
              arguments: '{"city":"San Francisco"}',
            },
          },
        ],
      },
      finish_reason: "tool_calls",
    },
  ],
  usage: {
    prompt_tokens: 15,
    completion_tokens: 12,
    total_tokens: 27,
  },
};

const THINKING_RESPONSE = {
  id: "chatcmpl-think",
  object: "chat.completion",
  created: 1700000000,
  model: "claude-sonnet-4-20250514",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: "The answer is 42.",
        thinking: "Let me reason about this step by step...",
      },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 },
};

describe("MergeGatewayChatLanguageModel.doGenerate", () => {
  it("returns text content for a basic completion", async () => {
    const fetchMock = mockJsonResponse(BASIC_COMPLETION_RESPONSE);
    const model = createTestModel(fetchMock);

    const result = await model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      inputFormat: "prompt",
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({
      type: "text",
      text: "Hello! How can I help you?",
    });
    expect(result.finishReason.unified).toBe("stop");
    expect(result.usage.inputTokens.total).toBe(10);
    expect(result.usage.outputTokens.total).toBe(8);
    expect(result.warnings).toEqual([]);
  });

  it("returns tool call content", async () => {
    const fetchMock = mockJsonResponse(TOOL_CALL_RESPONSE);
    const model = createTestModel(fetchMock);

    const result = await model.doGenerate({
      prompt: [
        {
          role: "user",
          content: [{ type: "text", text: "What's the weather?" }],
        },
      ],
      inputFormat: "prompt",
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({
      type: "tool-call",
      toolCallId: "call_abc",
      toolName: "get_weather",
      input: '{"city":"San Francisco"}',
    });
    expect(result.finishReason.unified).toBe("tool-calls");
  });

  it("returns reasoning content when thinking is present", async () => {
    const fetchMock = mockJsonResponse(THINKING_RESPONSE);
    const model = createTestModel(fetchMock);

    const result = await model.doGenerate({
      prompt: [
        { role: "user", content: [{ type: "text", text: "Think deeply" }] },
      ],
      inputFormat: "prompt",
    });

    expect(result.content).toHaveLength(2);
    expect(result.content[0]).toEqual({
      type: "reasoning",
      text: "Let me reason about this step by step...",
    });
    expect(result.content[1]).toEqual({
      type: "text",
      text: "The answer is 42.",
    });
  });

  it("sends Gateway options from providerOptions", async () => {
    const fetchMock = mockJsonResponse(BASIC_COMPLETION_RESPONSE);
    const model = createTestModel(fetchMock);

    await model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      inputFormat: "prompt",
      providerOptions: {
        mergeGateway: {
          tags: [{ key: "env", value: "test" }],
          vendor: "anthropic",
          vendors: ["anthropic", "bedrock"],
          projectId: "proj_123",
          includeRoutingMetadata: true,
          thinking: { type: "enabled", budgetTokens: 5000 },
        },
      },
    });

    // Verify the fetch was called with the right body
    const fetchCall = fetchMock.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.tags).toEqual([{ key: "env", value: "test" }]);
    expect(body.vendor).toBe("anthropic");
    expect(body.vendors).toEqual(["anthropic", "bedrock"]);
    expect(body.project_id).toBe("proj_123");
    expect(body.include_routing_metadata).toBe(true);
    expect(body.thinking).toEqual({ type: "enabled", budget_tokens: 5000 });
  });

  it("sends tools in OpenAI format", async () => {
    const fetchMock = mockJsonResponse(TOOL_CALL_RESPONSE);
    const model = createTestModel(fetchMock);

    await model.doGenerate({
      prompt: [
        {
          role: "user",
          content: [{ type: "text", text: "Weather?" }],
        },
      ],
      inputFormat: "prompt",
      tools: [
        {
          type: "function",
          name: "get_weather",
          description: "Get weather for a city",
          inputSchema: {
            type: "object",
            properties: {
              city: { type: "string" },
            },
            required: ["city"],
          },
        },
      ],
    });

    const fetchCall = fetchMock.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0]).toEqual({
      type: "function",
      function: {
        name: "get_weather",
        description: "Get weather for a city",
        parameters: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
      },
    });
  });

  it("includes response metadata", async () => {
    const fetchMock = mockJsonResponse(BASIC_COMPLETION_RESPONSE);
    const model = createTestModel(fetchMock);

    const result = await model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      inputFormat: "prompt",
    });

    expect(result.providerMetadata?.mergeGateway).toBeDefined();
    expect(result.response?.id).toBe("chatcmpl-test");
    expect(result.response?.modelId).toBe("gpt-4o");
  });

  it("handles empty choices gracefully", async () => {
    const fetchMock = mockJsonResponse({
      ...BASIC_COMPLETION_RESPONSE,
      choices: [],
    });
    const model = createTestModel(fetchMock);

    const result = await model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      inputFormat: "prompt",
    });

    expect(result.content).toEqual([]);
    expect(result.finishReason.unified).toBe("other");
  });

  it("sends request to /chat/completions path", async () => {
    const fetchMock = mockJsonResponse(BASIC_COMPLETION_RESPONSE);
    const model = createTestModel(fetchMock);

    await model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      inputFormat: "prompt",
    });

    const fetchCall = fetchMock.mock.calls[0];
    expect(fetchCall[0]).toBe(
      "https://test-gateway.example.com/chat/completions",
    );
  });
});

describe("MergeGatewayChatLanguageModel responseFormat", () => {
  const NESTED_SCHEMA = {
    type: "object",
    properties: {
      person: { $ref: "#/$defs/Person" },
      note: { anyOf: [{ type: "string" }, { type: "null" }] },
    },
    required: ["person"],
    additionalProperties: false,
    $defs: {
      Person: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
  };

  async function dispatchedBody(
    options: Record<string, unknown>,
    settings: Record<string, unknown> = {},
  ) {
    const fetchMock = mockJsonResponse(BASIC_COMPLETION_RESPONSE);
    const config: MergeGatewayChatConfig = {
      provider: "merge-gateway.chat",
      headers: () => ({ Authorization: "Bearer test-key" }),
      url: ({ path }) => `https://test-gateway.example.com${path}`,
      fetch: fetchMock,
    };
    const model = new MergeGatewayChatLanguageModel(
      "openai/gpt-4o",
      settings,
      config,
    );
    await model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      inputFormat: "prompt",
      ...options,
    } as never);
    const fetchCall = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    return JSON.parse(fetchCall[1].body);
  }

  it("maps schema-less json responseFormat to json_object", async () => {
    const body = await dispatchedBody({ responseFormat: { type: "json" } });
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("passes a nested schema through byte-identical with strict true by default", async () => {
    const body = await dispatchedBody({
      responseFormat: {
        type: "json",
        schema: NESTED_SCHEMA,
        name: "person_reply",
        description: "a person",
      },
    });
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        schema: NESTED_SCHEMA,
        strict: true,
        name: "person_reply",
        description: "a person",
      },
    });
  });

  it("providerOptions strictJsonSchema false wins over the default", async () => {
    const body = await dispatchedBody({
      responseFormat: { type: "json", schema: NESTED_SCHEMA },
      providerOptions: { mergeGateway: { strictJsonSchema: false } },
    });
    expect(body.response_format.json_schema.strict).toBe(false);
  });

  it("settings-level strictJsonSchema false applies, per-call option wins", async () => {
    const fromSettings = await dispatchedBody(
      { responseFormat: { type: "json", schema: NESTED_SCHEMA } },
      { strictJsonSchema: false },
    );
    expect(fromSettings.response_format.json_schema.strict).toBe(false);

    const perCallWins = await dispatchedBody(
      {
        responseFormat: { type: "json", schema: NESTED_SCHEMA },
        providerOptions: { mergeGateway: { strictJsonSchema: true } },
      },
      { strictJsonSchema: false },
    );
    expect(perCallWins.response_format.json_schema.strict).toBe(true);
  });

  it("prepends type object to a Zod-v4-style schema missing the root type", async () => {
    const body = await dispatchedBody({
      responseFormat: {
        type: "json",
        schema: { properties: { a: { type: "string" } }, required: ["a"] },
      },
    });
    expect(body.response_format.json_schema.schema).toEqual({
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"],
    });
  });

  it("defaults the schema name to response", async () => {
    const body = await dispatchedBody({
      responseFormat: { type: "json", schema: NESTED_SCHEMA },
    });
    expect(body.response_format.json_schema.name).toBe("response");
  });

  it("warns on topK instead of silently dropping it", async () => {
    const fetchMock = mockJsonResponse(BASIC_COMPLETION_RESPONSE);
    const model = createTestModel(fetchMock);
    const result = await model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      inputFormat: "prompt",
      topK: 40,
    } as never);
    expect(result.warnings).toEqual([
      expect.objectContaining({ type: "unsupported", feature: "topK" }),
    ]);
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body,
    );
    expect(body).not.toHaveProperty("top_k");
  });
});
