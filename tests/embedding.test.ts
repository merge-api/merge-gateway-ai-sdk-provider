import { describe, it, expect, vi } from "vitest";
import { MergeGatewayEmbeddingModel } from "../src/embedding/index";
import type { MergeGatewayEmbeddingConfig } from "../src/merge-gateway-provider";

function createTestEmbeddingModel(
  fetchMock: typeof fetch,
): MergeGatewayEmbeddingModel {
  const config: MergeGatewayEmbeddingConfig = {
    provider: "merge-gateway.embedding",
    headers: () => ({
      Authorization: "Bearer test-key",
    }),
    url: ({ path }) => `https://test-gateway.example.com${path}`,
    fetch: fetchMock,
  };
  return new MergeGatewayEmbeddingModel(
    "openai/text-embedding-3-small",
    {},
    config,
  );
}

function mockJsonResponse(body: Record<string, unknown>, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

const EMBEDDING_RESPONSE = {
  object: "list",
  data: [
    { object: "embedding", embedding: [0.1, 0.2, 0.3], index: 0 },
    { object: "embedding", embedding: [0.4, 0.5, 0.6], index: 1 },
  ],
  model: "text-embedding-3-small",
  usage: { prompt_tokens: 5, total_tokens: 5 },
};

describe("MergeGatewayEmbeddingModel.doEmbed", () => {
  it("returns embeddings for input values", async () => {
    const fetchMock = mockJsonResponse(EMBEDDING_RESPONSE);
    const model = createTestEmbeddingModel(fetchMock);

    const result = await model.doEmbed({ values: ["hello", "world"] });

    expect(result.embeddings).toHaveLength(2);
    expect(result.embeddings[0]).toEqual([0.1, 0.2, 0.3]);
    expect(result.embeddings[1]).toEqual([0.4, 0.5, 0.6]);
  });

  it("returns token usage", async () => {
    const fetchMock = mockJsonResponse(EMBEDDING_RESPONSE);
    const model = createTestEmbeddingModel(fetchMock);

    const result = await model.doEmbed({ values: ["hello"] });

    expect(result.usage).toEqual({ tokens: 5 });
  });

  it("returns warnings array", async () => {
    const fetchMock = mockJsonResponse(EMBEDDING_RESPONSE);
    const model = createTestEmbeddingModel(fetchMock);

    const result = await model.doEmbed({ values: ["hello"] });

    expect(result.warnings).toEqual([]);
  });

  it("sends request to /embeddings path", async () => {
    const fetchMock = mockJsonResponse(EMBEDDING_RESPONSE);
    const model = createTestEmbeddingModel(fetchMock);

    await model.doEmbed({ values: ["hello"] });

    const fetchCall = fetchMock.mock.calls[0];
    expect(fetchCall[0]).toBe(
      "https://test-gateway.example.com/embeddings",
    );
  });

  it("sends model and input in request body", async () => {
    const fetchMock = mockJsonResponse(EMBEDDING_RESPONSE);
    const model = createTestEmbeddingModel(fetchMock);

    await model.doEmbed({ values: ["hello", "world"] });

    const fetchCall = fetchMock.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.model).toBe("openai/text-embedding-3-small");
    expect(body.input).toEqual(["hello", "world"]);
  });

  it("sends user when configured", async () => {
    const config: MergeGatewayEmbeddingConfig = {
      provider: "merge-gateway.embedding",
      headers: () => ({ Authorization: "Bearer test-key" }),
      url: ({ path }) => `https://test-gateway.example.com${path}`,
    };
    const model = new MergeGatewayEmbeddingModel(
      "openai/text-embedding-3-small",
      { user: "test-user" },
      config,
    );
    const fetchMock = mockJsonResponse(EMBEDDING_RESPONSE);
    // Override fetch via a wrapping approach
    const configWithFetch: MergeGatewayEmbeddingConfig = {
      ...config,
      fetch: fetchMock,
    };
    const modelWithFetch = new MergeGatewayEmbeddingModel(
      "openai/text-embedding-3-small",
      { user: "test-user" },
      configWithFetch,
    );

    await modelWithFetch.doEmbed({ values: ["hello"] });

    const fetchCall = fetchMock.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.user).toBe("test-user");
  });

  it("handles response without usage", async () => {
    const responseWithoutUsage = {
      ...EMBEDDING_RESPONSE,
      usage: undefined,
    };
    const fetchMock = mockJsonResponse(responseWithoutUsage);
    const model = createTestEmbeddingModel(fetchMock);

    const result = await model.doEmbed({ values: ["hello"] });

    expect(result.usage).toBeUndefined();
  });
});
