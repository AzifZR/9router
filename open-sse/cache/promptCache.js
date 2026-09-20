import crypto from "crypto";

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 500;
const cache = new Map(); // key -> { body, expiresAt }

function getTtl() {
  const envTtl = Number(process.env.PROMPT_CACHE_TTL_MS);
  if (!isNaN(envTtl)) return envTtl;
  return DEFAULT_TTL_MS;
}

function computeKey(model, body) {
  try {
    const data = JSON.stringify(body.messages) + String(body.temperature) + String(body.top_p);
    return crypto.createHash("sha256").update(model + data).digest("hex");
  } catch (err) {
    return null;
  }
}

export function getPromptCache(model, body) {
  try {
    const ttl = getTtl();
    if (ttl === 0) return null;
    const key = computeKey(model, body);
    if (!key) return null;
    
    const entry = cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      cache.delete(key);
      return null;
    }
    
    // Refresh LRU
    cache.delete(key);
    cache.set(key, entry);
    
    return entry.body;
  } catch (err) {
    return null; // fail-open
  }
}

export function setPromptCache(model, reqBody, resBody) {
  try {
    const ttl = getTtl();
    if (ttl === 0) return;
    
    // Check if resBody has tool calls or errors
    if (!resBody || typeof resBody !== 'object') return;
    
    // Detect tool calls in common formats
    if (resBody.choices && resBody.choices.length > 0) {
      const choice = resBody.choices[0];
      if (choice.message && choice.message.tool_calls) return;
    }
    if (resBody.content && Array.isArray(resBody.content)) {
      if (resBody.content.some(c => c.type === 'tool_use' || c.type === 'tool_calls')) return;
    }
    if (resBody.error) return;

    const key = computeKey(model, reqBody);
    if (!key) return;

    if (cache.size >= MAX_ENTRIES) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    
    cache.set(key, {
      body: resBody,
      expiresAt: Date.now() + ttl
    });
  } catch (err) {
    // fail-open
  }
}

export function clearPromptCache() {
  cache.clear();
}
