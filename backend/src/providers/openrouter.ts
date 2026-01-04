import { debugLog, debugToken, debugApi, debugSuccess, debugError } from "../utils/debug";

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
  
  // 计算费用（基于OpenRouter的定价）
  const cost = calculateCost(params.model, usage);
  
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

// 费用计算函数
function calculateCost(model: string, usage: any): number {
  const pricing = getModelPricing(model);
  if (!pricing) return 0;
  
  const promptCost = (usage.prompt_tokens || 0) * pricing.prompt / 1_000_000;
  const completionCost = (usage.completion_tokens || 0) * pricing.completion / 1_000_000;
  
  return promptCost + completionCost;
}

// 获取模型定价信息
function getModelPricing(modelId: string) {
  // 这里可以从数据库或配置中获取具体模型的定价
  // 示例定价（需要根据实际OpenRouter API获取最新价格）
  const pricingMap: { [key: string]: { prompt: number; completion: number } } = {
    "openai/gpt-4o-mini": { prompt: 0.15, completion: 0.60 },  // $0.15/1M prompt, $0.60/1M completion
    "openai/gpt-4o": { prompt: 5.00, completion: 15.00 },
    "anthropic/claude-3.5-sonnet": { prompt: 3.00, completion: 15.00 },
    "anthropic/claude-3-haiku": { prompt: 0.25, completion: 1.25 },
    "meta-llama/llama-3.1-70b-instruct": { prompt: 0.90, completion: 0.90 },
    "meta-llama/llama-3.1-8b-instruct": { prompt: 0.10, completion: 0.10 },
    // 更多模型定价...
  };
  return pricingMap[modelId];
}