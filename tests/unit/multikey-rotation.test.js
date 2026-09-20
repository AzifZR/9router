import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getProviderConnections: vi.fn(),
  updateProviderConnection: vi.fn(),
  getSettings: vi.fn(() => ({})),
  getProxyPools: vi.fn(() => []),
}));

vi.mock("@/lib/localDb", () => dbMocks);
vi.mock("@/lib/network/connectionProxy", () => ({
  pickProxyPoolId: vi.fn(),
  resolveConnectionProxyConfig: vi.fn(() => ({})),
}));
vi.mock("@/shared/constants/providers.js", () => ({
  FREE_PROVIDERS: {},
  resolveProviderId: (provider) => provider,
}));
vi.mock("@/sse/utils/logger.js", () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));

const auth = await import("../../src/sse/services/auth.js");

describe("auth multikey rotation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.resetKeyRotationState();
  });

  it("single string still works", async () => {
    dbMocks.getProviderConnections.mockResolvedValue([
      { id: "conn-1", provider: "test", apiKey: "sk-single", isActive: true }
    ]);

    const c1 = await auth.getProviderCredentials("test");
    expect(c1.apiKey).toBe("sk-single");
    
    // Normal 429 locks account
    const fallback = await auth.markAccountUnavailable("conn-1", 429, "rate limited", "test", "gpt-4");
    expect(fallback.shouldFallback).toBe(true);
    expect(dbMocks.updateProviderConnection).toHaveBeenCalledWith("conn-1", expect.objectContaining({ testStatus: "unavailable" }));
  });

  it("array rotation order", async () => {
    dbMocks.getProviderConnections.mockResolvedValue([
      { id: "conn-multi", provider: "test", apiKey: ["key1", "key2", "key3"], isActive: true }
    ]);

    const c1 = await auth.getProviderCredentials("test");
    expect(c1.apiKey).toBe("key1");
    
    const c2 = await auth.getProviderCredentials("test");
    expect(c2.apiKey).toBe("key2");

    const c3 = await auth.getProviderCredentials("test");
    expect(c3.apiKey).toBe("key3");

    const c4 = await auth.getProviderCredentials("test");
    expect(c4.apiKey).toBe("key1");
  });

  it("429 advances key", async () => {
    dbMocks.getProviderConnections.mockResolvedValue([
      { id: "conn-multi", provider: "test", apiKey: ["key1", "key2", "key3"], isActive: true }
    ]);

    // Request 1 picks key1
    const excludeIds = new Set();
    const c1 = await auth.getProviderCredentials("test", excludeIds);
    expect(c1.apiKey).toBe("key1");

    // key1 hits 429
    const fb1 = await auth.markAccountUnavailable("conn-multi", 429, "rate limited", "test", "gpt-4");
    expect(fb1.shouldFallback).toBe(true);
    expect(fb1.keyRotated).toBe(true);
    expect(dbMocks.updateProviderConnection).not.toHaveBeenCalled(); // No DB lock yet!

    // Caller excludes the connection and tries again
    excludeIds.add("conn-multi");
    
    // getProviderCredentials un-excludes it because key2 and key3 are still available
    const c2 = await auth.getProviderCredentials("test", excludeIds);
    expect(c2.apiKey).toBe("key2");
    expect(excludeIds.has("conn-multi")).toBe(false);

    // key2 hits 429
    await auth.markAccountUnavailable("conn-multi", 429, "rate limited", "test", "gpt-4");
    excludeIds.add("conn-multi");

    const c3 = await auth.getProviderCredentials("test", excludeIds);
    expect(c3.apiKey).toBe("key3");

    // key3 hits 429 -> all exhausted
    const fb3 = await auth.markAccountUnavailable("conn-multi", 429, "rate limited", "test", "gpt-4");
    expect(fb3.shouldFallback).toBe(true);
    expect(dbMocks.updateProviderConnection).toHaveBeenCalledWith("conn-multi", expect.objectContaining({ testStatus: "unavailable" }));
  });

  it("never throws", () => {
    // Empty array
    expect(auth.selectApiKeyForConnection({ apiKey: [] })).toBe("");
    
    // Array with nulls
    expect(auth.selectApiKeyForConnection({ apiKey: [null, undefined] })).toBe("");
    
    // Invalid type
    expect(auth.selectApiKeyForConnection({ apiKey: 123 })).toBe("123");

    // Corrupted state should not throw
    expect(auth.selectApiKeyForConnection(null)).toBe("");
  });
});
