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
