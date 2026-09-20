import { describe, it, expect, beforeEach, vi } from "vitest";
import { getPromptCache, setPromptCache, clearPromptCache } from "../../open-sse/cache/promptCache.js";

describe("Prompt Cache", () => {
  beforeEach(() => {
    clearPromptCache();
    delete process.env.PROMPT_CACHE_TTL_MS;
    vi.restoreAllMocks();
  });

  it("hit returns cached body", () => {
    const model = "gpt-4o";
    const req = { messages: [{ role: "user", content: "hi" }], temperature: 0.7, top_p: 1.0 };
    const res = { choices: [{ message: { content: "hello" } }] };

    setPromptCache(model, req, res);
    const hit = getPromptCache(model, req);
    expect(hit).toEqual(res);
  });

  it("TTL expiry misses", () => {
    const model = "gpt-4o";
    const req = { messages: [{ role: "user", content: "hi" }] };
    const res = { choices: [{ message: { content: "hello" } }] };

    process.env.PROMPT_CACHE_TTL_MS = "100";
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    setPromptCache(model, req, res);

    vi.spyOn(Date, "now").mockReturnValue(now + 200);
    const miss = getPromptCache(model, req);
    expect(miss).toBeNull();
  });

  it("disabled-when-0", () => {
    process.env.PROMPT_CACHE_TTL_MS = "0";
    const model = "gpt-4o";
    const req = { messages: [{ role: "user", content: "hi" }] };
    const res = { choices: [{ message: { content: "hello" } }] };

    setPromptCache(model, req, res);
    expect(getPromptCache(model, req)).toBeNull();
  });

  it("never-throws on garbage", () => {
    expect(() => getPromptCache(null, undefined)).not.toThrow();
    expect(getPromptCache(null, undefined)).toBeNull();

    expect(() => setPromptCache(undefined, null, undefined)).not.toThrow();

    // Circular reference in body or messages
    const circular = {};
    circular.self = circular;
    expect(() => getPromptCache("m", circular)).not.toThrow();
    expect(() => setPromptCache("m", circular, circular)).not.toThrow();
  });

  it("tool_call responses not cached", () => {
    const model = "gpt-4o";
    const req = { messages: [{ role: "user", content: "call tool" }] };
    
    // OpenAI style tool_calls
    const openAiRes = {
      choices: [{
        message: {
          role: "assistant",
          tool_calls: [{ id: "call_1", type: "function", function: { name: "foo" } }]
        }
      }]
    };
    setPromptCache(model, req, openAiRes);
    expect(getPromptCache(model, req)).toBeNull();

    // Claude style tool_use
    const claudeRes = {
      content: [{ type: "tool_use", id: "toolu_1", name: "foo" }]
    };
    setPromptCache(model, req, claudeRes);
    expect(getPromptCache(model, req)).toBeNull();

    // Error response
    const errRes = { error: { message: "Internal Error" } };
    setPromptCache(model, req, errRes);
    expect(getPromptCache(model, req)).toBeNull();
  });
});
