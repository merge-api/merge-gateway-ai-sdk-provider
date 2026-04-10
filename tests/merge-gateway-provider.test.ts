import { describe, it, expect } from "vitest";
import { createMergeGateway } from "../src/merge-gateway-provider";
import { MergeGatewayChatLanguageModel } from "../src/chat/index";
import { MergeGatewayEmbeddingModel } from "../src/embedding/index";

describe("createMergeGateway", () => {
  it("creates a provider with default settings", () => {
    // Set env var so loadApiKey doesn't throw
    process.env.MERGE_GATEWAY_API_KEY = "test-key";
    const provider = createMergeGateway();
    expect(provider).toBeDefined();
    expect(typeof provider).toBe("function");
    expect(typeof provider.chat).toBe("function");
    expect(typeof provider.textEmbeddingModel).toBe("function");
    expect(typeof provider.languageModel).toBe("function");
    delete process.env.MERGE_GATEWAY_API_KEY;
  });

  it("creates a chat model when called directly", () => {
    const provider = createMergeGateway({ apiKey: "test-key" });
    const model = provider("openai/gpt-4o");
    expect(model).toBeInstanceOf(MergeGatewayChatLanguageModel);
    expect(model.modelId).toBe("openai/gpt-4o");
    expect(model.provider).toBe("merge-gateway.chat");
    expect(model.specificationVersion).toBe("v3");
  });

  it("creates a chat model via .chat()", () => {
    const provider = createMergeGateway({ apiKey: "test-key" });
    const model = provider.chat("anthropic/claude-sonnet-4-20250514");
    expect(model).toBeInstanceOf(MergeGatewayChatLanguageModel);
    expect(model.modelId).toBe("anthropic/claude-sonnet-4-20250514");
  });

  it("creates a chat model via .languageModel()", () => {
    const provider = createMergeGateway({ apiKey: "test-key" });
    const model = provider.languageModel("google/gemini-2.0-flash");
    expect(model).toBeInstanceOf(MergeGatewayChatLanguageModel);
    expect(model.modelId).toBe("google/gemini-2.0-flash");
  });

  it("creates an embedding model via .textEmbeddingModel()", () => {
    const provider = createMergeGateway({ apiKey: "test-key" });
    const model = provider.textEmbeddingModel("openai/text-embedding-3-small");
    expect(model).toBeInstanceOf(MergeGatewayEmbeddingModel);
    expect(model.modelId).toBe("openai/text-embedding-3-small");
    expect(model.provider).toBe("merge-gateway.embedding");
    expect(model.specificationVersion).toBe("v3");
  });

  it("uses custom baseURL", () => {
    const provider = createMergeGateway({
      apiKey: "test-key",
      baseURL: "https://custom-gateway.example.com/v1/ai-sdk",
    });
    const model = provider("openai/gpt-4o");
    // The model should exist and not throw
    expect(model.modelId).toBe("openai/gpt-4o");
  });

  it("passes custom settings to chat model", () => {
    const provider = createMergeGateway({ apiKey: "test-key" });
    const model = provider.chat("openai/gpt-4o", { user: "test-user" });
    expect(model.settings.user).toBe("test-user");
  });

  it("passes custom settings to embedding model", () => {
    const provider = createMergeGateway({ apiKey: "test-key" });
    const model = provider.textEmbeddingModel("openai/text-embedding-3-small", {
      user: "test-user",
    });
    expect(model.settings.user).toBe("test-user");
  });

  it("chat model has supportedUrls property", () => {
    const provider = createMergeGateway({ apiKey: "test-key" });
    const model = provider("openai/gpt-4o");
    expect(model.supportedUrls).toBeDefined();
    expect(typeof model.supportedUrls).toBe("object");
  });

  it("embedding model has required V3 properties", () => {
    const provider = createMergeGateway({ apiKey: "test-key" });
    const model = provider.textEmbeddingModel("openai/text-embedding-3-small");
    expect(model.maxEmbeddingsPerCall).toBeUndefined();
    expect(model.supportsParallelCalls).toBe(true);
  });
});
