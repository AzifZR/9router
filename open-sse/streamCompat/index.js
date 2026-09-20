/**
 * Stream compatibility converter for providers with flaky streaming.
 */

export function shouldBypass(providerId, errorHistory = []) {
  if (!providerId) return false;
  const list = (process.env.STREAM_BYPASS_PROVIDERS || "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(String(providerId).trim().toLowerCase());
}

export function* nonStreamToSse(fullText, model = "unknown") {
  let content = "";
  if (typeof fullText === "string") {
    content = fullText;
  } else if (fullText && typeof fullText === "object") {
    // OpenAI shape
    if (fullText.choices?.[0]?.message?.content) {
      content = fullText.choices[0].message.content;
    } else if (fullText.choices?.[0]?.text) {
      content = fullText.choices[0].text;
    // Claude shape
    } else if (Array.isArray(fullText.content)) {
      content = fullText.content.filter(c => c.type === 'text').map(c => c.text).join('');
    // Gemini shape
    } else if (fullText.candidates?.[0]?.content?.parts) {
      content = fullText.candidates[0].content.parts.map(p => p.text).join('');
    } else if (fullText.content) {
      content = fullText.content;
    } else {
      content = JSON.stringify(fullText);
    }
  }

  const MAX_CAP = 256 * 1024;
  if (content.length > MAX_CAP) {
    const marker = "\n... [TRUNCATED]";
    content = content.slice(0, MAX_CAP - marker.length) + marker;
  }

  const CHUNK_SIZE = 4096;
  const now = Math.floor(Date.now() / 1000);
  const id = `chatcmpl-${Date.now()}`;

  if (content.length === 0) {
    yield `data: ${JSON.stringify({
      id, object: "chat.completion.chunk", created: now, model,
      choices: [{ index: 0, delta: { content: "" }, finish_reason: null }]
    })}\n\n`;
  } else {
    for (let i = 0; i < content.length; i += CHUNK_SIZE) {
      const slice = content.slice(i, i + CHUNK_SIZE);
      yield `data: ${JSON.stringify({
        id, object: "chat.completion.chunk", created: now, model,
        choices: [{ index: 0, delta: { content: slice }, finish_reason: null }]
      })}\n\n`;
    }
  }
  
  yield `data: ${JSON.stringify({
    id, object: "chat.completion.chunk", created: now, model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
  })}\n\n`;
  yield "data: [DONE]\n\n";
}

export function createStreamCompatResponse(resText, model) {
  let parsed = resText;
  try {
    if (typeof resText === "string") parsed = JSON.parse(resText);
  } catch { /* use raw string */ }

  const generator = nonStreamToSse(parsed, model);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      try {
        for (const chunk of generator) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
