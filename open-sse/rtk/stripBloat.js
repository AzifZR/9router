// Strips bloat and filler from system messages to conserve tokens
import { FORMATS } from "../translator/formats.js";
import { ROLE } from "../translator/schema/roles.js";

const FILLER_PATTERNS = [
  /\bYou are a highly capable AI assistant\.?\s*/gi,
  /\bYou are a helpful assistant\.?\s*/gi,
  /\bPlease follow these instructions carefully:?\s*/gi,
  /\bHere are your instructions:?\s*/gi,
  /\bRead the following carefully:?\s*/gi,
  /\bAs an AI language model,?\s*/gi,
  /\bRemember to always:?\s*/gi,
  /\bYour primary goal is to:?\s*/gi,
  /\bPay close attention to:?\s*/gi,
  /\bLet's think step by step\.?\s*/gi
];

export function cleanBloatText(text) {
  if (typeof text !== "string") return text;

  let out = text;

  // 1. Strip common agent filler phrases (conservative allowlist)
  for (const regex of FILLER_PATTERNS) {
    out = out.replace(regex, "");
  }

  // 2. Trim trailing spaces per line
  out = out.replace(/[ \t]+$/gm, "");

  // 3. Collapse runs within a separator line (e.g. ------ -> ---)
  out = out.replace(/^([-_*])\1{2,}\s*$/gm, "$1$1$1");

  // Collapse consecutive repeated separator lines of any style into a single line
  out = out.replace(/((?:^[-_*]{3}\r?\n)+)(^[-_*]{3})/gm, "$2");

  // 4. Collapse 3+ newlines to max 2
  out = out.replace(/\n{3,}/g, "\n\n");

  // 5. Drop empty lines at start/end
  out = out.trim();

  return out;
}

export function stripSystemBloat(body, format) {
  try {
    if (!body || typeof body !== "object") return body;

    // Claude format
    if (format === FORMATS.CLAUDE || (body.system && !Array.isArray(body.messages) && !Array.isArray(body.input))) {
      stripClaudeSystem(body);
      return body;
    }

    // Gemini format
    if (format === FORMATS.GEMINI || format === FORMATS.GEMINI_CLI || format === FORMATS.VERTEX || format === FORMATS.ANTIGRAVITY) {
      stripGeminiSystem(body);
      return body;
    }

    // OpenAI Instructions
    if (typeof body.instructions === "string") {
      try { body.instructions = cleanBloatText(body.instructions); } catch (_) {}
      return body;
    }

    // OpenAI/Claude chat messages (OpenAI format or intermediate format)
    if (Array.isArray(body.messages)) {
      stripChatSystem(body);
      return body;
    }

    // OpenAI Responses input format
    if (Array.isArray(body.input)) {
      stripResponsesSystem(body);
      return body;
    }

    // Claude system field on body with messages
    if (body.system) {
      stripClaudeSystem(body);
    }

  } catch (_) {
    // fail-open: never throw
  }
  return body;
}

function stripClaudeSystem(body) {
  try {
    const sys = body.system;
    if (typeof sys === "string") {
      body.system = cleanBloatText(sys);
      return;
    }
    if (Array.isArray(sys)) {
      for (const block of sys) {
        if (block && block.type === "text" && typeof block.text === "string") {
          block.text = cleanBloatText(block.text);
        }
      }
    }
  } catch (_) {}
}

function stripGeminiSystem(body) {
  try {
    let target = body;
    if (body.request && typeof body.request === "object") target = body.request;
    const useSnake = Object.prototype.hasOwnProperty.call(target, "system_instruction");
    const key = useSnake ? "system_instruction" : "systemInstruction";
    const sys = target[key];
    if (sys && Array.isArray(sys.parts)) {
      for (const p of sys.parts) {
        if (p && typeof p.text === "string") {
          p.text = cleanBloatText(p.text);
        }
      }
    }
  } catch (_) {}
}

function stripChatSystem(body) {
  try {
    for (const m of body.messages) {
      if (!m || (m.role !== ROLE.SYSTEM && m.role !== ROLE.DEVELOPER)) continue;
      const c = m.content;
      if (typeof c === "string") {
        m.content = cleanBloatText(c);
      } else if (Array.isArray(c)) {
        for (const part of c) {
          if (part && part.type === "text" && typeof part.text === "string") {
            part.text = cleanBloatText(part.text);
          }
        }
      }
    }
  } catch (_) {}
}

function stripResponsesSystem(body) {
  try {
    for (const item of body.input) {
      if (!item || item.type !== "message") continue;
      if (item.role !== ROLE.SYSTEM && item.role !== ROLE.DEVELOPER) continue;
      const c = item.content;
      if (typeof c === "string") {
        item.content = cleanBloatText(c);
      } else if (Array.isArray(c)) {
        for (const part of c) {
          if (part && part.type === "input_text" && typeof part.text === "string") {
            part.text = cleanBloatText(part.text);
          }
        }
      }
    }
  } catch (_) {}
}
