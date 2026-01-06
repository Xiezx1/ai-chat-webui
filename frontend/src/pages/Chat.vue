<script setup lang="ts">
import { onMounted, ref, watch, nextTick, computed } from "vue";
import { useChatStore } from "../stores/chat";
import { useSettingsStore } from "../stores/settings";
import ChatInput from "../components/ChatInput.vue";
import ChatMessage from "../components/ChatMessage.vue";

const chat = useChatStore();
const settings = useSettingsStore();
const listRef = ref<HTMLDivElement | null>(null);

function formatUpdatedAt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

const activeConversation = computed(() =>
  chat.activeId ? chat.conversations.find((c) => c.id === chat.activeId) : null
);

function previewText(c: any) {
  const t = String(c?.lastMessagePreview || "").trim();
  return t || "（暂无消息）";
}

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
  
  const totalTokens = messages.reduce((sum: number, msg: any) => sum + (msg.totalTokens || 0), 0);
  const totalCost = messages.reduce((sum: number, msg: any) => sum + (msg.cost || 0), 0);
  
  
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
      <aside class="flex w-72 flex-col border-r border-gray-200 bg-white">
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

        <div class="flex-1 overflow-y-auto px-2 pb-4">
          <div
            v-for="c in chat.conversations"
            :key="c.id"
            class="group flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors hover:bg-gray-50"
            :class="chat.activeId === c.id ? 'bg-gray-100 ring-1 ring-gray-200' : ''"
          >
            <button class="min-w-0 flex-1 text-left" type="button" @click="open(c.id)">
              <div class="flex items-center justify-between gap-2">
                <div class="min-w-0 truncate text-sm text-gray-900">
                  {{ c.title }}
                </div>
                <div class="shrink-0 text-xs text-gray-500">{{ formatUpdatedAt(c.updatedAt) }}</div>
              </div>
              <div class="mt-0.5 flex items-center justify-between gap-2">
                <div class="min-w-0 truncate text-xs text-gray-600">{{ previewText(c) }}</div>
              </div>
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
        <!-- Sticky header: title + stats -->
        <div class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div class="mx-auto w-full max-w-3xl space-y-2">
            <div class="flex items-center justify-between gap-4">
              <div class="min-w-0">
                <div class="truncate text-sm font-semibold text-gray-900">
                  {{ activeConversation?.title || '未选择会话' }}
                </div>
                <div class="mt-0.5 text-xs text-gray-500">
                  {{ chat.sending ? '生成中…' : '就绪' }}
                </div>
              </div>

              <div class="flex items-center gap-2">
                <div class="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                  {{ currentModel.name || currentModel.id }}
                </div>
                <div class="hidden text-xs text-gray-500 sm:block">
                  上下文 {{ currentModel.context_length?.toLocaleString() || 'N/A' }}
                </div>
              </div>
            </div>

            <div v-if="conversationStats" class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div class="flex flex-wrap items-center gap-2">
                <div class="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                  {{ conversationStats.messageCount }} 条消息
                </div>
                <div class="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                  {{ conversationStats.totalTokens.toLocaleString() }} tokens
                </div>
                <div class="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900">
                  ${{ conversationStats.totalCost }}
                </div>
                <div
                  v-if="isUsingEstimatedTokens"
                  class="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900"
                >
                  估算
                </div>
              </div>

              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs text-gray-500">
                  <span>占用 {{ tokenUsagePercentage.toFixed(1) }}%</span>
                  <span>{{ (currentModel.context_length || 4000).toLocaleString() }}</span>
                </div>
                <div class="h-2 w-full rounded-full bg-gray-200">
                  <div
                    class="h-2 rounded-full transition-all duration-300"
                    :class="tokenUsagePercentage > 85 ? 'bg-red-500' : tokenUsagePercentage > 70 ? 'bg-yellow-500' : 'bg-green-500'"
                    :style="{ width: Math.min(tokenUsagePercentage, 100) + '%' }"
                  ></div>
                </div>
                <div class="flex justify-between text-xs text-gray-500">
                  <span>输入 {{ conversationStats.promptTokens.toLocaleString() }}</span>
                  <span>输出 {{ conversationStats.completionTokens.toLocaleString() }}</span>
                </div>
              </div>
            </div>

            <div v-else class="text-sm text-gray-500">开始聊天后会显示 token 统计</div>
          </div>
        </div>

        <!-- messages -->
        <div ref="listRef" class="flex-1 overflow-y-auto bg-gray-50">
          <div v-if="!chat.activeId" class="mx-auto w-full max-w-3xl px-4 py-10 text-gray-500">
            请选择或新建一个会话开始聊天
          </div>

          <div class="mx-auto w-full max-w-3xl px-4 py-4">
            <ChatMessage v-for="m in chat.messages" :key="m.id" :message="m" />
          </div>
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