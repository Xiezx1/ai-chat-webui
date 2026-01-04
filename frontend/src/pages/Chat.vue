<script setup lang="ts">
import { onMounted, ref, watch, nextTick, computed } from "vue";
import { useChatStore } from "../stores/chat";
import { useSettingsStore } from "../stores/settings";
import { debugUi, debugToken } from "../utils/debug";
import ChatInput from "../components/ChatInput.vue";
import ChatMessage from "../components/ChatMessage.vue";

const chat = useChatStore();
const settings = useSettingsStore();
const listRef = ref<HTMLDivElement | null>(null);

// 获取当前使用的模型信息
const currentModel = computed(() => {
  const modelId = settings.userSettings.defaultModel;
  const model = settings.models.find(m => m.id === modelId);
  return model || { id: modelId, name: modelId || "未选择模型", context_length: 4000 };
});

// 计算当前对话统计
const conversationStats = computed(() => {
  if (!chat.activeId) return null;
  
  const messages = chat.messages.filter(m => m.role !== 'system');
  
  // 调试：打印所有消息数据
  debugUi("前端所有消息数据", messages);
  
  const totalTokens = messages.reduce((sum: number, msg: any) => sum + (msg.totalTokens || 0), 0);
  const totalCost = messages.reduce((sum: number, msg: any) => sum + (msg.cost || 0), 0);
  
  // 调试：打印计算结果
  debugToken("前端计算结果", {
    messageCount: messages.length,
    totalTokens,
    totalCost,
    promptTokens: messages.reduce((sum: number, msg: any) => sum + (msg.promptTokens || 0), 0),
    completionTokens: messages.reduce((sum: number, msg: any) => sum + (msg.completionTokens || 0), 0)
  });
  
  return {
    messageCount: messages.length,
    totalTokens,
    totalCost: totalCost.toFixed(4), // 保留4位小数
    promptTokens: messages.reduce((sum: number, msg: any) => sum + (msg.promptTokens || 0), 0),
    completionTokens: messages.reduce((sum: number, msg: any) => sum + (msg.completionTokens || 0), 0)
  };
});

// 计算token使用百分比
const tokenUsagePercentage = computed(() => {
  const stats = conversationStats.value;
  if (!stats) return 0;
  
  const maxTokens = currentModel.value?.context_length || 4000;
  return Math.min((stats.totalTokens / maxTokens) * 100, 100);
});

const isUsingEstimatedTokens = computed(() => {
  const messages = chat.messages.filter(m => m.role === 'assistant' && m.totalTokens);
  return messages.some(m => m.estimated === true);
});

onMounted(async () => {
  await settings.init();
  await chat.loadConversations();
});

// 自动滚动：当新增消息时滚到底部（简单稳定版）
watch(
  () => chat.messages.length,
  async () => {
    await nextTick();
    const el = listRef.value;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }
);

async function newChat() {
  await chat.createConversation();
}

async function open(id: number) {
  await chat.openConversation(id);
}

async function renameConv(id: number, oldTitle: string) {
  const title = window.prompt("重命名会话", oldTitle);
  if (!title) return;
  await chat.renameConversation(id, title.trim());
}

async function delConv(id: number) {
  if (!window.confirm("确定删除该会话？此操作不可恢复")) return;
  await chat.deleteConversation(id);
}
</script>

