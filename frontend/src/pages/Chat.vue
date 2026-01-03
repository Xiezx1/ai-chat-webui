<script setup lang="ts">
import { onMounted, ref, watch, nextTick } from "vue";
import { useChatStore } from "../stores/chat";
import ChatInput from "../components/ChatInput.vue";
import ChatMessage from "../components/ChatMessage.vue";

const chat = useChatStore();
const listRef = ref<HTMLDivElement | null>(null);

onMounted(async () => {
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
          <button
            class="rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-black"
            type="button"
            @click="newChat"
          >
            新建
          </button>
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
        <!-- messages -->
        <div ref="listRef" class="flex-1 overflow-y-auto">
          <div v-if="!chat.activeId" class="mx-auto max-w-3xl px-6 py-10 text-gray-500">
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