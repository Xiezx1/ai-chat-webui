import { debugToken } from "./debug";

/**
 * 简单的token估算工具
 * 用于在API不返回usage数据时进行本地token估算
 */

/**
 * 估算文本的token数量
 * 基于经验公式：平均每个token约等于4个字符
 * 这个估算相对粗略，但对于显示统计信息足够准确
 */
export function estimateTokens(text: string): number {
  if (!text || typeof text !== 'string') {
    return 0;
  }
  
  // 移除多余的空白字符
  const cleanText = text.trim();
  if (!cleanText) {
    return 0;
  }
  
  // 经验公式：中文大约1个字符=1个token，英文大约4个字符=1个token
  // 这里使用一个平均的估算：1个token ≈ 3个字符
  const estimatedTokens = Math.ceil(cleanText.length / 3);
  
  return Math.max(estimatedTokens, 1); // 至少返回1个token
}


export function estimateChatUsage(
  history: Array<{ role: string; content: string }>,
  userMessage: string,
  assistantMessage: string,
  model: string
) {
  const promptText = [...history, { role: "user", content: userMessage }]
    .map((m) => `${m.role}:${m.content}`)
    .join("\n");

  const promptTokens = estimateTokens(promptText);
  const completionTokens = estimateTokens(assistantMessage || "");
  const totalTokens = promptTokens + completionTokens;
  const cost = calculateEstimatedCost(model, { promptTokens, completionTokens });

  return { promptTokens, completionTokens, totalTokens, cost, estimated: true };
}

export function estimateMessageTokens(messages: Array<{ role: string; content: string }>) {
  let totalTokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  
  for (const message of messages) {
    const messageTokens = estimateTokens(message.content);
    
    if (message.role === 'user') {
      promptTokens += messageTokens;
    } else if (message.role === 'assistant') {
      completionTokens += messageTokens;
    }
    
    totalTokens += messageTokens;
  }
  
  return {
    promptTokens,
    completionTokens,
    totalTokens,
  };
}

/**
 * 计算对话的token使用情况
 * 包含对话历史和当前消息
 */
export function estimateConversationTokens(
  history: Array<{ role: string; content: string }>,
  currentMessage: string,
  model: string
) {
  // 构建完整的消息列表
  const allMessages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: currentMessage }
  ];
  
  // 估算token
  const tokens = estimateMessageTokens(allMessages);
  
  // 计算费用（基于模型定价）
  const cost = calculateEstimatedCost(model, tokens);
  
  return {
    ...tokens,
    cost,
    estimated: true, // 标记这是估算值
  };
}

/**
 * 计算估算费用
 */
function calculateEstimatedCost(model: string, tokens: { promptTokens: number; completionTokens: number }) {
  const pricing = getModelPricing(model);
  if (!pricing) return 0;
  
  const promptCost = (tokens.promptTokens || 0) * pricing.prompt / 1_000_000;
  const completionCost = (tokens.completionTokens || 0) * pricing.completion / 1_000_000;
  
  return parseFloat((promptCost + completionCost).toFixed(6));
}

/**
 * 获取模型定价信息（与openrouter.ts中的相同）
 */
function getModelPricing(modelId: string) {
  const normalized = String(modelId || "").trim().split("@")[0].split(":")[0];
  const pricingMap: { [key: string]: { prompt: number; completion: number } } = {
    "openai/gpt-4o-mini": { prompt: 0.15, completion: 0.60 },
    "openai/gpt-4o": { prompt: 5.00, completion: 15.00 },
    "anthropic/claude-3.5-sonnet": { prompt: 3.00, completion: 15.00 },
    "anthropic/claude-3-haiku": { prompt: 0.25, completion: 1.25 },
    "meta-llama/llama-3.1-70b-instruct": { prompt: 0.90, completion: 0.90 },
    "meta-llama/llama-3.1-8b-instruct": { prompt: 0.10, completion: 0.10 },
  };
  return pricingMap[modelId] || pricingMap[normalized];
}

/**
 * 验证token估算的准确性
 * 这个函数用于调试，可以比较估算值和真实值
 */
export function validateTokenEstimate(estimated: number, actual?: number) {
  if (!actual || actual <= 0) {
    return { accuracy: 'unknown', difference: 0 };
  }
  
  const difference = Math.abs(estimated - actual);
  const accuracy = ((1 - difference / actual) * 100);
  
  debugToken('Token估算验证', {
    estimated,
    actual,
    difference,
    accuracy: `${accuracy.toFixed(1)}%`
  });
  
  return {
    accuracy: `${accuracy.toFixed(1)}%`,
    difference,
    estimated,
    actual,
  };
}