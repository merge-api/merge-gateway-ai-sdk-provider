import { describe, it, expect } from "vitest";
import { computeTokenUsage, emptyUsage } from "../src/utils/compute-token-usage";

describe("computeTokenUsage", () => {
  it("maps prompt_tokens to inputTokens", () => {
    const usage = computeTokenUsage({ prompt_tokens: 10, completion_tokens: 5 });
    expect(usage.inputTokens.total).toBe(10);
  });

  it("maps completion_tokens to outputTokens", () => {
    const usage = computeTokenUsage({ prompt_tokens: 10, completion_tokens: 5 });
    expect(usage.outputTokens.total).toBe(5);
  });

  it("handles missing fields with defaults of 0", () => {
    const usage = computeTokenUsage({});
    expect(usage.inputTokens.total).toBe(0);
    expect(usage.outputTokens.total).toBe(0);
  });

  it("handles partial usage", () => {
    const usage = computeTokenUsage({ prompt_tokens: 15 });
    expect(usage.inputTokens.total).toBe(15);
    expect(usage.outputTokens.total).toBe(0);
  });
});

describe("emptyUsage", () => {
  it("returns zero tokens", () => {
    const usage = emptyUsage();
    expect(usage.inputTokens.total).toBe(0);
    expect(usage.outputTokens.total).toBe(0);
  });
});