<template>
  <div class="h-screen bg-gray-50">
    <div class="flex h-full">
      <!-- Sidebar -->
      <aside class="w-72 border-r border-gray-200 bg-white">
        <div class="flex items-center justify-between px-4 py-4">
          <div class="text-sm font-semibold text-gray-900">AI Chat</div>
          <div class="flex gap-2">
            <button
              class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              type="button"
              @click="$router.push('/settings')"
            >
              设置
            </button>
            <button
              class="rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-black"
              type="button"
              @click="newChat"
            >
              新建
            </button>
          </div>
        </div>

        <div class="px-2">
          <div
            v-for="c in chat.conversations"
            :key="c.id"
            class="group flex items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-gray-50"
            :class="chat.activeId === c.id ? 'bg-gray-100' : ''"
          >
            <button class="flex-1 truncate text-left" type="button" @click="open(c.id)">
              {{ c.title }}
            </button>

            <div class="invisible flex gap-2 group-hover:visible">
              <button class="text-xs text-gray-500 hover:text-gray-900" @click="renameConv(c.id, c.title)">
                重命名
              </button>
              <button class="text-xs text-red-500 hover:text-red-700" @click="delConv(c.id)">
                删除
              </button>
            </div>
          </div>
        </div>
      </aside>

      <!-- Main -->
      <main class="flex flex-1 flex-col">
        <!-- 当前模型和Token统计显示条 -->
        <div class="border-b border-gray-200 bg-white px-6 py-3">
          <div class="space-y-3">
            <!-- 模型信息 -->
            <div class="flex items-center gap-2">
              <div class="text-sm text-gray-600">当前模型：</div>
              <div class="flex items-center gap-1">
                <div class="inline-flex items-center rounded-lg bg-blue-50 px-3 py-1 text-sm font-medium text-blue-900">
                  <div class="mr-2 h-2 w-2 rounded-full bg-blue-500"></div>
                  {{ currentModel.name || currentModel.id }}
                </div>
                <div class="text-xs text-gray-500">
                  最大上下文: {{ currentModel.context_length?.toLocaleString() || 'N/A' }}
                </div>
              </div>
            </div>
            
            <!-- Token统计和进度条 -->
            <div v-if="conversationStats" class="space-y-2">
              <!-- 统计信息 -->
              <div class="flex items-center justify-between text-sm text-gray-600">
                <div class="flex items-center gap-4">
                  <span>{{ conversationStats.messageCount }}条消息</span>
                  <span>{{ conversationStats.totalTokens.toLocaleString() }} tokens</span>
                  <span class="text-green-600">${{ conversationStats.totalCost }}</span>
                  <span v-if="isUsingEstimatedTokens" class="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                    估算值
                  </span>
                </div>
                <div class="text-xs text-gray-500">
                  {{ tokenUsagePercentage.toFixed(1) }}% / {{ (currentModel.context_length || 4000).toLocaleString() }}
                </div>
              </div>
              
              <!-- 进度条 -->
              <div class="w-full bg-gray-200 rounded-full h-2">
                <div 
                  class="h-2 rounded-full transition-all duration-300"
                  :class="tokenUsagePercentage > 85 ? 'bg-red-500' : tokenUsagePercentage > 70 ? 'bg-yellow-500' : 'bg-green-500'"
                  :style="{ width: Math.min(tokenUsagePercentage, 100) + '%' }"
                ></div>
              </div>
              
              <!-- 详细分解 -->
              <div class="flex justify-between text-xs text-gray-500">
                <span>输入: {{ conversationStats.promptTokens.toLocaleString() }}</span>
                <span>输出: {{ conversationStats.completionTokens.toLocaleString() }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- messages -->
        <div ref="listRef" class="flex-1 overflow-y-auto">
          <div v-if="!chat.activeId" class="w-full px-6 py-10 text-gray-500">
            请选择或新建一个会话开始聊天
          </div>

          <ChatMessage v-for="m in chat.messages" :key="m.id" :message="m" />
        </div>

        <!-- error + retry -->
        <div v-if="chat.error" class="mx-auto w-full max-w-3xl px-4">
          <div class="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div class="flex items-center justify-between gap-3">
              <div class="truncate">{{ chat.error }}</div>
              <button
                v-if="chat.lastUserText"
                class="rounded-lg bg-amber-900 px-3 py-2 text-xs font-medium text-white hover:bg-amber-950"
                type="button"
                @click="chat.retryLast()"
              >
                重试
              </button>
            </div>
          </div>
        </div>

        <!-- input -->
        <ChatInput />
      </main>
    </div>
  </div>
</template>