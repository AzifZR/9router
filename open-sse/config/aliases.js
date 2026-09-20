/**
 * Virtual model aliases configuration
 * Maps virtual aliases (e.g. portway/cheap, portway/reasoning) to candidate models in priority order
 * and static default fallbacks.
 */

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
