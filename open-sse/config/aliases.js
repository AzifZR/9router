/**
 * Virtual model aliases configuration
 * Maps virtual aliases (e.g. portway/cheap, portway/reasoning) to candidate models in priority order
 * and static default fallbacks.
 */

import { resolveProviderAlias } from "../services/model.js";

export const PORTWAY_ALIASES = {
  "portway/cheap": {
    candidates: [
      "groq/llama-3.3-70b-versatile",
      "google/gemini-1.5-flash",
      "anthropic/claude-3-5-haiku-20241022",
      "openai/gpt-4o-mini"
    ],
    defaultFallback: "google/gemini-1.5-flash"
  },
  "portway/reasoning": {
    candidates: [
      "openai/o3-mini",
      "openai/o1-mini",
      "anthropic/claude-3-7-sonnet-20250219",
      "google/gemini-2.5-pro"
    ],
    defaultFallback: "openai/o3-mini"
  }
};

let storeErrorLogged = false;
export function resetAliasStoreErrorFlag() {
  storeErrorLogged = false;
}

export async function fetchHealthConnections(log, forceError = false) {
  try {
    if (forceError) {
      throw new Error("Simulated health store failure");
    }
    let mod;
    try {
      mod = await import("../../src/lib/localDb.js");
    } catch {
      mod = await import("@/lib/localDb");
    }
    if (typeof mod?.getProviderConnections === "function") {
      return await mod.getProviderConnections({ isActive: true });
    }
    throw new Error("getProviderConnections not exported");
  } catch (err) {
    if (!storeErrorLogged) {
      storeErrorLogged = true;
      const msg = `Health store unreadable, falling back to static default alias candidates: ${err?.message || err}`;
      if (log && typeof log.warn === "function") log.warn("ALIAS", msg);
      else console.warn(`[ALIAS] ${msg}`);
    }
    return null;
  }
}

export function isConnectionHealthyForModel(conn, modelId) {
  if (!conn) return false;
  if (conn.isActive === false || conn.isActive === 0) return false;
  if (conn.testStatus === "unavailable" || conn.testStatus === "error") return false;
  const now = Date.now();
  const accountLock = conn.modelLock___all || conn["modelLock___all"];
  if (accountLock && new Date(accountLock).getTime() > now) return false;
  if (modelId) {
    const modelLock = conn[`modelLock_${modelId}`] || conn["modelLock_" + modelId];
    if (modelLock && new Date(modelLock).getTime() > now) return false;
  }
  return true;
}

/**
 * Pure helper to resolve a single model string if it's an alias.
 * @param {string} model
 * @param {Object} [options]
 * @param {Array} [options.connections]
 * @param {Function} [options.isModelLocked]
 * @param {Object} [options.log]
 * @param {boolean} [options.forceStoreError]
 * @returns {Promise<{ model?: string, error400?: string }>}
 */
export async function resolvePortwayAlias(model, options = {}) {
  if (typeof model !== "string" || !model.startsWith("portway/")) {
    return { model };
  }

  const aliasDef = PORTWAY_ALIASES[model];
  if (!aliasDef) {
    const validList = Object.keys(PORTWAY_ALIASES).join(", ");
    const message = `Unknown virtual model alias '${model}'. Valid aliases are: ${validList}`;
    if (options.log && typeof options.log.warn === "function") {
      options.log.warn("ALIAS", message);
    }
    return { error400: message };
  }

  const candidates = aliasDef.candidates || [];

  let connections = options.connections;
  if (options.forceStoreError) {
    connections = await fetchHealthConnections(options.log, true);
  } else if (connections === undefined && !options.isModelLocked) {
    connections = await fetchHealthConnections(options.log);
  }

  if (!connections && !options.isModelLocked) {
    return { model: aliasDef.defaultFallback || candidates[0] || model };
  }

  const healthyCandidates = candidates.filter((cand) => {
    const slash = cand.indexOf("/");
    const provider = slash > 0 ? cand.slice(0, slash) : cand;
    const modelId = slash > 0 ? cand.slice(slash + 1) : "";

    if (typeof options.isModelLocked === "function") {
      return !options.isModelLocked(provider, modelId);
    }

    const resolvedProvider = resolveProviderAlias(provider);
    const matchingConns = (connections || []).filter((conn) => {
      if (!conn) return false;
      const cp = conn.provider;
      const cr = resolveProviderAlias(cp);
      return cp === provider || cp === resolvedProvider || cr === provider || cr === resolvedProvider;
    });

    if (matchingConns.length === 0) return false;
    return matchingConns.some((conn) => isConnectionHealthyForModel(conn, modelId));
  });

  if (healthyCandidates.length > 0) {
    return { model: healthyCandidates[0] };
  } else if (aliasDef.defaultFallback) {
    return { model: aliasDef.defaultFallback };
  } else if (candidates.length > 0) {
    return { model: candidates[0] };
  }

  return { model };
}
