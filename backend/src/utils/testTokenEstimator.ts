import { estimateTokens, estimateConversationTokens } from "./tokenEstimator";

/**
 * 测试token估算功能
 */
export function testTokenEstimator() {
  console.log("🧪 开始测试Token估算功能...\n");

  // 测试1：基础文本估算
  console.log("测试1：基础文本估算");
  const testTexts = [
    "Hello world",
    "你好世界",
    "这是一个比较长的中文文本，用来测试token估算功能。",
    "This is a longer English text to test token estimation functionality.",
    "", // 空字符串
    "   ", // 只有空格
  ];

  testTexts.forEach((text, index) => {
    const tokens = estimateTokens(text);
    console.log(`  文本${index + 1}: "${text}" -> ${tokens} tokens`);
  });

  console.log("\n测试2：消息列表估算");
  
  // 测试2：消息列表估算
  const messages = [
    { role: "user", content: "请介绍一下人工智能的发展历史" },
    { role: "assistant", content: "人工智能（Artificial Intelligence，AI）是指通过计算机系统模拟、延伸和扩展人类智能的技术和理论。从20世纪50年代开始，人工智能经历了多个发展阶段..." },
    { role: "user", content: "能详细说说深度学习吗？" },
    { role: "assistant", content: "深度学习是机器学习的一个分支，它模拟人脑神经网络的结构和功能..." },
  ];

  const estimatedTokens = estimateConversationTokens(
    messages.slice(0, 2), // 历史消息
    messages[2].content,   // 当前消息
    "openai/gpt-4o-mini"
  );

  console.log("  历史消息 + 当前消息的估算结果:");
  console.log(`  - Prompt Tokens: ${estimatedTokens.promptTokens}`);
  console.log(`  - Completion Tokens: ${estimatedTokens.completionTokens}`);
  console.log(`  - Total Tokens: ${estimatedTokens.totalTokens}`);
  console.log(`  - Cost: $${estimatedTokens.cost}`);
  console.log(`  - Estimated: ${estimatedTokens.estimated}`);

  console.log("\n测试3：不同模型定价对比");
  
  const models = [
    "openai/gpt-4o-mini",
    "openai/gpt-4o",
    "anthropic/claude-3.5-sonnet",
    "anthropic/claude-3-haiku",
  ];

  const testMessage = "这是一个测试消息，用于比较不同模型的定价。";

  models.forEach(model => {
    const result = estimateConversationTokens([], testMessage, model);
    console.log(`  ${model}: $${result.cost}`);
  });

  console.log("\n测试4：中文vs英文token比例");
  
  const chineseText = "这是一个中文测试消息。";
  const englishText = "This is an English test message.";
  
  const chineseTokens = estimateTokens(chineseText);
  const englishTokens = estimateTokens(englishText);
  
  console.log(`  中文: "${chineseText}" -> ${chineseTokens} tokens`);
  console.log(`  英文: "${englishText}" -> ${englishTokens} tokens`);

  console.log("\n✅ Token估算功能测试完成！");
}

// 直接运行测试
testTokenEstimator();