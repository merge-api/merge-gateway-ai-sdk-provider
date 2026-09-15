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

  // Regression: AI SDK v5+ (LanguageModelV2/V3) moved the tool result from a
  // flat `result` field to `output: { type, value }`. Reading only `result`
  // silently produced an empty tool result ('""'), so the model never saw tool
  // output (e.g. OpenCode: "the directory is empty" despite a successful `ls`).
  describe("tool-result output shape (AI SDK v5+)", () => {
    it("reads output.type=text", () => {
      const prompt: LanguageModelV3Prompt = [
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "c1",
              toolName: "bash",
              output: { type: "text", value: "fizzbuzz.py\nopencode.json\n" },
            },
          ],
        },
      ];
      expect(convertToGatewayMessages(prompt)[0].content).toBe(
        "fizzbuzz.py\nopencode.json\n",
      );
    });

    it("reads output.type=json", () => {
      const prompt: LanguageModelV3Prompt = [
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "c1",
              toolName: "get_weather",
              output: { type: "json", value: { temp: 72, unit: "F" } },
            },
          ],
        },
      ];
      expect(convertToGatewayMessages(prompt)[0].content).toBe(
        '{"temp":72,"unit":"F"}',
      );
    });

    it("reads output.type=error-text", () => {
      const prompt: LanguageModelV3Prompt = [
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "c1",
              toolName: "bash",
              output: { type: "error-text", value: "command not found" },
            },
          ],
        },
      ];
      expect(convertToGatewayMessages(prompt)[0].content).toBe(
        "command not found",
      );
    });

    it("reads output.type=content (text parts joined)", () => {
      const prompt: LanguageModelV3Prompt = [
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "c1",
              toolName: "reader",
              output: {
                type: "content",
                value: [
                  { type: "text", text: "line 1" },
                  { type: "text", text: "line 2" },
                ],
              },
            },
          ],
        },
      ];
      expect(convertToGatewayMessages(prompt)[0].content).toBe("line 1\nline 2");
    });

    it("still supports the legacy v4 `result` field", () => {
      const prompt: LanguageModelV3Prompt = [
        {
          role: "tool",
          content: [
            {
              // legacy AI SDK v4 shape, retained for backward compat
              type: "tool-result",
              toolCallId: "c1",
              toolName: "echo",
              result: "hello world",
            },
          ],
        },
      ];
      expect(convertToGatewayMessages(prompt)[0].content).toBe("hello world");
    });
  });
});

