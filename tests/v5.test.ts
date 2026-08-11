import { describe, it, expect, vi } from "vitest";
import { createMergeGateway } from "../src/v5/index";

function mockJsonResponse(body: Record<string, unknown>, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function mockSseResponse(events: Array<Record<string, unknown>>) {
  const payload =
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") +
    "data: [DONE]\n\n";
  return vi.fn().mockResolvedValue(
    new Response(payload, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
  );
}

const COMPLETION_RESPONSE = {
  id: "chatcmpl-v5",
  object: "chat.completion",
  created: 1700000000,
  model: "gpt-4o",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "Hello from v5!" },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
};

function createModel(fetchMock: typeof fetch, settings = {}) {
  const gateway = createMergeGateway({
    apiKey: "test-key",
    baseURL: "https://test-gateway.example.com",
    fetch: fetchMock,
  });
  return gateway("openai/gpt-4o", settings);
}

describe("v5 entry point (LanguageModelV2 adapter)", () => {
  it("reports specification version v2 and delegates identity", () => {
    const model = createModel(mockJsonResponse(COMPLETION_RESPONSE));
    expect(model.specificationVersion).toBe("v2");
    expect(model.modelId).toBe("openai/gpt-4o");
    expect(model.provider).toBe("merge-gateway.chat");
  });

  it("doGenerate returns V2-shaped finishReason and flat usage", async () => {
    const model = createModel(mockJsonResponse(COMPLETION_RESPONSE));
    const result = await model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
    } as never);

    expect(result.finishReason).toBe("stop");
    expect(result.usage).toEqual({
      inputTokens: 10,
      outputTokens: 8,
      totalTokens: 18,
      reasoningTokens: undefined,
      cachedInputTokens: undefined,
    });
    expect(result.content).toEqual([{ type: "text", text: "Hello from v5!" }]);
    expect(result.warnings).toEqual([]);
  });

  it("converts topK warnings to the V2 unsupported-setting shape", async () => {
    const model = createModel(mockJsonResponse(COMPLETION_RESPONSE));
    const result = await model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      topK: 40,
    } as never);
    expect(result.warnings).toEqual([
      expect.objectContaining({ type: "unsupported-setting", setting: "topK" }),
    ]);
  });

  it("passes strictJsonSchema through the /v5 entry", async () => {
    const fetchMock = mockJsonResponse(COMPLETION_RESPONSE);
    const model = createModel(fetchMock);
    await model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      responseFormat: {
        type: "json",
        schema: { type: "object", properties: { a: { type: "string" } } },
      },
      providerOptions: { mergeGateway: { strictJsonSchema: false } },
    } as never);
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1]
        .body,
    );
    expect(body.response_format.json_schema.strict).toBe(false);
  });

  it("doStream emits stream-start first and a V2-shaped finish part", async () => {
    const chunkBase = {
      id: "chatcmpl-v5",
      object: "chat.completion.chunk",
      created: 1700000000,
      model: "gpt-4o",
    };
    const fetchMock = mockSseResponse([
      { ...chunkBase, choices: [{ index: 0, delta: { content: "Hel" } }] },
      { ...chunkBase, choices: [{ index: 0, delta: { content: "lo" } }] },
      {
        ...chunkBase,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
      },
    ]);
    const model = createModel(fetchMock);
    const { stream } = await model.doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
    } as never);

    const parts: Array<{ type: string } & Record<string, unknown>> = [];
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value as { type: string } & Record<string, unknown>);
    }

    expect(parts[0]).toEqual({ type: "stream-start", warnings: [] });
    const text = parts
      .filter((part) => part.type === "text-delta")
      .map((part) => part.delta)
      .join("");
    expect(text).toBe("Hello");
    const finish = parts.at(-1)!;
    expect(finish.type).toBe("finish");
    expect(finish.finishReason).toBe("stop");
    expect(finish.usage).toEqual({
      inputTokens: 5,
      outputTokens: 2,
      totalTokens: 7,
      reasoningTokens: undefined,
      cachedInputTokens: undefined,
    });
  });

  it("imageModel throws NoSuchModelError", () => {
    const gateway = createMergeGateway({
      apiKey: "test-key",
      baseURL: "https://test-gateway.example.com",
    });
    expect(() => gateway.imageModel("some-image-model")).toThrowError();
  });
});
