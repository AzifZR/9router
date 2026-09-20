import { describe, expect, it } from "vitest";
import { ensureToolCallIds, repairToolCallArguments } from "../../open-sse/translator/concerns/toolCall.js";

describe("repairToolCallArguments", () => {
  it("passes valid JSON through untouched", () => {
    const validSimple = '{"key":"value"}';
    const validNested = '{"user":{"name":"Alice","age":30},"tags":["admin","user"]}';
    const emptyObject = "{}";

    expect(repairToolCallArguments(validSimple)).toBe(validSimple);
    expect(repairToolCallArguments(validNested)).toBe(validNested);
    expect(repairToolCallArguments(emptyObject)).toBe(emptyObject);
  });

  it("repairs trailing commas", () => {
    const trailingObj = '{"key": "value",}';
    const trailingNested = '{"items": [1, 2,], "meta": {"ok": true,}, }';

    const repaired1 = repairToolCallArguments(trailingObj);
    expect(repaired1).not.toBeNull();
    expect(JSON.parse(repaired1)).toEqual({ key: "value" });

    const repaired2 = repairToolCallArguments(trailingNested);
    expect(repaired2).not.toBeNull();
    expect(JSON.parse(repaired2)).toEqual({ items: [1, 2], meta: { ok: true } });
  });

  it("repairs single-quoted strings and unquoted keys", () => {
    const singleQuotes = "{'name': 'Bob', 'greeting': 'it\\'s fine'}";
    const unquotedKeys = '{query: "search", limit: 10}';
    const combo = "{query: 'search', limit: 10, }";

    const repaired1 = repairToolCallArguments(singleQuotes);
    expect(repaired1).not.toBeNull();
    expect(JSON.parse(repaired1)).toEqual({ name: "Bob", greeting: "it's fine" });

    const repaired2 = repairToolCallArguments(unquotedKeys);
    expect(repaired2).not.toBeNull();
    expect(JSON.parse(repaired2)).toEqual({ query: "search", limit: 10 });

    const repaired3 = repairToolCallArguments(combo);
    expect(repaired3).not.toBeNull();
    expect(JSON.parse(repaired3)).toEqual({ query: "search", limit: 10 });
  });

  it("returns null on truncated JSON", () => {
    expect(repairToolCallArguments('{"foo": "bar')).toBeNull();
    expect(repairToolCallArguments('{"foo": ')).toBeNull();
    expect(repairToolCallArguments('{"items": [1, 2')).toBeNull();
    expect(repairToolCallArguments('{"a": 1, "b":')).toBeNull();
  });

  it("never throws on garbage input", () => {
    const garbageSamples = [
      null,
      undefined,
      12345,
      true,
      false,
      {},
      [],
      "",
      "<<<xml><broken>>",
      "not json at all",
      "{;:",
      NaN,
      Infinity,
      Symbol("foo"),
    ];

    for (const sample of garbageSamples) {
      expect(() => {
        const result = repairToolCallArguments(sample);
        expect(result).toBeNull();
      }).not.toThrow();
    }
  });
});

describe("ensureToolCallIds integration with arguments repair", () => {
  it("repairs malformed tool_call arguments in assistant messages", () => {
    const body = {
      messages: [
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_123",
              type: "function",
              function: {
                name: "search",
                arguments: "{query: 'vitest', limit: 5, }",
              },
            },
          ],
        },
      ],
    };

    ensureToolCallIds(body);
    const tc = body.messages[0].tool_calls[0];
    expect(tc).toBeDefined();
    expect(JSON.parse(tc.function.arguments)).toEqual({ query: "vitest", limit: 5 });
  });

  it("drops tool_calls with unrepairable arguments fail-open", () => {
    const body = {
      messages: [
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_bad",
              type: "function",
              function: {
                name: "bad_tool",
                arguments: '{"truncated": true, "extra":',
              },
            },
            {
              id: "call_good",
              type: "function",
              function: {
                name: "good_tool",
                arguments: '{"valid": true}',
              },
            },
          ],
        },
      ],
    };

    ensureToolCallIds(body);
    expect(body.messages[0].tool_calls).toHaveLength(1);
    expect(body.messages[0].tool_calls[0].id).toBe("call_good");
  });
});