describe("convertToGatewayMessages: file parts", () => {
  const PNG_BYTES = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);
  const PNG_BASE64 = "iVBORw0KGgoAAAAN";

  function userParts(part: Record<string, unknown>, warnings: any[] = []) {
    const result = convertToGatewayMessages(
      [
        {
          role: "user",
          content: [{ type: "text", text: "look" }, part as any],
        },
      ] as unknown as LanguageModelV3Prompt,
      warnings,
    );
    return result[0].content as Array<Record<string, any>>;
  }

  it("forwards an image file part addressed by mediaType (V2/V3 spelling)", () => {
    const parts = userParts({
      type: "file",
      mediaType: "image/png",
      data: PNG_BASE64,
    });
    expect(parts[1]).toEqual({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${PNG_BASE64}` },
    });
  });

  it("forwards image bytes as a base64 data URI", () => {
    const parts = userParts({
      type: "file",
      mediaType: "image/png",
      data: PNG_BYTES,
    });
    expect(parts[1].image_url.url).toBe(
      "data:image/png;base64,iVBORw0KGgoAAAAN",
    );
  });

  it("forwards a URL instance (the V3 data shape) untouched", () => {
    const parts = userParts({
      type: "file",
      mediaType: "image/jpeg",
      data: new URL("https://example.com/cat.jpg"),
    });
    expect(parts[1]).toEqual({
      type: "image_url",
      image_url: { url: "https://example.com/cat.jpg" },
    });
  });

  it("forwards a data: URI unchanged rather than re-wrapping it", () => {
    const dataUri = "data:image/webp;base64,UklGRh4AAABXRUJQ";
    const parts = userParts({ type: "file", mediaType: "image/webp", data: dataUri });
    expect(parts[1].image_url.url).toBe(dataUri);
  });

  it("forwards a PDF as the gateway's unified file block", () => {
    const parts = userParts({
      type: "file",
      mediaType: "application/pdf",
      filename: "invoice.pdf",
      data: "JVBERi0xLjQK",
    });
    expect(parts[1]).toEqual({
      type: "file",
      file: {
        file_data: "data:application/pdf;base64,JVBERi0xLjQK",
        format: "application/pdf",
        filename: "invoice.pdf",
      },
    });
  });

  it("forwards an Office document as a file block", () => {
    const mediaType =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const parts = userParts({
      type: "file",
      mediaType,
      filename: "spec.docx",
      data: "UEsDBBQABgAI",
    });
    expect(parts[1].type).toBe("file");
    expect(parts[1].file.format).toBe(mediaType);
    expect(parts[1].file.file_data).toBe(`data:${mediaType};base64,UEsDBBQABgAI`);
  });

  it("forwards a document URL without inventing a data URI", () => {
    const parts = userParts({
      type: "file",
      mediaType: "application/pdf",
      data: "https://example.com/report.pdf",
    });
    expect(parts[1].file.file_data).toBe("https://example.com/report.pdf");
  });

  it("forwards audio as input_audio with a bare format", () => {
    const parts = userParts({
      type: "file",
      mediaType: "audio/mpeg",
      data: "SUQzBAAAAAAA",
    });
    expect(parts[1]).toEqual({
      type: "input_audio",
      input_audio: { data: "SUQzBAAAAAAA", format: "mp3" },
    });
  });

  it("forwards video as a file block", () => {
    const parts = userParts({
      type: "file",
      mediaType: "video/mp4",
      data: "AAAAIGZ0eXA=",
    });
    expect(parts[1].type).toBe("file");
    expect(parts[1].file.format).toBe("video/mp4");
  });

  it("still accepts the legacy mimeType spelling", () => {
    const parts = userParts({
      type: "file",
      mimeType: "image/jpeg",
      data: "https://example.com/cat.jpg",
    });
    expect(parts[1]).toEqual({
      type: "image_url",
      image_url: { url: "https://example.com/cat.jpg" },
    });
  });

  describe("AI SDK V4 tagged data union", () => {
    it("reads { type: 'url' }", () => {
      const parts = userParts({
        type: "file",
        mediaType: "image/png",
        data: { type: "url", url: "https://example.com/a.png" },
      });
      expect(parts[1].image_url.url).toBe("https://example.com/a.png");
    });

    it("reads { type: 'data' } bytes", () => {
      const parts = userParts({
        type: "file",
        mediaType: "application/pdf",
        data: { type: "data", data: "JVBERi0xLjQK" },
      });
      expect(parts[1].file.file_data).toBe(
        "data:application/pdf;base64,JVBERi0xLjQK",
      );
    });

    it("inlines { type: 'text' } documents as text", () => {
      const parts = userParts({
        type: "file",
        mediaType: "text/plain",
        filename: "notes.txt",
        data: { type: "text", text: "hello from a file" },
      });
      expect(parts[1]).toEqual({
        type: "text",
        text: "notes.txt:\nhello from a file",
      });
    });

    it("warns instead of dropping { type: 'reference' } silently", () => {
      const warnings: any[] = [];
      const parts = userParts(
        {
          type: "file",
          mediaType: "application/pdf",
          filename: "ref.pdf",
          data: { type: "reference", reference: { openai: "file-123" } },
        },
        warnings,
      );
      expect(parts).toHaveLength(1);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe("unsupported");
      expect(warnings[0].details).toContain("ref.pdf");
    });

    it("resolves a top-level-only media type from the file signature", () => {
      const parts = userParts({
        type: "file",
        mediaType: "image",
        data: { type: "data", data: PNG_BYTES },
      });
      expect(parts[1].image_url.url).toBe(
        "data:image/png;base64,iVBORw0KGgoAAAAN",
      );
    });
  });

  it("resolves an image/* wildcard from the file signature", () => {
    const parts = userParts({
      type: "file",
      mediaType: "image/*",
      data: PNG_BASE64,
    });
    expect(parts[1].image_url.url).toBe(`data:image/png;base64,${PNG_BASE64}`);
  });

  it("resolves an unknown media type from the filename", () => {
    const parts = userParts({
      type: "file",
      mediaType: "application/*",
      filename: "deck.pptx",
      data: "UEsDBBQABgAI",
    });
    expect(parts[1].file.format).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
  });

  it("warns when a media type cannot be resolved at all", () => {
    const warnings: any[] = [];
    const parts = userParts(
      { type: "file", data: "c29tZSBieXRlcw==" },
      warnings,
    );
    expect(parts).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      type: "unsupported",
      feature: "file attachment",
    });
  });

  it("warns on an unknown user content part instead of dropping it", () => {
    const warnings: any[] = [];
    userParts({ type: "something-new", value: 1 } as any, warnings);
    expect(warnings[0]).toMatchObject({ type: "unsupported" });
    expect(warnings[0].feature).toContain("something-new");
  });

  it("encodes a multi-megabyte attachment without blowing the stack", () => {
    const big = new Uint8Array(3 * 1024 * 1024).fill(0x41);
    const parts = userParts({ type: "file", mediaType: "application/pdf", data: big });
    expect(parts[1].file.file_data.startsWith("data:application/pdf;base64,QUFB")).toBe(
      true,
    );
  });
});

describe("convertToGatewayMessages: prompt-cache hints", () => {
  const EPHEMERAL = { type: "ephemeral" };

  it("carries a message-level cache hint onto a system message", () => {
    const result = convertToGatewayMessages([
      {
        role: "system",
        content: "Long standing instructions.",
        providerOptions: { anthropic: { cacheControl: EPHEMERAL } },
      },
    ] as unknown as LanguageModelV3Prompt);
    expect(result[0]).toEqual({
      role: "system",
      content: "Long standing instructions.",
      cache_control: EPHEMERAL,
    });
  });

  it("promotes a part-level hint when a single text part is unwrapped", () => {
    const result = convertToGatewayMessages([
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Hello",
            providerOptions: { anthropic: { cacheControl: EPHEMERAL } },
          },
        ],
      },
    ] as unknown as LanguageModelV3Prompt);
    expect(result[0]).toEqual({
      role: "user",
      content: "Hello",
      cache_control: EPHEMERAL,
    });
  });

  it("puts a part-level hint on the content block it belongs to", () => {
    const result = convertToGatewayMessages([
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Cache this preamble",
            providerOptions: { anthropic: { cacheControl: EPHEMERAL } },
          },
          { type: "text", text: "but not this" },
        ],
      },
    ] as unknown as LanguageModelV3Prompt);
    expect(result[0].content).toEqual([
      { type: "text", text: "Cache this preamble", cache_control: EPHEMERAL },
      { type: "text", text: "but not this" },
    ]);
  });

  it("caches an attachment block", () => {
    const result = convertToGatewayMessages([
      {
        role: "user",
        content: [
          { type: "text", text: "Summarize" },
          {
            type: "file",
            mediaType: "application/pdf",
            filename: "contract.pdf",
            data: "JVBERi0xLjQK",
            providerOptions: { anthropic: { cacheControl: EPHEMERAL } },
          },
        ],
      },
    ] as unknown as LanguageModelV3Prompt);
    const parts = result[0].content as Array<Record<string, any>>;
    expect(parts[1].type).toBe("file");
    expect(parts[1].cache_control).toEqual(EPHEMERAL);
  });

  it("reads the snake_case and openrouter spellings too", () => {
    const result = convertToGatewayMessages([
      {
        role: "user",
        content: "ignored",
        providerOptions: { openrouter: { cache_control: EPHEMERAL } },
      },
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "prior turn",
            providerOptions: { mergeGateway: { cacheControl: EPHEMERAL } },
          },
        ],
      },
    ] as unknown as LanguageModelV3Prompt);
    expect(result[0].cache_control).toEqual(EPHEMERAL);
    expect(result[1]).toEqual({
      role: "assistant",
      content: "prior turn",
      cache_control: EPHEMERAL,
    });
  });

  it("leaves messages untouched when no hint is present", () => {
    const result = convertToGatewayMessages([
      { role: "user", content: [{ type: "text", text: "Hi" }] },
    ] as unknown as LanguageModelV3Prompt);
    expect(result[0]).toEqual({ role: "user", content: "Hi" });
  });

  it("ignores provider options that carry no cache hint", () => {
    const result = convertToGatewayMessages([
      {
        role: "system",
        content: "Hi",
        providerOptions: { anthropic: { somethingElse: true } },
      },
    ] as unknown as LanguageModelV3Prompt);
    expect(result[0]).toEqual({ role: "system", content: "Hi" });
  });
});
