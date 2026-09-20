import { describe, it, expect } from "vitest";
import { stripSystemBloat, cleanBloatText } from "../../open-sse/rtk/stripBloat.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

describe("stripSystemBloat", () => {
  it("cleans text: collapses newlines, strips trailing spaces, drops empty lines", () => {
    const input = "\n\n   \nYou are a highly capable AI assistant.\n\n\n\nSome instructions. \t \n\n\nMore. \n\n";
    const expected = "Some instructions.\n\nMore.";
    expect(cleanBloatText(input)).toBe(expected);
  });

  it("collapses repeated separator lines", () => {
    const input = "foo\n------\n----------\n------\nbar\n___\n_____\nbaz\n***\n***";
    const expected = "foo\n---\nbar\n___\nbaz\n***";
    expect(cleanBloatText(input)).toBe(expected);
  });

  it("strips common agent filler phrases", () => {
    const input = "You are a helpful assistant. Please follow these instructions carefully: do a flip. Let's think step by step.";
    const expected = "do a flip.";
    expect(cleanBloatText(input)).toBe(expected);
  });

  it("never throws on garbage", () => {
    expect(() => stripSystemBloat(null)).not.toThrow();
    expect(() => stripSystemBloat({ messages: [{ role: "system", content: null }] })).not.toThrow();
    expect(() => stripSystemBloat("garbage")).not.toThrow();
  });

  it("modifies Claude system fields", () => {
    const body = { system: "You are a highly capable AI assistant. \n\n\n\nReal rules." };
    stripSystemBloat(body, FORMATS.CLAUDE);
    expect(body.system).toBe("Real rules.");
  });

  it("modifies OpenAI chat system messages", () => {
    const body = { messages: [{ role: "system", content: "You are a helpful assistant.\n\n\n\nRules." }] };
    stripSystemBloat(body, FORMATS.OPENAI);
    expect(body.messages[0].content).toBe("Rules.");
  });

  it("modifies Gemini system fields", () => {
    const body = { systemInstruction: { parts: [{ text: "You are a highly capable AI assistant. Rules." }] } };
    stripSystemBloat(body, FORMATS.GEMINI);
    expect(body.systemInstruction.parts[0].text).toBe("Rules.");
  });

  it("leaves user messages untouched", () => {
    const body = { messages: [{ role: "user", content: "You are a highly capable AI assistant. \n\n\n\nHi" }] };
    stripSystemBloat(body, FORMATS.OPENAI);
    expect(body.messages[0].content).toBe("You are a highly capable AI assistant. \n\n\n\nHi");
  });
});
