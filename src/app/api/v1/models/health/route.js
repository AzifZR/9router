import { NextResponse } from "next/server";
import { getProviderConnections } from "@/lib/localDb";
import { getProviderAlias } from "@/shared/constants/providers";

const MODEL_LOCK_PREFIX = "modelLock_";

export async function GET() {
  try {
    const connections = await getProviderConnections({ isActive: true });
    
    // Group connections by model
    const modelStats = new Map();

    for (const conn of connections) {
      const alias = getProviderAlias(conn.provider) || conn.provider;
      const baseKey = `${alias}/__all`;

      // Check account level lock
      const accountLock = conn[MODEL_LOCK_PREFIX + "__all"];
      const isAccountLocked = accountLock && new Date(accountLock).getTime() > Date.now();
      
      const status = (conn.testStatus === "unavailable" || conn.testStatus === "error" || isAccountLocked) 
        ? "down" 
        : conn.testStatus === "active" ? "healthy" : "unknown";

      const updateStats = (modelId, status, latency) => {
        if (!modelStats.has(modelId)) {
          modelStats.set(modelId, { 
            id: modelId, 
            status: status,
            latencyMs: latency || null,
            lastChecked: conn.lastTested || conn.lastPingAt || conn.updatedAt || new Date().toISOString(),
            detail: conn.lastError || null
          });
        } else {
           const existing = modelStats.get(modelId);
           // Promote status if healthy
           if (status === "healthy" && existing.status !== "healthy") {
              existing.status = "healthy";
           }
           // Use lowest latency
           if (latency && (!existing.latencyMs || latency < existing.latencyMs)) {
              existing.latencyMs = latency;
           }
        }
      };

      // Add general account health as a wildcard for this provider
      updateStats(baseKey, status, conn.latencyMs);

      // Also process specific model locks if the account is healthy but a model is locked
      const now = Date.now();
      Object.entries(conn)
        .filter(([key, value]) => key.startsWith(MODEL_LOCK_PREFIX) && key !== MODEL_LOCK_PREFIX + "__all" && value)
        .forEach(([key, value]) => {
           if (new Date(value).getTime() > now) {
             const modelName = key.slice(MODEL_LOCK_PREFIX.length);
             const fullModelId = `${alias}/${modelName}`;
             updateStats(fullModelId, "down", null);
           }
        });
    }

    return NextResponse.json({
      models: Array.from(modelStats.values())
    });

  } catch (error) {
    console.error("[API] Failed to get models health:", error);
    return NextResponse.json(
      { models: [], error: "Failed to fetch model health" },
      { status: 200 } // 200 on error as requested
    );
  }
}
