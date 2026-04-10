import { describe, it, expect } from "vitest";
import { convertToGatewayMessages } from "../src/chat/convert-to-gateway-messages";
import type { LanguageModelV3Prompt } from "@ai-sdk/provider";

describe("convertToGatewayMessages", () => {
  it("converts system message", () => {
    const prompt: LanguageModelV3Prompt = [
      { role: "system", content: "You are helpful." },
    ];
    const result = convertToGatewayMessages(prompt);
    expect(result).toEqual([{ role: "system", content: "You are helpful." }]);
  });

  it("converts single text user message to plain string", () => {
    const prompt: LanguageModelV3Prompt = [
      { role: "user", content: [{ type: "text", text: "Hello!" }] },
    ];
    const result = convertToGatewayMessages(prompt);
    expect(result).toEqual([{ role: "user", content: "Hello!" }]);
  });

  it("converts multi-part user message to array", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: "user",
        content: [
          { type: "text", text: "What is this?" },
          { type: "text", text: "Tell me more." },
        ],
      },
    ];
    const result = convertToGatewayMessages(prompt);
    expect(result).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "What is this?" },
          { type: "text", text: "Tell me more." },
        ],
      },
    ]);
  });

  it("converts assistant text message", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: "assistant",
        content: [{ type: "text", text: "I can help with that." }],
      },
    ];
    const result = convertToGatewayMessages(prompt);
    expect(result).toEqual([
      { role: "assistant", content: "I can help with that." },
    ]);
  });

  it("converts assistant message with tool calls", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call_123",
            toolName: "get_weather",
            input: { location: "SF" },
          },
        ],
      },
    ];
    const result = convertToGatewayMessages(prompt);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("assistant");
    expect(result[0].content).toBeNull();
    expect(result[0].tool_calls).toHaveLength(1);
    expect(result[0].tool_calls![0]).toEqual({
      id: "call_123",
      type: "function",
      function: {
        name: "get_weather",
        arguments: '{"location":"SF"}',
      },
    });
  });

  it("converts assistant message with text and tool calls", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check." },
          {
            type: "tool-call",
            toolCallId: "call_456",
            toolName: "search",
            input: { query: "test" },
          },
        ],
      },
    ];
    const result = convertToGatewayMessages(prompt);
    expect(result[0].content).toBe("Let me check.");
    expect(result[0].tool_calls).toHaveLength(1);
  });

  it("converts tool result messages", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_123",
            toolName: "get_weather",
            result: { temp: 72, unit: "F" },
          },
        ],
      },
    ];
    const result = convertToGatewayMessages(prompt);
    expect(result).toEqual([
      {
        role: "tool",
        content: '{"temp":72,"unit":"F"}',
        tool_call_id: "call_123",
      },
    ]);
  });

  it("converts tool result with string output", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_789",
            toolName: "echo",
            result: "hello world",
          },
        ],
      },
    ];
    const result = convertToGatewayMessages(prompt);
    expect(result[0].content).toBe("hello world");
  });

  it("converts a full multi-turn conversation", () => {
    const prompt: LanguageModelV3Prompt = [
      { role: "system", content: "You are a weather assistant." },
      { role: "user", content: [{ type: "text", text: "Weather in SF?" }] },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "get_weather",
            input: { city: "San Francisco" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_1",
            toolName: "get_weather",
            result: { temp: 65, condition: "foggy" },
          },
        ],
      },
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "It's 65F and foggy in San Francisco.",
          },
        ],
      },
    ];
    const result = convertToGatewayMessages(prompt);
    expect(result).toHaveLength(5);
    expect(result[0].role).toBe("system");
    expect(result[1].role).toBe("user");
    expect(result[2].role).toBe("assistant");
    expect(result[2].tool_calls).toHaveLength(1);
    expect(result[3].role).toBe("tool");
    expect(result[4].role).toBe("assistant");
    expect(result[4].content).toBe(
      "It's 65F and foggy in San Francisco.",
    );
  });

  it("handles image content as image_url", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: "user",
        content: [
          { type: "text", text: "What is this image?" },
          {
            type: "file",
            data: "https://example.com/image.jpg",
            mimeType: "image/jpeg",
          },
        ],
      },
    ];
    const result = convertToGatewayMessages(prompt);
    expect(result[0].content).toBeInstanceOf(Array);
    const parts = result[0].content as Array<Record<string, unknown>>;
    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({ type: "text", text: "What is this image?" });
    expect(parts[1]).toEqual({
      type: "image_url",
      image_url: { url: "https://example.com/image.jpg" },
    });
  });

  it("handles base64 image content", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: "user",
        content: [
          {
            type: "file",
            data: "iVBORw0KGgo=",
            mimeType: "image/png",
          },
        ],
      },
    ];
    const result = convertToGatewayMessages(prompt);
    const parts = result[0].content as Array<Record<string, unknown>>;
    expect(parts[0]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,iVBORw0KGgo=" },
    });
  });

  it("skips reasoning parts in assistant messages", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "Let me think..." },
          { type: "text", text: "The answer is 42." },
        ],
      },
    ];
    const result = convertToGatewayMessages(prompt);
    expect(result[0].content).toBe("The answer is 42.");
  });
});
