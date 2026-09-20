import { describe, expect, it, vi, beforeEach } from "vitest";
import { expandVirtualAliases, resetAliasStoreErrorFlag } from "open-sse/services/combo.js";
import { PORTWAY_ALIASES } from "open-sse/config/aliases.js";

describe("Self-Healing Virtual Model Aliases", () => {
  beforeEach(() => {
    resetAliasStoreErrorFlag();
    vi.clearAllMocks();
  });

  const logger = { warn: vi.fn(), info: vi.fn() };

  it("cheap skips locked model", async () => {
    const cheapCandidates = PORTWAY_ALIASES["portway/cheap"].candidates;
    const firstCand = cheapCandidates[0]; // groq/llama-3.3-70b-versatile
    const secondCand = cheapCandidates[1]; // google/gemini-1.5-flash
    const thirdCand = cheapCandidates[2]; // anthropic/claude-3-5-haiku-20241022

    const slash1 = firstCand.indexOf("/");
    const provider1 = firstCand.slice(0, slash1);
    const model1 = firstCand.slice(slash1 + 1);

    const slash2 = secondCand.indexOf("/");
    const provider2 = secondCand.slice(0, slash2);

    const slash3 = thirdCand.indexOf("/");
    const provider3 = thirdCand.slice(0, slash3);

    const connections = [
      { 
        provider: provider1, 
        isActive: true, 
        testStatus: "active", 
        [`modelLock_${model1}`]: "2099-01-01T00:00:00.000Z" 
      },
      { 
        provider: provider2, 
        isActive: true, 
        testStatus: "active", 
        "modelLock___all": "2099-01-01T00:00:00.000Z" 
      },
      { 
        provider: provider3, 
        isActive: true, 
        testStatus: "active" 
      }
    ];

    const { models, errorResponse } = await expandVirtualAliases(["portway/cheap"], logger, { connections });
    expect(errorResponse).toBeNull();
    // Skips 1 and 2, starts with 3
    expect(models[0]).toBe(thirdCand);
    expect(models.length).toBe(1);
  });

  it("reasoning picks reasoning-capable", async () => {
    const reasoningCandidates = PORTWAY_ALIASES["portway/reasoning"].candidates;
    const thirdCand = reasoningCandidates[2]; // anthropic/claude-3-7-sonnet-20250219

    const connections = [
      { 
        provider: "openai", 
        isActive: true, 
        testStatus: "unavailable"
      },
      { 
        provider: "anthropic", 
        isActive: true, 
        testStatus: "active"
      }
    ];

    const { models, errorResponse } = await expandVirtualAliases(["portway/reasoning"], logger, { connections });
    expect(errorResponse).toBeNull();
    expect(models[0]).toBe(thirdCand);
  });

  it("unknown alias 400", async () => {
    const { models, errorResponse } = await expandVirtualAliases(["portway/invalid"], logger);
    expect(models).toEqual([]);
    expect(errorResponse).not.toBeNull();
    expect(errorResponse.status).toBe(400);

    const json = await errorResponse.clone().json();
    expect(json.error.message).toContain("Unknown virtual model alias 'portway/invalid'");
    expect(json.error.message).toContain("portway/cheap");
  });

  it("store-down fallback", async () => {
    const { models, errorResponse } = await expandVirtualAliases(["portway/cheap"], logger, { forceStoreError: true });
    expect(errorResponse).toBeNull();
    expect(models).toEqual(PORTWAY_ALIASES["portway/cheap"].candidates);
    expect(logger.warn).toHaveBeenCalledWith("ALIAS", expect.stringContaining("Health store unreadable"));
  });

  it("non-alias passthrough", async () => {
    const originalModels = ["openai/gpt-4o", "my-combo"];
    const { models, errorResponse } = await expandVirtualAliases(originalModels, logger);
    expect(errorResponse).toBeNull();
    expect(models).toBe(originalModels);
  });

  it("handleComboChat returns 400 for unknown alias", async () => {
    const { handleComboChat } = await import("open-sse/services/combo.js");
    const res = await handleComboChat({
      body: {},
      models: ["portway/unknown-model"],
      handleSingleModel: vi.fn(),
      log: logger,
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toContain("Unknown virtual model alias 'portway/unknown-model'");
  });
});
