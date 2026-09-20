import { describe, expect, it, vi, beforeEach } from "vitest";
import { shouldBypass, nonStreamToSse, createStreamCompatResponse } from "../../open-sse/streamCompat/index.js";

describe("streamCompat module", () => {
  beforeEach(() => {
    delete process.env.STREAM_BYPASS_PROVIDERS;
  });

  it("shouldBypass matches env override", () => {
    process.env.STREAM_BYPASS_PROVIDERS = "openrouter, groq, deepinfra";
    expect(shouldBypass("groq")).toBe(true);
    expect(shouldBypass("Groq")).toBe(true);
    expect(shouldBypass("openai")).toBe(false);
  });

  it("shouldBypass returns false if env empty", () => {
    expect(shouldBypass("groq")).toBe(false);
  });

  it("nonStreamToSse emits correct chunks and respects model", () => {
    const text = "Hello world";
    const model = "test-model";
    const chunks = Array.from(nonStreamToSse(text, model));
    
    expect(chunks.length).toBe(3); // 1 content chunk, 1 stop chunk, 1 DONE chunk
    expect(chunks[0]).toContain(`"delta":{"content":"Hello world"}`);
    expect(chunks[0]).toContain(`"model":"test-model"`);
    expect(chunks[1]).toContain(`"finish_reason":"stop"`);
    expect(chunks[1]).toContain(`"model":"test-model"`);
    expect(chunks[2]).toBe("data: [DONE]\n\n");
  });

  it("nonStreamToSse truncates to ~256KB", () => {
    const longText = "a".repeat(300 * 1024); // 300KB
    const chunks = Array.from(nonStreamToSse(longText, "test"));
    
    // Check total content length emitted
    let totalLength = 0;
    for (const chunk of chunks) {
      if (chunk.includes("[DONE]")) continue;
      const parsed = JSON.parse(chunk.replace("data: ", "").trim());
      if (parsed.choices[0].delta.content) {
        totalLength += parsed.choices[0].delta.content.length;
      }
    }
    
    expect(totalLength).toBe(256 * 1024); // Cap strictly respected
    
    // Check for marker in the last content chunk
    const contentChunks = chunks.filter(c => c.includes(`"content":`));
    const lastContentChunk = contentChunks[contentChunks.length - 1];
    expect(lastContentChunk).toContain("[TRUNCATED]");
  });

  it("nonStreamToSse extracts from OpenAI shape", () => {
    const data = { choices: [{ message: { content: "from openai" } }] };
    const chunks = Array.from(nonStreamToSse(data, "test"));
    expect(chunks[0]).toContain("from openai");
  });

  it("nonStreamToSse extracts from Claude shape", () => {
    const data = { content: [{ type: "text", text: "from claude" }] };
    const chunks = Array.from(nonStreamToSse(data, "test"));
    expect(chunks[0]).toContain("from claude");
  });

  it("createStreamCompatResponse creates a valid Response object", async () => {
    const res = createStreamCompatResponse("response body", "gpt-test");
    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let result = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value);
    }
    expect(result).toContain(`"content":"response body"`);
    expect(result).toContain(`"model":"gpt-test"`);
    expect(result).toContain("data: [DONE]");
  });

  it("fail-open (error passthrough): handles invalid input gracefully without throwing", async () => {
    // Pass undefined/null
    const res = createStreamCompatResponse(null, "gpt-test");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let result = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value);
    }
    // Should emit an empty content chunk or stringified null but NOT crash
    expect(result).toContain("data: [DONE]");
    expect(result).toContain(`"model":"gpt-test"`);
  });
});