import { describe, expect, it, vi, beforeEach } from "vitest";
import { expandVirtualAliases, resetAliasStoreErrorFlag } from "open-sse/services/combo.js";
import { PORTWAY_ALIASES, resolvePortwayAlias } from "open-sse/config/aliases.js";

describe("Self-Healing Virtual Model Aliases", () => {
  beforeEach(() => {
    resetAliasStoreErrorFlag();
    vi.clearAllMocks();
  });

  const logger = { warn: vi.fn(), info: vi.fn() };

  describe("expandVirtualAliases (combo.js)", () => {
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

  describe("resolvePortwayAlias early-resolution helper", () => {
    it("returns unknown→400 shape for invalid alias", async () => {
      const res = await resolvePortwayAlias("portway/nonsense", { log: logger });
      expect(res.error400).toBeDefined();
      expect(res.error400).toContain("Unknown virtual model alias 'portway/nonsense'");
      expect(res.model).toBeUndefined();
    });

    it("passes through non-alias", async () => {
      const res = await resolvePortwayAlias("openai/gpt-4", { log: logger });
      expect(res.model).toBe("openai/gpt-4");
      expect(res.error400).toBeUndefined();
    });

    it("picks first healthy candidate (deterministic tiebreak)", async () => {
      const connections = [
        { provider: "groq", isActive: true, testStatus: "active" }, // first candidate
        { provider: "google", isActive: true, testStatus: "active" }, // second candidate
      ];
      const res = await resolvePortwayAlias("portway/cheap", { log: logger, connections });
      expect(res.model).toBe("groq/llama-3.3-70b-versatile");
    });

    it("skips locked provider and picks next candidate", async () => {
      const isModelLocked = vi.fn((provider, model) => {
        if (provider === "groq") return true; // lock groq
        return false;
      });
      // We pass isModelLocked to bypass DB fetch and provide custom lock logic
      const res = await resolvePortwayAlias("portway/cheap", { log: logger, isModelLocked });
      expect(isModelLocked).toHaveBeenCalled();
      expect(res.model).toBe("google/gemini-1.5-flash"); // second candidate
    });

    it("returns static default if store is down", async () => {
      const res = await resolvePortwayAlias("portway/cheap", { log: logger, forceStoreError: true });
      expect(res.model).toBe("google/gemini-1.5-flash"); // defaultFallback
      expect(logger.warn).toHaveBeenCalledWith("ALIAS", expect.stringContaining("Health store unreadable"));
    });

    it("handles wrapped connections object and garbage object without throwing", async () => {
      // Wrapped { connections: [...] }
      const wrapped = { connections: [{ provider: "google", isActive: true, testStatus: "active" }] };
      const res1 = await resolvePortwayAlias("portway/cheap", { log: logger, connections: wrapped });
      expect(res1.model).toBe("google/gemini-1.5-flash");

      // Garbage object
      const garbage = { foo: "bar" };
      const res2 = await resolvePortwayAlias("portway/cheap", { log: logger, connections: garbage });
      expect(res2.model).toBe("google/gemini-1.5-flash"); // static fallback
    });

    it("handles throwing store or error in resolver without throwing", async () => {
      const throwingResolver = await resolvePortwayAlias("portway/cheap", {
        log: logger,
        get connections() {
          throw new Error("Store read exploded");
        }
      });
      expect(throwingResolver.model).toBe("google/gemini-1.5-flash");
      expect(logger.warn).toHaveBeenCalledWith("ALIAS", expect.stringContaining("resolvePortwayAlias failed"));
    });
  });
});
