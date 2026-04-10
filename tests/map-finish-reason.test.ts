import { describe, it, expect } from "vitest";
import { mapFinishReason } from "../src/utils/map-finish-reason";

describe("mapFinishReason", () => {
  it("maps 'stop' to unified stop", () => {
    const result = mapFinishReason("stop");
    expect(result.unified).toBe("stop");
    expect(result.raw).toBe("stop");
  });

  it("maps 'length' to unified length", () => {
    const result = mapFinishReason("length");
    expect(result.unified).toBe("length");
    expect(result.raw).toBe("length");
  });

  it("maps 'max_tokens' to unified length", () => {
    const result = mapFinishReason("max_tokens");
    expect(result.unified).toBe("length");
    expect(result.raw).toBe("max_tokens");
  });

  it("maps 'tool_calls' to unified tool-calls", () => {
    const result = mapFinishReason("tool_calls");
    expect(result.unified).toBe("tool-calls");
  });

  it("maps 'tool_use' to unified tool-calls", () => {
    const result = mapFinishReason("tool_use");
    expect(result.unified).toBe("tool-calls");
  });

  it("maps 'content_filter' to unified content-filter", () => {
    const result = mapFinishReason("content_filter");
    expect(result.unified).toBe("content-filter");
  });

  it("maps null to unified other with undefined raw", () => {
    const result = mapFinishReason(null);
    expect(result.unified).toBe("other");
    expect(result.raw).toBeUndefined();
  });

  it("maps undefined to unified other with undefined raw", () => {
    const result = mapFinishReason(undefined);
    expect(result.unified).toBe("other");
    expect(result.raw).toBeUndefined();
  });

  it("maps unknown string to unified other", () => {
    const result = mapFinishReason("some_other_reason");
    expect(result.unified).toBe("other");
    expect(result.raw).toBe("some_other_reason");
  });
});
