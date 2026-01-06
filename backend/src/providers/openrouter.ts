import { debugLog, debugToken, debugApi, debugSuccess, debugError } from "../utils/debug";
import { calculateUsdCost } from "../utils/modelPricing";

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
};

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
  const res = await fetch("https://api.x1zx.com/api/v1/chat/completions", {
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

  // 调试：打印完整响应数据
  debugApi("OpenRouter 完整响应数据", data, { prefix: "🔍" });

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
  const usage = data?.usage || {};
  
  // 调试：详细打印usage信息
  debugToken("提取的usage数据", usage);
  debugToken("prompt_tokens", usage.prompt_tokens);
  debugToken("completion_tokens", usage.completion_tokens);
  debugToken("total_tokens", usage.total_tokens);
  
  // 计算费用（优先用 OpenRouter /models 的定价；缓存）
  const cost = await calculateUsdCost(params.model, {
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
  });
  
  // 调试：打印计算出的费用
  debugToken("计算出的费用", cost, { prefix: "💰" });
  
  return { 
    content, 
    raw: data,
    usage: {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0, 
      totalTokens: usage.total_tokens || 0,
      cost
    }
  };
}

// 流式：返回 Response，让 route 去读 res.body
export async function openRouterChatStream(params: {
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}) {
  const res = await fetch("https://api.x1zx.com/api/v1/chat/completions", {
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

