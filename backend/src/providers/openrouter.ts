type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function mustApiKey() {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey) {
    const err: any = new Error("未配置 OPENROUTER_API_KEY");
    err.statusCode = 500;
    err.code = "OPENROUTER_KEY_MISSING";
    throw err;
  }
  return apiKey;
}

function commonHeaders() {
  const apiKey = mustApiKey();
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "http://localhost",
    "X-Title": process.env.OPENROUTER_APP_TITLE || "ai-chat-webui",
  };
}

// 非流式（你已经用上了）
export async function openRouterChatComplete(params: {
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: commonHeaders(),
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      stream: false,
    }),
    signal: params.signal,
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}

  if (!res.ok) {
    const msg =
      data?.error?.message || data?.message || `OpenRouter 请求失败 (${res.status})`;
    const err: any = new Error(msg);
    err.statusCode = res.status;
    err.code = "OPENROUTER_ERROR";
    err.details = data;
    throw err;
  }

  const content = data?.choices?.[0]?.message?.content ?? "";
  return { content, raw: data };
}

// 流式：返回 Response，让 route 去读 res.body
export async function openRouterChatStream(params: {
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: commonHeaders(),
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      stream: true,
    }),
    signal: params.signal,
  });

  return res;
}